import * as XLSX from 'xlsx'
import { dialog } from 'electron'
import { getProductRepository } from '../repositories/productRepository'

export async function exportProductsExcel(): Promise<string> {
  const repository = getProductRepository()
  const firstPage = await repository.list({ page: 1, pageSize: 500 })
  const allProducts = [...firstPage.items]
  for (let page = 2; allProducts.length < firstPage.total; page += 1) {
    const nextPage = await repository.list({ page, pageSize: 500 })
    allProducts.push(...nextPage.items)
  }
  const save = await dialog.showSaveDialog({
    defaultPath: `danh-muc-san-pham_${new Date().toISOString().slice(0, 10)}.xlsx`,
    filters: [{ name: 'Excel', extensions: ['xlsx'] }],
  })
  if (save.canceled || !save.filePath) return ''
  const rows = allProducts.map((product) => ({
    'Mã sản phẩm': product.productCode,
    'Tên sản phẩm': product.productName,
    'Loại vật nuôi': product.animalCategory,
    'Đơn vị tính': product.inventoryUnit,
    'Trọng lượng (gram)': product.packageWeightGrams,
    'Thương hiệu': product.brand ?? '',
    'Giá nhập gần nhất': product.latestPurchasePrice,
    'Giá vốn bình quân': product.averageCost,
    'Giá bán': product.currentSalePrice,
    'Tồn kho': product.currentStock,
    'Trạng thái': product.active ? 'Đang kinh doanh' : 'Ngừng kinh doanh',
  }))
  const sheet = XLSX.utils.json_to_sheet(rows)
  for (let row = 2; row <= rows.length + 1; row += 1) {
    const cell: unknown = sheet[`A${row}`]
    if (cell && typeof cell === 'object' && 't' in cell) {
      const typedCell = cell as XLSX.CellObject
      typedCell.t = 's'
    }
  }
  sheet['!autofilter'] = { ref: sheet['!ref'] ?? 'A1:A1' }
  sheet['!freeze'] = { xSplit: 0, ySplit: 1 }
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, sheet, 'Sản phẩm')
  XLSX.writeFile(workbook, save.filePath)
  return save.filePath
}
