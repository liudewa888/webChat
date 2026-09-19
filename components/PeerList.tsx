'use client'
import { useStore } from '@/lib/store'

const MODE_BADGE = {
  p2p: { text: '已直连', cls: 'bg-green-100 text-green-700' },
  relay: { text: '中转', cls: 'bg-amber-100 text-amber-700' },
  connecting: { text: '连接中…', cls: 'bg-neutral-100 text-neutral-500' },
} as const

export default function PeerList() {
  const peers = useStore((s) => s.peers)

  if (peers.length === 0) {
    return (
      <p className="text-sm leading-relaxed text-neutral-400">
        等待其他设备加入 → 扫码或打开同一链接
        <br />
        <span className="text-xs">现在也能直接发送:消息在房间暂存 10 分钟,对方进来就能看到</span>
      </p>
    )
  }
  return (
    <div className="flex flex-wrap gap-2">
      {peers.map((p) => {
        const b = MODE_BADGE[p.mode]
        return (
          <div
            key={p.id}
            className="flex items-center gap-2 rounded-full border border-neutral-200 bg-white px-3 py-1.5 text-sm"
          >
            <span className="max-w-32 truncate">{p.name}</span>
            <span className={`rounded-full px-1.5 py-0.5 text-[10px] ${b.cls}`}>{b.text}</span>
          </div>
        )
      })}
    </div>
  )
}
