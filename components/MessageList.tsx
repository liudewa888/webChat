'use client'
import { useEffect, useRef } from 'react'
import { useStore } from '@/lib/store'
import type { Msg } from '@/lib/types'

function fmtSize(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`
}

function fmtTime(t: number): string {
  return new Date(t).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
}

export default function MessageList({ onPreview }: { onPreview: (url: string) => void }) {
  const messages = useStore((s) => s.messages)
  const peers = useStore((s) => s.peers)
  const toast = useStore((s) => s.toast)
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length])

  // 对端设备名:在线时查 peers,历史回放的离线设备只能用消息里带的名字
  const peerName = (m: Msg) => (m.peerId ? peers.find((p) => p.id === m.peerId)?.name : undefined) ?? m.fromName ?? '对方'

  if (messages.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 text-neutral-400">
        <p className="text-4xl">📦</p>
        <p className="text-sm">发送第一个内容试试:粘贴截图 / 拖入文件 / 输入文字</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {messages.map((m) => (
        <div key={m.mid} className={`flex flex-col ${m.from === 'me' ? 'items-end' : 'items-start'}`}>
          <div className="mb-0.5 flex items-center gap-1.5 text-[10px] text-neutral-400">
            <span>{m.from === 'me' ? `我 → ${peerName(m)}` : peerName(m)}</span>
            <span>{fmtTime(m.time)}</span>
            <span className={`rounded px-1 ${m.via === 'p2p' ? 'bg-green-50 text-green-600' : 'bg-amber-50 text-amber-600'}`}>
              {m.via === 'p2p' ? '直连' : '中转'}
            </span>
          </div>
          {m.kind === 'text' ? (
            <TextBubble text={m.text} mine={m.from === 'me'} onCopy={() => toast('已复制', 'ok')} />
          ) : (
            <FileCard msg={m} onPreview={onPreview} />
          )}
        </div>
      ))}
      <div ref={endRef} />
    </div>
  )
}

function TextBubble({ text, mine, onCopy }: { text: string; mine: boolean; onCopy: () => void }) {
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      onCopy()
    } catch {
      const ta = document.createElement('textarea')
      ta.value = text
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      const ok = document.execCommand('copy')
      ta.remove()
      if (ok) onCopy()
    }
  }
  return (
    <button
      onClick={copy}
      title="点击复制"
      className={`max-w-[80%] whitespace-pre-wrap break-all rounded-2xl px-4 py-2.5 text-left text-[15px] leading-relaxed shadow-sm ${
        mine ? 'bg-blue-600 text-white hover:bg-blue-600' : 'bg-white text-neutral-800 hover:bg-neutral-50'
      }`}
    >
      {text}
    </button>
  )
}

function FileCard({ msg, onPreview }: { msg: Extract<Msg, { kind: 'file' }>; onPreview: (u: string) => void }) {
  const st = msg.state
  const pct =
    st.phase === 'sending' || st.phase === 'uploading'
      ? (st.sent / msg.size) * 100
      : st.phase === 'receiving'
        ? (st.recv / msg.size) * 100
        : st.phase === 'done'
          ? 100
          : 0
  const isImg = msg.type.startsWith('image/')
  const progressLabel =
    st.phase === 'connecting' ? '等待对方接收…' :
    st.phase === 'sending' ? `发送中 ${pct.toFixed(0)}%` :
    st.phase === 'receiving' ? `接收中 ${pct.toFixed(0)}%` :
    st.phase === 'uploading' ? `上传中(中转) ${pct.toFixed(0)}%` :
    st.phase === 'failed' ? `失败: ${st.reason}` :
    '传输完成'

  return (
    <div className="w-72 max-w-[85%] rounded-2xl border border-neutral-200 bg-white p-3 shadow-sm">
      {isImg && st.phase === 'done' && msg.url ? (
        <button
          onClick={() => onPreview(msg.url!)}
          title="点击查看大图"
          className="mb-2 block w-full cursor-zoom-in overflow-hidden rounded-lg"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={msg.url} alt={msg.name} className="max-h-56 w-full object-cover" />
        </button>
      ) : (
        <div className="mb-1 flex items-center gap-2">
          <span className="text-xl">{isImg ? '🖼️' : '📄'}</span>
          <span className="truncate text-sm font-medium text-neutral-800">{msg.name}</span>
        </div>
      )}
      <div className="flex items-center justify-between text-[11px] text-neutral-500">
        <span>{fmtSize(msg.size)}</span>
        <span>{st.phase === 'done' && isImg ? '点图查看大图' : progressLabel}</span>
      </div>
      {st.phase !== 'done' && st.phase !== 'failed' && (
        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-neutral-100">
          <div className="h-full rounded-full bg-blue-500 transition-all" style={{ width: `${pct}%` }} />
        </div>
      )}
      {st.phase === 'done' && msg.url && (
        <a
          href={msg.url}
          download={msg.name}
          className="mt-2 block rounded-lg bg-blue-600 py-1.5 text-center text-sm text-white hover:bg-blue-700"
        >
          下载
        </a>
      )}
    </div>
  )
}
