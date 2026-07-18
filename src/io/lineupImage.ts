import { BRAND_COLORS, BRAND_FONTS, BRAND_NAME, BRAND_SLOGAN } from '../brand'
import { INFIELD } from '../types'
import type { LineupRow, TeamSummary } from '../types'
import { getTeamInitials, getTeamLogo } from '../teamLogos'

function roundRect(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  context.beginPath()
  context.roundRect(x, y, width, height, radius)
}

function drawFieldStarMark(context: CanvasRenderingContext2D, x: number, y: number, size: number) {
  const scale = size / 54
  context.save()
  context.translate(x, y)
  context.scale(scale, scale)
  context.fillStyle = BRAND_COLORS.clay
  context.beginPath()
  context.arc(27, 27, 24, 0, Math.PI * 2)
  context.fill()
  context.strokeStyle = BRAND_COLORS.cream
  context.lineWidth = 2.5
  context.setLineDash([1, 5])
  context.lineCap = 'round'
  context.beginPath()
  context.moveTo(13, 10)
  context.bezierCurveTo(18.5, 20, 18.5, 34, 13, 44)
  context.moveTo(41, 10)
  context.bezierCurveTo(35.5, 20, 35.5, 34, 41, 44)
  context.stroke()
  context.setLineDash([])
  context.fillStyle = BRAND_COLORS.cream
  const star = new Path2D('M27 19 L29.5 25.6 L36.4 25.9 L31 30.2 L32.9 36.9 L27 32.9 L21.1 36.9 L23 30.2 L17.6 25.9 L24.5 25.6 Z')
  context.fill(star)
  context.restore()
}

function drawCell(context: CanvasRenderingContext2D, value: string, x: number, y: number, width: number, height: number, fill: string, color: string, font = `600 24px ${BRAND_FONTS.ui}`) {
  context.fillStyle = fill
  roundRect(context, x, y, width, height, 8)
  context.fill()
  context.fillStyle = color
  context.font = font
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  context.fillText(value || '-', x + width / 2, y + height / 2)
}

async function loadCardFonts() {
  if (!document.fonts) return
  await document.fonts.ready
  await Promise.all([
    document.fonts.load(`700 48px ${BRAND_FONTS.display}`),
    document.fonts.load(`700 20px ${BRAND_FONTS.ui}`),
    document.fonts.load(`600 24px ${BRAND_FONTS.ui}`),
  ])
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

function drawTeamLogo(
  context: CanvasRenderingContext2D,
  logo: HTMLImageElement | null,
  teamName: string,
  centerX: number,
  centerY: number,
  diameter: number,
) {
  const radius = diameter / 2
  context.save()
  context.beginPath()
  context.arc(centerX, centerY, radius, 0, Math.PI * 2)
  context.clip()
  context.fillStyle = BRAND_COLORS.cream
  context.fillRect(centerX - radius, centerY - radius, diameter, diameter)
  if (logo) {
    const scale = Math.max(diameter / logo.width, diameter / logo.height) * 1.16
    const width = logo.width * scale
    const height = logo.height * scale
    context.drawImage(logo, centerX - width / 2, centerY - height / 2, width, height)
  } else {
    context.fillStyle = BRAND_COLORS.grass
    context.font = `700 ${Math.round(diameter * 0.34)}px ${BRAND_FONTS.display}`
    context.textAlign = 'center'
    context.textBaseline = 'middle'
    context.fillText(getTeamInitials(teamName), centerX, centerY + 1)
  }
  context.restore()
  context.strokeStyle = 'rgba(247, 243, 232, 0.7)'
  context.lineWidth = 2
  context.beginPath()
  context.arc(centerX, centerY, radius - 1, 0, Math.PI * 2)
  context.stroke()
}

export async function createLineupCardBlob(team: TeamSummary, lineup: LineupRow[], date: string, innings: number) {
  await loadCardFonts()

  const scale = 2
  const width = 1080
  const rowHeight = 58
  const height = 300 + rowHeight * Math.max(1, lineup.length)
  const canvas = document.createElement('canvas')
  canvas.width = width * scale
  canvas.height = height * scale
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Could not create lineup image')
  context.scale(scale, scale)

  const logo = await loadImage(getTeamLogo(team))
  context.fillStyle = BRAND_COLORS.cream
  context.fillRect(0, 0, width, height)
  context.fillStyle = BRAND_COLORS.grass
  context.fillRect(0, 0, width, 174)

  drawFieldStarMark(context, 42, 28, 72)
  context.fillStyle = BRAND_COLORS.cream
  context.font = `700 46px ${BRAND_FONTS.display}`
  context.textAlign = 'left'
  context.textBaseline = 'top'
  context.fillText(BRAND_NAME, 132, 32)
  context.font = `700 13px ${BRAND_FONTS.ui}`
  context.fillText(BRAND_SLOGAN, 134, 91)

  drawTeamLogo(context, logo, team.name, 993, 73, 90)
  context.textAlign = 'right'
  context.fillStyle = BRAND_COLORS.cream
  context.font = `700 32px ${BRAND_FONTS.display}`
  context.fillText(team.name || 'Team lineup', 928, 38)
  context.font = `600 17px ${BRAND_FONTS.ui}`
  context.fillText(`${date} · ${innings} innings`, 928, 83)
  const tableX = 44
  const tableY = 222
  const batWidth = 74
  const playerWidth = 250
  const gap = 8
  const inningWidth = Math.floor((width - tableX * 2 - batWidth - playerWidth - gap * (innings + 1)) / innings)

  context.font = `700 18px ${BRAND_FONTS.ui}`
  context.fillStyle = BRAND_COLORS.muted
  context.textAlign = 'left'
  context.fillText('BAT', tableX, tableY - 34)
  context.fillText('PLAYER', tableX + batWidth + gap, tableY - 34)
  Array.from({ length: innings }, (_, inning) => {
    context.fillText(`INN ${inning + 1}`, tableX + batWidth + playerWidth + gap * 2 + inning * (inningWidth + gap), tableY - 34)
  })

  if (!lineup.length) {
    context.fillStyle = BRAND_COLORS.muted
    context.font = `600 28px ${BRAND_FONTS.ui}`
    context.fillText('No lineup yet', tableX, tableY + 20)
  }

  lineup.forEach((row, index) => {
    const y = tableY + index * rowHeight
    drawCell(context, String(row.batOrder), tableX, y, batWidth, 46, BRAND_COLORS.clayTint, BRAND_COLORS.clay, `700 30px ${BRAND_FONTS.display}`)
    drawCell(context, row.playerName, tableX + batWidth + gap, y, playerWidth, 46, BRAND_COLORS.surface, BRAND_COLORS.ink)
    Array.from({ length: innings }, (_, inning) => {
      const value = row.assignments[inning] || ''
      const fill = value === 'Sit'
        ? BRAND_COLORS.stoneTint
        : INFIELD.has(value)
          ? BRAND_COLORS.infieldTint
          : value
            ? BRAND_COLORS.grassTint
            : BRAND_COLORS.surface
      const color = value === 'Sit'
        ? BRAND_COLORS.stone
        : INFIELD.has(value)
          ? BRAND_COLORS.infield
          : value
            ? BRAND_COLORS.grass
            : BRAND_COLORS.ink
      drawCell(context, positionLabel(value), tableX + batWidth + playerWidth + gap * 2 + inning * (inningWidth + gap), y, inningWidth, 46, fill, color)
    })
  })

  context.fillStyle = BRAND_COLORS.muted
  context.font = `700 12px ${BRAND_FONTS.ui}`
  context.textAlign = 'right'
  context.fillText(BRAND_SLOGAN, width - 44, height - 22)

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error('Could not create lineup image'))
    }, 'image/png')
  })
}
