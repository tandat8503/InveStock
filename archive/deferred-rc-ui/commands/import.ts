import { command } from './client'
export const imports = { productsExcel: (filePath: string) => command<number>('import_products_excel', { filePath }) }
