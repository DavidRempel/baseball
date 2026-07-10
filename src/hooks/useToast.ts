import { useCallback, useState } from 'react'
import type { ToastState } from '../types'

export function useToast() {
  const [toast, setToast] = useState<ToastState | null>(null)

  const showToast = useCallback((message: string, action?: { label: string; onClick: () => void }) => {
    const id = Date.now()
    setToast({ actionLabel: action?.label, id, message, onAction: action?.onClick })
    window.setTimeout(() => {
      setToast((current) => (current?.id === id ? null : current))
    }, 3600)
  }, [])

  const dismissToast = useCallback(() => setToast(null), [])

  return { dismissToast, toast, showToast }
}
