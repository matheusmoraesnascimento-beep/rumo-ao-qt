/**
 * Login por nome de usuário. O Supabase Auth autentica por e-mail, então um nome sem "@"
 * vira o e-mail interno `<nome>@usuario.local` (domínio reservado, nunca recebe mensagens).
 * Nenhum e-mail real é embutido no código público.
 */
export const USER_DOMAIN = 'usuario.local'
const USERNAME = /^[a-z0-9._-]{2,32}$/i

export const isUsername = (s: string): boolean => USERNAME.test(s.trim())

/** "moraes" -> "moraes@usuario.local"; e-mails passam como estão. */
export function toLoginEmail(identifier: string): string {
  const v = identifier.trim()
  return v.includes('@') ? v : `${v.toLowerCase()}@${USER_DOMAIN}`
}
