import { useEffect, useMemo, useState } from 'react'
import {
  CheckCircle2,
  FileText,
  Info,
  Laptop,
  Plus,
  Printer,
  Radio,
  RefreshCw,
  Save,
  Send,
  Trash2,
  Wifi,
} from 'lucide-react'
import { Capacitor } from '@capacitor/core'
import type { KitchenTicketJob } from '../../modules/restaurant/domain/kitchenPrint'
import { DEFAULT_KITCHEN_PRINTER_CONFIG, type KitchenPrinterConfig } from './kitchenPrinterConfig'
import type { PrinterProfile } from '../../types/printing'
import {
  deletePrinterProfile,
  loadPrinterProfiles,
  savePrinterProfile,
} from '../../services/printing/printerBootstrap'
import { PrintEngineService } from '../../services/printing/printEngineService'
import { isValidIpOrHost } from '../../adapters/printing/androidNetworkTcpPrinterAdapter'

export interface RestaurantPrintersProps {
  tenantId?: string
  branchId?: string
  config?: KitchenPrinterConfig
  jobs?: KitchenTicketJob[]
  onSave?: (config: KitchenPrinterConfig) => void
  onPrintTest?: () => void
  onRetry?: (jobId: string) => void
  onReprintLatest?: () => void
}

type UIConnectionType = 'browser_dialog' | 'network_tcp' | 'bluetooth_spp'

export function RestaurantPrinters({
  tenantId = 'principal',
  branchId = 'main',
  config: _config = DEFAULT_KITCHEN_PRINTER_CONFIG,
  jobs = [],
  onSave,
  onPrintTest,
  onRetry,
  onReprintLatest,
}: RestaurantPrintersProps) {
  const isAndroid = Capacitor.getPlatform() === 'android'

  // Perfiles de impresoras persistidos para este tenant/sucursal
  const [profiles, setProfiles] = useState<PrinterProfile[]>(() => loadPrinterProfiles(tenantId, branchId))
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(() => profiles[0]?.id || null)

  // Estado del formulario
  const [name, setName] = useState('')
  const [role, setRole] = useState<'kitchen' | 'receipt' | 'bar'>('kitchen')
  const [connectionType, setConnectionType] = useState<UIConnectionType>('browser_dialog')
  const [paperWidth, setPaperWidth] = useState<'58mm' | '80mm'>('80mm')
  const [ipAddress, setIpAddress] = useState('192.168.1.200')
  const [port, setPort] = useState('9100')
  const [macAddress, setMacAddress] = useState('')

  const [testStatus, setTestStatus] = useState<{ type: 'idle' | 'testing' | 'success' | 'error'; message?: string }>({
    type: 'idle',
  })
  const [saveSuccess, setSaveSuccess] = useState(false)

  // Sincronizar selección de perfil
  useEffect(() => {
    const active = profiles.find((p) => p.id === selectedProfileId)
    if (active) {
      setName(active.name)
      setRole(active.role === 'bar' ? 'bar' : active.role === 'receipt' ? 'receipt' : 'kitchen')
      setConnectionType(
        active.connectionType === 'bluetooth_spp'
          ? 'bluetooth_spp'
          : active.connectionType === 'network_tcp'
          ? 'network_tcp'
          : 'browser_dialog'
      )
      setPaperWidth(active.paperWidth || '80mm')
      setIpAddress(active.ipAddress || '192.168.1.200')
      setPort(String(active.port || active.ipPort || 9100))
      setMacAddress(active.macAddress || '')
    } else if (profiles.length === 0) {
      setName('Impresora de Cocina')
      setRole('kitchen')
      setConnectionType('browser_dialog')
      setPaperWidth('80mm')
      setIpAddress('192.168.1.200')
      setPort('9100')
      setMacAddress('')
    }
  }, [selectedProfileId, profiles])

  const reloadProfiles = () => {
    const updated = loadPrinterProfiles(tenantId, branchId)
    setProfiles(updated)
    if (!selectedProfileId && updated[0]) {
      setSelectedProfileId(updated[0].id)
    }
  }

  // Evaluar estado del dispositivo y compatibilidad
  const currentDeviceStatus = useMemo(() => {
    if (!name.trim()) return { label: 'Sin configurar', tone: 'neutral' as const }
    if (connectionType === 'bluetooth_spp' && !isAndroid) {
      return { label: 'No disponible en este dispositivo (requiere app Android)', tone: 'warning' as const }
    }
    if (connectionType === 'network_tcp' && !isValidIpOrHost(ipAddress)) {
      return { label: 'IP de red incompleta', tone: 'warning' as const }
    }
    if (connectionType === 'bluetooth_spp' && !macAddress.trim()) {
      return { label: 'Falta dirección MAC de Bluetooth', tone: 'warning' as const }
    }
    if (testStatus.type === 'error') {
      return { label: 'Error al enviar impresión', tone: 'danger' as const }
    }
    return { label: 'Configurada y lista', tone: 'success' as const }
  }, [name, connectionType, isAndroid, ipAddress, macAddress, testStatus])

  const handleSaveProfile = () => {
    if (!name.trim()) {
      window.alert('Ingresa un nombre para la impresora.')
      return
    }

    const id = selectedProfileId || `prn_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`
    const profile: PrinterProfile = {
      id,
      restaurantId: tenantId,
      branchId,
      name: name.trim(),
      role,
      connectionType,
      paperWidth,
      ipAddress: connectionType === 'network_tcp' ? ipAddress.trim() : undefined,
      port: connectionType === 'network_tcp' ? parseInt(port, 10) || 9100 : undefined,
      macAddress: connectionType === 'bluetooth_spp' ? macAddress.trim() : undefined,
      copies: 1,
      autoPrintOnOrderCreated: role === 'kitchen' || role === 'bar',
      autoPrintOnOrderPaid: role === 'receipt',
      kickDrawerOnPrint: role === 'receipt',
      isActive: true,
      createdAt: new Date().toISOString(),
      capabilities: {
        supportsCashDrawerKick: role === 'receipt',
        supportsPaperCut: paperWidth === '80mm',
        supportsBeep: true,
        supportsBarcode: false,
        supportsQrCode: false,
        supportsImages: false,
        supportsRealtimeStatus: false,
        columnsPerLine: paperWidth === '58mm' ? 32 : 48,
        codePage: 'CP850',
        encoding: 'utf-8',
        chunkSize: 1024,
        chunkDelayMs: 20,
        connectionTimeoutMs: 5000,
        writeTimeoutMs: 5000,
        feedLinesEnd: 3,
      },
    }

    savePrinterProfile(profile, tenantId, branchId)
    setSelectedProfileId(id)
    reloadProfiles()

    // Sincronizar compatibilidad legacy si existe callback onSave
    onSave?.({
      name: profile.name,
      area: role === 'receipt' ? 'cash' : role === 'bar' ? 'bar' : 'kitchen',
      connection: connectionType === 'bluetooth_spp' ? 'bluetooth' : connectionType === 'network_tcp' ? 'network' : 'browser',
      paperWidth: profile.paperWidth,
      mode: 'manual',
    })

    setSaveSuccess(true)
    setTimeout(() => setSaveSuccess(false), 3000)
  }

  const handleDeleteProfile = (id: string) => {
    if (!window.confirm('¿Eliminar esta configuración de impresora?')) return
    deletePrinterProfile(id, tenantId, branchId)
    if (selectedProfileId === id) setSelectedProfileId(null)
    reloadProfiles()
  }

  const handleCreateNew = () => {
    setSelectedProfileId(null)
    setName('')
    setRole('kitchen')
    setConnectionType('browser_dialog')
    setPaperWidth('80mm')
    setIpAddress('192.168.1.200')
    setPort('9100')
    setMacAddress('')
  }

  const handleTestPrint = async () => {
    setTestStatus({ type: 'testing' })
    try {
      if (onPrintTest) {
        onPrintTest()
        setTestStatus({ type: 'success', message: 'Prueba enviada correctamente.' })
        return
      }

      // Probar directamente con el PrintEngineService canónico
      const engine = PrintEngineService.getInstance()
      const testJob = await engine.submitPrintRequest({
        targetType: 'test',
        printerProfileId: selectedProfileId || undefined,
        payload: {
          payloadSchemaVersion: 1,
          templateVersion: 'v1.0',
          restaurantName: 'PACHAX Restaurante',
          branchName: 'Sucursal Principal',
          displayNumber: 'PRUEBA',
          tableInfo: 'MESA TEST',
          items: [{ name: 'Prueba de comanda', basePrice: 0, quantity: 1, lineTotal: 0 }],
          subtotal: 0,
          discountTotal: 0,
          taxTotal: 0,
          deliveryFee: 0,
          grandTotal: 0,
          isCopy: false,
          copies: 1,
          createdIso: new Date().toISOString(),
        },
      })

      if (testJob.status === 'failed' || Boolean(testJob.lastError)) {
        throw new Error(testJob.lastError || 'Fallo de transmisión al dispositivo.')
      }

      setTestStatus({ type: 'success', message: 'Prueba de impresión ejecutada con éxito.' })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error desconocido al probar impresora.'
      setTestStatus({ type: 'error', message: msg })
    }
  }

  const lastJob = useMemo(() => jobs[0], [jobs])

  return (
    <div className="restaurant-printers max-w-4xl space-y-6">
      {/* Encabezado */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Impresoras del restaurante</h1>
        <p className="mt-1 text-sm text-slate-500">
          Configuración de hardware local para comandas de cocina, tickets de caja y barra.
          Las ventas y pedidos se guardan en el sistema antes de imprimir.
        </p>
      </div>

      {/* Lista de impresoras configuradas */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
        <div className="flex flex-wrap items-center gap-2">
          {profiles.map((p) => {
            const isSelected = p.id === selectedProfileId
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => setSelectedProfileId(p.id)}
                className={`inline-flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-bold transition-all ${
                  isSelected
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                <Printer size={14} />
                <span>{p.name}</span>
                <span className="text-[10px] opacity-75">
                  ({p.role === 'kitchen' ? 'Cocina' : p.role === 'bar' ? 'Barra' : 'Caja'})
                </span>
              </button>
            )
          })}
        </div>
        <button
          type="button"
          onClick={handleCreateNew}
          className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700 transition hover:bg-slate-50"
        >
          <Plus size={14} />
          <span>Nueva impresora</span>
        </button>
      </div>

      {/* Estado entendible */}
      <div
        className={`flex items-start gap-3 rounded-2xl border p-4 text-sm ${
          currentDeviceStatus.tone === 'success'
            ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
            : currentDeviceStatus.tone === 'warning'
            ? 'border-amber-200 bg-amber-50 text-amber-900'
            : currentDeviceStatus.tone === 'danger'
            ? 'border-rose-200 bg-rose-50 text-rose-900'
            : 'border-slate-200 bg-slate-50 text-slate-700'
        }`}
      >
        <Printer className="mt-0.5 h-5 w-5 shrink-0" />
        <div className="space-y-0.5">
          <div className="font-bold">{currentDeviceStatus.label}</div>
          <div className="text-xs opacity-90">
            {connectionType === 'browser_dialog' &&
              'En computadoras con Windows/Mac, la impresión abre el diálogo del sistema para seleccionar la impresora USB o de red instalada.'}
            {connectionType === 'network_tcp' &&
              'Conexión directa por cable o Wi-Fi mediante la dirección IP asignada a la impresora térmica.'}
            {connectionType === 'bluetooth_spp' &&
              'Conexión inalámbrica Bluetooth. Requiere vincular la impresora en los ajustes del dispositivo primero.'}
          </div>
        </div>
      </div>

      {/* Formulario de Configuración */}
      <section className="space-y-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
        <h2 className="text-base font-bold text-slate-900">
          {selectedProfileId ? 'Editar impresora' : 'Configurar nueva impresora'}
        </h2>

        <div className="grid gap-4 sm:grid-cols-2">
          {/* Nombre */}
          <div className="sm:col-span-2">
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
              Nombre de la impresora
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej.: Cocina Principal, Barra Central, Caja 1"
              className="mt-1.5 min-h-11 w-full rounded-xl border border-slate-300 px-3.5 text-sm font-medium focus:border-slate-900 focus:outline-none"
            />
          </div>

          {/* Uso / Destino */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
              Uso / Destino
            </label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as 'kitchen' | 'receipt' | 'bar')}
              className="mt-1.5 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3.5 text-sm font-medium focus:border-slate-900 focus:outline-none"
            >
              <option value="kitchen">Cocina (comandas sin precios)</option>
              <option value="receipt">Recibos / Caja (cuentas y tickets de cobro)</option>
              <option value="bar">Barra (comandas de bebidas)</option>
            </select>
          </div>

          {/* Papel */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
              Ancho del papel térmico
            </label>
            <select
              value={paperWidth}
              onChange={(e) => setPaperWidth(e.target.value as '58mm' | '80mm')}
              className="mt-1.5 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3.5 text-sm font-medium focus:border-slate-900 focus:outline-none"
            >
              <option value="80mm">80 mm (estándar de restaurante)</option>
              <option value="58mm">58 mm (portátil / compacta)</option>
            </select>
          </div>

          {/* Tipo de Conexión */}
          <div className="sm:col-span-2">
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
              Tipo de Conexión
            </label>
            <div className="mt-2 grid gap-2.5 sm:grid-cols-3">
              <label
                className={`flex cursor-pointer flex-col rounded-xl border p-3.5 transition ${
                  connectionType === 'browser_dialog'
                    ? 'border-slate-900 bg-slate-50 ring-1 ring-slate-900'
                    : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                <div className="flex items-center gap-2 font-bold text-slate-900">
                  <Laptop size={16} />
                  <span>USB en PC</span>
                </div>
                <span className="mt-1 text-xs text-slate-500">
                  Impresora conectada por USB o instalada en Windows / Mac.
                </span>
                <input
                  type="radio"
                  name="connType"
                  className="sr-only"
                  checked={connectionType === 'browser_dialog'}
                  onChange={() => setConnectionType('browser_dialog')}
                />
              </label>

              <label
                className={`flex cursor-pointer flex-col rounded-xl border p-3.5 transition ${
                  connectionType === 'network_tcp'
                    ? 'border-slate-900 bg-slate-50 ring-1 ring-slate-900'
                    : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                <div className="flex items-center gap-2 font-bold text-slate-900">
                  <Wifi size={16} />
                  <span>Red / Wi-Fi</span>
                </div>
                <span className="mt-1 text-xs text-slate-500">
                  Impresora de red con cable Ethernet o Wi-Fi por IP.
                </span>
                <input
                  type="radio"
                  name="connType"
                  className="sr-only"
                  checked={connectionType === 'network_tcp'}
                  onChange={() => setConnectionType('network_tcp')}
                />
              </label>

              <label
                className={`flex cursor-pointer flex-col rounded-xl border p-3.5 transition ${
                  connectionType === 'bluetooth_spp'
                    ? 'border-slate-900 bg-slate-50 ring-1 ring-slate-900'
                    : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                <div className="flex items-center gap-2 font-bold text-slate-900">
                  <Radio size={16} />
                  <span>Bluetooth</span>
                </div>
                <span className="mt-1 text-xs text-slate-500">
                  Impresora portátil vinculada al celular o tablet Android.
                </span>
                <input
                  type="radio"
                  name="connType"
                  className="sr-only"
                  checked={connectionType === 'bluetooth_spp'}
                  onChange={() => setConnectionType('bluetooth_spp')}
                />
              </label>
            </div>
          </div>

          {/* Parámetros condicionales según conexión */}
          {connectionType === 'browser_dialog' && (
            <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-xs text-blue-900 sm:col-span-2">
              <div className="font-bold">USB en computadora / Impresión del sistema</div>
              <p className="mt-1 opacity-90">
                Requiere que la impresora esté instalada en Windows o en el sistema operativo.
                Al comandar o cobrar, se abrirá el diálogo del sistema con el documento formateado a {paperWidth}.
                No requiere configurar direcciones IP ni puertos.
              </p>
            </div>
          )}

          {connectionType === 'network_tcp' && (
            <>
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Dirección IP de la impresora
                </label>
                <input
                  type="text"
                  value={ipAddress}
                  onChange={(e) => setIpAddress(e.target.value)}
                  placeholder="Ej.: 192.168.1.150"
                  className="mt-1.5 min-h-11 w-full rounded-xl border border-slate-300 px-3.5 text-sm font-medium focus:border-slate-900 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Puerto de red
                </label>
                <input
                  type="number"
                  value={port}
                  onChange={(e) => setPort(e.target.value)}
                  placeholder="9100"
                  className="mt-1.5 min-h-11 w-full rounded-xl border border-slate-300 px-3.5 text-sm font-medium focus:border-slate-900 focus:outline-none"
                />
              </div>
            </>
          )}

          {connectionType === 'bluetooth_spp' && (
            <div className="sm:col-span-2">
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                Dirección MAC o dispositivo Bluetooth
              </label>
              <input
                type="text"
                value={macAddress}
                onChange={(e) => setMacAddress(e.target.value)}
                placeholder="Ej.: 00:11:22:33:44:55"
                className="mt-1.5 min-h-11 w-full rounded-xl border border-slate-300 px-3.5 text-sm font-medium focus:border-slate-900 focus:outline-none"
              />
              <p className="mt-1 text-xs text-slate-500">
                Vincula primero la impresora en los ajustes de Bluetooth de tu dispositivo Android.
              </p>
            </div>
          )}
        </div>

        {/* Sección informativa de Agente Local (D) */}
        <div className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3.5 text-xs text-slate-600">
          <Info size={16} className="mt-0.5 shrink-0 text-slate-400" />
          <div>
            <span className="font-bold text-slate-800">Impresión automática silenciosa en PC:</span>{' '}
            Requiere PACHAX Print Agent — próximamente disponible en configuración avanzada para evitar la ventana de confirmación del navegador.
          </div>
        </div>

        {/* Botones de acción */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleSaveProfile}
              className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-slate-900 px-5 text-sm font-bold text-white transition hover:bg-slate-800"
            >
              <Save size={16} />
              <span>Guardar impresora</span>
            </button>
            {saveSuccess && (
              <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-600">
                <CheckCircle2 size={14} /> Guardada
              </span>
            )}
          </div>

          {selectedProfileId && (
            <button
              type="button"
              onClick={() => handleDeleteProfile(selectedProfileId)}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-rose-200 px-3.5 text-xs font-bold text-rose-600 transition hover:bg-rose-50"
            >
              <Trash2 size={14} />
              <span>Eliminar impresora</span>
            </button>
          )}
        </div>
      </section>

      {/* Pruebas y Reimpresión */}
      <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
        <h2 className="text-base font-bold text-slate-900">Pruebas operativas</h2>
        <div className="flex flex-wrap gap-2.5">
          <button
            type="button"
            onClick={handleTestPrint}
            disabled={testStatus.type === 'testing'}
            className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-300 px-4 text-xs font-bold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
          >
            {testStatus.type === 'testing' ? <RefreshCw size={14} className="animate-spin" /> : <Send size={14} />}
            <span>Probar impresión</span>
          </button>

          <button
            type="button"
            onClick={onReprintLatest}
            className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-300 px-4 text-xs font-bold text-slate-700 transition hover:bg-slate-50"
          >
            <FileText size={14} />
            <span>Reimprimir última comanda</span>
          </button>
        </div>

        {testStatus.message && (
          <div
            className={`rounded-xl p-3 text-xs font-bold ${
              testStatus.type === 'success'
                ? 'bg-emerald-50 text-emerald-800'
                : testStatus.type === 'error'
                ? 'bg-rose-50 text-rose-800'
                : 'bg-slate-100 text-slate-700'
            }`}
          >
            {testStatus.message}
          </div>
        )}

        {/* Historial reciente si existe */}
        {lastJob && (
          <div className="mt-3 rounded-xl border border-slate-100 bg-slate-50 p-3.5 text-xs">
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-800">
                Último trabajo: Pedido #{lastJob.idempotencyKey.split(':')[1] || lastJob.orderId?.slice(-4) || 'comanda'}
              </span>
              <span className="inline-flex items-center gap-1 font-bold text-emerald-600">
                <CheckCircle2 size={13} />
                {lastJob.status === 'sent' || lastJob.status === 'agent_confirmed' ? 'Enviado' : lastJob.status}
              </span>
            </div>
            <div className="mt-1 text-slate-500">
              {new Date(lastJob.createdAt).toLocaleString('es-BO')}
            </div>
            {lastJob.error && (
              <div className="mt-2 text-rose-600">
                Error: {lastJob.error}
                {onRetry && (
                  <button
                    type="button"
                    onClick={() => onRetry(lastJob.id)}
                    className="ml-2 font-bold underline"
                  >
                    Reintentar
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  )
}
