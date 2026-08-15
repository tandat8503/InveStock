/**
 * Format utilities for Vietnamese locale
 */

// Format VND currency with thousand separators
export function formatVND(amount: number): string {
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}

// Format number with thousand separators
export function formatNumber(n: number): string {
  return new Intl.NumberFormat('vi-VN').format(n)
}

// Format date DD/MM/YYYY from ISO date string YYYY-MM-DD
export function formatDate(dateStr: string): string {
  if (!dateStr) return ''
  // Handle both YYYY-MM-DD and YYYY-MM-DD HH:mm:ss formats
  const parts = dateStr.substring(0, 10).split('-')
  if (parts.length !== 3) return dateStr
  return `${parts[2]}/${parts[1]}/${parts[0]}`
}

// Format datetime DD/MM/YYYY HH:mm
export function formatDateTime(dateStr: string): string {
  if (!dateStr) return ''
  const date = new Date(dateStr)
  if (isNaN(date.getTime())) return dateStr
  const day = String(date.getDate()).padStart(2, '0')
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const year = date.getFullYear()
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  return `${day}/${month}/${year} ${hours}:${minutes}`
}

// Format ISO date for input[type="date"] value
export function toInputDate(dateStr: string): string {
  return dateStr.substring(0, 10)
}

// Get today as YYYY-MM-DD
export function todayISO(): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

// Animal category label
export const animalCategoryLabels: Record<string, string> = {
  heo: 'Heo',
  ga: 'Gà',
  vit: 'Vịt',
  bo: 'Bò',
  de: 'Dê',
  khac: 'Khác',
}

// Payment method label
export const paymentMethodLabels: Record<string, string> = {
  chuyen_khoan: 'Chuyển khoản',
  tien_mat: 'Tiền mặt',
  khac: 'Khác',
}

// Buyer type label
export const buyerTypeLabels: Record<string, string> = {
  khach_le: 'Khách lẻ',
  dai_ly: 'Đại lý',
  trang_trai: 'Trang trại',
  khac: 'Khác',
}

// Invoice status label
export const invoiceStatusLabels: Record<string, string> = {
  nhap: 'Nháp',
  xac_nhan: 'Đã xác nhận',
  huy: 'Đã hủy',
}

// Format package weight from grams
export function formatWeight(grams: number, unit: string): string {
  void unit // legacy display hint; grams is the canonical value.
  if (grams >= 1000) {
    const kg = grams / 1000
    return `${kg % 1 === 0 ? kg.toFixed(0) : kg} kg`
  }
  return `${grams} g`
}
