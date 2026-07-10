import type { LineupRow, TeamSummary } from '../types'

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

function drawCell(context: CanvasRenderingContext2D, value: string, x: number, y: number, width: number, height: number, fill: string, color = '#203126') {
  context.fillStyle = fill
  roundRect(context, x, y, width, height, 6)
  context.fill()
  context.fillStyle = color
  context.font = '600 24px Inter, Arial, sans-serif'
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  context.fillText(value || '-', x + width / 2, y + height / 2)
}

export function createLineupCardBlob(team: TeamSummary, lineup: LineupRow[], date: string, innings: number) {
  const scale = 2
  const width = 1080
  const rowHeight = 58
  const height = 210 + rowHeight * Math.max(1, lineup.length)
  const canvas = document.createElement('canvas')
  canvas.width = width * scale
  canvas.height = height * scale
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Could not create lineup image')
  context.scale(scale, scale)

  context.fillStyle = '#f6f7f1'
  context.fillRect(0, 0, width, height)
  context.fillStyle = '#0b2a52'
  context.fillRect(0, 0, width, 132)
  context.fillStyle = '#f2b441'
  context.fillRect(0, 132, width, 8)

  context.fillStyle = '#ffffff'
  context.font = '800 48px Archivo, Arial, sans-serif'
  context.textAlign = 'left'
  context.textBaseline = 'top'
  context.fillText(team.name || 'FieldStar', 44, 32)
  context.fillStyle = '#d9e4dc'
  context.font = '600 24px Inter, Arial, sans-serif'
  context.fillText(`${date} · ${innings} innings`, 46, 86)

  const tableX = 44
  const tableY = 166
  const batWidth = 74
  const playerWidth = 250
  const gap = 8
  const inningWidth = Math.floor((width - tableX * 2 - batWidth - playerWidth - gap * (innings + 1)) / innings)

  context.font = '700 20px Inter, Arial, sans-serif'
  context.fillStyle = '#435448'
  context.fillText('Bat', tableX, tableY - 34)
  context.fillText('Player', tableX + batWidth + gap, tableY - 34)
  Array.from({ length: innings }, (_, inning) => {
    context.fillText(`Inn ${inning + 1}`, tableX + batWidth + playerWidth + gap * 2 + inning * (inningWidth + gap), tableY - 34)
  })

  if (!lineup.length) {
    context.fillStyle = '#667264'
    context.font = '600 28px Inter, Arial, sans-serif'
    context.fillText('No lineup yet', tableX, tableY + 20)
  }

  lineup.forEach((row, index) => {
    const y = tableY + index * rowHeight
    drawCell(context, String(row.batOrder), tableX, y, batWidth, 46, '#e8efe8')
    drawCell(context, row.playerName, tableX + batWidth + gap, y, playerWidth, 46, '#ffffff')
    Array.from({ length: innings }, (_, inning) => {
      const value = row.assignments[inning] || ''
      const fill = value === 'Sit' ? '#fff3cd' : value ? '#e8efe8' : '#ffffff'
      drawCell(context, value, tableX + batWidth + playerWidth + gap * 2 + inning * (inningWidth + gap), y, inningWidth, 46, fill)
    })
  })

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error('Could not create lineup image'))
    }, 'image/png')
  })
}
