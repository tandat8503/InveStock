import { useState, useEffect, useRef, useCallback } from 'react'
import { Search, Loader2 } from 'lucide-react'
import { appCommands } from '@/lib/commands'
import type { ProductDTO } from '@shared/ipc-types'

export interface ProductSearchComboboxProps {
  onSelect: (product: ProductDTO) => void
  placeholder?: string
  disabled?: boolean
  label?: string
  error?: string
}

export function ProductSearchCombobox({
  onSelect,
  placeholder = 'Tìm sản phẩm theo tên hoặc mã...',
  disabled = false,
  label,
  error
}: ProductSearchComboboxProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [products, setProducts] = useState<ProductDTO[]>([])
  const [loading, setLoading] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  
  const containerRef = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<NodeJS.Timeout | null>(null)

  // Fetch products from backend based on search term
  const fetchProducts = useCallback(async (query: string) => {
    setLoading(true)
    try {
      const res = await appCommands.products.list({
        activeOnly: true,
        search: query.trim() || undefined,
        page: 1,
        pageSize: 30
      })
      if (res.success && res.data) {
        setProducts(res.data.items)
      } else {
        setProducts([])
      }
    } catch {
      setProducts([])
    } finally {
      setLoading(false)
    }
  }, [])

  // Debounced search trigger
  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current)
    }
    debounceRef.current = setTimeout(() => {
      void fetchProducts(search)
    }, 200)

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current)
      }
    }
  }, [search, fetchProducts])

  // Handle outside clicks to close the dropdown
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen) {
      if (e.key === 'ArrowDown') {
        setIsOpen(true)
      }
      return
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setActiveIndex((prev) => (prev < products.length - 1 ? prev + 1 : prev))
        break
      case 'ArrowUp':
        e.preventDefault()
        setActiveIndex((prev) => (prev > 0 ? prev - 1 : prev))
        break
      case 'Enter':
        e.preventDefault()
        if (activeIndex >= 0 && activeIndex < products.length) {
          handleSelect(products[activeIndex])
        }
        break
      case 'Escape':
        setIsOpen(false)
        break
    }
  }

  const handleSelect = (product: ProductDTO) => {
    onSelect(product)
    setSearch('')
    setIsOpen(false)
    setActiveIndex(-1)
  }

  return (
    <div className="w-full relative" ref={containerRef}>
      {label && (
        <label className="form-label block text-sm font-medium text-gray-700 mb-1">
          {label}
        </label>
      )}

      <div className="relative flex items-center">
        <div className="absolute left-3 text-gray-400">
          {loading ? <Loader2 size={16} className="animate-spin text-primary-500" /> : <Search size={16} />}
        </div>

        <input
          type="text"
          disabled={disabled}
          placeholder={placeholder}
          value={search}
          onChange={(e) => {
            setSearch(e.target.value)
            setIsOpen(true)
            setActiveIndex(-1)
          }}
          onFocus={() => {
            if (!disabled) setIsOpen(true)
          }}
          onKeyDown={handleKeyDown}
          className={`form-input pl-9 w-full rounded-md border border-gray-300 bg-white h-9 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 ${
            error ? 'border-danger-500 focus:ring-danger-500' : ''
          }`}
        />

        {/* Dropdown Results List */}
        {isOpen && (
          <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg py-1 z-50 max-h-60 overflow-y-auto">
            {products.length === 0 ? (
              <div className="px-4 py-2.5 text-xs text-gray-500 text-center">
                {loading ? 'Đang tìm kiếm sản phẩm...' : 'Không tìm thấy sản phẩm nào'}
              </div>
            ) : (
              products.map((product, idx) => (
                <button
                  key={product.id}
                  type="button"
                  onClick={() => handleSelect(product)}
                  className={`w-full text-left px-3 py-2 text-xs transition-colors flex flex-col gap-0.5 hover:bg-gray-50 ${
                    idx === activeIndex ? 'bg-primary-50 text-primary-800' : 'text-gray-700'
                  }`}
                >
                  <span className="font-semibold text-gray-900">
                    {product.productCode} — {product.productName}
                  </span>
                  <span className="text-[10px] text-gray-500">
                    Tồn kho: {product.currentStock} {product.inventoryUnit} · Phân loại: {product.animalCategory}
                  </span>
                </button>
              ))
            )}
          </div>
        )}
      </div>

      {error && <p className="mt-1 text-xs text-danger-500">{error}</p>}
    </div>
  )
}
