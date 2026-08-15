export interface StatusBadgeProps {
  active: boolean
  activeText?: string
  inactiveText?: string
}

export function StatusBadge({ active, activeText = 'Hoạt động', inactiveText = 'Ngừng kinh doanh' }: StatusBadgeProps) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
        active
          ? 'bg-success-100 text-success-700'
          : 'bg-gray-100 text-gray-600'
      }`}
    >
      {active ? activeText : inactiveText}
    </span>
  )
}
