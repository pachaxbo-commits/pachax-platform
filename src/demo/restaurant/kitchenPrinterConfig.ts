export type KitchenPrinterConfig = {
  name: string
  area: 'kitchen' | 'bar' | 'cash'
  connection: 'browser' | 'local_agent' | 'network' | 'bluetooth' | 'usb'
  paperWidth: '58mm' | '80mm' | 'A4'
  mode: 'manual' | 'automatic'
}

export const DEFAULT_KITCHEN_PRINTER_CONFIG: KitchenPrinterConfig = { name: '', area: 'kitchen', connection: 'browser', paperWidth: '80mm', mode: 'manual' }
