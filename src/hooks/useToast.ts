import { useCallback, useState } from 'react'
import type { ToastState } from '../types'

export function useToast() {
  const [toast, setToast] = useState<ToastState | null>(null)

  const showToast = useCallback((message: string) => {
    const id = Date.now()
    setToast({ id, message })
    window.setTimeout(() => {
      setToast((current) => (current?.id === id ? null : current))
    }, 3600)
  }, [])

  return { toast, showToast }
}
