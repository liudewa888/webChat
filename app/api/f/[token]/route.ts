// GET 中转文件下载(token 即凭证)
import fs from 'fs'
import { Readable } from 'stream'
import { files } from '@/lib/server/hub'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ token: string }> }

export async function GET(_req: Request, ctx: Ctx) {
  const { token } = await ctx.params
  const f = files.get(token)
  if (!f || Date.now() > f.exp) {
    return new Response('文件不存在或已过期(有效期 10 分钟)', { status: 404 })
  }
  // 登记表与磁盘可能不一致(临时目录被系统 tmpfiles / 手工清理):先确认文件在,
  // 否则 createReadStream 的异步 error 会让响应永久挂起(表现为「点了下载一直转圈」)
  try {
    const st = await fs.promises.stat(f.dst)
    if (!st.isFile()) throw new Error('not-file')
  } catch {
    files.delete(token)
    return new Response('文件已被清理,请让对方重新发送', { status: 410 })
  }
  const file = fs.createReadStream(f.dst)
  const stream = Readable.toWeb(file) as unknown as ReadableStream<Uint8Array>
  // 读取中途出错(文件被删/磁盘异常)时主动终止响应,避免挂起
  file.on('error', () => void stream.cancel().catch(() => {}))
  return new Response(stream, {
    headers: {
      'Content-Type': f.type || 'application/octet-stream',
      'Content-Length': String(f.size),
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(f.name)}`,
      'Cache-Control': 'no-store',
    },
  })
}
