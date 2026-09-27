"use client";
// 房间编排:SSE 生命周期、信令接线、全局粘贴/拖拽、扫码配对
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { connectRoom } from "@/lib/room";
import {
  initRtc,
  onPeerJoined,
  onPeerLeft,
  onSignal,
  syncExistingPeers,
  resetRtc,
} from "@/lib/rtc";
import { sendFiles } from "@/lib/send";
import { useStore } from "@/lib/store";
import { loadName, saveName, isWeChat, loadCid } from "@/lib/device";
import type { Msg } from "@/lib/types";
import PeerList from "@/components/PeerList";
import MessageList from "@/components/MessageList";
import Composer from "@/components/Composer";
import DropOverlay from "@/components/DropOverlay";
import QRPanel from "@/components/QRPanel";
import Toasts from "@/components/Toast";
import BuildTag from "@/components/BuildTag";
import PreviewOverlay from "@/components/PreviewOverlay";

export default function RoomClient({ code }: { code: string }) {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [dropping, setDropping] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [connKey, setConnKey] = useState(0);
  const [editingName, setEditingName] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false); // 设备/扫码区默认折叠,省垂直空间
  const myName = useStore((s) => s.myName);
  const peers = useStore((s) => s.peers);

  // 建立连接(code/name 变化或 sse-dead 重连时 key 变化)
  useEffect(() => {
    const name = loadName();
    const cid = loadCid();
    useStore.getState().setMe("", name);
    useStore.getState().setCid(cid);
    initRtc(code, "", name);
    let connected = false;
    const close = connectRoom(code, name, cid, {
      hello: ({ self, peers }) => {
        const s = useStore.getState();
        s.setMe(self, name);
        initRtc(code, self, name);
        for (const p of peers) s.addPeer({ ...p, mode: "connecting" });
        syncExistingPeers(peers);
        connected = true;
        s.setSse(true);
        setReady(true);
      },
      "peer-joined": onPeerJoined,
      "peer-left": (d) => onPeerLeft(d.id),
      signal: onSignal,
      chat: (d) => {
        const s = useStore.getState();
        const mine = d.from === s.myId;
        const fromName = s.peers.find((p) => p.id === d.from)?.name;
        // 群聊:直连已投递过同一 mid 时这里会被去重丢弃
        if (d.kind === "chat" && d.text) {
          s.addMsgIfNew({
            mid: d.mid,
            from: mine ? "me" : "them",
            time: Date.now(),
            via: "relay",
            peerId: d.from,
            fromName,
            kind: "text",
            text: d.text,
          });
        } else if (d.kind === "file-link" && d.url) {
          const m: Msg = {
            mid: d.mid,
            from: mine ? "me" : "them",
            time: Date.now(),
            via: "relay",
            peerId: d.from,
            fromName,
            kind: "file",
            name: d.name || "文件",
            size: d.size || 0,
            type: d.type || "",
            state: { phase: "done" },
            url: d.url,
          };
          s.addMsgIfNew(m);
        }
      },
      // 进房时回放服务端暂存的消息(10 分钟内)
      history: ({ items }) => {
        const s = useStore.getState();
        for (const it of items) {
          const mine = it.cid === cid;
          const base = {
            mid: it.mid,
            from: mine ? ("me" as const) : ("them" as const),
            time: it.time,
            via: "relay" as const,
            fromName: it.name,
            peerId: it.cid,
          };
          if (it.kind === "chat") {
            s.addMsgIfNew({ ...base, kind: "text", text: it.text || "" });
          } else if (it.url) {
            s.addMsgIfNew({
              ...base,
              kind: "file",
              name: it.fname || "文件",
              size: it.fsize || 0,
              type: it.ftype || "",
              state: { phase: "done" },
              url: it.url,
            });
          }
        }
      },
      full: ({ max }) => {
        useStore
          .getState()
          .toast(`房间已满(最多 ${max} 人),请稍后再试或创建新房间`, "error");
        setTimeout(() => router.push("/"), 2500);
      },
      "room-full": ({ max }) => {
        useStore
          .getState()
          .toast(
            `已达最大房间数(${max} 个),请加入其他房间或等待旧房间过期`,
            "error",
          );
        setTimeout(() => router.push("/"), 2500);
      },
    });
    const onDead = () => setConnKey((k) => k + 1);
    document.addEventListener("wct:sse-dead", onDead);
    return () => {
      document.removeEventListener("wct:sse-dead", onDead);
      close();
      resetRtc();
      void connected;
    };
  }, [code, connKey]);

  // 全局粘贴:文件/截图直接发送;文本且焦点不在输入框 → 填入输入框
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const inField =
        document.activeElement instanceof HTMLTextAreaElement ||
        document.activeElement instanceof HTMLInputElement;
      const files = e.clipboardData?.files;
      if (files && files.length > 0) {
        e.preventDefault();
        void sendFiles(code, [...files]);
      } else if (!inField && e.clipboardData?.getData("text")) {
        document.dispatchEvent(
          new CustomEvent("wct:paste-text", {
            detail: e.clipboardData.getData("text"),
          }),
        );
      }
    };
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, [code]);

  // 全局拖拽
  useEffect(() => {
    let depth = 0;
    const hasFiles = (e: DragEvent) => e.dataTransfer?.types?.includes("Files");
    const onEnter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth++;
      setDropping(true);
    };
    const onLeave = () => {
      depth = Math.max(0, depth - 1);
      if (depth === 0) setDropping(false);
    };
    const onOver = (e: DragEvent) => {
      if (hasFiles(e)) e.preventDefault();
    };
    const onDrop = (e: DragEvent) => {
      e.preventDefault();
      depth = 0;
      setDropping(false);
      const fs = e.dataTransfer?.files;
      if (fs?.length) void sendFiles(code, [...fs]);
    };
    window.addEventListener("dragenter", onEnter);
    window.addEventListener("dragleave", onLeave);
    window.addEventListener("dragover", onOver);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragenter", onEnter);
      window.removeEventListener("dragleave", onLeave);
      window.removeEventListener("dragover", onOver);
      window.removeEventListener("drop", onDrop);
    };
  }, [code]);

  useEffect(() => {
    if (isWeChat())
      useStore
        .getState()
        .toast(
          "检测到微信内置浏览器,建议用系统浏览器打开以获得最佳体验",
          "error",
        );
  }, []);

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(code);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = code;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
    useStore.getState().toast("房间码已复制", "ok");
  };

  // 宽度:移动端铺满,PC 上限 600px 居中。
  // w-full 不能省 —— body 是 flex-col,mx-auto 会关掉交叉轴的 stretch,
  // 只写 max-w 时容器会收缩成 fit-content(内容窄时到不了 100%)。
  return (
    <div className="mx-auto w-full max-w-[600px] flex h-screen flex-col supports-[height:100dvh]:h-dvh md:border-x md:border-neutral-200">
      {/* 头部 */}
      <header className="flex items-center gap-3 border-b border-neutral-200 px-2 py-1">
        <div className="flex items-baseline gap-2">
          <span className="text-sm text-neutral-500">房间码</span>
          <span className="font-mono text-2xl font-bold tracking-widest">
            {code}
          </span>
          <button
            onClick={copyCode}
            className="rounded px-2 py-0.5 text-xs text-neutral-500 hover:bg-neutral-100"
          >
            复制
          </button>
        </div>
        <div className="ml-auto flex items-center gap-2 text-xs text-neutral-500">
          <span
            className={`inline-block h-2 w-2 rounded-full ${useStore((s) => s.sseUp) ? "bg-green-500" : "bg-red-400"}`}
          />
          {editingName ? (
            <input
              className="w-40 rounded border border-neutral-300 px-2 py-1 text-xs text-neutral-800"
              defaultValue={myName}
              autoFocus
              onBlur={(e) => {
                const v = e.target.value.trim() || myName;
                saveName(v);
                useStore.getState().setMe(useStore.getState().myId, v);
                useStore
                  .getState()
                  .toast("改名将在重新加入房间后对他人生效", "info");
                setEditingName(false);
              }}
              onKeyDown={(e) =>
                e.key === "Enter" && (e.target as HTMLInputElement).blur()
              }
            />
          ) : (
            <button
              className="hover:text-neutral-800"
              onClick={() => setEditingName(true)}
            >
              {myName} ✎
            </button>
          )}
        </div>
      </header>

      {/* 本机实际加载的 CSS 指纹:排查旧缓存用 */}
      <BuildTag className="-mt-1 px-4 pb-1 text-right" />

      {/* 设备列表 + 扫码:默认折叠(点一行展开),给会话区让出垂直空间 */}
      <div className="border-b border-neutral-200">
        <button
          onClick={() => setInviteOpen((v) => !v)}
          aria-expanded={inviteOpen}
          className="flex w-full items-center gap-2 px-4 py-1.5 text-xs text-neutral-500 hover:bg-neutral-50"
        >
          <span
            className={`inline-block transition-transform ${inviteOpen ? "rotate-90" : ""}`}
          >
            ▶
          </span>
          <span>设备与邀请</span>
          <span className="text-neutral-400">{peers.length + 1} 台</span>
          <span className="ml-auto">{inviteOpen ? "收起" : "展开"}</span>
        </button>
        {inviteOpen && (
          <div className="flex items-start justify-between gap-4 px-2 pb-2">
            <PeerList />
            <QRPanel code={code} />
          </div>
        )}
      </div>

      {/* 会话区 */}
      <main className="flex-1 overflow-y-auto bg-neutral-50 px-2 py-1">
        {!ready ? (
          <p className="pt-10 text-center text-sm text-neutral-400">
            正在连接服务器…
          </p>
        ) : (
          <MessageList onPreview={setPreview} />
        )}
      </main>

      <Composer code={code} />
      {dropping && <DropOverlay />}
      {preview && (
        <PreviewOverlay url={preview} onClose={() => setPreview(null)} />
      )}
      <Toasts />
    </div>
  );
}
