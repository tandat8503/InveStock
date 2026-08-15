import type { IpcMain } from 'electron'
import { app, shell, dialog } from 'electron'
import { handle } from './utils'
import { IPC_CHANNELS } from '../../shared/ipc-types'
import path from 'path'
import { v4 as uuidv4 } from 'uuid'
import fs from 'fs'
import { getDb } from '../db/connection'
import { attachments } from '../db/schema'
import { eq, and } from 'drizzle-orm'

const ALLOWED_ENTITY_TYPES = new Set(['purchase_invoice', 'sales_invoice'])
const ALLOWED_EXTENSIONS = new Set(['.pdf', '.xml', '.jpg', '.jpeg', '.png'])
const MAX_FILE_SIZE = 20 * 1024 * 1024

export function validateAttachmentFile(filePath: string): { extension: string; size: number } {
  if (!fs.existsSync(filePath)) throw new Error(`File không tồn tại: ${filePath}`)
  const stats = fs.statSync(filePath)
  if (!stats.isFile()) throw new Error('Đường dẫn không phải file')
  if (stats.size > MAX_FILE_SIZE) throw new Error('File vượt quá giới hạn 20 MB')
  const extension = path.extname(filePath).toLowerCase()
  if (!ALLOWED_EXTENSIONS.has(extension)) throw new Error('Định dạng file không được hỗ trợ')
  const header = Buffer.alloc(Math.min(stats.size, 512))
  const descriptor = fs.openSync(filePath, 'r')
  try {
    fs.readSync(descriptor, header, 0, header.length, 0)
  } finally {
    fs.closeSync(descriptor)
  }
  const isPdf = extension === '.pdf' && header.subarray(0, 5).toString() === '%PDF-'
  const isPng = extension === '.png' && header.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  const isJpeg = (extension === '.jpg' || extension === '.jpeg') &&
    header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff
  const xmlText = header.toString('utf8').trimStart()
  const isXml = extension === '.xml' && (xmlText.startsWith('<?xml') || xmlText.startsWith('<'))
  if (!isPdf && !isPng && !isJpeg && !isXml) {
    throw new Error('Nội dung file không khớp với phần mở rộng')
  }
  return { extension, size: stats.size }
}

function validateEntity(entityType: string, entityId: number): void {
  if (!ALLOWED_ENTITY_TYPES.has(entityType)) throw new Error('Loại chứng từ không hợp lệ')
  if (!Number.isInteger(entityId) || entityId <= 0) throw new Error('Mã chứng từ không hợp lệ')
}

function safeAttachmentPath(relativePath: string): string {
  const base = path.resolve(getAttachmentsBase())
  const result = path.resolve(base, relativePath)
  if (!result.startsWith(`${base}${path.sep}`)) throw new Error('Đường dẫn file không hợp lệ')
  return result
}

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_').substring(0, 200)
}

function getAttachmentsBase(): string {
  return path.join(app.getPath('userData'), 'attachments')
}

export function registerAttachmentHandlers(ipcMain: IpcMain): void {
  handle(ipcMain, IPC_CHANNELS.ATTACHMENT_SAVE, async (_event, entityType, entityId, sourcePath) => {
    const db = getDb()
    const srcPath = sourcePath as string
    const eType = entityType as string
    const eId = entityId as number
    validateEntity(eType, eId)
    if (eType === 'purchase_invoice') {
      const invoice = await db.query.purchaseInvoices.findFirst({
        where: (table, operators) => operators.eq(table.id, eId),
      })
      if (!invoice) throw new Error('Phiếu nhập không tồn tại')
      if (invoice.status !== 'nhap') throw new Error('Chỉ được gắn file khi phiếu nhập còn nháp')
    } else {
      const invoice = await db.query.salesInvoices.findFirst({
        where: (table, operators) => operators.eq(table.id, eId),
      })
      if (!invoice) throw new Error('Phiếu xuất không tồn tại')
      if (invoice.status !== 'nhap') throw new Error('Chỉ được gắn file khi phiếu xuất còn nháp')
    }

    const validated = validateAttachmentFile(srcPath)
    const stats = fs.statSync(srcPath)
    const originalFilename = path.basename(srcPath)
    const ext = validated.extension
    const storedFilename = `${uuidv4()}-${sanitizeFilename(path.basename(originalFilename, ext))}${ext}`
    const relativeDir = path.join(eType, String(eId))
    const absoluteDir = path.join(getAttachmentsBase(), relativeDir)
    const relativePath = path.join(relativeDir, storedFilename)
    const absolutePath = path.join(absoluteDir, storedFilename)

    fs.mkdirSync(absoluteDir, { recursive: true })
    fs.copyFileSync(srcPath, absolutePath)

    // Detect mime type from extension
    const mimeMap: Record<string, string> = {
      '.pdf': 'application/pdf',
      '.xml': 'application/xml',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
    }
    const mimeType = mimeMap[ext.toLowerCase()] ?? 'application/octet-stream'

    try {
      const [attachment] = await db.insert(attachments).values({
          entityType: eType, entityId: eId, originalFilename, storedFilename,
          mimeType, relativePath, fileSize: stats.size,
        }).returning()
      return attachment
    } catch (error) {
      if (fs.existsSync(absolutePath)) fs.unlinkSync(absolutePath)
      throw error
    }
  })

  handle(ipcMain, IPC_CHANNELS.ATTACHMENT_LIST, async (_event, entityType, entityId) => {
    validateEntity(entityType as string, entityId as number)
    const db = getDb()
    return db
      .select()
      .from(attachments)
      .where(
        and(
          eq(attachments.entityType, entityType as string),
          eq(attachments.entityId, entityId as number)
        )
      )
  })

  handle(ipcMain, IPC_CHANNELS.ATTACHMENT_OPEN, async (_event, id) => {
    const db = getDb()
    const [attachment] = await db
      .select()
      .from(attachments)
      .where(eq(attachments.id, id as number))

    if (!attachment) throw new Error('File không tồn tại')

    const absolutePath = safeAttachmentPath(attachment.relativePath)
    if (!fs.existsSync(absolutePath)) {
      throw new Error('File đã bị xóa khỏi hệ thống')
    }

    await shell.openPath(absolutePath)
  })

  handle(ipcMain, IPC_CHANNELS.ATTACHMENT_DELETE, async (_event, id) => {
    const db = getDb()
    const [attachment] = await db
      .select()
      .from(attachments)
      .where(eq(attachments.id, id as number))

    if (!attachment) throw new Error('Không tìm thấy file')
    if (attachment.entityType === 'purchase_invoice') {
      const invoice = await db.query.purchaseInvoices.findFirst({
        where: (table, operators) => operators.eq(table.id, attachment.entityId),
      })
      if (invoice?.status === 'xac_nhan') {
        throw new Error('Không thể xóa file của phiếu nhập đã xác nhận')
      }
    }
    if (attachment.entityType === 'sales_invoice') {
      const invoice = await db.query.salesInvoices.findFirst({
        where: (table, operators) => operators.eq(table.id, attachment.entityId),
      })
      if (invoice?.status !== 'nhap') {
        throw new Error('Không thể xóa file của phiếu xuất đã xác nhận hoặc đã hủy')
      }
    }

    // Check if any other attachments use the same stored file (shouldn't happen with uuid names)
    const absolutePath = safeAttachmentPath(attachment.relativePath)

    await db.delete(attachments).where(eq(attachments.id, id as number))

    // Only delete the physical file after DB delete succeeds
    if (fs.existsSync(absolutePath)) {
      fs.unlinkSync(absolutePath)
    }
  })

  // Dialog for selecting attachment file
  ipcMain.handle(IPC_CHANNELS.DIALOG_OPEN_FILE, async (_event, filters) => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: filters as Electron.FileFilter[] ?? [
        { name: 'Hóa đơn', extensions: ['pdf', 'xml', 'jpg', 'jpeg', 'png'] },
      ],
    })
    return result.canceled ? null : result.filePaths[0]
  })

  ipcMain.handle(IPC_CHANNELS.DIALOG_OPEN_FOLDER, async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory'],
    })
    return result.canceled ? null : result.filePaths[0]
  })

  ipcMain.handle(IPC_CHANNELS.DIALOG_SAVE_FILE, async (_event, defaultName) => {
    const result = await dialog.showSaveDialog({
      defaultPath: defaultName as string ?? 'export.xlsx',
    })
    return result.canceled ? null : result.filePath
  })
}
