// GET SSE:连接即入房。hello + peer-joined 广播;断连即 leave。
import { join, leave, ev, peerList, broadcast, recentHistory, MAX_ROOMS, MAX_PEERS } from '@/lib/server/hub'
import type { NextRequest } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ code: string }> }

export async function GET(req: NextRequest, ctx: Ctx) {
  const { code } = await ctx.params
  const url = new URL(req.url)
  const name = (url.searchParams.get('name') || '访客').slice(0, 40)
  const cid = (url.searchParams.get('cid') || '').slice(0, 64)

  let stream: ReadableStream
  stream = new ReadableStream({
    start(ctrl) {
      ctrl.enqueue(':ok\n\n') // 立刻写出,触发 headers flush
      const r = join(code.toLowerCase(), name, cid)
      if (r === 'room-full') {
        ev(ctrl, 'room-full', { max: MAX_ROOMS })
        ctrl.close()
        return
      }
      if (r === 'full') {
        ev(ctrl, 'full', { max: MAX_PEERS })
        ctrl.close()
        return
      }
      const { room, me } = r
      me.ctrl = ctrl
      ev(ctrl, 'hello', { self: me.id, peers: peerList(room, me.id) })
      // 回放暂存消息(10 分钟内):晚进来/断线重连的设备也能看到
      const items = recentHistory(room)
      if (items.length) ev(ctrl, 'history', { items })
      broadcast(room, 'peer-joined', { id: me.id, name }, me.id)
      req.signal.addEventListener('abort', () => {
        if (room.peers.has(me.id)) leave(room.code, me.id)
      })
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}
