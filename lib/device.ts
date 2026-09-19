'use client'
// UA → 人类可读设备名,如「iPhone · Safari」「Windows · Chrome」
import { uid } from '@/lib/uid'

export function deviceName(): string {
  const ua = navigator.userAgent
  let os = '未知设备'
  if (/iPhone|iPad|iPod/i.test(ua)) os = ua.includes('iPad') ? 'iPad' : 'iPhone'
  else if (/Android/i.test(ua)) os = 'Android'
  else if (/Windows NT/i.test(ua)) os = 'Windows'
  else if (/Mac OS X/i.test(ua)) os = 'macOS'
  else if (/Linux/i.test(ua)) os = 'Linux'

  let browser = '浏览器'
  if (/MicroMessenger/i.test(ua)) browser = '微信'
  else if (/Edg\//i.test(ua)) browser = 'Edge'
  else if (/OPR\//i.test(ua)) browser = 'Opera'
  else if (/Chrome\//i.test(ua)) browser = 'Chrome'
  else if (/Safari\//i.test(ua)) browser = 'Safari'
  else if (/Firefox\//i.test(ua)) browser = 'Firefox'

  return `${os} · ${browser}`
}

export function isWeChat(): boolean {
  return /MicroMessenger/i.test(navigator.userAgent)
}

/** Safari ≤14(iOS 14 及以下)DataChannel 单消息上限约 2KB,超过会静默丢包/抛错 */
export function legacySafariMaxChunk(): number {
  const m = navigator.userAgent.match(/Version\/(\d+)\./) // Safari UA: Version/14.1 …
  const iosVer = navigator.userAgent.match(/OS (\d+)[._]/) // iPhone OS 14_6
  const ver = m ? Number(m[1]) : iosVer ? Number(iosVer[1]) : 99
  const isSafariFamily = /Safari\//i.test(navigator.userAgent) && !/Chrome|CriOS|FxiOS|Edg\//i.test(navigator.userAgent)
  return isSafariFamily && ver <= 14 ? 2048 : 16384
}

export function loadName(): string {
  try {
    return localStorage.getItem('wct.name') || deviceName()
  } catch {
    return deviceName()
  }
}

export function saveName(name: string) {
  try {
    localStorage.setItem('wct.name', name)
  } catch {}
}

/** 设备稳定 id(存 localStorage):服务器靠它判断历史消息里哪条是自己发的 */
export function loadCid(): string {
  try {
    let v = localStorage.getItem('wct.cid')
    if (!v) {
      v = uid()
      localStorage.setItem('wct.cid', v)
    }
    return v
  } catch {
    return uid()
  }
}
