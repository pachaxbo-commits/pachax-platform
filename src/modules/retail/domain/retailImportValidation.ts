export interface RetailImportFields {
  row: number
  name: string
  category: string
  price: string
  cost: string
  initialStock: string
  minStock: string
  trackStock: string
  active: string
}

export interface ValidatedRetailImportFields {
  priceMinor: number
  costMinor?: number
  initialStock: number
  minStock: number
  trackStock: boolean
  active: boolean
}

function importMoney(value: string, label: string, row: number): number | undefined {
  if (!value.trim()) return undefined
  if (!/^\d+(?:[.,]\d{1,2})?$/.test(value.trim())) throw new Error(`Fila ${row}: ${label} debe ser un importe válido con hasta dos decimales.`)
  const amount = Number(value.replace(',', '.'))
  if (!Number.isFinite(amount) || amount > 1_000_000) throw new Error(`Fila ${row}: ${label} está fuera del rango permitido.`)
  return Math.round(amount * 100)
}

function importWhole(value: string, label: string, row: number): number {
  if (!/^\d+$/.test(value.trim())) throw new Error(`Fila ${row}: ${label} debe ser un entero igual o mayor que cero.`)
  const amount = Number(value)
  if (!Number.isSafeInteger(amount)) throw new Error(`Fila ${row}: ${label} está fuera del rango permitido.`)
  return amount
}

function booleanField(value: string, label: string, row: number, fallback: boolean): boolean {
  const normalized = value.trim().toLowerCase()
  if (!normalized) return fallback
  if (['si', 'sí', 'true', '1'].includes(normalized)) return true
  if (['no', 'false', '0'].includes(normalized)) return false
  throw new Error(`Fila ${row}: el valor de ${label} debe ser Sí o No.`)
}

export function validateRetailImportFields(fields: RetailImportFields): ValidatedRetailImportFields {
  if (!fields.name.trim()) throw new Error(`Fila ${fields.row}: falta el nombre del producto.`)
  if (!fields.category.trim()) throw new Error(`Fila ${fields.row}: falta la categoría.`)
  const priceMinor = importMoney(fields.price, 'precio de venta', fields.row)
  if (priceMinor === undefined) throw new Error(`Fila ${fields.row}: falta el precio de venta.`)
  const costMinor = importMoney(fields.cost, 'precio de compra', fields.row)
  return {
    priceMinor,
    ...(costMinor === undefined ? {} : { costMinor }),
    initialStock: fields.initialStock.trim() ? importWhole(fields.initialStock, 'stock inicial', fields.row) : 0,
    minStock: fields.minStock.trim() ? importWhole(fields.minStock, 'stock mínimo', fields.row) : 0,
    trackStock: booleanField(fields.trackStock, 'controlar stock', fields.row, true),
    active: booleanField(fields.active, 'activo', fields.row, true),
  }
}
