import { createHash } from 'node:crypto'

/** UUID determinístico (formato v5-like) — usado só em scripts/testes (Node), nunca no browser. */
export function detUuid(name: string): string {
  const h = createHash('sha1').update(`rumo-ao-qt:${name}`).digest('hex')
  const variant = ((parseInt(h.slice(16, 18), 16) & 0x3f) | 0x80).toString(16).padStart(2, '0')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-${variant}${h.slice(18, 20)}-${h.slice(20, 32)}`
}
