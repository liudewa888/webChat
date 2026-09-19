'use client'
// 群聊发送入口:文本 DC 优先/SSE 兜底;文件统一走服务器归档(广播元信息,谁要谁从服务器拉)
import { api } from '@/lib/room'
import { sendCtrl } from '@/lib/protocol'
import { sendFileViaRelay } from '@/lib/relay'
import { useStore } from '@/lib/store'
import { uid } from '@/lib/uid'

/** 群聊文本:先尝试 DC 直连每个 peer,失败走 SSE 服务器广播 */
export function sendTextMsg(code: string, text: string) {
  const t = text.trim()
  if (!t) return
  const s = useStore.getState()
  const mid = uid()
  // 先本地显示
  s.addMsg({ mid, from: 'me', time: Date.now(), via: 'relay', peerId: s.myId, kind: 'text', text: t })
  // 尝试 DC 直连每个在线 peer(去重由接收方 addMsgIfNew 处理)
  let anyDirect = false
  for (const p of s.peers) {
    const ok = sendCtrl(p.id, { t: 'chat', mid, text: t })
    if (ok) anyDirect = true
  }
  // 上报服务器:① 离线设备兜底 ② 房间暂存(10 分钟) ③ 广播给全房
  void api.message(code, { from: s.myId, to: '*', kind: 'chat', mid, text: t })
  if (!anyDirect && s.peers.length > 0) s.toast('直连均不可用,文本已走服务器中转', 'info')
}

/** 单次发送文件大小上限 */
export const MAX_FILE_BYTES = 10 * 1024 * 1024

/**
 * 群聊文件:统一走服务器归档(上传→广播 file-link)。
 * 好处:① 发送方走后别人仍能下载 ② 不拖慢所有人(谁点保存谁才从服务器拉)
 */
export async function sendFiles(code: string, files: File[]) {
  const s = useStore.getState()
  if (s.peers.length === 0) {
    s.toast('暂无其他设备在线,文件仍会上传并暂存 10 分钟,对方进来即可下载', 'info')
  }
  for (const f of files) {
    if (f.size > MAX_FILE_BYTES) {
      s.toast(`${f.name} 超过 10MB 上限,已跳过`, 'error')
      continue
    }
    // 文件统一走服务器归档(上传+广播),不再走 P2P 推送
    await sendFileViaRelay(code, f)
  }
}
