// 房间码生成:去混淆字符集,6 位 ≈ 7.3 亿组合(仅服务端 import)
import { randomBytes } from 'crypto'

const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789' // 30 字符,无 i/l/o/0/1

export function genCode(): string {
  const bytes = randomBytes(6)
  let s = ''
  for (const b of bytes) s += ALPHABET[b % 30]
  return s
}

export function genToken(): string {
  return randomBytes(12).toString('hex')
}
