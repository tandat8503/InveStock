import fs from 'fs'
import os from 'os'
import path from 'path'
import { afterEach, describe, expect, it } from 'vitest'
import { validateAttachmentFile } from '../../electron/ipc/attachments'

describe('attachment validation', () => {
  const directories: string[] = []
  afterEach(() => {
    for (const directory of directories) fs.rmSync(directory, { recursive: true, force: true })
    directories.length = 0
  })

  function fixture(name: string, content: string | Buffer): string {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'phase3-attachment-'))
    directories.push(directory)
    const filePath = path.join(directory, name)
    fs.writeFileSync(filePath, content)
    return filePath
  }

  it('nhận PDF hợp lệ và chặn exe đổi tên thành PDF', () => {
    expect(validateAttachmentFile(fixture('invoice.pdf', '%PDF-1.7\n')).extension).toBe('.pdf')
    expect(() => validateAttachmentFile(fixture('fake.pdf', 'MZ executable'))).toThrow('không khớp')
  })

  it('chặn phần mở rộng không được hỗ trợ', () => {
    expect(() => validateAttachmentFile(fixture('invoice.exe', 'MZ'))).toThrow('không được hỗ trợ')
  })
})
