// POST 群聊消息广播:文本/文件中继(元信息),广播给房间里除发送方外的所有人
import { rooms, broadcast, addHistory } from '@/lib/server/hub'
import type { RelayChat } from '@/lib/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ code: string }> }

export async function POST(req: Request, ctx: Ctx) {
  const { code } = await ctx.params
  const room = rooms.get(code.toLowerCase())
  if (!room) return Response.json({ ok: false, why: 'no-room' }, { status: 404 })
  const body = (await req.json().catch(() => null)) as RelayChat | null
  // 群聊模式:to 字段可选(兼容旧客户端传具体 peerId,但实际广播给全房)
  if (!body?.from || !body.mid || !['chat', 'file-link'].includes(body.kind)) {
    return Response.json({ ok: false }, { status: 400 })
  }
  const msg: RelayChat = {
    from: body.from,
    to: body.to || '*', // 群聊统一用 '*' 表示广播
    kind: body.kind,
    mid: body.mid,
    text: body.kind === 'chat' ? String(body.text ?? '').slice(0, 4000) : undefined,
    url: body.kind === 'file-link' ? String(body.url ?? '').slice(0, 200) : undefined,
    name: body.kind === 'file-link' ? String(body.name ?? '文件').slice(0, 200) : undefined,
    size: body.kind === 'file-link' ? Number(body.size) || 0 : undefined,
    type: body.kind === 'file-link' ? String(body.type ?? '').slice(0, 100) : undefined,
  }
  // 暂存到房间(10 分钟),晚进来的人也能看到;按 mid 去重防重复投递
  if (!room.history.some((h) => h.mid === msg.mid)) {
    const sender = room.peers.get(msg.from)
    addHistory(room, {
      mid: msg.mid,
      cid: sender?.cid ?? '',
      name: sender?.name ?? '未知设备',
      time: Date.now(),
      kind: msg.kind,
      text: msg.text,
      url: msg.url,
      fname: msg.name,
      fsize: msg.size,
      ftype: msg.type,
    })
  }
  // 广播给除发送方外的所有人(群聊语义)
  broadcast(room, 'chat', msg, msg.from)
  return Response.json({ ok: true })
}
