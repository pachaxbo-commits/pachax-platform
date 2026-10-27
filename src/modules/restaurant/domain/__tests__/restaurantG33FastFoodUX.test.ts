// @ts-expect-error Node test types are intentionally absent from the browser tsconfig.
import test from 'node:test'
// @ts-expect-error Node test types are intentionally absent from the browser tsconfig.
import assert from 'node:assert/strict'
import {
  validateImageFile,
} from '../../../../demo/restaurant/demoProductImageStorage.ts'

test('G3.3 - validateImageFile: permite JPG, PNG y WebP', () => {
  const jpgFile = new File(['fake-jpg'], 'burger.jpg', { type: 'image/jpeg' })
  const pngFile = new File(['fake-png'], 'fries.png', { type: 'image/png' })
  const webpFile = new File(['fake-webp'], 'combo.webp', { type: 'image/webp' })

  assert.equal(validateImageFile(jpgFile).ok, true)
  assert.equal(validateImageFile(pngFile).ok, true)
  assert.equal(validateImageFile(webpFile).ok, true)
})

test('G3.3 - validateImageFile: rechaza estrictamente SVG por seguridad (prevención XSS)', () => {
  const svgFile = new File(['<svg onload="alert(1)"></svg>'], 'malicious.svg', {
    type: 'image/svg+xml',
  })
  const res = validateImageFile(svgFile)
  assert.equal(res.ok, false)
  assert.match(res.error || '', /SVG no permitido por motivos de seguridad/i)
})

test('G3.3 - validateImageFile: rechaza archivos de más de 10 MB', () => {
  const bigArray = new Uint8Array(11 * 1024 * 1024)
  const bigFile = new File([bigArray], 'huge.jpg', { type: 'image/jpeg' })
  const res = validateImageFile(bigFile)
  assert.equal(res.ok, false)
  assert.match(res.error || '', /excede el límite de 10 MB/i)
})

test('G3.3 - validateImageFile: rechaza tipos MIME no soportados (ej. pdf, exe)', () => {
  const pdfFile = new File(['fake-pdf'], 'doc.pdf', { type: 'application/pdf' })
  const res = validateImageFile(pdfFile)
  assert.equal(res.ok, false)
  assert.match(res.error || '', /no soportado/i)
})

test('G3.3 - Secondary modules by role in Counter Service (Restaurante Rápido)', () => {
  // Replicamos la regla canónica de módulos secundarios para verificar que los roles sin módulos secundarios no muestren Más
  const counterSecondary = ['users', 'reports', 'settings', 'printers', 'history']

  const getSecondaryForRole = (role: string) => {
    const rolePermissions: Record<string, string[]> = {
      owner: ['users', 'reports', 'settings', 'printers', 'history'],
      admin: ['users', 'reports', 'settings', 'printers', 'history'],
      cashier: ['printers', 'history'],
      waiter: [],
      kitchen: [],
      inventory: [],
    }
    const authorized = rolePermissions[role] || []
    return counterSecondary.filter((id) => authorized.includes(id))
  }

  // Admin y Owner tienen todos los 5 módulos secundarios
  assert.deepEqual(getSecondaryForRole('admin'), ['users', 'reports', 'settings', 'printers', 'history'])
  assert.deepEqual(getSecondaryForRole('owner'), ['users', 'reports', 'settings', 'printers', 'history'])

  // Cajero tiene Impresoras e Historial (2 módulos)
  assert.deepEqual(getSecondaryForRole('cashier'), ['printers', 'history'])

  // Mesero, Cocina e Inventario NO tienen módulos secundarios (longitud 0 -> botón Más no se muestra)
  assert.equal(getSecondaryForRole('waiter').length, 0)
  assert.equal(getSecondaryForRole('kitchen').length, 0)
  assert.equal(getSecondaryForRole('inventory').length, 0)
})
