import type { Metadata } from 'next'
import RoomClient from '@/components/RoomClient'

export const dynamic = 'force-dynamic'

type Props = { params: Promise<{ code: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { code } = await params
  return { title: `房间 ${code} · 网传` }
}

export default async function RoomPage({ params }: Props) {
  const { code } = await params
  const normalized = code.toLowerCase()
  if (!/^[a-z0-9]{4,12}$/.test(normalized)) {
    return <p className="p-8 text-center text-sm text-neutral-500">房间码格式不正确,请返回首页重新进入。</p>
  }
  return <RoomClient code={normalized} />
}
