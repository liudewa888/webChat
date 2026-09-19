'use client'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import BuildTag from '@/components/BuildTag'

const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789'

function genCode(): string {
  const b = new Uint8Array(6)
  crypto.getRandomValues(b)
  return [...b].map((x) => ALPHABET[x % ALPHABET.length]).join('')
}

export default function Home() {
  const router = useRouter()
  const [input, setInput] = useState('')
  const [err, setErr] = useState('')

  const join = (raw: string) => {
    const code = raw.trim().toLowerCase()
    if (!/^[a-z0-9]{4,12}$/.test(code) || /[ilo01]/.test(code)) {
      setErr('房间码格式不对,应为 6 位字母数字(如 abcd23)')
      return
    }
    router.push(`/r/${code}`)
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6 supports-[min-height:100dvh]:min-h-dvh">
      <div className="w-full max-w-sm text-center">
        <div className="mb-3 text-5xl">⚡</div>
        <h1 className="text-2xl font-bold">网传</h1>
        <p className="mt-1 text-[11px] uppercase tracking-widest text-neutral-400">webChat</p>
        <p className="mt-2 text-sm leading-relaxed text-neutral-500">
          手机 ↔ 电脑 互传文件、文字、截图
          <br />
          两台设备打开同一个房间即可传输,优先 P2P 直连
          <br />
          <span className="text-xs text-neutral-400">消息在房间暂存 10 分钟 · 单次文件最大 10MB</span>
        </p>

        <button
          onClick={() => router.push(`/r/${genCode()}`)}
          className="mt-8 w-full rounded-2xl bg-blue-600 py-3.5 text-base font-medium text-white shadow-lg shadow-blue-600/25 transition hover:bg-blue-700 active:scale-[0.99]"
        >
          创建房间
        </button>

        <div className="my-5 flex items-center gap-3 text-xs text-neutral-400">
          <span className="h-px flex-1 bg-neutral-200" />
          或加入已有房间
          <span className="h-px flex-1 bg-neutral-200" />
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault()
            join(input)
          }}
          className="flex gap-2"
        >
          <input
            value={input}
            onChange={(e) => {
              setInput(e.target.value)
              setErr('')
            }}
            placeholder="输入 6 位房间码"
            autoCapitalize="none"
            autoComplete="off"
            spellCheck={false}
            className="h-12 flex-1 rounded-2xl border border-neutral-200 bg-neutral-50 px-4 text-center font-mono text-lg tracking-widest outline-none focus:border-blue-400"
          />
          <button type="submit" className="h-12 rounded-2xl bg-neutral-900 px-6 text-sm font-medium text-white hover:bg-neutral-700">
            加入
          </button>
        </form>
        {err && <p className="mt-2 text-xs text-red-500">{err}</p>}
      </div>

      <p className="mt-12 max-w-sm text-center text-[11px] leading-relaxed text-neutral-400">
        房间仅存在于服务器内存,无账号、无历史记录;文件暂存服务器 10 分钟,过期自动清除。请勿用于传输敏感内容。
      </p>
      <BuildTag />
    </main>
  )
}
