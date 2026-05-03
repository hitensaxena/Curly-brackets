import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'

type Variant = 'default' | 'ghost' | 'outline' | 'destructive' | 'success'
type Size = 'sm' | 'md' | 'lg' | 'icon'

const variantClasses: Record<Variant, string> = {
  default: 'bg-indigo-500 hover:bg-indigo-400 text-white',
  ghost: 'hover:bg-white/5 text-slate-300 hover:text-white',
  outline: 'border border-white/10 hover:border-white/20 hover:bg-white/5 text-slate-300',
  destructive: 'bg-red-600 hover:bg-red-500 text-white',
  success: 'bg-green-600 hover:bg-green-500 text-white'
}

const sizeClasses: Record<Size, string> = {
  sm: 'h-7 px-2.5 text-xs',
  md: 'h-9 px-4 text-sm',
  lg: 'h-10 px-6 text-sm',
  icon: 'h-8 w-8'
}

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  asChild?: boolean
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className = '', variant = 'default', size = 'md', asChild, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button'
    return (
      <Comp
        ref={ref}
        className={`inline-flex items-center justify-center gap-1.5 rounded-md font-medium transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${variantClasses[variant]} ${sizeClasses[size]} ${className}`}
        {...props}
      />
    )
  }
)
Button.displayName = 'Button'
