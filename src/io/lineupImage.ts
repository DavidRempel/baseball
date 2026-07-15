import type { LineupRow, TeamSummary } from '../types'
import { getTeamLogo } from '../teamLogos'

function roundRect(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  context.beginPath()
  context.moveTo(x + radius, y)
  context.lineTo(x + width - radius, y)
  context.quadraticCurveTo(x + width, y, x + width, y + radius)
  context.lineTo(x + width, y + height - radius)
  context.quadraticCurveTo(x + width, y + height, x + width - radius, y + height)
  context.lineTo(x + radius, y + height)
  context.quadraticCurveTo(x, y + height, x, y + height - radius)
  context.lineTo(x, y + radius)
  context.quadraticCurveTo(x, y, x + radius, y)
  context.closePath()
}

function drawCell(context: CanvasRenderingContext2D, value: string, x: number, y: number, width: number, height: number, fill: string, color: string) {
  context.fillStyle = fill
  roundRect(context, x, y, width, height, 6)
  context.fill()
  context.fillStyle = color
  context.font = '600 24px "Inter Variable", Inter, Arial, sans-serif'
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  context.fillText(value || '-', x + width / 2, y + height / 2)
}

function cssColor(name: string, fallback: string) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback
}

async function loadCardFonts() {
  if (!document.fonts) return
  await Promise.all([
    document.fonts.load('800 48px "Archivo Variable"'),
    document.fonts.load('700 20px "Inter Variable"'),
    document.fonts.load('600 24px "Inter Variable"'),
  ]).catch(() => undefined)
}

function positionLabel(value: string) {
  return value === 'Rover' ? 'Rov' : value
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement | null>((resolve) => {
    if (!src) {
      resolve(null)
      return
    }
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => resolve(null)
    image.src = src
  })
}

export async function createLineupCardBlob(team: TeamSummary, lineup: LineupRow[], date: string, innings: number) {
  const scale = 2
  const width = 1080
  const rowHeight = 58
  const height = 248 + rowHeight * Math.max(1, lineup.length)
  const canvas = document.createElement('canvas')
  canvas.width = width * scale
  canvas.height = height * scale
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Could not create lineup image')
  context.scale(scale, scale)

  const [logo] = await Promise.all([loadImage(getTeamLogo(team)), loadCardFonts()])
  const colors = {
    accent: cssColor('--accent', '#f2b441'),
    accentSoft: cssColor('--accent-soft', '#fff8df'),
    brandDark: cssColor('--brand-dark', '#0b2a52'),
    brandSoft: cssColor('--brand-soft', '#e8efe8'),
    headerMuted: cssColor('--header-muted', '#d9e4dc'),
    ink: cssColor('--ink', '#1b2430'),
    muted: cssColor('--muted', '#5e6b62'),
    page: cssColor('--page-bg', '#fbfcf9'),
    surface: cssColor('--surface', '#ffffff'),
  }

  context.fillStyle = colors.page
  context.fillRect(0, 0, width, height)
  context.fillStyle = colors.brandDark
  context.fillRect(0, 0, width, 150)
  context.fillStyle = colors.accent
  context.fillRect(0, 150, width, 8)

  if (logo) {
    context.fillStyle = colors.surface
    roundRect(context, 44, 28, 94, 94, 8)
    context.fill()
    const ratio = Math.min(78 / logo.width, 78 / logo.height)
    const imageWidth = logo.width * ratio
    const imageHeight = logo.height * ratio
    context.drawImage(logo, 44 + (94 - imageWidth) / 2, 28 + (94 - imageHeight) / 2, imageWidth, imageHeight)
  }

  const titleX = logo ? 160 : 44

  context.fillStyle = colors.surface
  context.font = '800 48px "Archivo Variable", Archivo, Arial, sans-serif'
  context.textAlign = 'left'
  context.textBaseline = 'top'
  context.fillText(team.name || 'FieldStar', titleX, 32)
  context.fillStyle = colors.headerMuted
  context.font = '600 24px "Inter Variable", Inter, Arial, sans-serif'
  context.fillText(`${date} · ${innings} innings · FieldStar`, titleX + 2, 88)

  const tableX = 44
  const tableY = 196
  const batWidth = 74
  const playerWidth = 250
  const gap = 8
  const inningWidth = Math.floor((width - tableX * 2 - batWidth - playerWidth - gap * (innings + 1)) / innings)

  context.font = '700 20px "Inter Variable", Inter, Arial, sans-serif'
  context.fillStyle = colors.muted
  context.fillText('Bat', tableX, tableY - 34)
  context.fillText('Player', tableX + batWidth + gap, tableY - 34)
  Array.from({ length: innings }, (_, inning) => {
    context.fillText(`Inn ${inning + 1}`, tableX + batWidth + playerWidth + gap * 2 + inning * (inningWidth + gap), tableY - 34)
  })

  if (!lineup.length) {
    context.fillStyle = colors.muted
    context.font = '600 28px "Inter Variable", Inter, Arial, sans-serif'
    context.fillText('No lineup yet', tableX, tableY + 20)
  }

  lineup.forEach((row, index) => {
    const y = tableY + index * rowHeight
    drawCell(context, String(row.batOrder), tableX, y, batWidth, 46, colors.brandSoft, colors.ink)
    drawCell(context, row.playerName, tableX + batWidth + gap, y, playerWidth, 46, colors.surface, colors.ink)
    Array.from({ length: innings }, (_, inning) => {
      const value = row.assignments[inning] || ''
      const fill = value === 'Sit' ? colors.accentSoft : value ? colors.brandSoft : colors.surface
      drawCell(context, positionLabel(value), tableX + batWidth + playerWidth + gap * 2 + inning * (inningWidth + gap), y, inningWidth, 46, fill, colors.ink)
    })
  })

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error('Could not create lineup image'))
    }, 'image/png')
  })
}
