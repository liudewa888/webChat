"use client";
// 桌面端显示二维码供另一台设备扫码进房;手机端只显示链接+复制
import { useEffect, useState } from "react";
import { QRCodeCanvas } from "qrcode.react";
import { useStore } from "@/lib/store";
import { BASE_PATH } from "@/lib/base";

export default function QRPanel({ code }: { code: string }) {
  const [url, setUrl] = useState("");
  const toast = useStore((s) => s.toast);
  useEffect(() => setUrl(`${window.location.origin}${BASE_PATH}/r/${code}`), [code]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = url;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
    toast("链接已复制,发给对方打开即可", "ok");
  };

  return (
    <div className="flex shrink-0 items-center gap-3">
      {url && (
        <div className="hidden md:block">
          <QRCodeCanvas value={url} size={72} level="M" includeMargin={false} />
        </div>
      )}
      <button
        onClick={copy}
        className="rounded-lg border border-neutral-200 px-3 py-1.5 text-xs text-neutral-600 hover:bg-neutral-50"
      >
        复制房间链接
      </button>
    </div>
  );
}
