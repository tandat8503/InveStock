import type { InventoryParams, InventorySummaryDTO, InventoryTransactionDTO, PeriodResponse, ProductPriceHistoryPoint, CreateInventoryAdjustmentInput, InventoryAdjustmentDTO, CurrentInventoryRowDTO, InventoryDataHealth } from '@shared/ipc-types'
import { command } from './client'
export const inventory = {
  summary: (params: Pick<InventoryParams, 'dateFrom' | 'dateTo'> = {}) => command<PeriodResponse<InventorySummaryDTO>>('get_inventory_summary', params),
  priceHistory: (productId: number) => command<ProductPriceHistoryPoint[]>('get_product_price_history', { productId }),
  productHistory: (productId: number, params: Pick<InventoryParams, 'page' | 'pageSize'> = {}) => command<InventoryTransactionDTO[]>('get_product_inventory_history', { productId, ...params }),
  createAdjustment: (input: CreateInventoryAdjustmentInput) => command<InventoryAdjustmentDTO>('create_inventory_adjustment', { input }),
  adjustments: () => command<InventoryAdjustmentDTO[]>('get_inventory_adjustments'),
  getCurrentInventory: () => command<CurrentInventoryRowDTO[]>('get_current_inventory'),
  checkInventoryDataHealth: () => command<InventoryDataHealth>('check_inventory_data_health')
}
