'use client'
import { useStore } from '@/lib/store'

const CLS = {
  info: 'bg-neutral-800',
  ok: 'bg-green-600',
  error: 'bg-red-600',
} as const

export default function Toasts() {
  const toasts = useStore((s) => s.toasts)
  return (
    <div className="pointer-events-none fixed inset-x-0 top-4 z-50 flex flex-col items-center gap-2 px-4">
      {toasts.map((t) => (
        <div key={t.id} className={`max-w-md rounded-full px-4 py-2 text-sm text-white shadow-lg ${CLS[t.kind]}`}>
          {t.text}
        </div>
      ))}
    </div>
  )
}
