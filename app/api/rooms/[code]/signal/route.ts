// POST WebRTC 信令:SDP/ICE → 定向 SSE 给目标 peer
import { rooms, sendTo } from '@/lib/server/hub'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ code: string }> }

export async function POST(req: Request, ctx: Ctx) {
  const { code } = await ctx.params
  const room = rooms.get(code.toLowerCase())
  if (!room) return Response.json({ ok: false, why: 'no-room' }, { status: 404 })
  const body = (await req.json().catch(() => null)) as {
    from?: string
    to?: string
    sdp?: RTCSessionDescriptionInit
    candidate?: RTCIceCandidateInit
  } | null
  if (!body?.from || !body?.to || (!body.sdp && !body.candidate)) {
    return Response.json({ ok: false }, { status: 400 })
  }
  const ok = sendTo(room, body.to, 'signal', {
    from: body.from,
    sdp: body.sdp,
    candidate: body.candidate,
  })
  return Response.json({ ok })
}
