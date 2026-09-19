'use client'
export default function PreviewOverlay({ url, onClose }: { url: string; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
      onClick={onClose}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt="预览" className="max-h-full max-w-full object-contain" onClick={onClose} />
      <button className="absolute right-4 top-4 rounded-full bg-white/20 px-3 py-1.5 text-sm text-white" onClick={onClose}>
        关闭 ✕
      </button>
    </div>
  )
}
