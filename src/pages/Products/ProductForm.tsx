import { appCommands } from '@/lib/commands'
import { useForm, Controller, type Resolver } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Modal, Button, Input, Select, UnsavedChangesDialog } from '@/components/ui'
import { useState, useCallback } from 'react'
import { createProductSchema, updateProductSchema, type CreateProductInput } from '@shared/schemas'
import type { ProductDTO } from '@shared/ipc-types'
import type { CommandResult } from '@/lib/commands/client'
import { useNotify } from '@/stores/uiStore'
import { productCodeFieldError } from '@/lib/userFeedback'

export interface ProductFormProps {
  product?: ProductDTO
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
}

interface ProductFormData extends CreateProductInput {
  id?: number
}

export function ProductForm({ product, isOpen, onClose, onSuccess }: ProductFormProps) {
  const notify = useNotify()
  const isEditing = !!product

  const schema = isEditing ? updateProductSchema : createProductSchema

  const {
    register,
    handleSubmit,
    setError,
    control,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<ProductFormData>({
    resolver: zodResolver(schema) as Resolver<ProductFormData>,
    defaultValues: product
      ? {
          id: product.id,
          productCode: product.productCode,
          productName: product.productName,
          animalCategory: product.animalCategory,
          packageWeightGrams: product.packageWeightGrams,
          packageWeightUnit: 'g',
          inventoryUnit: product.inventoryUnit,
          brand: product.brand ?? '',
          active: product.active,
          notes: product.notes ?? '',
        }
      : {
          productCode: '',
          productName: '',
          animalCategory: '' as ProductDTO['animalCategory'],
          packageWeightGrams: 0,
          packageWeightUnit: 'g',
          inventoryUnit: '' as ProductDTO['inventoryUnit'],
          brand: '',
          active: true,
          notes: '',
        },
  })

  const [showUnsavedDialog, setShowUnsavedDialog] = useState(false)

  const submitForm = useCallback(async (data: ProductFormData) => {
    try {
      let result: CommandResult<ProductDTO>
      if (isEditing && data.id) {
        result = await appCommands.products.update({
          id: data.id,
          productCode: data.productCode,
          productName: data.productName,
          animalCategory: data.animalCategory,
          packageWeightGrams: data.packageWeightGrams,
          packageWeightUnit: data.packageWeightUnit,
          inventoryUnit: data.inventoryUnit,
          brand: data.brand,
          notes: product?.notes ?? undefined,
        })
      } else {
        result = await appCommands.products.create({
          ...data,
          active: data.active ?? true,
        })
      }

      if (result.success) {
        notify.success(isEditing ? 'Cập nhật sản phẩm thành công' : 'Thêm sản phẩm thành công')
        onSuccess()
      } else {
        const fieldError = productCodeFieldError(result)
        if (fieldError) {
          setError('productCode', { type: 'manual', message: fieldError })
        } else {
          notify.error(result.error ?? 'Lỗi lưu sản phẩm')
        }
      }
    } catch {
      notify.error('Lỗi hệ thống')
    }
  }, [isEditing, product, notify, onSuccess, setError])

  const handleCloseAttempt = () => {
    if (isDirty) {
      setShowUnsavedDialog(true)
    } else {
      onClose()
    }
  }

  /**
   * "Lưu thay đổi" in the UnsavedChangesDialog must ACTUALLY save.
   * If save succeeds → onSuccess() closes the form.
   * If save fails → errors shown in form, dialog closes, form stays open.
   */
  const handleSaveFromDialog = async () => {
    setShowUnsavedDialog(false)
    await handleSubmit(submitForm)()
    // If submitForm succeeded it called onSuccess() which closes the modal.
    // If it failed, setError was called and the form remains visible with errors.
  }

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={handleCloseAttempt}
        title={isEditing ? 'Sửa sản phẩm' : 'Thêm sản phẩm mới'}
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={handleCloseAttempt} disabled={isSubmitting}>
              Hủy
            </Button>
            <Button onClick={() => { void handleSubmit(submitForm)() }} isLoading={isSubmitting}>
              {isEditing ? 'Lưu thay đổi' : 'Thêm sản phẩm'}
            </Button>
          </>
        }
      >
        <form onSubmit={(event) => { void handleSubmit(submitForm)(event) }} className="space-y-5">
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <div>
              <Input
                label="Mã sản phẩm"
                required
                {...register('productCode')}
                error={errors.productCode?.message as string}
              />
              <p className="mt-1.5 text-xs text-slate-400">
                Chỉ dùng chữ, số, gạch ngang (-) hoặc gạch dưới (_). VD: CAM-LON-01
              </p>
            </div>
            <Input
              label="Tên sản phẩm"
              required
              {...register('productName')}
              error={errors.productName?.message as string}
            />

            <Select
              label="Loại vật nuôi"
              required
              {...register('animalCategory')}
              error={errors.animalCategory?.message as string}
              options={[
                { value: '', label: 'Chọn loại vật nuôi' },
                { value: 'heo', label: 'Heo' },
                { value: 'ga', label: 'Gà' },
                { value: 'vit', label: 'Vịt' },
                { value: 'bo', label: 'Bò' },
                { value: 'de', label: 'Dê' },
                { value: 'khac', label: 'Khác' },
              ]}
            />
            <Input
              label="Thương hiệu"
              {...register('brand')}
              error={errors.brand?.message as string}
            />

            <Controller
              name="packageWeightGrams"
              control={control}
              render={({ field }) => (
                <Input
                  label="Trọng lượng (kg)"
                  type="number"
                  min={0}
                  step={0.001}
                  value={field.value > 0 ? field.value / 1000 : ''}
                  onChange={(event) => field.onChange(Math.round(Number(event.target.value) * 1000))}
                  error={errors.packageWeightGrams?.message as string}
                />
              )}
            />

            <Select
              label="Đơn vị tính"
              required
              {...register('inventoryUnit')}
              error={errors.inventoryUnit?.message as string}
              options={[
                { value: '', label: 'Chọn đơn vị tính' },
                { value: 'Bao', label: 'Bao' },
                { value: 'Tui', label: 'Túi' },
                { value: 'Bich', label: 'Bịch' },
              ]}
            />
          </div>
        </form>
      </Modal>

      {/* UnsavedChangesDialog renders via Portal at z-[200] — never clipped by Modal */}
      <UnsavedChangesDialog
        isOpen={showUnsavedDialog}
        mode="entity"
        onSave={handleSaveFromDialog}
        onDiscard={() => {
          setShowUnsavedDialog(false)
          onClose()
        }}
        onContinue={() => setShowUnsavedDialog(false)}
      />
    </>
  )
}
