/**
 * Inventory calculation utilities.
 * All calculations use integer math (VND đồng, not float).
 */

/**
 * Tính giá vốn bình quân sau khi nhập thêm hàng.
 * Công thức: ((tồn cũ × giá vốn cũ) + (số lượng nhập × giá thực nhập)) / (tồn cũ + số lượng nhập)
 *
 * Sử dụng integer math để tránh floating point errors.
 * Kết quả được làm tròn về đồng (Math.round).
 *
 * @param oldStock - Tồn kho hiện tại (integer)
 * @param oldAverageCost - Giá vốn bình quân hiện tại (VND, integer)
 * @param newQty - Số lượng nhập thêm (integer, > 0)
 * @param newUnitCost - Đơn giá thực nhập (VND, integer)
 * @returns Giá vốn bình quân mới (VND, integer)
 */
export function calculateAverageCost(
  oldStock: number,
  oldAverageCost: number,
  newQty: number,
  newUnitCost: number
): number {
  if (newQty <= 0) {
    throw new Error('Số lượng nhập phải lớn hơn 0')
  }
  if (![oldStock, oldAverageCost, newQty, newUnitCost].every(Number.isInteger)) {
    throw new Error('Tồn kho, số lượng và giá vốn phải là số nguyên')
  }
  if (oldStock < 0) {
    throw new Error('Không thể tính giá vốn khi tồn kho legacy đang âm')
  }
  if (oldAverageCost < 0 || newUnitCost < 0) {
    throw new Error('Giá vốn không được âm')
  }

  const totalNewQty = oldStock + newQty

  if (totalNewQty <= 0) {
    // Edge case: should not happen, but handle safely
    return newUnitCost
  }

  if (oldStock === 0) {
    // No existing stock: new average cost = new unit cost
    return Math.round(newUnitCost)
  }

  // Integer multiplication: avoid float by working with scaled integers
  // Both operands are already integers (VND cents = 1)
  const totalOldValue = oldStock * oldAverageCost
  const totalNewValue = newQty * newUnitCost
  const newAverageCost = Math.round((totalOldValue + totalNewValue) / totalNewQty)

  return newAverageCost
}

/**
 * Phân bổ chi phí vận chuyển theo số lượng.
 * Dòng cuối nhận phần còn lại để đảm bảo tổng chính xác.
 */
export function allocateShippingByQuantity(
  items: { quantity: number }[],
  totalShipping: number
): number[] {
  validateAllocationInput(items.map((item) => item.quantity), totalShipping)
  if (items.length === 0) throw new Error('Phải có ít nhất một sản phẩm')
  if (totalShipping === 0) return items.map(() => 0)

  const totalQty = items.reduce((sum, i) => sum + i.quantity, 0)
  if (totalQty === 0) return items.map(() => 0)

  const allocations: number[] = []
  let allocated = 0

  for (let i = 0; i < items.length; i++) {
    if (i === items.length - 1) {
      // Last item gets the remainder to ensure total is exact
      allocations.push(totalShipping - allocated)
    } else {
      const alloc = Math.round((items[i].quantity / totalQty) * totalShipping)
      allocations.push(alloc)
      allocated += alloc
    }
  }

  return allocations
}

/**
 * Phân bổ chi phí vận chuyển theo giá trị hàng hóa.
 */
export function allocateShippingByValue(
  items: { lineTotal: number }[],
  totalShipping: number
): number[] {
  validateAllocationInput(items.map((item) => item.lineTotal), totalShipping)
  if (items.length === 0) throw new Error('Phải có ít nhất một sản phẩm')
  if (totalShipping === 0) return items.map(() => 0)

  const totalValue = items.reduce((sum, i) => sum + i.lineTotal, 0)
  if (totalValue === 0) return items.map(() => 0)

  const allocations: number[] = []
  let allocated = 0

  for (let i = 0; i < items.length; i++) {
    if (i === items.length - 1) {
      allocations.push(totalShipping - allocated)
    } else {
      const alloc = Math.round((items[i].lineTotal / totalValue) * totalShipping)
      allocations.push(alloc)
      allocated += alloc
    }
  }

  return allocations
}

function validateAllocationInput(weights: number[], totalShipping: number): void {
  if (!Number.isInteger(totalShipping) || totalShipping < 0) {
    throw new Error('Chi phí vận chuyển phải là số nguyên không âm')
  }
  if (weights.some((weight) => !Number.isInteger(weight) || weight < 0)) {
    throw new Error('Dữ liệu phân bổ phải là số nguyên không âm')
  }
}

/**
 * Tính đơn giá thực nhập sau chiết khấu và phân bổ vận chuyển.
 * effectiveUnitCost = (invoiceUnitPrice * qty - discountAmount + shippingAllocation) / qty
 */
export function calculateEffectiveUnitCost(
  invoiceUnitPrice: number,
  quantity: number,
  discountAmount: number,
  shippingAllocation: number
): number {
  if (quantity <= 0) throw new Error('Số lượng phải lớn hơn 0')
  const totalCost = invoiceUnitPrice * quantity - discountAmount + shippingAllocation
  return Math.round(totalCost / quantity)
}
