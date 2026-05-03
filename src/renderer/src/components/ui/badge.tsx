import * as React from 'react'

type Variant = 'default' | 'success' | 'warning' | 'error' | 'claude' | 'gemini' | 'muted'

const variantClasses: Record<Variant, string> = {
  default: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30',
  success: 'bg-green-500/20 text-green-300 border-green-500/30',
  warning: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
  error: 'bg-red-500/20 text-red-300 border-red-500/30',
  claude: 'bg-amber-600/20 text-amber-400 border-amber-600/30',
  gemini: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  muted: 'bg-white/5 text-slate-400 border-white/10'
}

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: Variant
}

export function Badge({ variant = 'default', className = '', ...props }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${variantClasses[variant]} ${className}`}
      {...props}
    />
  )
}
