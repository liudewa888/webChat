'use client'
// 文件服务器归档:上传到服务器 → 以 file-link 聊天消息广播给全房
import { api } from '@/lib/room'
import { useStore } from '@/lib/store'
import { uid } from '@/lib/uid'
import type { Msg } from '@/lib/types'

/**
 * P2P 直传成功后的后台归档:把文件也留一份到服务器,并广播进房间暂存(沿用同一 mid,不会重复显示)。
 * 静默执行、失败无感 —— 目的是让「后进房的人」也能看到并下载图片/文件。
 */
export async function archiveP2PFile(code: string, file: File, mid: string): Promise<void> {
  if (!mid) return
  try {
    const res = await api.upload(code, file, () => {})
    if (!res.ok || !res.url) return
    // 给发送方自己的卡片补上链接:图片可直接显示缩略图,也能重新下载
    useStore.getState().updateMsg(mid, (m) => (m.kind === 'file' ? { ...m, url: res.url } : m))
    await api.message(code, {
      from: useStore.getState().myId, to: '*', kind: 'file-link', mid,
      url: res.url, name: file.name, size: res.size ?? file.size, type: file.type,
    })
  } catch {}
}

/** 群聊文件发送:上传到服务器 → 广播 file-link 给全房 */
export async function sendFileViaRelay(code: string, file: File, reuseMid?: string): Promise<boolean> {
  const s = useStore.getState()
  let mid = reuseMid ?? uid()
  if (reuseMid) {
    s.updateMsg(mid, (m) => (m.kind === 'file' ? { ...m, state: { phase: 'uploading', sent: 0 }, via: 'relay' } : m))
  } else {
    s.addMsg({
      mid, from: 'me', time: Date.now(), via: 'relay', kind: 'file',
      name: file.name, size: file.size, type: file.type, state: { phase: 'uploading', sent: 0 }, peerId: s.myId,
    })
  }
  try {
    const res = await api.upload(code, file, (sent) => {
      useStore.getState().updateMsg(mid, (m) => (m.kind === 'file' ? { ...m, state: { phase: 'uploading', sent } } : m))
    })
    if (!res.ok || !res.url) throw new Error(res.why === 'too-large' ? '文件超过 10MB 上限' : '上传失败')
    const myId = s.myId
    const msg: Msg & { mid: string } = {
      mid, from: 'me', time: Date.now(), via: 'relay', kind: 'file',
      name: file.name, size: res.size ?? file.size, type: file.type,
      state: { phase: 'done' }, url: res.url, peerId: myId,
    }
    s.updateMsg(mid, () => msg)
    await api.message(code, {
      from: myId, to: '*', kind: 'file-link', mid, url: res.url, name: file.name,
      size: res.size ?? file.size, type: file.type,
    })
    return true
  } catch (e) {
    s.updateMsg(mid, (m) => (m.kind === 'file' ? { ...m, state: { phase: 'failed', reason: (e as Error).message } } : m))
    s.toast((e as Error).message, 'error')
    return false
  }
}
