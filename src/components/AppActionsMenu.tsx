import { Copy, Download, Eye, EyeOff, Image as ImageIcon, MoreHorizontal, Share2, Upload } from 'lucide-react'

type AppActionsMenuProps = {
  canCopyViewLink: boolean
  canEdit: boolean
  currentLineupCount: number
  isListed: boolean
  onBackup: () => void
  onCopyEditLink: () => void
  onCopyViewLink: () => void
  onRestore: () => void
  onShareCard: () => void
  onShareText: () => void
  onToggleListed: () => void
  open: boolean
  setOpen: (open: boolean | ((open: boolean) => boolean)) => void
}

export function AppActionsMenu({
  canCopyViewLink,
  canEdit,
  currentLineupCount,
  isListed,
  onBackup,
  onCopyEditLink,
  onCopyViewLink,
  onRestore,
  onShareCard,
  onShareText,
  onToggleListed,
  open,
  setOpen,
}: AppActionsMenuProps) {
  function closeAfter(action: () => void) {
    action()
    setOpen(false)
  }

  return (
    <div className="action-menu">
      <button type="button" onClick={() => setOpen((isOpen) => !isOpen)} title="Share and data actions">
        <MoreHorizontal size={18} /> Actions
      </button>
      {open && (
        <div className="action-menu-panel">
          <span className="action-menu-label">Lineup</span>
          <button type="button" onClick={() => closeAfter(onShareText)} disabled={currentLineupCount === 0}>
            <Share2 size={17} /> Share text
          </button>
          <button type="button" onClick={() => closeAfter(onShareCard)} disabled={currentLineupCount === 0}>
            <ImageIcon size={17} /> Share card
          </button>

          <span className="action-menu-label">Access</span>
          <button type="button" onClick={() => closeAfter(onCopyViewLink)} disabled={!canCopyViewLink}>
            <Eye size={17} /> Copy parent view link
          </button>
          {canEdit && (
            <button type="button" onClick={() => closeAfter(onCopyEditLink)}>
              <Copy size={17} /> Copy coach edit link
            </button>
          )}
          {canEdit && (
            <button type="button" onClick={() => closeAfter(onToggleListed)}>
              {isListed ? <EyeOff size={17} /> : <Eye size={17} />}
              {isListed ? 'Hide from team picker' : 'List in team picker'}
            </button>
          )}

          {canEdit && (
            <>
              <span className="action-menu-label">Data</span>
              <button type="button" onClick={() => closeAfter(onBackup)}>
                <Download size={17} /> Backup JSON
              </button>
              <button type="button" onClick={() => closeAfter(onRestore)}>
                <Upload size={17} /> Restore JSON
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}
