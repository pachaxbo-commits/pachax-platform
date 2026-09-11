/**
 * Driver Web Bluetooth y Sockets para Impresoras Térmicas POS (Estilo Loyverse)
 */

export interface BluetoothDeviceOption {
  id: string
  name: string
}

export async function requestBluetoothPrinter(): Promise<BluetoothDeviceOption | null> {
  if (!('bluetooth' in navigator)) {
    throw new Error('Tu navegador o dispositivo no soporta Web Bluetooth API.')
  }

  try {
    // Solicitar dispositivos bluetooth cercanos que puedan ser impresoras térmicas
    const device = await (navigator as any).bluetooth.requestDevice({
      acceptAllDevices: true,
      optionalServices: [
        '000018f0-0000-1000-8000-00805f9b34fb', // Standard POS Printer Service
        '00001101-0000-1000-8000-00805f9b34fb', // SPP Serial Service
      ],
    })

    if (!device) return null

    return {
      id: device.id,
      name: device.name || 'Impresora Bluetooth Térmica',
    }
  } catch (err: any) {
    if (err.name === 'NotFoundError') {
      // Usuario canceló la búsqueda
      return null
    }
    throw new Error(err.message || 'Error al buscar dispositivos Bluetooth.')
  }
}
