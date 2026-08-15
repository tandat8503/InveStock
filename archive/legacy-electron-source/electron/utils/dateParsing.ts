export function parseImportDate(value: unknown): string | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10)
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value < 1 || value > 2_958_465) return null
    const date = new Date(Date.UTC(1899, 11, 30) + Math.floor(value) * 86_400_000)
    return date.toISOString().slice(0, 10)
  }
  if (typeof value !== 'string') return null
  const text = value.trim()
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(text)
  const local = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(text)
  const parts = iso ? [Number(iso[1]), Number(iso[2]), Number(iso[3])]
    : local ? [Number(local[3]), Number(local[2]), Number(local[1])] : null
  if (!parts) return null
  const [year, month, day] = parts
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
    ? `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}` : null
}
