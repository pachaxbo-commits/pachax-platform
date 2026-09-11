import { useState } from 'react'
import { Printer, X, Check, FileText, Zap, DollarSign, Copy, ShieldCheck, Tag, SlidersHorizontal, Bluetooth, Wifi, Radio, Search, AlertCircle } from 'lucide-react'
import { getPrinterSettings, savePrinterSettings, type PrinterSettings } from '../lib/printerSettings'
import { requestBluetoothPrinter } from '../lib/bluetoothPrinter'
import { enviarARawBt, ticketPruebaBase64 } from '../lib/escpos'

export function PrinterSettingsModal({
  isOpen,
  onClose,
}: {
  isOpen: boolean
  onClose: () => void
}) {
  const [settings, setSettings] = useState<PrinterSettings>(getPrinterSettings)
  const [savedSuccess, setSavedSuccess] = useState(false)
  const [testSuccess, setTestSuccess] = useState(false)
  const [isScanningBt, setIsScanningBt] = useState(false)
  const [btError, setBtError] = useState<string | null>(null)

  if (!isOpen) return null

  const handleSave = () => {
    savePrinterSettings(settings)
    setSavedSuccess(true)
    setTimeout(() => {
      setSavedSuccess(false)
      onClose()
    }, 1000)
  }

  const handleScanBluetooth = async () => {
    setIsScanningBt(true)
    setBtError(null)
    try {
      const dev = await requestBluetoothPrinter()
      if (dev) {
        setSettings((s) => ({
          ...s,
          connectionType: 'bluetooth',
          bluetoothDeviceName: dev.name,
        }))
      }
    } catch (err: any) {
      setBtError(err.message || 'No se pudo vincular la impresora Bluetooth.')
    } finally {
      setIsScanningBt(false)
    }
  }

  const handleTestPrint = () => {
    const base64 = ticketPruebaBase64()
    enviarARawBt(base64)
    setTestSuccess(true)
    setTimeout(() => setTestSuccess(false), 2500)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fadeIn overflow-y-auto">
      <div className="relative w-full max-w-xl rounded-3xl bg-slate-900 border border-slate-800 p-6 sm:p-8 shadow-2xl text-slate-100 my-8">
        {/* Header */}
        <div className="flex items-center justify-between pb-5 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-600/20 border border-indigo-500/30 text-indigo-400">
              <Printer size={24} />
            </div>
            <div>
              <h2 className="text-xl font-bold tracking-tight text-white">Configuración de Impresoras</h2>
              <p className="text-xs text-slate-400">Conexiones Bluetooth, Wi-Fi y ESC/POS estilo Loyverse POS</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700 transition"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content Options */}
        <div className="mt-6 space-y-6">
          {/* Tipo de Conexión (Loyverse POS Style) */}
          <div>
            <label className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-400 mb-2.5">
              <Radio size={14} className="text-indigo-400" /> Tipo de Interfaz / Conexión
            </label>
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              <button
                type="button"
                onClick={() => setSettings((s) => ({ ...s, connectionType: 'bluetooth' }))}
                className={`p-3 rounded-2xl border text-xs font-bold flex flex-col items-center gap-1.5 transition ${
                  settings.connectionType === 'bluetooth'
                    ? 'bg-indigo-600/20 border-indigo-500 text-white shadow-md'
                    : 'bg-slate-800/60 border-slate-700 text-slate-400 hover:bg-slate-800'
                }`}
              >
                <Bluetooth size={18} className="text-indigo-400" />
                <span>Bluetooth</span>
              </button>

              <button
                type="button"
                onClick={() => setSettings((s) => ({ ...s, connectionType: 'wifi' }))}
                className={`p-3 rounded-2xl border text-xs font-bold flex flex-col items-center gap-1.5 transition ${
                  settings.connectionType === 'wifi'
                    ? 'bg-indigo-600/20 border-indigo-500 text-white shadow-md'
                    : 'bg-slate-800/60 border-slate-700 text-slate-400 hover:bg-slate-800'
                }`}
              >
                <Wifi size={18} className="text-sky-400" />
                <span>Wi-Fi / Red (IP)</span>
              </button>

              <button
                type="button"
                onClick={() => setSettings((s) => ({ ...s, connectionType: 'rawbt' }))}
                className={`p-3 rounded-2xl border text-xs font-bold flex flex-col items-center gap-1.5 transition ${
                  settings.connectionType === 'rawbt'
                    ? 'bg-indigo-600/20 border-indigo-500 text-white shadow-md'
                    : 'bg-slate-800/60 border-slate-700 text-slate-400 hover:bg-slate-800'
                }`}
              >
                <Zap size={18} className="text-amber-400" />
                <span>RawBT Driver</span>
              </button>

              <button
                type="button"
                onClick={() => setSettings((s) => ({ ...s, connectionType: 'browser' }))}
                className={`p-3 rounded-2xl border text-xs font-bold flex flex-col items-center gap-1.5 transition ${
                  settings.connectionType === 'browser'
                    ? 'bg-indigo-600/20 border-indigo-500 text-white shadow-md'
                    : 'bg-slate-800/60 border-slate-700 text-slate-400 hover:bg-slate-800'
                }`}
              >
                <Printer size={18} className="text-emerald-400" />
                <span>Navegador / PC</span>
              </button>
            </div>
          </div>

          {/* Configuración según la conexión seleccionada */}
          {settings.connectionType === 'bluetooth' && (
            <div className="p-4 rounded-2xl bg-indigo-950/30 border border-indigo-500/20 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-white block">Impresora Bluetooth Vinculada</span>
                  <span className="text-xs text-indigo-300">{settings.bluetoothDeviceName}</span>
                </div>
                <button
                  type="button"
                  onClick={handleScanBluetooth}
                  disabled={isScanningBt}
                  className="py-2 px-3.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold flex items-center gap-1.5 transition shadow-sm"
                >
                  <Search size={14} />
                  {isScanningBt ? 'Buscando...' : 'Buscar / Emparejar'}
                </button>
              </div>

              {btError && (
                <div className="flex items-center gap-1.5 text-xs text-rose-400 bg-rose-500/10 p-2 rounded-xl border border-rose-500/20">
                  <AlertCircle size={14} /> {btError}
                </div>
              )}
            </div>
          )}

          {settings.connectionType === 'wifi' && (
            <div className="p-4 rounded-2xl bg-sky-950/30 border border-sky-500/20 space-y-3">
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <span className="text-xs font-semibold text-slate-300 block mb-1">Dirección IP de la Impresora</span>
                  <input
                    type="text"
                    value={settings.wifiIpAddress}
                    onChange={(e) => setSettings((s) => ({ ...s, wifiIpAddress: e.target.value }))}
                    className="w-full rounded-xl border border-slate-800 bg-slate-950/70 px-3 py-2 text-xs text-white focus:border-sky-500 focus:outline-none"
                    placeholder="192.168.1.200"
                  />
                </div>
                <div>
                  <span className="text-xs font-semibold text-slate-300 block mb-1">Puerto (TCP)</span>
                  <input
                    type="number"
                    value={settings.wifiPort}
                    onChange={(e) => setSettings((s) => ({ ...s, wifiPort: Number(e.target.value) || 9100 }))}
                    className="w-full rounded-xl border border-slate-800 bg-slate-950/70 px-3 py-2 text-xs text-white focus:border-sky-500 focus:outline-none"
                    placeholder="9100"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Perfiles de Impresora */}
          <div>
            <label className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-400 mb-2.5">
              <Tag size={14} className="text-indigo-400" /> Perfiles de Impresora (Estaciones)
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <span className="text-xs font-semibold text-slate-300 block mb-1">Nombre Impresora de Caja</span>
                <input
                  type="text"
                  value={settings.receiptPrinterName}
                  onChange={(e) => setSettings((s) => ({ ...s, receiptPrinterName: e.target.value }))}
                  className="w-full rounded-2xl border border-slate-800 bg-slate-950/70 px-3.5 py-2 text-xs text-white focus:border-indigo-500 focus:outline-none transition"
                  placeholder="Ej. Impresora Caja POS"
                />
              </div>
              <div>
                <span className="text-xs font-semibold text-slate-300 block mb-1">Nombre Impresora de Cocina</span>
                <input
                  type="text"
                  value={settings.kitchenPrinterName}
                  onChange={(e) => setSettings((s) => ({ ...s, kitchenPrinterName: e.target.value }))}
                  className="w-full rounded-2xl border border-slate-800 bg-slate-950/70 px-3.5 py-2 text-xs text-white focus:border-indigo-500 focus:outline-none transition"
                  placeholder="Ej. Impresora Cocina"
                />
              </div>
            </div>
          </div>

          {/* Formato de Papel */}
          <div>
            <label className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-400 mb-2.5">
              <FileText size={14} className="text-indigo-400" /> Ancho del Papel Térmico
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setSettings((s) => ({ ...s, paperWidth: '58mm' }))}
                className={`py-3 px-4 rounded-2xl border text-xs font-bold flex items-center justify-between transition ${
                  settings.paperWidth === '58mm'
                    ? 'bg-indigo-600/20 border-indigo-500 text-white shadow-md'
                    : 'bg-slate-800/60 border-slate-700 text-slate-400 hover:bg-slate-800'
                }`}
              >
                <span>58 mm (2 pulgadas)</span>
                {settings.paperWidth === '58mm' && <Check size={16} className="text-indigo-400" />}
              </button>
              <button
                type="button"
                onClick={() => setSettings((s) => ({ ...s, paperWidth: '80mm' }))}
                className={`py-3 px-4 rounded-2xl border text-xs font-bold flex items-center justify-between transition ${
                  settings.paperWidth === '80mm'
                    ? 'bg-indigo-600/20 border-indigo-500 text-white shadow-md'
                    : 'bg-slate-800/60 border-slate-700 text-slate-400 hover:bg-slate-800'
                }`}
              >
                <span>80 mm (3 pulgadas)</span>
                {settings.paperWidth === '80mm' && <Check size={16} className="text-indigo-400" />}
              </button>
            </div>
          </div>

          {/* Impresión Automática y Cajón de Dinero */}
          <div className="space-y-2.5">
            <label className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-400">
              <Zap size={14} className="text-amber-400" /> Disparadores Automáticos (Auto-Print)
            </label>

            <label className="flex items-center justify-between p-3 rounded-2xl bg-slate-800/50 border border-slate-800 cursor-pointer hover:bg-slate-800 transition">
              <div>
                <span className="text-xs font-semibold text-white block">Auto-imprimir Ticket de Cliente al cobrar</span>
                <span className="text-[11px] text-slate-400">Imprime el recibo al confirmar el pago en Caja</span>
              </div>
              <input
                type="checkbox"
                checked={settings.autoPrintCustomerReceipt}
                onChange={(e) => setSettings((s) => ({ ...s, autoPrintCustomerReceipt: e.target.checked }))}
                className="h-4 w-4 rounded border-slate-700 bg-slate-900 text-indigo-600 focus:ring-indigo-500"
              />
            </label>

            <label className="flex items-center justify-between p-3 rounded-2xl bg-slate-800/50 border border-slate-800 cursor-pointer hover:bg-slate-800 transition">
              <div>
                <span className="text-xs font-semibold text-white block">Auto-imprimir Comanda de Cocina al pedir</span>
                <span className="text-[11px] text-slate-400">Envía la comanda a cocina automáticamente al solicitar la orden</span>
              </div>
              <input
                type="checkbox"
                checked={settings.autoPrintKitchenTicket}
                onChange={(e) => setSettings((s) => ({ ...s, autoPrintKitchenTicket: e.target.checked }))}
                className="h-4 w-4 rounded border-slate-700 bg-slate-900 text-indigo-600 focus:ring-indigo-500"
              />
            </label>

            <label className="flex items-center justify-between p-3 rounded-2xl bg-slate-800/50 border border-slate-800 cursor-pointer hover:bg-slate-800 transition">
              <div>
                <span className="text-xs font-semibold text-white block flex items-center gap-1">
                  <DollarSign size={13} className="text-emerald-400" /> Apertura Automática de Gaveta de Dinero
                </span>
                <span className="text-[11px] text-slate-400">Envía pulso ESC/POS para abrir el cajón de billetes en pago efectivo</span>
              </div>
              <input
                type="checkbox"
                checked={settings.kickCashDrawer}
                onChange={(e) => setSettings((s) => ({ ...s, kickCashDrawer: e.target.checked }))}
                className="h-4 w-4 rounded border-slate-700 bg-slate-900 text-indigo-600 focus:ring-indigo-500"
              />
            </label>
          </div>

          {/* Opciones Adicionales de Formato (Loyverse) */}
          <div className="space-y-2.5">
            <label className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-400">
              <SlidersHorizontal size={14} className="text-sky-400" /> Opciones de Comanda para Cocina
            </label>

            <label className="flex items-center justify-between p-3 rounded-2xl bg-slate-800/50 border border-slate-800 cursor-pointer hover:bg-slate-800 transition">
              <div>
                <span className="text-xs font-semibold text-white block">Observaciones y Notas en Grande</span>
                <span className="text-[11px] text-slate-400">Resalta las notas de cocineros con fuente en negrita de tamaño doble</span>
              </div>
              <input
                type="checkbox"
                checked={settings.printItemNotesLarge}
                onChange={(e) => setSettings((s) => ({ ...s, printItemNotesLarge: e.target.checked }))}
                className="h-4 w-4 rounded border-slate-700 bg-slate-900 text-indigo-600 focus:ring-indigo-500"
              />
            </label>
          </div>

          {/* Copias */}
          <div>
            <label className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
              <Copy size={14} className="text-sky-400" /> Número de Copias por Ticket
            </label>
            <div className="flex items-center gap-3">
              {[1, 2, 3].map((num) => (
                <button
                  key={num}
                  type="button"
                  onClick={() => setSettings((s) => ({ ...s, copies: num }))}
                  className={`flex-1 py-2 rounded-xl border text-xs font-bold transition ${
                    settings.copies === num
                      ? 'bg-sky-600/20 border-sky-500 text-white'
                      : 'bg-slate-800/60 border-slate-700 text-slate-400 hover:bg-slate-800'
                  }`}
                >
                  {num} {num === 1 ? 'Copia' : 'Copias'}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="mt-8 pt-5 border-t border-slate-800 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={handleTestPrint}
            className="py-2.5 px-4 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold flex items-center gap-2 transition"
          >
            <Printer size={16} />
            {testSuccess ? '¡Ticket de Prueba Enviado!' : 'Probar Impresión'}
          </button>

          <button
            type="button"
            onClick={handleSave}
            className="py-2.5 px-6 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold flex items-center gap-2 shadow-lg shadow-indigo-600/25 transition"
          >
            {savedSuccess ? <Check size={16} /> : <ShieldCheck size={16} />}
            {savedSuccess ? '¡Guardado!' : 'Guardar Ajustes'}
          </button>
        </div>
      </div>
    </div>
  )
}
