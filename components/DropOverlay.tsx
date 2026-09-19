'use client'
export default function DropOverlay() {
  return (
    <div className="pointer-events-none fixed inset-0 z-40 flex items-center justify-center bg-blue-600/20 backdrop-blur-[2px]">
      <div className="rounded-2xl border-2 border-dashed border-blue-500 bg-white px-8 py-6 text-lg font-medium text-blue-700 shadow-xl">
        松开即发送给当前设备
      </div>
    </div>
  )
}
