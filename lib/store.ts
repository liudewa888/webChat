'use client'
import { create } from 'zustand'
import type { Msg, PeerState } from '@/lib/types'

type Store = {
  myId: string
  myName: string
  myCid: string // 本设备稳定 id,用于识别历史消息里自己发的那条
  peers: PeerState[]
  messages: Msg[]                // 群聊:全房一个会话流
  toasts: { id: number; text: string; kind: 'info' | 'error' | 'ok' }[]
  sseUp: boolean

  setMe: (id: string, name: string) => void
  setCid: (cid: string) => void
  addMsgIfNew: (m: Msg) => boolean // 按 mid 去重(DC 与 SSE 双路投递时会重复)
  setSse: (up: boolean) => void
  addPeer: (p: PeerState) => void
  removePeer: (id: string) => void
  setPeerMode: (id: string, mode: PeerState['mode']) => void
  addMsg: (m: Msg) => void
  updateMsg: (mid: string, updater: (m: Msg) => Msg) => void
  toast: (text: string, kind?: 'info' | 'error' | 'ok') => void
}

let toastId = 0

export const useStore = create<Store>((set, get) => ({
  myId: '',
  myName: '',
  myCid: '',
  peers: [],
  messages: [],
  toasts: [],
  sseUp: false,

  setMe: (myId, myName) => set({ myId, myName }),
  setCid: (myCid) => set({ myCid }),
  addMsgIfNew: (m) => {
    if (get().messages.some((x) => x.mid === m.mid)) return false
    set((s) => ({ messages: [...s.messages, m] }))
    return true
  },
  setSse: (sseUp) => set({ sseUp }),
  addPeer: (p) => set((s) => ({ peers: [...s.peers.filter((x) => x.id !== p.id), p] })),
  removePeer: (id) => set((s) => ({ peers: s.peers.filter((p) => p.id !== id) })),
  setPeerMode: (id, mode) => set((s) => ({ peers: s.peers.map((p) => (p.id === id ? { ...p, mode } : p)) })),
  addMsg: (m) => set((s) => ({ messages: [...s.messages, m] })),
  updateMsg: (mid, updater) => set((s) => ({ messages: s.messages.map((m) => (m.mid === mid ? updater(m) : m)) })),
  toast: (text, kind = 'info') => {
    const id = ++toastId
    set((s) => ({ toasts: [...s.toasts, { id, text, kind }] }))
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), 3600)
  },
}))
