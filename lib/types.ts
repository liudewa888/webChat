// 共享类型:服务端 SSE 事件、DataChannel 控制帧、聊天消息

export type PeerInfo = { id: string; name: string }

export type SseEvent =
  | { event: 'hello'; data: { self: string; peers: PeerInfo[] } }
  | { event: 'peer-joined'; data: PeerInfo }
  | { event: 'peer-left'; data: { id: string } }
  | { event: 'signal'; data: { from: string; sdp?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit } }
  | { event: 'chat'; data: RelayChat }
  | { event: 'history'; data: { items: HistoryItem[] } }
  | { event: 'full'; data: { max: number } }
  | { event: 'room-full'; data: { max: number } }

/** 服务端房间暂存的消息(默认保留 10 分钟),新人进房/断线重连后回放 */
export type HistoryItem = {
  mid: string
  cid: string        // 发送方设备稳定 id(localStorage),用于把「自己的历史消息」显示在右侧
  name: string       // 发送方设备名
  time: number
  kind: 'chat' | 'file-link'
  text?: string
  url?: string
  fname?: string
  fsize?: number
  ftype?: string
}

export type RelayChat = {
  from: string
  to: string           // peerId 或 '*' 表示全房
  kind: 'chat' | 'file-link'
  mid: string
  text?: string
  url?: string         // file-link: /api/f/<token>
  name?: string
  size?: number
  type?: string
}

// ---- DataChannel 控制帧 ----
export type Ctrl =
  | { t: 'hello'; name: string; chunkMax?: number }
  | { t: 'chat'; mid: string; text: string }
  | { t: 'file-meta'; fid: string; name: string; size: number; type: string }
  | { t: 'file-ok'; fid: string }
  | { t: 'file-reject'; fid: string; why: string }
  | { t: 'file-progress'; fid: string; recv: number }
  | { t: 'file-done'; fid: string }

// ---- UI 消息模型 ----
export type FileState =
  | { phase: 'connecting' }                      // 等待对方 file-ok
  | { phase: 'sending'; sent: number }
  | { phase: 'receiving'; recv: number }
  | { phase: 'uploading'; sent: number }         // 中转上传中
  | { phase: 'done' }
  | { phase: 'failed'; reason: string }

export type Msg = {
  mid: string
  from: 'me' | 'them'
  time: number
  via: 'p2p' | 'relay'
  peerId?: string   // 关联的设备 id(发送目标或来源)
  fromName?: string // 发送方设备名(历史回放时对方可能已离线,只能靠这个显示)
} & (
  | { kind: 'text'; text: string }
  | {
      kind: 'file'
      name: string
      size: number
      type: string
      state: FileState
      url?: string // 完成后可保存:objectURL 或 /api/f/token
    }
)

export type PeerState = PeerInfo & { mode: 'connecting' | 'p2p' | 'relay' }
