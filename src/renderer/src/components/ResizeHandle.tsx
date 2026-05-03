import { useEffect, useRef, useState } from 'react'

/**
 * Persist a panel width to localStorage. Returns the current width plus a setter
 * that writes through to storage. Width is clamped to [min, max].
 */
export function usePersistedWidth(key: string, defaultWidth: number, min = 160, max = 600): [number, (n: number) => void] {
  const [width, setWidth] = useState<number>(() => {
    const saved = typeof window !== 'undefined' ? Number(localStorage.getItem(key)) : NaN
    return saved && saved >= min && saved <= max ? saved : defaultWidth
  })
  const set = (n: number) => {
    const clamped = Math.max(min, Math.min(max, n))
    setWidth(clamped)
    try { localStorage.setItem(key, String(clamped)) } catch { /* ignore */ }
  }
  return [width, set]
}

/**
 * A thin vertical drag handle that emits new widths as the user drags.
 * Place it immediately to the right of the panel you're resizing.
 *
 * `direction='left'` means dragging right grows the panel to the LEFT of the handle (default).
 * `direction='right'` flips the math — useful when the resizable panel is on the right.
 */
export function ResizeHandle({
  width,
  onResize,
  direction = 'left',
  min = 160,
  max = 600
}: {
  width: number
  onResize: (newWidth: number) => void
  direction?: 'left' | 'right'
  min?: number
  max?: number
}) {
  const startRef = useRef<{ x: number; w: number } | null>(null)
  const [dragging, setDragging] = useState(false)

  useEffect(() => {
    if (!dragging) return
    const move = (e: MouseEvent) => {
      if (!startRef.current) return
      const dx = e.clientX - startRef.current.x
      const next = direction === 'left' ? startRef.current.w + dx : startRef.current.w - dx
      onResize(Math.max(min, Math.min(max, next)))
    }
    const up = () => { setDragging(false); startRef.current = null }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    return () => {
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
  }, [dragging, direction, min, max, onResize])

  return (
    <div
      onMouseDown={(e) => {
        startRef.current = { x: e.clientX, w: width }
        setDragging(true)
      }}
      className={`w-1 flex-shrink-0 cursor-col-resize transition-colors ${
        dragging ? 'bg-indigo-500/50' : 'bg-transparent hover:bg-white/10'
      }`}
      title="Drag to resize"
    />
  )
}
