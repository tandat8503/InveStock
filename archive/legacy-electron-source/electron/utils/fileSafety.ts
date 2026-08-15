import fs from 'fs'
import path from 'path'
import crypto from 'crypto'

export function sha256File(filePath: string): string {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex')
}

export function assertSafeArchivePath(entryPath: string): void {
  if (
    path.isAbsolute(entryPath) ||
    /^[\\/]/.test(entryPath) ||
    /^[A-Za-z]:/.test(entryPath) ||
    entryPath.split(/[\\/]/).includes('..')
  ) {
    throw new Error('Backup chứa đường dẫn không an toàn')
  }
}

export function safeResolve(base: string, relative: string): string {
  assertSafeArchivePath(relative)
  const resolved = path.resolve(base, relative)
  const root = path.resolve(base)
  if (!resolved.startsWith(`${root}${path.sep}`) && resolved !== root) throw new Error('Đường dẫn vượt ngoài thư mục cho phép')
  return resolved
}
