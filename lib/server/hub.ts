// 服务端房间注册表(单进程内存)。globalThis 守卫,防 dev 热重载丢状态/重复起定时器。
import fs from 'fs'
import path from 'path'
import type { HistoryItem, PeerInfo } from '@/lib/types'

export const MAX_PEERS = 4 // 群聊房间上限,4 人 = 6 条直连通道(C(4,2)),低配服务器友好
export const MAX_ROOMS = 4 // 全局最多 4 个房间
const IDLE_MS = 2 * 60 * 60 * 1000   // 空房 2 小时后回收
export const FILE_TTL_MS = 10 * 60 * 1000   // 中转/归档文件有效期(与消息暂存窗口一致)
export const FILE_QUOTA_BYTES = 100 * 1024 * 1024 // 临时目录总容量上限,超出按「最旧优先」淘汰

/**
 * 中转/归档文件目录:固定为项目(部署)根目录下的 tmp/。
 * 不放系统临时目录 —— 那里可能被 systemd-tmpfiles 清理,或压根是 tmpfs(内存盘)。
 * 进程工作目录由 `next start` / pm2 的 cwd 决定,均为项目根。
 */
export function tempDir(): string {
  return path.join(process.cwd(), 'tmp')
}

/** 启动时清扫:上次进程崩溃/重启遗留的孤儿文件不清理会一直占磁盘 */
async function sweepOrphanFiles() {
  const dir = tempDir()
  try {
    const names = await fs.promises.readdir(dir)
    const cutoff = Date.now() - FILE_TTL_MS
    let removed = 0
    for (const n of names) {
      const p = path.join(dir, n)
      try {
        const st = await fs.promises.stat(p)
        // 尚有登记(dev 热重载场景)且未过期 → 保留;其余一律删除
        if (files.has(n) && st.mtimeMs >= cutoff) continue
        if (st.isFile()) {
          await fs.promises.unlink(p)
          removed++
        }
      } catch { }
    }
    // 日志:进程重启会清掉上次遗留的临时文件,便于排查「文件怎么没了」
    if (removed) console.log(`[webChat] 启动清扫:删除 ${removed} 个遗留临时文件(${dir})`)
  } catch { }
}
export const HISTORY_MS = 10 * 60 * 1000 // 房间消息暂存时长:晚来的设备能看到这 10 分钟内的消息
const HISTORY_MAX = 200              // 条数上限,防刷屏占内存

type Peer = { id: string; name: string; cid: string; ctrl: ReadableStreamDefaultController }
type Room = { code: string; peers: Map<string, Peer>; seq: number; lastAct: number; history: HistoryItem[] }

const g = globalThis as unknown as { __rooms?: Map<string, Room> }
export const rooms: Map<string, Room> = g.__rooms ??= new Map()

function getOrCreate(code: string): Room {
  let r = rooms.get(code)
  if (!r) {
    r = { code, peers: new Map(), seq: 0, lastAct: Date.now(), history: [] }
    rooms.set(code, r)
  }
  r.lastAct = Date.now()
  return r
}

/** 追加一条房间消息并清理过期项 */
export function addHistory(room: Room, item: HistoryItem) {
  room.history.push(item)
  pruneHistory(room)
}

export function pruneHistory(room: Room) {
  const cutoff = Date.now() - HISTORY_MS
  if (room.history.length && room.history[0].time < cutoff) {
    room.history = room.history.filter((h) => h.time >= cutoff)
  }
  if (room.history.length > HISTORY_MAX) room.history = room.history.slice(-HISTORY_MAX)
}

/** 取仍在暂存期内的消息(按时间升序) */
export function recentHistory(room: Room): HistoryItem[] {
  pruneHistory(room)
  return room.history
}

export function ev(ctrl: ReadableStreamDefaultController, event: string, data: unknown) {
  ctrl.enqueue(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
}

/** 定向发给某个 peer */
export function sendTo(room: Room, peerId: string, event: string, data: unknown): boolean {
  const p = room.peers.get(peerId)
  if (!p) return false
  try {
    ev(p.ctrl, event, data)
    return true
  } catch {
    return false
  }
}

/** 广播给全房(except 可排除自己) */
export function broadcast(room: Room, event: string, data: unknown, except?: string) {
  for (const [id, p] of room.peers) {
    if (id === except) continue
    try {
      ev(p.ctrl, event, data)
    } catch { }
  }
}

export type JoinResult = { room: Room; me: Peer } | 'full' | 'room-full'

export function join(code: string, name: string, cid = ''): JoinResult {
  // 全局房间数限制:新房间且已满 → 拒绝
  if (!rooms.has(code) && rooms.size >= MAX_ROOMS) return 'room-full'
  const room = getOrCreate(code)
  // 单房间人数限制
  if (room.peers.size >= MAX_PEERS) return 'full'
  const id = `p${++room.seq}`
  const peer: Peer = { id, name, cid, ctrl: null as unknown as ReadableStreamDefaultController }
  room.peers.set(id, peer)
  return { room, me: peer }
}

export function attach(code: string, id: string, ctrl: ReadableStreamDefaultController) {
  const room = rooms.get(code)
  const p = room?.peers.get(id)
  if (room && p) p.ctrl = ctrl
}

export function leave(code: string, id: string) {
  const room = rooms.get(code)
  if (!room) return
  room.peers.delete(id)
  broadcast(room, 'peer-left', { id })
}

export function peerList(room: Room, except?: string): PeerInfo[] {
  return [...room.peers.values()].filter((p) => p.id !== except).map(({ id, name }) => ({ id, name }))
}

// 20s 心跳(顺带防 nginx/代理掐线)+ 空房回收 + 临时文件清理
type FileReg = { dst: string; name: string; size: number; type: string; exp: number }
const gf = globalThis as unknown as { __files?: Map<string, FileReg>; __hubTimer?: NodeJS.Timeout }
export const files: Map<string, FileReg> = gf.__files ??= new Map()

if (!gf.__hubTimer) {
  void sweepOrphanFiles() // 进程启动即清扫历史孤儿文件
  gf.__hubTimer = setInterval(async () => {
    const now = Date.now()
    for (const room of rooms.values()) {
      pruneHistory(room)
      for (const p of room.peers.values()) {
        try {
          p.ctrl.enqueue(':hb\n\n')
        } catch { }
      }
      if (room.peers.size === 0 && now - room.lastAct > IDLE_MS) rooms.delete(room.code)
    }
    for (const [token, f] of files) {
      if (now > f.exp) {
        files.delete(token)
        import('fs').then((fs) => fs.promises.unlink(f.dst).catch(() => { }))
      }
    }
  }, 20_000)
  gf.__hubTimer.unref?.()
}

export function registerFile(token: string, reg: FileReg) {
  files.set(token, reg)
  trimToQuota()
}

/** 临时目录总容量超限时按「最早到期优先」淘汰;新文件到期时间最晚,不会被自己挤掉 */
function trimToQuota() {
  let total = 0
  for (const f of files.values()) total += f.size
  if (total <= FILE_QUOTA_BYTES) return
  const ordered = [...files.entries()].sort((a, b) => a[1].exp - b[1].exp)
  for (const [token, f] of ordered) {
    if (total <= FILE_QUOTA_BYTES) break
    files.delete(token)
    total -= f.size
    void fs.promises.unlink(f.dst).catch(() => { })
  }
}
