import { getFirebaseRestaurantId } from '../lib/firebase'
import { useState } from 'react'
import {
  Printer,
  Plus,
  Edit2,
  Trash2,
  X,
  Wifi,
  Bluetooth,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Play,
  Monitor,
} from 'lucide-react'
import { PrintEngineService, classifyPrintJobOutcome } from '../services/printing/printEngineService'
import { PrintMigrationService, type PrintingEngineVersion } from '../services/printing/printMigrationService'
import { AndroidNetworkTcpPrinterAdapter } from '../adapters/printing/androidNetworkTcpPrinterAdapter'
import { AndroidBluetoothSppAdapter } from '../adapters/printing/androidBluetoothSppAdapter'
import { savePrinterProfile, deletePrinterProfile } from '../services/printing/printerBootstrap'
import { PageHeader } from './ui/PageHeader'
import type { PrinterProfile, PrinterConnectionType, PrintJobPayload } from '../types/printing'

export interface PrinterSettingsViewProps {
  onBack?: () => void
  onClose?: () => void
  tenantId?: string
  branchId?: string
  accentColor?: string
  theme?: string
  canManage?: boolean
  canTestPrint?: boolean
  showAutomaticOptions?: boolean
  allowedRoles?: Array<'receipt' | 'kitchen' | 'bar'>
  companyName?: string
  businessIdentity?: import('../core/businessIdentity').BusinessIdentity
  documentContext?: import('../core/businessIdentity').BusinessDocumentContext
}

export function PrinterSettingsView({
  onBack,
  onClose,
  tenantId,
  branchId = 'main',
  accentColor,
  canManage = true,
  canTestPrint = true,
  showAutomaticOptions = true,
  allowedRoles,
  companyName,
  businessIdentity,
  documentContext,
}: PrinterSettingsViewProps) {
  const handleBack = onClose || onBack
  const engine = PrintEngineService.getInstance()
  const migration = PrintMigrationService.getInstance()

  const effectiveTenantId = tenantId || getFirebaseRestaurantId() || 'principal'
  const effectiveBranchId = branchId || 'main'
  const profileScope = `${effectiveTenantId}:${effectiveBranchId}`

  const [engineVersion, setEngineVersion] = useState<PrintingEngineVersion>(migration.getEngineVersion())
  const [profileState, setProfileState] = useState(() => ({
    scope: profileScope,
    profiles: engine.listPrinterProfiles(effectiveTenantId, effectiveBranchId),
  }))
  const profiles = profileState.scope === profileScope
    ? profileState.profiles
    : engine.listPrinterProfiles(effectiveTenantId, effectiveBranchId)
  const [isEditingModalOpen, setIsEditingModalOpen] = useState(false)
  const [editingProfile, setEditingProfile] = useState<Partial<PrinterProfile> | null>(null)

  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [testError, setTestError] = useState<string | null>(null)
  const [testResult, setTestResult] = useState<string | null>(null)
  const [isTesting, setIsTesting] = useState(false)

  const loadProfiles = () => {
    const activeProfiles = engine.listPrinterProfiles(effectiveTenantId, effectiveBranchId)
    setProfileState({ scope: profileScope, profiles: activeProfiles })
  }

  const handleToggleEngineVersion = (version: PrintingEngineVersion) => {
    migration.setEngineVersion(version)
    setEngineVersion(version)
    setStatusMessage(`Motor de impresión cambiado a: ${version === 'new' ? 'NUEVO MOTOR (PrintEngineService)' : 'MODO LEGACY'}`)
  }

  const handleOpenCreateModal = () => {
    if (!canManage) return
    const defaultRole = allowedRoles?.[0] || 'receipt'
    setEditingProfile({
      id: `prn-${Date.now()}`,
      restaurantId: effectiveTenantId,
      branchId: effectiveBranchId,
      name: defaultRole === 'bar' ? 'Impresora Barra' : 'Impresora Principal',
      role: defaultRole,
      connectionType: typeof window !== 'undefined' && 'Capacitor' in window ? 'network_tcp' : 'browser_dialog',
      paperWidth: '80mm',
      ipAddress: '192.168.1.150',
      port: 9100,
      copies: 1,
      autoPrintOnOrderCreated: showAutomaticOptions,
      autoPrintOnOrderPaid: showAutomaticOptions,
      kickDrawerOnPrint: true,
      isActive: true,
      capabilities: {
        supportsCashDrawerKick: true,
        supportsPaperCut: true,
        supportsBeep: true,
        supportsBarcode: true,
        supportsQrCode: true,
        supportsImages: true,
        supportsRealtimeStatus: false,
        columnsPerLine: 48,
        codePage: 'CP850',
        encoding: 'utf-8',
        chunkSize: 1024,
        chunkDelayMs: 10,
        connectionTimeoutMs: 5000,
        writeTimeoutMs: 5000,
        feedLinesEnd: 3,
      },
    })
    setTestResult(null)
    setTestError(null)
    setIsEditingModalOpen(true)
  }

  const handleOpenEditModal = (profile: PrinterProfile) => {
    if (!canManage) return
    setEditingProfile({ ...profile })
    setTestResult(null)
    setTestError(null)
    setIsEditingModalOpen(true)
  }

  const handleSaveProfile = () => {
    if (!editingProfile || !editingProfile.name || !canManage) return
    const toSave: PrinterProfile = {
      ...editingProfile,
      restaurantId: effectiveTenantId,
      branchId: effectiveBranchId,
      ...(showAutomaticOptions ? {} : { autoPrintOnOrderCreated: false, autoPrintOnOrderPaid: false }),
    } as PrinterProfile

    savePrinterProfile(toSave, effectiveTenantId, effectiveBranchId)
    loadProfiles()
    setIsEditingModalOpen(false)
    setStatusMessage('Impresora vinculada correctamente')
    setTestError(null)
  }

  const handleDeleteProfile = (profileId: string) => {
    if (!canManage) return
    deletePrinterProfile(profileId, effectiveTenantId, effectiveBranchId)
    loadProfiles()
    setStatusMessage('Impresora desvinculada.')
    setTestError(null)
  }

  const handleToggleActive = (profile: PrinterProfile) => {
    if (!canManage) return
    const updated = { ...profile, isActive: !profile.isActive }
    savePrinterProfile(updated, effectiveTenantId, effectiveBranchId)
    loadProfiles()
  }

  const handleTestConnection = async () => {
    if (!editingProfile) return
    setIsTesting(true)
    setTestResult(null)
    setTestError(null)

    try {
      if (editingProfile.connectionType === 'network_tcp') {
        const tcpAdapter = new AndroidNetworkTcpPrinterAdapter()
        const res = await tcpAdapter.testConnection(
          editingProfile.ipAddress || '',
          editingProfile.port || 9100,
          editingProfile.capabilities?.connectionTimeoutMs || 5000
        )
        if (res.connected) {
          setTestResult('🟢 CONEXIÓN TCP EXITOSA')
        } else {
          setTestResult(`🔴 FALLÓ: ${res.message}`)
        }
      } else if (editingProfile.connectionType === 'bluetooth_spp') {
        const sppAdapter = new AndroidBluetoothSppAdapter()
        const isAvailable = sppAdapter.isPluginAvailable()
        if (isAvailable) {
          setTestResult('🟢 PLUGIN BLUETOOTH DETECTADO Y ENLACE LISTO')
        } else {
          setTestResult('🔴 PLUGIN BLUETOOTH NO DISPONIBLE EN EL NAVEGADOR')
        }
      } else {
        setTestResult('🟢 DIÁLOGO DEL SISTEMA / CONTROLADOR PC LISTO')
      }
    } catch (err: unknown) {
      setTestResult(`🔴 ERROR: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setIsTesting(false)
    }
  }

  const handleTestPrint = async (profile: PrinterProfile) => {
    if (!canTestPrint) {
      setTestError('La prueba de impresión requiere la capacidad printing.manual.')
      return
    }
    setIsTesting(true)
    setStatusMessage(null)
    setTestError(null)
    try {
      const effectiveCompanyName =
        documentContext?.companyName ||
        businessIdentity?.tradeName ||
        companyName ||
        'PACHAX Platform'
      const effectiveBranchName =
        documentContext?.branchName ||
        (effectiveBranchId === 'main' ? 'Sucursal Principal' : effectiveBranchId)

      const payload: PrintJobPayload = {
        payloadSchemaVersion: 1,
        templateVersion: 'v1.0',
        restaurantName: effectiveCompanyName,
        branchName: effectiveBranchName,
        logoUrl: documentContext?.showLogo !== false ? (documentContext?.logoUrl || businessIdentity?.logoUrl) : undefined,
        items: [
          {
            name: 'Comprobación de enlace térmico',
            quantity: 1,
            basePrice: 0,
            lineTotal: 0,
          },
        ],
        subtotal: 0,
        discountTotal: 0,
        taxTotal: 0,
        deliveryFee: 0,
        grandTotal: 0,
        isCopy: false,
        copies: 1,
        createdIso: new Date().toISOString(),
      }

      const job = await engine.submitPrintRequest({
        targetType: 'test',
        printerProfileId: profile.id,
        tenantId: effectiveTenantId,
        branchId: effectiveBranchId,
        idempotencyKey: `test:${profile.id}:${Date.now()}`,
        payload,
      })

      const outcome = classifyPrintJobOutcome(job, 'Prueba de impresión')
      if (outcome.isSuccess) {
        setStatusMessage(`Prueba enviada con éxito a "${profile.name}".`)
      } else if (outcome.category === 'uncertain') {
        setTestError(`No se pudo confirmar si la prueba salió en "${profile.name}".`)
      } else if (outcome.category === 'pending') {
        setStatusMessage(`Prueba pendiente de reintento en "${profile.name}".`)
      } else {
        setTestError(`Fallo al enviar prueba a "${profile.name}": ${outcome.message}`)
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al imprimir'
      setTestError(`Fallo al enviar prueba a "${profile.name}": ${msg}`)
    } finally {
      setIsTesting(false)
    }
  }

  const printerRoles: Array<{ id: 'receipt' | 'kitchen' | 'bar'; label: string }> = [
    { id: 'receipt', label: 'Recibos / Caja' },
    { id: 'bar', label: 'Barra' },
    { id: 'kitchen', label: 'Comanda Cocina' },
  ]
  const availableRoles = allowedRoles ? printerRoles.filter(role => allowedRoles.includes(role.id)) : printerRoles

  return (
    <div className="space-y-4 bg-slate-50 min-h-screen pb-12">
      <PageHeader
        title="Impresoras y Estaciones"
        subtitle="Gestión de impresoras térmicas Bluetooth Classic SPP, Red LAN TCP/IP y Diálogo de PC"
        onBack={handleBack}
        actions={
          canManage ? (
            <button
              onClick={handleOpenCreateModal}
              style={accentColor ? { backgroundColor: accentColor } : undefined}
              className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-xs transition cursor-pointer"
            >
              <Plus size={16} /> Vincular Impresora
            </button>
          ) : undefined
        }
      />

      <div className="max-w-7xl mx-auto px-4 space-y-4">
        {/* Banner de Motor */}
        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-2xl bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600">
              <Printer size={20} />
            </div>
            <div>
              <h2 className="text-sm font-extrabold text-slate-900">Motor de Impresión PACHAX</h2>
              <p className="text-xs text-slate-500 font-medium">Aislamiento por empresa ({effectiveTenantId}) y sucursal ({effectiveBranchId})</p>
            </div>
          </div>

          <div className="flex items-center gap-2 bg-slate-100 p-1.5 rounded-2xl border border-slate-200">
            <button
              onClick={() => handleToggleEngineVersion('new')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
                engineVersion === 'new' ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-600 hover:bg-slate-200'
              }`}
            >
              <ShieldCheck size={14} /> Motor Universal
            </button>
            <button
              onClick={() => handleToggleEngineVersion('legacy')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
                engineVersion === 'legacy' ? 'bg-amber-600 text-white shadow-xs' : 'text-slate-600 hover:bg-slate-200'
              }`}
            >
              Modo Directo
            </button>
          </div>
        </div>

        {statusMessage && (
          <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 px-4 py-3 rounded-2xl text-xs font-semibold flex items-center justify-between gap-2 shadow-xs">
            <div className="flex items-center gap-2">
              <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
              <span>{statusMessage}</span>
            </div>
            <button onClick={() => setStatusMessage(null)} className="text-emerald-700 hover:text-emerald-900">
              <X size={14} />
            </button>
          </div>
        )}

        {testError && (
          <div className="bg-rose-50 border border-rose-200 text-rose-800 px-4 py-3 rounded-2xl text-xs font-semibold flex items-center justify-between gap-2 shadow-xs">
            <div className="flex items-center gap-2">
              <AlertCircle size={16} className="text-rose-600 shrink-0" />
              <span>{testError}</span>
            </div>
            <button onClick={() => setTestError(null)} className="text-rose-700 hover:text-rose-900">
              <X size={14} />
            </button>
          </div>
        )}

        {/* Header de Lista */}
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-slate-800">Impresoras Vinculadas ({profiles.length})</h2>
          {canManage && (
            <button
              onClick={handleOpenCreateModal}
              style={accentColor ? { backgroundColor: accentColor } : undefined}
              className="px-4 py-2.5 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs flex items-center gap-2 shadow-md shadow-blue-500/20 transition cursor-pointer"
            >
              <Plus size={16} /> Configurar Nueva Impresora
            </button>
          )}
        </div>

        {/* Profiles Grid */}
        {profiles.length === 0 ? (
          <div className="bg-white p-12 rounded-3xl border border-slate-200 text-center space-y-3 shadow-xs">
            <Printer size={36} className="mx-auto text-slate-300" />
            <h3 className="font-bold text-slate-700 text-sm">No hay impresoras vinculadas en esta estación</h3>
            <p className="text-xs text-slate-400 max-w-sm mx-auto">
              Configura tu primera impresora para enrutar recibos de caja y comandas operativas.
            </p>
            {canManage && (
              <button
                onClick={handleOpenCreateModal}
                style={accentColor ? { backgroundColor: accentColor } : undefined}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition cursor-pointer"
              >
                Vincular Impresora
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {profiles.map((p) => {
              const usageLabel = p.role === 'bar' ? 'Barra' : p.role === 'receipt' ? 'Recibos' : p.role === 'kitchen' ? 'Cocina' : 'General'
              const connectionLabel =
                p.connectionType === 'network_tcp'
                  ? 'Red LAN / IP'
                  : p.connectionType === 'bluetooth_spp'
                  ? 'Bluetooth Classic SPP'
                  : 'Impresora PC / Navegador'

              return (
                <div key={p.id} className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm space-y-3 relative">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div
                        className={`p-2.5 rounded-2xl ${
                          p.connectionType === 'network_tcp'
                            ? 'bg-blue-50 text-blue-600'
                            : p.connectionType === 'bluetooth_spp'
                            ? 'bg-emerald-50 text-emerald-600'
                            : 'bg-indigo-50 text-indigo-600'
                        }`}
                      >
                        {p.connectionType === 'network_tcp' ? (
                          <Wifi size={20} />
                        ) : p.connectionType === 'bluetooth_spp' ? (
                          <Bluetooth size={20} />
                        ) : (
                          <Monitor size={20} />
                        )}
                      </div>
                      <div>
                        <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">IMPRESORA VINCULADA</span>
                        <h3 className="font-bold text-slate-900 text-sm">{p.name}</h3>
                        <p className="text-xs text-slate-500 font-medium">
                          Uso: <span className="font-semibold text-slate-700">{usageLabel}</span> · Papel:{' '}
                          <span className="font-semibold text-slate-700">{p.paperWidth}</span>
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      disabled={!canManage}
                      onClick={() => handleToggleActive(p)}
                      className={`px-3 py-1 rounded-full text-[10px] font-extrabold transition cursor-pointer ${
                        p.isActive ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-500'
                      }`}
                    >
                      {p.isActive ? 'Activa' : 'Inactiva'}
                    </button>
                  </div>

                  <div className="bg-slate-50 p-3 rounded-2xl text-xs space-y-1 font-mono text-slate-600">
                    <div>Tipo conexión: <strong>{connectionLabel}</strong></div>
                    {p.connectionType === 'network_tcp' && (
                      <div>Dirección: <strong>{p.ipAddress || '192.168.1.150'}</strong>:{p.port || 9100}</div>
                    )}
                    {p.connectionType === 'bluetooth_spp' && (
                      <div>Dispositivo MAC: <strong>{p.macAddress || 'Dispositivo vinculado'}</strong></div>
                    )}
                    <div>
                      {showAutomaticOptions ? <>Auto-impresión: {p.autoPrintOnOrderCreated ? 'SÍ' : 'NO'} | </> : 'Modo manual | '}
                      Gaveta: {p.kickDrawerOnPrint ? 'SÍ' : 'NO'}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t border-slate-100">
                    <button
                      type="button"
                      disabled={isTesting || !canTestPrint}
                      onClick={() => handleTestPrint(p)}
                      className="px-3 py-1.5 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 font-bold text-xs flex items-center gap-1 transition cursor-pointer disabled:opacity-50"
                    >
                      <Play size={13} /> Probar impresión
                    </button>
                    {canManage && (
                      <>
                        <button
                          type="button"
                          onClick={() => handleOpenEditModal(p)}
                          className="px-3 py-1.5 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 font-bold text-xs flex items-center gap-1 transition cursor-pointer"
                        >
                          <Edit2 size={13} /> Editar
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteProfile(p.id)}
                          className="px-3 py-1.5 rounded-xl border border-rose-200 text-rose-700 hover:bg-rose-50 font-bold text-xs flex items-center gap-1 transition cursor-pointer"
                        >
                          <Trash2 size={13} /> Desvincular
                        </button>
                      </>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {!canTestPrint && <p role="status" className="text-xs text-amber-800">La prueba de impresión requiere la capacidad `printing.manual`; la edición del perfil local sigue disponible.</p>}

        {/* Modal de Configuración / Vinculación */}
        {isEditingModalOpen && editingProfile && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
            <div className="bg-white rounded-3xl border border-slate-200 p-6 max-w-xl w-full space-y-5 shadow-2xl max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div>
                  <h3 className="font-bold text-slate-900 text-base">
                    {profiles.some((p) => p.id === editingProfile.id) ? 'Editar Impresora' : 'Vincular Impresora'}
                  </h3>
                  <p className="text-xs text-slate-500">Configura la conexión de la estación de trabajo</p>
                </div>
                <button onClick={() => setIsEditingModalOpen(false)} className="text-slate-400 hover:text-slate-600 cursor-pointer">
                  <X size={20} />
                </button>
              </div>

              {testResult && (
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-mono font-semibold">
                  {testResult}
                </div>
              )}

              <div className="space-y-4 text-xs">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Nombre de la Impresora:</label>
                  <input
                    type="text"
                    value={editingProfile.name || ''}
                    onChange={(e) => setEditingProfile((p) => ({ ...p, name: e.target.value }))}
                    placeholder="Ej. Impresora Barra 1"
                    className="w-full border border-slate-200 rounded-xl p-2.5 bg-slate-50 text-slate-800 font-semibold focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">Tipo de Conexión:</label>
                    <select
                      value={editingProfile.connectionType}
                      onChange={(e) =>
                        setEditingProfile((p) => ({ ...p, connectionType: e.target.value as PrinterConnectionType }))
                      }
                      className="w-full border border-slate-200 rounded-xl p-2.5 bg-slate-50 text-slate-800 font-semibold focus:outline-none"
                    >
                      <option value="browser_dialog">Impresora PC / Navegador (Driver del sistema)</option>
                      <option value="network_tcp">Red LAN / IP (TCP 9100)</option>
                      <option value="bluetooth_spp">Bluetooth Classic SPP (Android)</option>
                    </select>
                  </div>

                  <div>
                    <label className="font-bold text-slate-700 block mb-1">Uso / Rol:</label>
                    <select
                      value={editingProfile.role}
                      onChange={(e) => setEditingProfile((p) => ({ ...p, role: e.target.value as PrinterProfile['role'] }))}
                      className="w-full border border-slate-200 rounded-xl p-2.5 bg-slate-50 text-slate-800 font-semibold focus:outline-none"
                    >
                      {availableRoles.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {editingProfile.connectionType === 'network_tcp' && (
                  <div className="grid grid-cols-3 gap-3">
                    <div className="col-span-2">
                      <label className="font-bold text-slate-700 block mb-1">Dirección IP / Host:</label>
                      <input
                        type="text"
                        value={editingProfile.ipAddress || ''}
                        onChange={(e) => setEditingProfile((p) => ({ ...p, ipAddress: e.target.value }))}
                        className="w-full border border-slate-200 rounded-xl p-2.5 bg-slate-50 font-mono font-semibold"
                      />
                    </div>
                    <div>
                      <label className="font-bold text-slate-700 block mb-1">Puerto TCP:</label>
                      <input
                        type="number"
                        value={editingProfile.port || 9100}
                        onChange={(e) => setEditingProfile((p) => ({ ...p, port: Number(e.target.value) }))}
                        className="w-full border border-slate-200 rounded-xl p-2.5 bg-slate-50 font-mono font-semibold"
                      />
                    </div>
                  </div>
                )}

                {editingProfile.connectionType === 'bluetooth_spp' && (
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">Dirección MAC Bluetooth:</label>
                    <input
                      type="text"
                      value={editingProfile.macAddress || ''}
                      onChange={(e) => setEditingProfile((p) => ({ ...p, macAddress: e.target.value }))}
                      placeholder="00:11:22:33:44:55"
                      className="w-full border border-slate-200 rounded-xl p-2.5 bg-slate-50 font-mono font-semibold"
                    />
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">Ancho de Papel:</label>
                    <select
                      value={editingProfile.paperWidth}
                      onChange={(e) => setEditingProfile((p) => ({ ...p, paperWidth: e.target.value as '58mm' | '80mm' }))}
                      className="w-full border border-slate-200 rounded-xl p-2.5 bg-slate-50 text-slate-800 font-semibold"
                    >
                      <option value="80mm">80 mm (Estándar)</option>
                      <option value="58mm">58 mm (Compacto)</option>
                    </select>
                  </div>

                  <div className="flex flex-col justify-end space-y-2">
                    {showAutomaticOptions && <label className="flex items-center gap-2 cursor-pointer font-bold text-slate-700">
                      <input type="checkbox" checked={editingProfile.autoPrintOnOrderCreated || false} onChange={(e) => setEditingProfile((p) => ({ ...p, autoPrintOnOrderCreated: e.target.checked }))} className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 h-4 w-4" />
                      Imprimir automáticamente al crear pedido
                    </label>}
                    {showAutomaticOptions && <label className="flex items-center gap-2 cursor-pointer font-bold text-slate-700">
                      <input type="checkbox" checked={editingProfile.autoPrintOnOrderPaid || false} onChange={(e) => setEditingProfile((p) => ({ ...p, autoPrintOnOrderPaid: e.target.checked }))} className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 h-4 w-4" />
                      Imprimir automáticamente al confirmar pago
                    </label>}
                    {!showAutomaticOptions && <p className="text-xs text-slate-600">La plantilla usa impresión manual. No hay impresión automática de tickets configurada.</p>}
                    <label className="flex items-center gap-2 cursor-pointer font-bold text-slate-700">
                      <input
                        type="checkbox"
                        checked={editingProfile.kickDrawerOnPrint || false}
                        onChange={(e) => setEditingProfile((p) => ({ ...p, kickDrawerOnPrint: e.target.checked }))}
                        className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 h-4 w-4"
                      />
                      Abrir gaveta al imprimir
                    </label>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between border-t border-slate-100 pt-4">
                <button
                  type="button"
                  onClick={handleTestConnection}
                  disabled={isTesting}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-700 font-bold text-xs flex items-center gap-1.5 hover:bg-slate-50 transition cursor-pointer"
                >
                  <Play size={14} /> {isTesting ? 'Probando...' : 'Probar Conexión'}
                </button>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsEditingModalOpen(false)}
                    className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 font-bold text-xs cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveProfile}
                    style={accentColor ? { backgroundColor: accentColor } : undefined}
                    className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-md shadow-blue-500/20 cursor-pointer"
                  >
                    Guardar
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
