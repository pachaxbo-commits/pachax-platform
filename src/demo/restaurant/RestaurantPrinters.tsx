import { useState } from 'react'
import { Printer, CheckCircle, Wifi, Bluetooth, Usb, Play } from 'lucide-react'

export function RestaurantPrinters() {
  const [paperWidth, setPaperWidth] = useState<'58mm' | '80mm'>('80mm')
  const [connType, setConnType] = useState<'tcp' | 'bluetooth' | 'usb'>('tcp')
  const [testSent, setTestSent] = useState(false)

  const handleTestPrint = () => {
    setTestSent(true)
    setTimeout(() => setTestSent(false), 3000)
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Configuración de Impresoras Térmicas</h1>
        <p className="text-sm text-slate-500">Impresión de comandas para cocina, barra y recibos de caja</p>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs space-y-6">
        <div>
          <label className="text-xs font-semibold text-slate-700 block mb-2">Ancho de Rollo Térmico</label>
          <div className="grid grid-cols-2 gap-3 max-w-sm">
            {(['58mm', '80mm'] as const).map((w) => (
              <button
                key={w}
                onClick={() => setPaperWidth(w)}
                className={`py-2.5 px-4 rounded-xl border text-xs font-bold transition flex items-center justify-center gap-2 ${
                  paperWidth === w
                    ? 'bg-slate-900 text-white border-slate-900'
                    : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'
                }`}
              >
                <Printer className="w-4 h-4" />
                {w} {w === '80mm' ? '(Estándar Salón)' : '(Compacto)'}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="text-xs font-semibold text-slate-700 block mb-2">Tipo de Conexión</label>
          <div className="grid grid-cols-3 gap-3">
            {[
              { id: 'tcp', label: 'Red TCP / WiFi', icon: Wifi, desc: 'Cocina & Salón (Recomendado)' },
              { id: 'bluetooth', label: 'Bluetooth SPP', icon: Bluetooth, desc: 'Impresora portátil móvil' },
              { id: 'usb', label: 'USB / Serial', icon: Usb, desc: 'Caja mostrador fija' },
            ].map((c) => {
              const Icon = c.icon
              const isSelected = connType === c.id
              return (
                <button
                  key={c.id}
                  onClick={() => setConnType(c.id as any)}
                  className={`p-3.5 rounded-xl border text-left transition flex flex-col justify-between ${
                    isSelected
                      ? 'bg-teal-50/50 border-teal-300 ring-2 ring-teal-400/30'
                      : 'bg-white border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <Icon className={`w-5 h-5 mb-2 ${isSelected ? 'text-teal-700' : 'text-slate-500'}`} />
                  <div>
                    <div className="text-xs font-bold text-slate-900">{c.label}</div>
                    <div className="text-[11px] text-slate-500 mt-0.5">{c.desc}</div>
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        <div className="pt-4 border-t border-slate-100 flex items-center justify-between">
          <div className="text-xs text-slate-500">
            Simulador de hardware térmico ESC/POS activo
          </div>
          <button
            onClick={handleTestPrint}
            className="px-4 py-2 text-xs font-bold bg-slate-900 hover:bg-slate-800 text-white rounded-xl transition flex items-center gap-2"
          >
            {testSent ? <CheckCircle className="w-4 h-4 text-emerald-400" /> : <Play className="w-4 h-4" />}
            {testSent ? '¡Ticket de prueba enviado!' : 'Probar Impresión de Prueba'}
          </button>
        </div>
      </div>
    </div>
  )
}
