import type React from 'react'

export interface ToolButtonProps {
  icon: React.ReactNode
  isActive?: boolean
  onClick: () => void
  tooltip: string
}

export function ToolButton({ icon, isActive, onClick, tooltip }: ToolButtonProps) {
  return (
    <button
      onClick={onClick}
      title={tooltip}
      aria-label={tooltip}
      className={`p-2.5 rounded-lg transition-colors ${
        isActive ? 'bg-[#3B82F6] text-white' : 'hover:bg-[#252525] text-[#A0A0A0] hover:text-white'
      }`}
    >
      {icon}
    </button>
  )
}
