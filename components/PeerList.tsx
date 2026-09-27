"use client";
import { useStore } from "@/lib/store";

const MODE_BADGE = {
  p2p: { text: "已直连", cls: "bg-green-100 text-green-700" },
  relay: { text: "中转", cls: "bg-amber-100 text-amber-700" },
  connecting: { text: "连接中…", cls: "bg-neutral-100 text-neutral-500" },
} as const;

export default function PeerList() {
  const peers = useStore((s) => s.peers);

  if (peers.length === 0) {
    return (
      <p className="text-sm leading-relaxed text-neutral-400">
        等待其他设备加入(扫码或复制链接)
        <br />
        <span className="text-xs">可以直接发送:消息在房间暂存 10 分钟</span>
      </p>
    );
  }
  return (
    // 房间上限 MAX_PEERS = 4,固定两列铺满,小屏也刚好两排
    <div className="grid min-w-0 flex-1 grid-cols-2 gap-1.5">
      {peers.map((p) => {
        const b = MODE_BADGE[p.mode];
        return (
          <div
            key={p.id}
            className="flex items-center gap-1.5 rounded-full border border-neutral-200 bg-white px-2 py-1 text-xs"
          >
            <span className="min-w-0 flex-1 truncate">{p.name}</span>
            <span
              className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] ${b.cls}`}
            >
              {b.text}
            </span>
          </div>
        );
      })}
    </div>
  );
}
