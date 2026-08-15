import { parseImportDate } from '../../utils/dateParsing'
import type { ImportType } from '../../../shared/ipc-types'
import type { ImportCell, NormalizedImportRow } from './importModels'
import { cellText } from './importParsingService'
import { inferAnimalCategory, normalizeNxtguiUnit } from './nxtguiParsingService'

export function parseImportInteger(value: unknown): number | null {
  if (value === null || value === undefined || cellText(value).trim() === '') return null
  if (typeof value === 'number') return Math.round(value)
  const cleaned = cellText(value).replace(/[.,\s](?=\d{3}(?:\D|$))/g, '')
  const num = Number(cleaned)
  if (isNaN(num)) return null
  return Math.round(num)
}

export function parseImportMoney(value: unknown): number | null {
  if (value === null || value === undefined || cellText(value) === '') return 0
  if (typeof value === 'number') return Math.round(value)
  const cleaned = cellText(value).replace(/[.,\s](?=\d{3}(?:\D|$))/g, '')
  const num = Number(cleaned)
  if (isNaN(num)) return null
  return Math.round(num)
}

export interface NormalizeRowInput {
  importType: ImportType
  row: ImportCell[]
  columnIndexes: Map<string, number>
}

export function normalizeImportRow(input: NormalizeRowInput): NormalizedImportRow {
  const value = (field: string): unknown => input.row[input.columnIndexes.get(field) ?? -1]
  const output: NormalizedImportRow = {
    productCode: cellText(value('productCode')),
    productName: cellText(value('productName')),
  }
  if (input.importType === 'products') {
    const rawUnit = cellText(value('inventoryUnit'))
    output.inventoryUnit = rawUnit === 'Túi' ? 'Tui' : rawUnit === 'Bịch' ? 'Bich' : rawUnit
    output.animalCategory = cellText(value('animalCategory')) || 'khac'
    output.packageWeightGrams = parseImportInteger(value('packageWeightGrams')) ?? 0
    output.currentSalePrice = parseImportInteger(value('currentSalePrice')) ?? 0
    output.brand = cellText(value('brand'))
    output.notes = cellText(value('notes'))
    return output
  }
  if (input.importType === 'nxtgui_inventory_summary') {
    const rawUnit = cellText(value('inventoryUnit'))
    output.inventoryUnit = normalizeNxtguiUnit(rawUnit)
    const customAnimal = cellText(value('animalCategory'))
    output.animalCategory = customAnimal || inferAnimalCategory(output.productName as string)
    output.inferredAnimalCategory = !customAnimal ? 1 : 0
    output.openingQuantity = parseImportInteger(value('openingQuantity')) ?? 0
    output.openingUnitCost = parseImportMoney(value('openingUnitCost')) ?? 0
    output.openingValue = parseImportMoney(value('openingValue')) ?? 0
    output.purchaseQuantity = parseImportInteger(value('purchaseQuantity')) ?? 0
    output.purchaseUnitCost = parseImportMoney(value('purchaseUnitCost')) ?? 0
    output.purchaseValue = parseImportMoney(value('purchaseValue')) ?? 0
    output.saleQuantity = parseImportInteger(value('saleQuantity')) ?? 0
    output.saleUnitCost = parseImportMoney(value('saleUnitCost')) ?? 0
    output.saleValue = parseImportMoney(value('saleValue')) ?? 0
    output.closingQuantity = parseImportInteger(value('closingQuantity')) ?? 0
    output.closingUnitCost = parseImportMoney(value('closingUnitCost')) ?? 0
    output.closingValue = parseImportMoney(value('closingValue')) ?? 0
    return output
  }
  output.quantity = parseImportInteger(value('quantity'))
  output.invoiceNumber = cellText(value('invoiceNumber'))
  output.invoiceDate = parseImportDate(value('invoiceDate'))
  output.unitPrice = parseImportInteger(value('unitPrice'))
  output.totalAmount = parseImportInteger(value('totalAmount'))
  output.unitCost = parseImportInteger(value('unitCost'))
  output.openingDate = parseImportDate(value('openingDate'))
  if (output.unitPrice === null && output.totalAmount !== null && Number(output.quantity) > 0) {
    output.unitPrice = Math.round(Number(output.totalAmount) / Number(output.quantity))
  }
  return output
}
