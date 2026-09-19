'use client'
// 显示「本机实际加载的样式文件指纹」:手机与电脑对比读数,即可判定是否命中了旧缓存/旧部署
import { useEffect, useState } from 'react'

export default function BuildTag({ className = 'mt-3 text-center' }: { className?: string }) {
  const [tag, setTag] = useState('读取中')
  useEffect(() => {
    const link = document.querySelector<HTMLLinkElement>('link[rel="stylesheet"][href*="/_next/"]')
    const m = link?.href.match(/chunks\/([A-Za-z0-9_-]+)\.css/)
    setTag(m ? m[1] : 'dev(未打包)')
  }, [])
  return <p className={`font-mono text-[10px] text-neutral-300 ${className}`}>css: {tag}</p>
}
