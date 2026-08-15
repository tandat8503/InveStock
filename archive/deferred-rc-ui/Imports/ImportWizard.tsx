import { appCommands } from '@/lib/commands'
import { useEffect, useMemo, useState } from 'react'
import type {
  ImportMapping,
  ImportParseResult,
  ImportResult,
  ImportType,
  ImportValidationResult,
  SupplierDTO,
} from '@shared/ipc-types'
import { ImportFileStep } from './ImportFileStep'
import { ImportSheetStep } from './ImportSheetStep'
import { ImportTypeStep } from './ImportTypeStep'
import { ImportHeaderStep } from './ImportHeaderStep'
import { ImportMappingStep, type MappingField } from './ImportMappingStep'
import { ImportPreviewStep } from './ImportPreviewStep'
import { ImportValidationStep } from './ImportValidationStep'
import { ImportOptionsStep, type ImportOptionsState } from './ImportOptionsStep'
import { ImportExecuteStep } from './ImportExecuteStep'
import { ImportResultStep } from './ImportResultStep'

const fields: Record<ImportType, MappingField[]> = {
  products: [
    { key: 'productCode', label: 'Mã sản phẩm', required: true },
    { key: 'productName', label: 'Tên sản phẩm', required: true },
    { key: 'inventoryUnit', label: 'Đơn vị tính', required: true },
    { key: 'animalCategory', label: 'Loại vật nuôi' },
    { key: 'packageWeightGrams', label: 'Trọng lượng (gram)' },
    { key: 'currentSalePrice', label: 'Giá bán' },
    { key: 'brand', label: 'Thương hiệu' },
    { key: 'notes', label: 'Ghi chú' },
  ],
  opening_inventory: [
    { key: 'productCode', label: 'Mã sản phẩm', required: true },
    { key: 'quantity', label: 'Số lượng', required: true },
    { key: 'unitCost', label: 'Giá vốn', required: true },
    { key: 'openingDate', label: 'Ngày tồn đầu', required: true },
  ],
  purchase_invoices: [
    { key: 'invoiceNumber', label: 'Số hóa đơn', required: true },
    { key: 'invoiceDate', label: 'Ngày hóa đơn', required: true },
    { key: 'productCode', label: 'Mã sản phẩm', required: true },
    { key: 'quantity', label: 'Số lượng', required: true },
    { key: 'unitPrice', label: 'Đơn giá' },
    { key: 'totalAmount', label: 'Thành tiền' },
  ],
  sales_invoices: [
    { key: 'invoiceNumber', label: 'Số hóa đơn', required: true },
    { key: 'invoiceDate', label: 'Ngày hóa đơn', required: true },
    { key: 'productCode', label: 'Mã sản phẩm', required: true },
    { key: 'quantity', label: 'Số lượng', required: true },
    { key: 'unitPrice', label: 'Giá bán' },
    { key: 'totalAmount', label: 'Thành tiền' },
  ],
  nxtgui_inventory_summary: [
    { key: 'productCode', label: 'Mã sản phẩm (MH)', required: true },
    { key: 'productName', label: 'Tên sản phẩm', required: true },
    { key: 'inventoryUnit', label: 'Đơn vị tính (ĐVT)', required: true },
    { key: 'openingQuantity', label: 'Số lượng đầu kỳ' },
    { key: 'openingUnitCost', label: 'Đơn giá đầu kỳ' },
    { key: 'openingValue', label: 'Thành tiền đầu kỳ' },
    { key: 'purchaseQuantity', label: 'Số lượng nhập' },
    { key: 'purchaseUnitCost', label: 'Đơn giá nhập' },
    { key: 'purchaseValue', label: 'Thành tiền nhập' },
    { key: 'saleQuantity', label: 'Số lượng xuất' },
    { key: 'saleUnitCost', label: 'Đơn giá xuất' },
    { key: 'saleValue', label: 'Thành tiền xuất' },
    { key: 'closingQuantity', label: 'Số lượng tồn cuối' },
    { key: 'closingUnitCost', label: 'Đơn giá tồn cuối' },
    { key: 'closingValue', label: 'Thành tiền tồn cuối' },
    { key: 'animalCategory', label: 'Loại vật nuôi' },
  ],
}

const defaultOptions: ImportOptionsState = {
  existingProduct: 'error',
  allowNegativeStock: false,
  allowNegativeLegacyStock: false,
  mode: 'import_as_draft',
  transactionMode: 'all_or_nothing',
  defaultSupplierId: 0,
  snapshotDate: '2026-06-30',
}

export function ImportWizard(): JSX.Element {
  const [step, setStep] = useState(0)
  const [parsed, setParsed] = useState<ImportParseResult | null>(null)
  const [sheetName, setSheetName] = useState('')
  const [type, setType] = useState<ImportType>('products')
  const [headerRow, setHeaderRow] = useState(0)
  const [mappings, setMappings] = useState<ImportMapping[]>([])
  const [options, setOptions] = useState(defaultOptions)
  const [validation, setValidation] = useState<ImportValidationResult | null>(null)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [suppliers, setSuppliers] = useState<SupplierDTO[]>([])
  const [loading, setLoading] = useState(false)
  const [executing, setExecuting] = useState(false)
  const [error, setError] = useState('')
  const sheet = useMemo(
    () => parsed?.sheets.find((item) => item.sheetName === sheetName),
    [parsed, sheetName]
  )
  const currentHeaders = (sheet?.rows[headerRow] ?? sheet?.headers ?? []).map(String)
  const requiredMapped = fields[type]
    .filter((field) => field.required)
    .every((field) => mappings.some((mapping) => mapping.targetField === field.key))

  useEffect(() => {
    const sessionId = parsed?.importSessionId
    return () => {
      if (sessionId) void appCommands.import.cancel(sessionId)
    }
  }, [parsed?.importSessionId])

  async function chooseFile(): Promise<void> {
    const file = await appCommands.dialog.openFile([
      { name: 'Excel/CSV', extensions: ['xlsx', 'xls', 'csv'] },
    ])
    if (!file) return
    setLoading(true)
    setError('')
    const response = await appCommands.import.parseFile(file)
    setLoading(false)
    if (!response.success || !response.data) {
      setError(response.error ?? 'Không thể đọc file')
      return
    }
    setParsed(response.data)
    const nxtSheet = response.data.sheets.find(
      (s) => s.detectedProfile === 'nxtgui' || s.sheetName.trim().toUpperCase() === 'TH'
    )
    const targetSheet = nxtSheet || response.data.sheets[0]
    if (targetSheet) {
      setSheetName(targetSheet.sheetName)
      setHeaderRow(targetSheet.detectedHeaderRow)
      if (targetSheet.detectedProfile === 'nxtgui' || targetSheet.sheetName.trim().toUpperCase() === 'TH') {
        setType('nxtgui_inventory_summary')
        if (targetSheet.proposedSnapshotDate) {
          setOptions((opts) => ({
            ...opts,
            snapshotDate: targetSheet.proposedSnapshotDate,
            mode: 'reconcile_only',
          }))
        }
      }
    }
    setMappings([])
    setValidation(null)
    setResult(null)
    if (response.data.duplicateFile) setError('Cảnh báo: hash file đã được import thành công trước đây.')
    const supplierResponse = await appCommands.suppliers.list({ activeOnly: true, pageSize: 500 })
    if (supplierResponse.success && supplierResponse.data) setSuppliers(supplierResponse.data.items)
  }

  function changeMapping(targetField: string, sourceColumn: string): void {
    setMappings((current) => [
      ...current.filter((mapping) => mapping.targetField !== targetField),
      ...(sourceColumn ? [{ targetField, sourceColumn }] : []),
    ])
  }

  async function validateAndContinue(): Promise<void> {
    if (!parsed) return
    setLoading(true)
    setError('')
    const response = await appCommands.import.validate({
      importSessionId: parsed.importSessionId,
      sheetName,
      importType: type,
      headerRow,
      mappings,
      options: {
        existingProduct: options.existingProduct,
        allowNegativeStock: options.allowNegativeStock,
        allowNegativeLegacyStock: options.allowNegativeLegacyStock,
        mode: options.mode,
        transactionMode: options.transactionMode,
        snapshotDate: options.snapshotDate,
        ...(options.defaultSupplierId ? { defaultSupplierId: options.defaultSupplierId } : {}),
      },
    })
    setLoading(false)
    if (!response.success || !response.data) {
      setError(response.error ?? 'Validation thất bại')
      return
    }
    setValidation(response.data)
    setStep(7)
  }

  async function execute(): Promise<void> {
    if (!parsed || executing || !validation?.canExecute) return
    setExecuting(true)
    setError('')
    const response = await appCommands.import.execute({
      importSessionId: parsed.importSessionId,
    })
    setExecuting(false)
    if (!response.success || !response.data) {
      setError(response.error ?? 'Import thất bại')
      return
    }
    setResult(response.data)
    setStep(9)
  }

  async function exportErrors(): Promise<void> {
    if (!parsed) return
    const filePath = await appCommands.dialog.saveFile('import-errors.xlsx')
    if (!filePath) return
    const response = await appCommands.import.exportErrors(parsed.importSessionId, filePath)
    if (!response.success) setError(response.error ?? 'Không thể xuất danh sách lỗi')
  }

  function canGoNext(): boolean {
    if (step === 0) return Boolean(parsed)
    if (step === 1) return Boolean(sheetName)
    if (step === 4) return requiredMapped
    if (step === 7) return Boolean(validation?.canExecute)
    return true
  }

  const content = [
    <ImportFileStep key="file" fileName={parsed?.fileName} loading={loading} onChoose={() => void chooseFile()}/>,
    <ImportSheetStep key="sheet" sheets={parsed?.sheets ?? []} value={sheetName} onChange={(value) => { setSheetName(value); setHeaderRow(parsed?.sheets.find((item) => item.sheetName === value)?.detectedHeaderRow ?? 0) }}/>,
    <ImportTypeStep key="type" value={type} onChange={(value) => { setType(value); setMappings([]); setValidation(null) }}/>,
    <ImportHeaderStep key="header" value={headerRow} onChange={setHeaderRow}/>,
    <ImportMappingStep key="mapping" fields={fields[type]} headers={currentHeaders} mappings={mappings} onChange={changeMapping}/>,
    <ImportPreviewStep key="source-preview" title="Preview dữ liệu nguồn" headers={currentHeaders} rows={(sheet?.rows ?? []).slice(headerRow + 1)}/>,
    <ImportOptionsStep key="options" type={type} value={options} suppliers={suppliers} onChange={setOptions}/>,
    validation ? <div key="validation" className="space-y-4"><ImportPreviewStep title="Preview normalized" headers={Object.keys(validation.normalizedPreview[0] ?? {})} rows={validation.normalizedPreview.map((row) => Object.values(row))}/><ImportValidationStep validation={validation} onExportErrors={() => void exportErrors()}/></div> : <p key="validation-empty">Chưa validate.</p>,
    <ImportExecuteStep key="execute" executing={executing} onExecute={() => void execute()}/>,
    result ? <ImportResultStep key="result" result={result}/> : <p key="result-empty">Chưa có kết quả.</p>,
  ][step]

  return <div className="card p-5 space-y-5">
    <div className="flex flex-wrap gap-2 text-xs">{['File', 'Sheet', 'Loại', 'Header', 'Mapping', 'Preview', 'Options', 'Validation', 'Execute', 'Kết quả'].map((label, index) => <span key={label} className={`px-2 py-1 rounded ${index === step ? 'bg-primary-600 text-white' : index < step ? 'bg-green-100 text-green-800' : 'bg-gray-100'}`}>{index + 1}. {label}</span>)}</div>
    {error && <p className="rounded bg-red-50 text-red-700 p-3 text-sm">{error}</p>}
    {content}
    {step < 9 && <div className="flex justify-between border-t pt-4">
      <button className="px-3 py-2 border rounded text-sm disabled:opacity-50" disabled={step === 0 || executing} onClick={() => setStep((current) => current - 1)}>Back</button>
      {step !== 8 && <button className="btn-primary disabled:opacity-50" disabled={!canGoNext() || loading || executing || (step === 6 && type === 'purchase_invoices' && !options.defaultSupplierId)} onClick={() => { if (step === 6) void validateAndContinue(); else setStep((current) => current + 1) }}>Next</button>}
    </div>}
  </div>
}
