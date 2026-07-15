import { useEffect, useId, useRef } from 'react'

type TextEntryDialogProps = {
  confirmLabel: string
  label: string
  onCancel: () => void
  onChange: (value: string) => void
  onConfirm: () => void
  title: string
  value: string
}

type LinkDialogProps = {
  onClose: () => void
  onCopied: () => void
  title: string
  value: string
}

function useEscape(onClose: () => void) {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])
}

export function TextEntryDialog({ confirmLabel, label, onCancel, onChange, onConfirm, title, value }: TextEntryDialogProps) {
  const titleId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  useEscape(onCancel)

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  return (
    <div className="app-dialog-backdrop" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onCancel()
    }}>
      <form className="app-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId} onSubmit={(event) => {
        event.preventDefault()
        onConfirm()
      }}>
        <div>
          <span className="section-kicker">Team settings</span>
          <h2 id={titleId}>{title}</h2>
        </div>
        <label className="app-dialog-field">
          {label}
          <input ref={inputRef} value={value} onChange={(event) => onChange(event.target.value)} maxLength={80} />
        </label>
        <div className="app-dialog-actions">
          <button type="button" onClick={onCancel}>Cancel</button>
          <button className="primary" type="submit" disabled={!value.trim()}>{confirmLabel}</button>
        </div>
      </form>
    </div>
  )
}

export function LinkDialog({ onClose, onCopied, title, value }: LinkDialogProps) {
  const titleId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  useEscape(onClose)

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(value)
      onCopied()
      onClose()
    } catch {
      inputRef.current?.focus()
      inputRef.current?.select()
    }
  }

  return (
    <div className="app-dialog-backdrop" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose()
    }}>
      <section className="app-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <div>
          <span className="section-kicker">Share access</span>
          <h2 id={titleId}>{title}</h2>
          <p>Your browser blocked automatic copying. Copy the selected link below.</p>
        </div>
        <label className="app-dialog-field">
          Link
          <input ref={inputRef} value={value} readOnly onFocus={(event) => event.currentTarget.select()} />
        </label>
        <div className="app-dialog-actions">
          <button type="button" onClick={onClose}>Close</button>
          <button className="primary" type="button" onClick={() => { void copyLink() }}>Copy Link</button>
        </div>
      </section>
    </div>
  )
}
