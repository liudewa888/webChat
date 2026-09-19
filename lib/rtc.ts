'use client'
// PeerManager:每对 peer 一个 RTCPeerConnection(mesh),小 id 一方发起 offer,避免 glare
import { api } from '@/lib/room'
import { useStore } from '@/lib/store'
import { legacySafariMaxChunk } from '@/lib/device'
import { dispatchCtrl, handleBinary, dropPeerLimits } from '@/lib/protocol'

// 注意:STUN URL 不能带 ?transport=udp(Safari 严格校验会直接抛错,Chrome 会静默忽略)
const ICE_FULL: RTCConfiguration = {
  iceServers: [
    { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302', 'stun:stun.cloudflare.com:3478'] },
  ],
}
// 极端情况下连 STUN 都不受支持 → 无 STUN 裸连(局域网/同一 NAT 下仍可通)
const ICE_MIN: RTCConfiguration = { iceServers: [] }
const WATCHDOG_MS = 8000

/** 构造 RTCPeerConnection,配置不合法时逐级降配;全失败返回 null(调用方转中转) */
function createPc(): RTCPeerConnection | null {
  for (const cfg of [ICE_FULL, ICE_MIN]) {
    try {
      return new RTCPeerConnection(cfg)
    } catch {}
  }
  return null
}

type Pair = {
  pc: RTCPeerConnection
  dc?: RTCDataChannel
  mode: 'connecting' | 'p2p' | 'relay'
  remoteSet: boolean
  candQ: RTCIceCandidateInit[]
  watchdog?: ReturnType<typeof setTimeout>
}

let code = ''
let myId = ''
let myName = ''
const pairs = new Map<string, Pair>()

export function initRtc(roomCode: string, self: string, name: string) {
  code = roomCode
  myId = self
  myName = name
}

/** hello 后对每个已存在 peer 调用:按「小 id 发起」规则决定是否建 offer */
export function syncExistingPeers(peers: { id: string }[]) {
  for (const p of peers) if (myId < p.id) void offer(p.id)
}

/** 重连/离开房间时清干净所有 pc */
export function resetRtc() {
  for (const p of pairs.values()) {
    clearTimeout(p.watchdog)
    p.pc.close()
  }
  pairs.clear()
}

export function getPair(id: string): Pair | undefined {
  return pairs.get(id)
}

export function peerMode(id: string): 'p2p' | 'relay' | 'connecting' {
  return pairs.get(id)?.mode ?? 'relay'
}

export function onPeerJoined(p: { id: string; name: string }) {
  const s = useStore.getState()
  s.addPeer({ ...p, mode: 'connecting' })
  s.toast(`${p.name} 加入了房间`, 'ok')
  if (myId < p.id) void offer(p.id) // 小 id 发起
}

export function onPeerLeft(id: string) {
  const p = pairs.get(id)
  if (p) {
    clearTimeout(p.watchdog)
    p.pc.close()
    pairs.delete(id)
  }
  dropPeerLimits(id)
  useStore.getState().removePeer(id)
}

export function onSignal(d: { from: string; sdp?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit }) {
  void handle(d.from, d.sdp, d.candidate)
}

function mk(): Pair | null {
  const pc = createPc()
  if (!pc) return null
  const pair: Pair = { pc, mode: 'connecting', remoteSet: false, candQ: [] }
  pc.onicecandidate = (e) => {
    if (e.candidate) void api.signal(code, myId, targetOf(pc), undefined, e.candidate.toJSON())
  }
  pc.onconnectionstatechange = () => {
    const st = pc.connectionState
    if (st === 'connected') {
      const id = [...pairs.entries()].find(([, x]) => x.pc === pc)?.[0]
      if (id) clearTimeout(pairs.get(id)!.watchdog)
    } else if (st === 'failed' || st === 'closed') {
      const entry = [...pairs.entries()].find(([, x]) => x.pc === pc)
      if (entry) downgrade(entry[0], '连接失败')
    }
  }
  return pair
}

function targetOf(pc: RTCPeerConnection): string {
  for (const [id, p] of pairs) if (p.pc === pc) return id
  return ''
}

async function offer(to: string) {
  if (pairs.has(to)) return
  const pair = mk()
  if (!pair) return forceRelay(to, '本机浏览器不支持 WebRTC,文件将走服务器中转')
  pairs.set(to, pair)
  // Safari 要求:由 offerer 创建 DataChannel,label 不能为空
  const dc = pair.pc.createDataChannel('wct', { ordered: true })
  bind(dc, to)
  pair.watchdog = setTimeout(() => {
    if (pairs.get(to) === pair && pair.mode !== 'p2p') downgrade(to, 'P2P 未打通,已改用服务器中转')
  }, WATCHDOG_MS)
  await pair.pc.setLocalDescription(await pair.pc.createOffer())
  void api.signal(code, myId, to, pair.pc.localDescription!.toJSON())
}

async function handle(from: string, sdp?: RTCSessionDescriptionInit, candidate?: RTCIceCandidateInit) {
  if (sdp?.type === 'offer') {
    let pair: Pair | null | undefined = pairs.get(from)
    if (!pair) {
      pair = mk()
      if (!pair) return forceRelay(from, '本机浏览器不支持 WebRTC,文件将走服务器中转')
      pairs.set(from, pair)
      pair.pc.ondatachannel = (e) => bind(e.channel, from)
    }
    await pair.pc.setRemoteDescription(sdp)
    pair.remoteSet = true
    flush(pair, from)
    await pair.pc.setLocalDescription(await pair.pc.createAnswer())
    void api.signal(code, myId, from, pair.pc.localDescription!.toJSON())
  } else if (sdp) {
    const pair = pairs.get(from)
    if (!pair) return
    await pair.pc.setRemoteDescription(sdp)
    pair.remoteSet = true
    flush(pair, from)
  } else if (candidate) {
    const pair = pairs.get(from)
    if (!pair) return
    if (pair.remoteSet) await pair.pc.addIceCandidate(candidate).catch(() => {})
    else pair.candQ.push(candidate)
  }
}

function flush(pair: Pair, to: string) {
  for (const c of pair.candQ) void pair.pc.addIceCandidate(c).catch(() => {})
  pair.candQ = []
  void to
}

function bind(dc: RTCDataChannel, to: string) {
  const pair = pairs.get(to)
  if (!pair) return
  pair.dc = dc
  dc.bufferedAmountLowThreshold = 64_000
  dc.onopen = () => {
    if (pair.mode !== 'p2p') {
      pair.mode = 'p2p'
      useStore.getState().setPeerMode(to, 'p2p')
      useStore.getState().toast('已建立 P2P 直连', 'ok')
    }
    dc.send(JSON.stringify({ t: 'hello', name: myName, chunkMax: legacySafariMaxChunk() }))
  }
  dc.onclose = () => {
    if (pair.mode === 'p2p') downgrade(to, '直连断开')
  }
  dc.onmessage = (e) => {
    if (typeof e.data === 'string') dispatchCtrl(to, e.data)
    else handleBinary(to, e.data as ArrayBuffer | Blob)
  }
}

/** 连 pc 都建不起来时(浏览器不支持/配置被拒)直接把该 peer 标为中转 */
function forceRelay(to: string, why: string) {
  useStore.getState().setPeerMode(to, 'relay')
  useStore.getState().toast(why, 'error')
}

function downgrade(to: string, why: string) {
  const pair = pairs.get(to)
  if (!pair || pair.mode === 'relay') return
  pair.mode = 'relay'
  useStore.getState().setPeerMode(to, 'relay')
  useStore.getState().toast(why, 'error')
}

/** 供 protocol/relay 调用:文本优先 DC,失败返回 false 由调用方走 SSE */
export function sendText(to: string, json: string): boolean {
  const pair = pairs.get(to)
  if (pair?.mode === 'p2p' && pair.dc?.readyState === 'open') {
    pair.dc.send(json)
    return true
  }
  return false
}

export function openChannel(to: string): RTCDataChannel | null {
  const pair = pairs.get(to)
  return pair?.mode === 'p2p' && pair.dc?.readyState === 'open' ? pair.dc : null
}
