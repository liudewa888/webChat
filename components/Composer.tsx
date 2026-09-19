'use client'
import { useEffect, useRef, useState } from 'react'
import { sendFiles, sendTextMsg } from '@/lib/send'

export default function Composer({ code: roomCode }: { code: string }) {
  const [text, setText] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const taRef = useRef<HTMLTextAreaElement>(null)

  // 全局粘贴的纯文本 → 追加进输入框
  useEffect(() => {
    const onText = (e: Event) => {
      const t = (e as CustomEvent<string>).detail
      setText((v) => v + t)
      taRef.current?.focus()
    }
    document.addEventListener('wct:paste-text', onText)
    return () => document.removeEventListener('wct:paste-text', onText)
  }, [])

  const send = () => {
    if (!text.trim()) return
    sendTextMsg(roomCode, text)
    setText('')
  }

  const onPick = (fs: FileList | null) => {
    if (!fs?.length) return
    void sendFiles(roomCode, [...fs])
    if (fileRef.current) fileRef.current.value = ''
  }

  return (
    <footer className="border-t border-neutral-200 bg-white px-3 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
      <div className="flex items-end gap-2">
        <button
          onClick={() => fileRef.current?.click()}
          title="发送文件"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-lg hover:bg-neutral-200"
        >
          📎
        </button>
        <input ref={fileRef} type="file" multiple hidden onChange={(e) => onPick(e.target.files)} />
        <textarea
          ref={taRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !/iPhone|iPad|Android/i.test(navigator.userAgent)) {
              e.preventDefault()
              send()
            }
          }}
          rows={1}
          placeholder="输入文字,或粘贴/拖入文件…"
          className="max-h-32 min-h-10 flex-1 resize-none rounded-2xl border border-neutral-200 px-3.5 py-2.5 text-base leading-snug outline-none focus:border-blue-400"
        />
        <button
          onClick={send}
          className="h-10 shrink-0 rounded-full bg-blue-600 px-5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-40"
          disabled={!text.trim()}
        >
          发送
        </button>
      </div>
    </footer>
  )
}
