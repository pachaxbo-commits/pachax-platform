import type { PrintJobPayload } from '../../../types/printing.ts'
import { EscPosBuilder } from '../escPosFormatter.ts'

export function buildKitchenTicketBytes(
  payload: PrintJobPayload,
  paperWidth: '58mm' | '80mm' = '80mm',
  areaLabel: 'COCINA' | 'BARRA' = 'COCINA'
): Uint8Array {
  const cols = paperWidth === '58mm' ? 32 : 48
  const builder = new EscPosBuilder()

  builder.init().alignCenter()

  if (payload.isCopy) {
    builder.bold(true).doubleSize(true)
    builder.line('*** COMANDA COPIA ***')
    builder.doubleSize(false).separator(cols, '=')
  }

  // Large Order / Table Header for Kitchen or Bar staff
  builder.bold(true).doubleSize(true)
  if (areaLabel === 'BARRA') {
    builder.line('COMANDA - BARRA')
    if (payload.displayNumber) {
      builder.line(`RONDA #${payload.displayNumber}`)
    }
  } else {
    builder.line(`COMANDA ${payload.displayNumber || '#000'}`)
  }
  builder.doubleSize(false)

  if (payload.tableInfo) {
    builder.doubleSize(true).line(`MESA: ${payload.tableInfo}`).doubleSize(false)
  }

  builder.alignLeft().separator(cols)
  builder.line(`HORA: ${new Date(payload.createdIso || Date.now()).toLocaleTimeString('es-BO')}`)
  if (payload.customerName) {
    builder.line(`RESPONSABLE: ${payload.customerName}`)
  }
  if (payload.fulfillmentType) {
    builder.line(`TIPO: ${payload.fulfillmentType.toUpperCase()}`)
  }

  builder.separator(cols)

  // Items for Kitchen / Bar (WITHOUT PRICES)
  payload.items.forEach((item) => {
    builder.bold(true).doubleSize(true)
    builder.line(`${item.quantity}x ${item.name}`)
    builder.doubleSize(false).bold(false)

    if (item.modifiersText && item.modifiersText.length > 0) {
      item.modifiersText.forEach((mod) => {
        builder.bold(true).line(`   [!] ${mod}`).bold(false)
      })
    }

    if (item.note) {
      builder.bold(true).line(`   OBS: ${item.note}`).bold(false)
    }

    builder.line('')
  })

  builder.separator(cols)
  builder.feed(3).cut(true)

  return builder.build()
}

export const buildOperationalTicketBytes = buildKitchenTicketBytes
