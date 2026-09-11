export interface PrinterSettings {
  paperWidth: '58mm' | '80mm'
  connectionType: 'bluetooth' | 'wifi' | 'rawbt' | 'browser'
  bluetoothDeviceName: string
  wifiIpAddress: string
  wifiPort: number
  autoPrintCustomerReceipt: boolean
  autoPrintKitchenTicket: boolean
  kickCashDrawer: boolean
  copies: number
  receiptPrinterName: string
  kitchenPrinterName: string
  printItemNotesLarge: boolean
  groupKitchenItemsByCategory: boolean
}

const PRINTER_SETTINGS_KEY = 'pachax:printer-settings'

export const DEFAULT_PRINTER_SETTINGS: PrinterSettings = {
  paperWidth: '80mm',
  connectionType: 'rawbt',
  bluetoothDeviceName: 'POS-58 / POS-80',
  wifiIpAddress: '192.168.1.200',
  wifiPort: 9100,
  autoPrintCustomerReceipt: true,
  autoPrintKitchenTicket: true,
  kickCashDrawer: true,
  copies: 1,
  receiptPrinterName: 'Impresora Caja POS',
  kitchenPrinterName: 'Impresora Cocina',
  printItemNotesLarge: true,
  groupKitchenItemsByCategory: true,
}

export function getPrinterSettings(): PrinterSettings {
  try {
    const raw = localStorage.getItem(PRINTER_SETTINGS_KEY)
    if (!raw) return DEFAULT_PRINTER_SETTINGS
    return { ...DEFAULT_PRINTER_SETTINGS, ...JSON.parse(raw) }
  } catch {
    return DEFAULT_PRINTER_SETTINGS
  }
}

export function savePrinterSettings(settings: PrinterSettings): void {
  try {
    localStorage.setItem(PRINTER_SETTINGS_KEY, JSON.stringify(settings))
  } catch {
    // ignore
  }
}
