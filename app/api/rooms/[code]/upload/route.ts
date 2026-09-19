// PUT 原始文件体 → 手动 reader 循环流式落盘(不走 multipart;超限立即取消并返回 413,不依赖 pipeline 边界行为)
import fs from 'fs'
import path from 'path'
import { genToken } from '@/lib/code'
import { BASE_PATH } from '@/lib/base'
import { registerFile, tempDir, FILE_TTL_MS } from '@/lib/server/hub'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MAX = 10 * 1024 * 1024 // 10MB —— 与前端 send.ts 的 MAX_FILE_BYTES 保持一致

type Ctx = { params: Promise<{ code: string }> }

export async function PUT(req: Request, _ctx: Ctx) {
  if (!req.body) return Response.json({ ok: false, why: 'empty' }, { status: 400 })
  const url = new URL(req.url)
  const name = decodeURIComponent(url.searchParams.get('name') || 'file.bin').slice(0, 200)
  const type = url.searchParams.get('type') || 'application/octet-stream'

  const declared = Number(req.headers.get('content-length') || 0)
  if (declared > MAX) {
    void req.body.cancel().catch(() => {})
    return Response.json({ ok: false, why: 'too-large' }, { status: 413 })
  }

  const token = genToken()
  const dir = tempDir()
  await fs.promises.mkdir(dir, { recursive: true })
  const dst = path.join(dir, token)

  const fh = await fs.promises.open(dst, 'w')
  let n = 0
  try {
    const reader = req.body.getReader()
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      n += value.byteLength
      if (n > MAX) {
        await reader.cancel()
        throw Object.assign(new Error('too-large'), { code: 'TOO_LARGE' })
      }
      await fh.write(value)
    }
    await fh.sync()
    registerFile(token, { dst, name, size: n, type, exp: Date.now() + FILE_TTL_MS })
    console.log(`[webChat] 暂存 ${name} ${(n / 1024).toFixed(0)}KB → ${dst}`)
    return Response.json({ ok: true, url: `${BASE_PATH}/api/f/${token}`, name, size: n })
  } catch (e) {
    await fh.close().catch(() => {})
    await fs.promises.unlink(dst).catch(() => {})
    if ((e as Error).message === 'too-large' || (e as { code?: string }).code === 'TOO_LARGE') {
      return Response.json({ ok: false, why: 'too-large' }, { status: 413 })
    }
    return Response.json({ ok: false, why: 'io-error' }, { status: 500 })
  } finally {
    await fh.close().catch(() => {})
  }
}
