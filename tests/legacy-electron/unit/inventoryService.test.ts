import { describe, it, expect } from 'vitest'
import {
  calculateAverageCost,
  allocateShippingByQuantity,
  allocateShippingByValue,
  calculateEffectiveUnitCost,
} from '../../electron/services/inventoryService'

describe('calculateAverageCost', () => {
  it('trả về giá mới khi tồn cũ bằng 0', () => {
    expect(calculateAverageCost(0, 0, 10, 50000)).toBe(50000)
  })

  it('tính đúng giá vốn bình quân khi có tồn cũ', () => {
    // (100 * 50000 + 50 * 60000) / 150 = (5000000 + 3000000) / 150 = 53333.33... → 53333
    expect(calculateAverageCost(100, 50000, 50, 60000)).toBe(53333)
  })

  it('giá vốn bình quân khi giá bằng nhau', () => {
    expect(calculateAverageCost(100, 50000, 50, 50000)).toBe(50000)
  })

  it('throw khi số lượng nhập bằng 0', () => {
    expect(() => calculateAverageCost(100, 50000, 0, 60000)).toThrow()
  })

  it('xử lý đúng khi tồn âm (legacy data)', () => {
    expect(() => calculateAverageCost(-5, 50000, 10, 60000)).toThrow(
      'tồn kho legacy đang âm'
    )
  })

  it('làm tròn về đồng nguyên', () => {
    // (3 * 33333 + 2 * 50000) / 5 = (99999 + 100000) / 5 = 39999.8 → 40000
    const result = calculateAverageCost(3, 33333, 2, 50000)
    expect(Number.isInteger(result)).toBe(true)
  })
})

describe('allocateShippingByQuantity', () => {
  it('phân bổ đều theo số lượng', () => {
    const items = [{ quantity: 10 }, { quantity: 10 }]
    const result = allocateShippingByQuantity(items, 200000)
    expect(result[0]).toBe(100000)
    expect(result[1]).toBe(100000)
    expect(result.reduce((s, v) => s + v, 0)).toBe(200000)
  })

  it('dòng cuối nhận phần còn lại để tổng luôn chính xác', () => {
    const items = [{ quantity: 1 }, { quantity: 1 }, { quantity: 1 }]
    const result = allocateShippingByQuantity(items, 100)
    expect(result.reduce((s, v) => s + v, 0)).toBe(100)
  })

  it('trả về 0 khi không có phí vận chuyển', () => {
    const items = [{ quantity: 10 }, { quantity: 20 }]
    const result = allocateShippingByQuantity(items, 0)
    expect(result).toEqual([0, 0])
  })

  it('tỷ lệ phân bổ đúng', () => {
    const items = [{ quantity: 1 }, { quantity: 3 }]
    const result = allocateShippingByQuantity(items, 400000)
    expect(result[0]).toBe(100000)
    expect(result[1]).toBe(300000)
    expect(result.reduce((s, v) => s + v, 0)).toBe(400000)
  })
})

describe('allocateShippingByValue', () => {
  it('phân bổ theo giá trị', () => {
    const items = [{ lineTotal: 1000000 }, { lineTotal: 3000000 }]
    const result = allocateShippingByValue(items, 400000)
    expect(result[0]).toBe(100000)
    expect(result[1]).toBe(300000)
    expect(result.reduce((s, v) => s + v, 0)).toBe(400000)
  })

  it('trả về 0 khi tổng giá trị bằng 0', () => {
    const items = [{ lineTotal: 0 }, { lineTotal: 0 }]
    const result = allocateShippingByValue(items, 100000)
    expect(result).toEqual([0, 0])
  })
})

describe('calculateEffectiveUnitCost', () => {
  it('tính đúng giá thực nhập', () => {
    // (100000 * 10 - 50000 + 100000) / 10 = 1050000 / 10 = 105000
    expect(calculateEffectiveUnitCost(100000, 10, 50000, 100000)).toBe(105000)
  })

  it('không chiết khấu, không vận chuyển', () => {
    expect(calculateEffectiveUnitCost(50000, 5, 0, 0)).toBe(50000)
  })

  it('throw khi số lượng bằng 0', () => {
    expect(() => calculateEffectiveUnitCost(50000, 0, 0, 0)).toThrow()
  })
})
