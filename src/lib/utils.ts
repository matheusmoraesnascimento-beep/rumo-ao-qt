import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { formatInTimeZone } from 'date-fns-tz'
import { DEFAULT_TZ } from './srs'

export const cn = (...i: ClassValue[]) => twMerge(clsx(i))

export const todayLocal = (tz = DEFAULT_TZ) => formatInTimeZone(new Date(), tz, 'yyyy-MM-dd')
export const fmtDateTime = (d: string | Date, tz = DEFAULT_TZ) => formatInTimeZone(new Date(d), tz, 'dd/MM/yyyy HH:mm')
export const fmtDate = (d: string | Date, tz = DEFAULT_TZ) => formatInTimeZone(new Date(d), tz, 'dd/MM/yyyy')

export function errMsg(e: unknown): string {
  if (e && typeof e === 'object' && 'message' in e) return String((e as { message: unknown }).message)
  return 'Erro inesperado. Tente novamente.'
}

export const uuid = () => crypto.randomUUID()

export const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const
export const WEEKDAY_LABEL: Record<string, string> = {
  mon: 'Segunda', tue: 'Terça', wed: 'Quarta', thu: 'Quinta', fri: 'Sexta', sat: 'Sábado', sun: 'Domingo',
}
export function weekdayKey(dateStr: string): (typeof WEEKDAYS)[number] {
  const [y, m, d] = dateStr.split('-').map(Number)
  return WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]
}
