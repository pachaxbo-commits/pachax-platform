import type { PrintJobPayload } from '../../../types/printing'
import { EscPosBuilder } from '../escPosFormatter'

export function buildKitchenTicketBytes(payload: PrintJobPayload, paperWidth: '58mm' | '80mm' = '80mm'): Uint8Array {
  const cols = paperWidth === '58mm' ? 32 : 48
  const builder = new EscPosBuilder()

  builder.init().alignCenter()

  if (payload.isCopy) {
    builder.bold(true).doubleSize(true)
    builder.line('*** COMANDA COPIA ***')
    builder.doubleSize(false).separator(cols, '=')
  }

  // Large Order / Table Header for Kitchen staff
  builder.bold(true).doubleSize(true)
  builder.line(`COMANDA ${payload.displayNumber || '#000'}`)
  builder.doubleSize(false)

  if (payload.tableInfo) {
    builder.doubleSize(true).line(`MESA: ${payload.tableInfo}`).doubleSize(false)
  }

  builder.alignLeft().separator(cols)
  builder.line(`HORA: ${new Date(payload.createdIso).toLocaleTimeString('es-BO')}`)
  if (payload.fulfillmentType) builder.line(`TIPO: ${payload.fulfillmentType.toUpperCase()}`)

  builder.separator(cols)

  // Items for Kitchen
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
