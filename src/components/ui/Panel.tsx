import type { HTMLAttributes, PropsWithChildren } from 'react'

export function Panel({ children, className = '', ...props }: PropsWithChildren<HTMLAttributes<HTMLDivElement>>) {
  return (
    <div className={`rounded-4xl border border-white/80 bg-panel/92 shadow-card backdrop-blur ${className}`} {...props}>
      {children}
    </div>
  )
}
