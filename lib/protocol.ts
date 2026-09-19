'use client'
// DataChannel 协议:JSON 控制帧 + 二进制文件分块(同一对 peer 串行传输,故无需 transfer-id 前缀)
import type { Ctrl } from '@/lib/types'
import { useStore } from '@/lib/store'
import { openChannel } from '@/lib/rtc'
import { uid } from '@/lib/uid'
import { legacySafariMaxChunk } from '@/lib/device'

/** peer 离开时清理协商记录 */
export function dropPeerLimits(peerId: string) {
  peerChunk.delete(peerId)
}

const CHUNK = 16 * 1024 // 跨浏览器安全值
const HIGH_WATER = 64_000

type Incoming = { fid: string; name: string; size: number; type: string; parts: Uint8Array[]; recv: number; mid: string }

const incoming = new Map<string, Incoming>()          // peerId → 当前接收任务
const peerChunk = new Map<string, number>()           // peerId → 对端可收单消息上限(hello 上报)
const pending = new Map<string, { resolve: (v?: boolean) => void }>() // fid → file-ok 等待
const doneWait = new Map<string, { resolve: (v?: boolean) => void }>()
const sendQueues = new Map<string, Promise<unknown>>() // peerId → 串行队列尾

export function sendCtrl(to: string, c: Ctrl): boolean {
  const dc = openChannel(to)
  if (!dc) return false
  dc.send(JSON.stringify(c))
  return true
}

export function dispatchCtrl(to: string, json: string) {
  let c: Ctrl
  try {
    c = JSON.parse(json)
  } catch {
    return
  }
  const s = useStore.getState()
  switch (c.t) {
    case 'hello':
      peerChunk.set(to, Math.min(CHUNK, c.chunkMax ?? CHUNK))
      break
    case 'chat':
      // 对方经 DC 发来的文本;同一 mid 也会经 SSE 中转投递(用于服务端暂存),这里先去重
      s.addMsgIfNew({ mid: c.mid, from: 'them', time: Date.now(), via: 'p2p', peerId: to, kind: 'text', text: c.text })
      break
    case 'file-meta':
      void onFileMeta(to, c)
      break
    case 'file-ok': {
      pending.get(c.fid)?.resolve(true)
      pending.delete(c.fid)
      break
    }
    case 'file-reject': {
      pending.get(c.fid)?.resolve(false)
      pending.delete(c.fid)
      s.toast(`对方拒收: ${c.why}`, 'error')
      break
    }
    case 'file-done': {
      doneWait.get(c.fid)?.resolve()
      doneWait.delete(c.fid)
      break
    }
    default:
      break
  }
}

function onFileMeta(to: string, c: Extract<Ctrl, { t: 'file-meta' }>) {
  const s = useStore.getState()
  if (incoming.has(to)) {
    sendCtrl(to, { t: 'file-reject', fid: c.fid, why: '正忙,请稍候' })
    return
  }
  const mid = uid()
  s.addMsg({
    mid, from: 'them', time: Date.now(), via: 'p2p', kind: 'file',
    name: c.name, size: c.size, type: c.type, state: { phase: 'receiving', recv: 0 }, peerId: to,
  })
  incoming.set(to, { fid: c.fid, name: c.name, size: c.size, type: c.type, parts: [], recv: 0, mid })
  sendCtrl(to, { t: 'file-ok', fid: c.fid })
}

export function handleBinary(to: string, data: ArrayBuffer | Blob) {
  if (!incoming.get(to)) return
  if (data instanceof Blob) {
    data.arrayBuffer().then((b) => push(to, new Uint8Array(b)))
  } else {
    push(to, new Uint8Array(data))
  }
}

function push(to: string, bytes: Uint8Array) {
  const cur = incoming.get(to)
  if (!cur) return
  cur.parts.push(bytes)
  cur.recv += bytes.length
  const s = useStore.getState()
  s.updateMsg(cur.mid, (m) => (m.kind === 'file' ? { ...m, state: { phase: 'receiving', recv: cur.recv } } : m))
  if (cur.recv >= cur.size) {
    incoming.delete(to)
    const blob = new Blob(cur.parts as BlobPart[], { type: cur.type })
    const url = URL.createObjectURL(blob)
    s.updateMsg(cur.mid, (m) => (m.kind === 'file' ? { ...m, state: { phase: 'done' }, url } : m))
    s.toast(`已收到 ${cur.name}`, 'ok')
    sendCtrl(to, { t: 'file-done', fid: cur.fid })
  }
}

/** 发送文件;ok=false 时调用方改走中转。mid 供直传成功后归档进房间暂存 */
export function sendFile(to: string, file: File): Promise<{ ok: boolean; mid: string }> {
  const prev = sendQueues.get(to) ?? Promise.resolve()
  const next = prev.then(() => doSendFile(to, file)).catch(() => ({ ok: false, mid: '' }))
  sendQueues.set(to, next)
  return next
}

async function doSendFile(to: string, file: File): Promise<{ ok: boolean; mid: string }> {
  const s = useStore.getState()
  const dc = openChannel(to)
  const mid = uid()
  const fid = uid()
  s.addMsg({
    mid, from: 'me', time: Date.now(), via: 'p2p', kind: 'file',
    name: file.name, size: file.size, type: file.type, state: { phase: 'connecting' }, peerId: to,
  })
  if (!dc) {
    s.updateMsg(mid, (m) => (m.kind === 'file' ? { ...m, state: { phase: 'failed', reason: 'P2P 未连通' } } : m))
    return { ok: false, mid }
  }
  if (!sendCtrl(to, { t: 'file-meta', fid, name: file.name, size: file.size, type: file.type })) {
    s.updateMsg(mid, (m) => (m.kind === 'file' ? { ...m, state: { phase: 'failed', reason: '通道不可用' } } : m))
    return { ok: false, mid }
  }
  const ok = await waitFlag(pending, fid, 15_000)
  if (!ok) {
    s.updateMsg(mid, (m) => (m.kind === 'file' ? { ...m, state: { phase: 'failed', reason: '对方未确认' } } : m))
    return { ok: false, mid }
  }
  s.updateMsg(mid, (m) => (m.kind === 'file' ? { ...m, state: { phase: 'sending', sent: 0 } } : m))
  let sent = 0
  let sinceProgress = 0
  let chunk = Math.min(CHUNK, peerChunk.get(to) ?? CHUNK, legacySafariMaxChunk()) // 受本端与对端两者中较小上限约束
  for await (const bytes of fileChunks(file)) {
    let i = 0
    while (i < bytes.length) {
      const slice = bytes.subarray(i, i + chunk)
      while (dc.bufferedAmount > HIGH_WATER) await waitDrain(dc)
      try {
        dc.send(slice.slice()) // copy 成独立 buffer(规避 Safari 对共享 ArrayBuffer 视图的问题)
        i += slice.length
      } catch (e) {
        if (chunk > 2048) {
          chunk = 2048 // 老 Safari 抛「消息过大」→ 就地降块重试同一切片
          continue
        }
        throw e
      }
      sent += slice.length
      sinceProgress += slice.length
      if (sinceProgress >= 256 * 1024) {
        sinceProgress = 0
        s.updateMsg(mid, (m) => (m.kind === 'file' ? { ...m, state: { phase: 'sending', sent } } : m))
      }
    }
  }
  await waitFlag(doneWait, fid, 30_000) // 等对方确认收完(超时也视为完成)
  s.updateMsg(mid, (m) => (m.kind === 'file' ? { ...m, state: { phase: 'done' } } : m))
  return { ok: true, mid }
}

function waitFlag(map: Map<string, { resolve: (v?: boolean) => void }>, fid: string, ms: number): Promise<boolean> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      map.delete(fid)
      resolve(false)
    }, ms)
    map.set(fid, {
      resolve: (v) => {
        clearTimeout(timer)
        map.delete(fid)
        resolve(v !== false)
      },
    })
  })
}

/** 读文件分块:优先 File.stream();iOS 14 及更老浏览器用 slice+FileReader 兜底 */
async function* fileChunks(file: File): AsyncGenerator<Uint8Array> {
  if (typeof file.stream === 'function') {
    const reader = file.stream().getReader()
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      yield value as Uint8Array
    }
    return
  }
  const BLOCK = 512 * 1024
  for (let off = 0; off < file.size; off += BLOCK) {
    yield await readSliceAsBytes(file.slice(off, Math.min(off + BLOCK, file.size)))
  }
}

function readSliceAsBytes(blob: Blob): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader()
    fr.onload = () => resolve(new Uint8Array(fr.result as ArrayBuffer))
    fr.onerror = () => reject(fr.error)
    fr.readAsArrayBuffer(blob)
  })
}

/** 背压等待:支持 bufferedamountlow 事件则用事件,否则短轮询(Safari 14 该事件不可靠) */
function waitDrain(dc: RTCDataChannel): Promise<void> {
  if (typeof dc.addEventListener === 'function' && 'onbufferedamountlow' in dc) {
    return new Promise((resolve) => dc.addEventListener('bufferedamountlow', () => resolve(), { once: true }))
  }
  return new Promise((resolve) => setTimeout(resolve, 30))
}
