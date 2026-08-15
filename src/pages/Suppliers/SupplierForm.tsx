import { appCommands } from '@/lib/commands'
import { useForm, type Resolver } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Modal, Button, Input, UnsavedChangesDialog } from '@/components/ui'
import { useState } from 'react'
import { createSupplierSchema, updateSupplierSchema } from '@shared/schemas'
import type { IpcResult, SupplierDTO } from '@shared/ipc-types'
import type { CreateSupplierInput } from '@shared/schemas'
import { useNotify } from '@/stores/uiStore'

export interface SupplierFormProps {
  supplier?: SupplierDTO
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
}

interface SupplierFormValues extends CreateSupplierInput {
  id?: number
}

export function SupplierForm({ supplier, isOpen, onClose, onSuccess }: SupplierFormProps) {
  const notify = useNotify()
  const isEditing = !!supplier

  const schema = isEditing ? updateSupplierSchema : createSupplierSchema

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<SupplierFormValues>({
    resolver: zodResolver(schema) as Resolver<SupplierFormValues>,
    defaultValues: supplier
      ? {
          id: supplier.id,
          companyName: supplier.companyName,
          phone: supplier.phone ?? '',
          address: supplier.address ?? '',
        }
      : {
          companyName: '',
          phone: '',
          address: '',
        },
  })

  const onSubmit = async (data: SupplierFormValues) => {
    try {
      let result: IpcResult<SupplierDTO>
      if (isEditing && data.id) {
        result = await appCommands.suppliers.update({ ...data, id: data.id })
      } else {
        result = await appCommands.suppliers.create(data)
      }

      if (result.success) {
        notify.success(isEditing ? 'Cập nhật nhà cung cấp thành công' : 'Thêm nhà cung cấp thành công')
        onSuccess()
      } else {
        notify.error(result.error ?? 'Lỗi lưu nhà cung cấp')
      }
    } catch (error) {
      notify.error('Lỗi hệ thống')
    }
  }

  const [showUnsavedConfirm, setShowUnsavedConfirm] = useState(false)
  const handleCloseAttempt = () => {
    if (isDirty) {
      setShowUnsavedConfirm(true)
    } else {
      onClose()
    }
  }

  const phoneRegister = register('phone', {
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
      const digitsOnly = e.target.value.replace(/\D/g, '').slice(0, 10)
      setValue('phone', digitsOnly, { shouldValidate: true, shouldDirty: true })
    },
  })

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleCloseAttempt}
      title={isEditing ? 'Sửa thông tin nhà cung cấp' : 'Thêm nhà cung cấp mới'}
      size="md"
      footer={
        <>
          <Button onClick={() => { void handleSubmit(onSubmit)() }} isLoading={isSubmitting}>
            Lưu
          </Button>
          <Button variant="secondary" onClick={handleCloseAttempt} disabled={isSubmitting}>
            Hủy
          </Button>
        </>
      }
    >
      <form onSubmit={(event) => { void handleSubmit(onSubmit)(event) }} className="space-y-4">
        <Input
          label="Tên nhà cung cấp"
          required
          placeholder="Nhập tên nhà cung cấp"
          {...register('companyName')}
          error={errors.companyName?.message as string}
        />
        
        <Input
          label="Số điện thoại"
          placeholder="Nhập 10 chữ số (VD: 0912345678)"
          inputMode="numeric"
          maxLength={10}
          {...phoneRegister}
          error={errors.phone?.message as string}
        />
        
        <Input
          label="Địa chỉ"
          placeholder="Nhập địa chỉ nhà cung cấp"
          {...register('address')}
          error={errors.address?.message as string}
        />
      </form>
      <UnsavedChangesDialog
        isOpen={showUnsavedConfirm}
        mode="entity"
        onSave={() => { setShowUnsavedConfirm(false); void handleSubmit(onSubmit)() }}
        onDiscard={() => { setShowUnsavedConfirm(false); onClose() }}
        onContinue={() => setShowUnsavedConfirm(false)}
      />
    </Modal>
  )
}

