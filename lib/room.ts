'use client'
// EventSource 封装 + signal/message/upload POST
import type { HistoryItem, RelayChat } from '@/lib/types'
import { BASE_PATH } from '@/lib/base'

export type SseHandlers = {
  hello: (d: { self: string; peers: { id: string; name: string }[] }) => void
  'peer-joined': (d: { id: string; name: string }) => void
  'peer-left': (d: { id: string }) => void
  signal: (d: { from: string; sdp?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit }) => void
  chat: (d: RelayChat) => void
  history: (d: { items: HistoryItem[] }) => void
  full: (d: { max: number }) => void
  'room-full': (d: { max: number }) => void
}

export function connectRoom(code: string, name: string, cid: string, h: Partial<SseHandlers>): () => void {
  const es = new EventSource(`${BASE_PATH}/api/rooms/${code}/events?name=${encodeURIComponent(name)}&cid=${encodeURIComponent(cid)}`)
  for (const key of Object.keys(h) as (keyof SseHandlers)[]) {
    es.addEventListener(key, (e: MessageEvent) => {
      try {
        ;(h[key] as (d: unknown) => void)(JSON.parse(e.data))
      } catch {}
    })
  }
  // iOS 切后台会冻 SSE:回前台时若已断则重建
  const onVis = () => {
    if (document.visibilityState === 'visible' && es.readyState === EventSource.CLOSED) {
      // EventSource 不能重开同实例,交给 React 层 remount(见 RoomClient)
      document.dispatchEvent(new CustomEvent('wct:sse-dead'))
    }
  }
  document.addEventListener('visibilitychange', onVis)
  return () => {
    document.removeEventListener('visibilitychange', onVis)
    es.close()
  }
}

const post = (url: string, body: unknown) =>
  fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then((r) => r.json())

export const api = {
  signal: (code: string, from: string, to: string, sdp?: RTCSessionDescriptionInit, candidate?: RTCIceCandidateInit) =>
    post(`${BASE_PATH}/api/rooms/${code}/signal`, { from, to, sdp, candidate }),
  message: (code: string, msg: RelayChat) => post(`${BASE_PATH}/api/rooms/${code}/message`, msg),
  upload: (code: string, file: File, onProgress: (sent: number) => void): Promise<{ ok: boolean; url?: string; name?: string; size?: number; why?: string }> =>
    new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest()
      xhr.open('PUT', `${BASE_PATH}/api/rooms/${code}/upload?name=${encodeURIComponent(file.name)}&type=${encodeURIComponent(file.type || '')}`)
      xhr.upload.onprogress = (e) => onProgress(e.loaded)
      xhr.onload = () => {
        try {
          resolve(JSON.parse(xhr.responseText))
        } catch {
          reject(new Error('上传响应解析失败'))
        }
      }
      xhr.onerror = () => reject(new Error('网络错误,上传失败'))
      xhr.send(file)
    }),
}
