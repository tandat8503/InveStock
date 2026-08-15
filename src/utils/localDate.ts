/**
 * Returns the current local calendar date as YYYY-MM-DD string.
 * Uses getFullYear/getMonth/getDate so it always matches the machine's
 * local calendar day — never shifts to the previous day in UTC+7 and
 * similar timezones.
 *
 * Do NOT use new Date().toISOString().slice(0, 10) for business dates.
 */
export function localDateISO(date = new Date()): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}
