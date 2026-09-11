import { useState, useEffect } from 'react'
import {
  Printer,
  Play,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  FileText,
  RotateCcw,
  Zap,
  ShieldAlert,
  Sliders,
  Database,
  Bluetooth,
  Info,
  Copy,
  Check,
  Globe,
  Wifi,
  ChevronDown,
  ChevronUp,
  Smartphone,
  ExternalLink,
} from 'lucide-react'
import { PrintEngineService } from '../services/printing/printEngineService'
import { DiagnosticPrinterAdapter, type DiagnosticMockBehavior } from '../services/printing/diagnosticPrinterAdapter'
import { AndroidBluetoothSppAdapter, type BluetoothPairedDevice } from '../adapters/printing/androidBluetoothSppAdapter'
import { AndroidNetworkTcpPrinterAdapter, isValidIpOrHost, isValidPort } from '../adapters/printing/androidNetworkTcpPrinterAdapter'
import { AndroidBluetoothPermissionsService, type BluetoothDiagnosticState } from '../services/printing/androidBluetoothPermissionsService'
import { runPrintEngineTestSuite } from '../services/printing/__tests__/printEngine.test'
import { runAndroidBluetoothSppTestSuite } from '../services/printing/__tests__/androidBluetoothSppAdapter.test'
import { runPachaxBluetoothPermissionsTestSuite } from '../services/printing/__tests__/pachaxBluetoothPermissionsPlugin.test'
import { runAndroidNetworkTcpTestSuite } from '../services/printing/__tests__/androidNetworkTcpPrinterAdapter.test'
import { runPrintIntegrationTestSuite } from '../services/printing/__tests__/printIntegration.test'
import { runCashEngineTestSuite } from '../services/cash/__tests__/cashEngine.test'
import type { PrinterProfile, PrintJob, PrintJobPayload } from '../types/printing'

export function PrinterDiagnosticView() {
  const [adapterMode, setAdapterMode] = useState<'network_tcp' | 'android_bt' | 'virtual'>('network_tcp')
  const [mockBehavior] = useState<DiagnosticMockBehavior>('success_transmitted')
  const [pairedDevices, setPairedDevices] = useState<BluetoothPairedDevice[]>([])
  const [selectedMac, setSelectedMac] = useState<string>('')
  const [diagState, setDiagState] = useState<BluetoothDiagnosticState | null>(null)
  const [isConnectedActive, setIsConnectedActive] = useState<boolean>(false)
  const [lastNativeError, setLastNativeError] = useState<string | null>(null)

  // LAN configuration inputs
  const [lanIp, setLanIp] = useState<string>('192.168.1.150')
  const [lanPort, setLanPort] = useState<number>(9100)
  const [isAdvancedLanOpen, setIsAdvancedLanOpen] = useState<boolean>(false)
  const [isTestingConnection, setIsTestingConnection] = useState<boolean>(false)
  const [lanTestResult, setLanTestResult] = useState<string | null>(null)

  const [chunkSize, setChunkSize] = useState<number>(1024)
  const [chunkDelayMs, setChunkDelayMs] = useState<number>(10)
  const [connectionTimeoutMs, setConnectionTimeoutMs] = useState<number>(5000)
  const [copied, setCopied] = useState(false)

  const [testSuiteOutput, setTestSuiteOutput] = useState<{ passed: number; failed: number; results: string[] } | null>(null)
  const [recentJobs, setRecentJobs] = useState<PrintJob[]>([])
  const [selectedJob, setSelectedJob] = useState<PrintJob | null>(null)
  const [isTestRunning, setIsTestRunning] = useState(false)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)

  const engine = PrintEngineService.getInstance()
  const sppAdapter = new AndroidBluetoothSppAdapter()
  const tcpAdapter = new AndroidNetworkTcpPrinterAdapter()

  useEffect(() => {
    if (adapterMode === 'virtual') {
      const adapter = new DiagnosticPrinterAdapter(mockBehavior)
      engine.registerAdapter(adapter)
    } else if (adapterMode === 'network_tcp') {
      engine.registerAdapter(tcpAdapter)
    } else {
      engine.registerAdapter(sppAdapter)
      loadBluetoothStatus()
    }
  }, [adapterMode, mockBehavior])

  const loadBluetoothStatus = async () => {
    const state = await AndroidBluetoothPermissionsService.checkDiagnosticState()
    setDiagState(state)
    setLastNativeError(null)

    try {
      const connected = await sppAdapter.isConnected()
      setIsConnectedActive(connected)

      const devices = await sppAdapter.listPairedDevices()
      setPairedDevices(devices)
      if (devices.length > 0 && !selectedMac) {
        setSelectedMac(devices[0].address)
      }
    } catch (err: any) {
      setLastNativeError(err.message)
      setStatusMessage(`Error al listar dispositivos emparejados: ${err.message}`)
    }
  }

  const handleTestLanConnection = async () => {
    setIsTestingConnection(true)
    setLanTestResult(null)
    setStatusMessage(`Probando socket TCP contra ${lanIp}:${lanPort}...`)

    const res = await tcpAdapter.testConnection(lanIp, lanPort, connectionTimeoutMs)
    setIsTestingConnection(false)

    if (res.connected) {
      setLanTestResult('🟢 CONECTADA: Socket TCP abierto exitosamente')
      setStatusMessage('🟢 Conexión exitosa. La impresora responde en la red local.')
    } else {
      setLanTestResult(`🔴 FALLÓ (${res.errorType || 'error'}): ${res.message}`)
      setStatusMessage(`🔴 No se pudo conectar: ${res.message}`)
    }
  }

  const handleRequestPermissions = async () => {
    setStatusMessage('Solicitando permiso Dispositivos Cercanos (BLUETOOTH_CONNECT) a Android OS...')
    const state = await AndroidBluetoothPermissionsService.requestConnectPermission()
    setDiagState(state)
    if (state.bluetoothConnectPermission === 'granted' || state.bluetoothConnectPermission === 'notRequired') {
      setStatusMessage('¡Permiso concedido correctamente!')
      await loadBluetoothStatus()
    } else if (state.bluetoothConnectPermission === 'permanentlyDenied') {
      setStatusMessage('El permiso fue denegado permanentemente. Presiona "Abrir Configuración" para otorgarlo.')
    } else {
      setStatusMessage('Permiso denegado por el usuario.')
    }
  }

  const handleEnableBluetooth = async () => {
    setStatusMessage('Solicitando encendido nativo de Bluetooth...')
    const success = await AndroidBluetoothPermissionsService.enableBluetooth()
    if (success) {
      setStatusMessage('Bluetooth encendido correctamente.')
      await loadBluetoothStatus()
    } else {
      setStatusMessage('No se pudo encender el Bluetooth o la acción fue cancelada.')
    }
  }

  const handleOpenAppSettings = async () => {
    setStatusMessage('Abriendo configuración de permisos de PACHAX Flow...')
    await AndroidBluetoothPermissionsService.openAppSettings()
  }

  const handleCopyDiagnosticReport = () => {
    const report = {
      appVersion: '0.1.0 (Etapa 4B.3 LAN/IP)',
      timestamp: new Date().toISOString(),
      platform: tcpAdapter.isNativeAndroid() ? 'Android Nativo' : 'Web / Browser',
      adapterMode,
      lanIp,
      lanPort,
      isIpValid: isValidIpOrHost(lanIp),
      isPortValid: isValidPort(lanPort),
      bluetoothSerialPluginVersion: 'cordova-plugin-bluetooth-serial@0.4.7',
      androidSdkApiLevel: diagState?.apiLevel ?? 0,
      bluetoothConnectPermission: diagState?.bluetoothConnectPermission ?? 'unknown',
      bluetoothEnabled: diagState?.isBluetoothEnabled ?? false,
      pairedDevicesCount: pairedDevices.length,
      selectedPrinterMac: selectedMac || 'Ninguna',
      chunkSize,
      chunkDelayMs,
      connectionTimeoutMs,
      lastError: lastNativeError || 'Ninguno',
    }

    navigator.clipboard.writeText(JSON.stringify(report, null, 2))
    setCopied(true)
    setTimeout(() => setCopied(false), 3000)
    setStatusMessage('Reporte de diagnóstico técnico exportado al portapapeles.')
  }

  const handleRunTests = async () => {
    setIsTestRunning(true)
    setStatusMessage('Ejecutando suite completa de 103 pruebas automatizadas...')
    try {
      const coreRes = await runPrintEngineTestSuite()
      const btRes = await runAndroidBluetoothSppTestSuite()
      const permRes = await runPachaxBluetoothPermissionsTestSuite()
      const tcpRes = await runAndroidNetworkTcpTestSuite()
      const integRes = await runPrintIntegrationTestSuite()
      const cashRes = await runCashEngineTestSuite()

      const totalPassed = coreRes.passed + btRes.passed + permRes.passed + tcpRes.passed + integRes.passed + cashRes.passed
      const totalFailed = coreRes.failed + btRes.failed + permRes.failed + tcpRes.failed + integRes.failed + cashRes.failed

      setTestSuiteOutput({
        passed: totalPassed,
        failed: totalFailed,
        results: [
          ...coreRes.results,
          ...btRes.results,
          ...permRes.results,
          ...tcpRes.results,
          ...integRes.results,
          ...cashRes.results,
        ],
      })
      setStatusMessage(`Suite completada: ${totalPassed} PASARON / ${totalFailed} FALLARON`)
    } catch (err: any) {
      setStatusMessage(`Error ejecutando suite: ${err.message}`)
    } finally {
      setIsTestRunning(false)
    }
  }

  const getActivePrinterProfile = (): PrinterProfile => {
    if (adapterMode === 'network_tcp') {
      return {
        id: `lan-${lanIp}:${lanPort}`,
        restaurantId: 'principal',
        branchId: 'main',
        name: `Impresora Red LAN (${lanIp}:${lanPort})`,
        role: 'kitchen',
        connectionType: 'network_tcp',
        paperWidth: '80mm',
        ipAddress: lanIp.trim(),
        port: lanPort,
        copies: 1,
        autoPrintOnOrderCreated: true,
        autoPrintOnOrderPaid: true,
        kickDrawerOnPrint: false,
        isActive: true,
        createdAt: new Date().toISOString(),
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
          chunkSize,
          chunkDelayMs,
          connectionTimeoutMs,
          writeTimeoutMs: 5000,
          feedLinesEnd: 3,
        },
      }
    }

    return {
      id: adapterMode === 'android_bt' ? `bt-${selectedMac || 'default'}` : 'default-diagnostic',
      restaurantId: 'principal',
      branchId: 'main',
      name: adapterMode === 'android_bt' ? `Impresora Bluetooth (${selectedMac || 'Sin MAC'})` : 'Impresora Diagnóstico Virtual',
      role: 'receipt',
      connectionType: adapterMode === 'android_bt' ? 'bluetooth_spp' : 'virtual_pdf',
      paperWidth: '80mm',
      macAddress: selectedMac || '00:11:22:33:44:55',
      copies: 1,
      autoPrintOnOrderCreated: true,
      autoPrintOnOrderPaid: true,
      kickDrawerOnPrint: true,
      isActive: true,
      createdAt: new Date().toISOString(),
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
        chunkSize,
        chunkDelayMs,
        connectionTimeoutMs,
        writeTimeoutMs: 5000,
        feedLinesEnd: 3,
      },
    }
  }

  const samplePayload: PrintJobPayload = {
    payloadSchemaVersion: 1,
    templateVersion: 'v1.0-80mm',
    restaurantName: 'PACHAX Flow Restaurant',
    branchName: 'Sucursal Central - Bolivia',
    branchAddress: 'Av. Principal #450, Santa Cruz',
    branchPhone: '77123456',
    orderId: 'ord-demo-88',
    sequenceNumber: 24,
    displayNumber: '#024',
    fulfillmentType: 'table',
    tableInfo: 'Mesa 5',
    customerName: 'Juan Pérez',
    items: [
      { name: 'Hamburguesa Doble Carne y Queso', basePrice: 42, quantity: 2, lineTotal: 84, modifiersText: ['Sin Cebolla', 'Extra Salsa'] },
      { name: 'Papas Fritas Medianas', basePrice: 15, quantity: 1, lineTotal: 15 },
    ],
    subtotal: 99,
    discountTotal: 0,
    taxTotal: 0,
    deliveryFee: 0,
    grandTotal: 99,
    paymentMethod: 'cash',
    cashReceived: 100,
    changeAmount: 1,
    isCopy: false,
    copies: 1,
    createdIso: new Date().toISOString(),
  }

  const handleCreateTestReceipt = async () => {
    try {
      const activePrinter = getActivePrinterProfile()
      engine.registerPrinterProfile(activePrinter)

      setStatusMessage(`Enviando recibo vía ${adapterMode.toUpperCase()}...`)
      const job = await engine.submitPrintRequest({
        targetType: 'receipt',
        payload: samplePayload,
        idempotencyKey: `test-receipt-${Date.now()}`,
        printerProfileId: activePrinter.id,
      })
      setRecentJobs((prev) => [job, ...prev])
      setSelectedJob(job)
      setStatusMessage(`Recibo enviado. Estado final: ${job.status.toUpperCase()}`)
    } catch (err: any) {
      setStatusMessage(`Error: ${err.message}`)
    }
  }

  const handleCreateKitchenTicket = async () => {
    try {
      const activePrinter = getActivePrinterProfile()
      engine.registerPrinterProfile(activePrinter)

      setStatusMessage('Enviando comanda de cocina...')
      const job = await engine.submitPrintRequest({
        targetType: 'kitchen_ticket',
        payload: samplePayload,
        idempotencyKey: `test-kitchen-${Date.now()}`,
        printerProfileId: activePrinter.id,
      })
      setRecentJobs((prev) => [job, ...prev])
      setSelectedJob(job)
      setStatusMessage(`Comanda procesada. Estado final: ${job.status.toUpperCase()}`)
    } catch (err: any) {
      setStatusMessage(`Error: ${err.message}`)
    }
  }

  const handleDrawerKick = async () => {
    try {
      setStatusMessage('Enviando pulso de apertura de gaveta...')
      const job = await engine.kickCashDrawer({
        userUid: 'cajero-test-uid',
        terminalId: engine.queueManager.terminalId,
        reason: 'Prueba de diagnóstico de gaveta',
      })
      setRecentJobs((prev) => [job, ...prev])
      setSelectedJob(job)
      setStatusMessage(`Apertura de gaveta ejecutada: ${job.status.toUpperCase()}`)
    } catch (err: any) {
      setStatusMessage(`Error: ${err.message}`)
    }
  }

  const handleResolveUnknown = async (type: 'printed' | 'not_printed' | 'reprint_requested') => {
    if (!selectedJob) return
    try {
      const resolved = await engine.resolveUnknownJob(selectedJob.id, {
        type,
        resolvedByUid: 'operador-test-uid',
        resolvedAtIso: new Date().toISOString(),
        reason: 'Resolución manual desde panel de diagnóstico',
      })
      setSelectedJob(resolved)
      setRecentJobs((prev) => prev.map((j) => (j.id === resolved.id ? resolved : j)))
      setStatusMessage(`Trabajo resuelto como: ${type.toUpperCase()}`)
    } catch (err: any) {
      setStatusMessage(`Error al resolver: ${err.message}`)
    }
  }

  const handleRequestReprint = async () => {
    if (!selectedJob) return
    try {
      const copyJob = await engine.requestReprint(
        {
          originalJobId: selectedJob.id,
          requestedByUid: 'supervisor-uid',
          reason: 'Papel atascado en prueba',
          terminalId: engine.queueManager.terminalId,
        },
        selectedJob
      )
      setRecentJobs((prev) => [copyJob, ...prev])
      setSelectedJob(copyJob)
      setStatusMessage(`Reimpresión generada como trabajo copia: ${copyJob.id}`)
    } catch (err: any) {
      setStatusMessage(`Error al reimprimir: ${err.message}`)
    }
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6 bg-slate-50 min-h-screen">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="h-12 w-12 rounded-2xl bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600">
            <Printer size={24} />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-800">Panel de Diagnóstico — Motor de Impresión</h1>
            <p className="text-xs text-slate-500 font-medium">Etapa 4B.3 — Impresión por Red LAN / IP Socket TCP Nativo</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={handleCopyDiagnosticReport}
            className="flex items-center justify-center gap-2 px-4 py-3 rounded-2xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-bold text-xs shadow-sm transition"
          >
            {copied ? <Check size={16} className="text-emerald-600" /> : <Copy size={16} />}
            {copied ? '¡Diagnóstico Copiado!' : 'Copiar Diagnóstico'}
          </button>

          <button
            onClick={handleRunTests}
            disabled={isTestRunning}
            className="flex items-center justify-center gap-2 px-5 py-3 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm shadow-md shadow-blue-500/20 transition disabled:opacity-50"
          >
            {isTestRunning ? <RefreshCw className="animate-spin" size={18} /> : <Play size={18} />}
            Ejecutar Suite (103 Pruebas)
          </button>
        </div>
      </div>

      {statusMessage && (
        <div className="bg-blue-50 border border-blue-200 text-blue-800 px-4 py-3 rounded-2xl text-xs font-semibold flex items-center gap-2">
          <Zap size={16} className="text-blue-600 shrink-0" />
          {statusMessage}
        </div>
      )}

      {/* Connection Type Tabs */}
      <div className="flex bg-white p-2 rounded-2xl border border-slate-200 gap-2">
        <button
          onClick={() => setAdapterMode('network_tcp')}
          className={`flex-1 py-2.5 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition ${
            adapterMode === 'network_tcp' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-50'
          }`}
        >
          <Globe size={16} /> Red LAN / IP (Socket TCP Nativo)
        </button>
        <button
          onClick={() => setAdapterMode('android_bt')}
          className={`flex-1 py-2.5 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition ${
            adapterMode === 'android_bt' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-50'
          }`}
        >
          <Bluetooth size={16} /> Bluetooth Classic SPP Nativo
        </button>
        <button
          onClick={() => setAdapterMode('virtual')}
          className={`flex-1 py-2.5 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition ${
            adapterMode === 'virtual' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-50'
          }`}
        >
          <Sliders size={16} /> Simulador Diagnóstico Virtual
        </button>
      </div>

      {/* Bluetooth Diagnostic Panel */}
      {adapterMode === 'android_bt' && (
        <div className="space-y-4">
          {/* Structured Diagnostic Summary Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-3 text-center text-xs">
            <div className="bg-white p-3 rounded-2xl border border-slate-200 shadow-sm space-y-1">
              <div className="text-[10px] uppercase font-extrabold text-slate-400">PLATAFORMA</div>
              <div className="font-extrabold text-slate-800 flex items-center justify-center gap-1">
                {sppAdapter.isNativeAndroid() ? (
                  <>Android Nativo <CheckCircle2 size={14} className="text-emerald-600" /></>
                ) : (
                  <>Web / Browser <Info size={14} className="text-amber-600" /></>
                )}
              </div>
            </div>

            <div className="bg-white p-3 rounded-2xl border border-slate-200 shadow-sm space-y-1">
              <div className="text-[10px] uppercase font-extrabold text-slate-400">PLUGIN SPP</div>
              <div className="font-extrabold text-slate-800 flex items-center justify-center gap-1">
                {sppAdapter.isPluginAvailable() ? (
                  <>Detectado <CheckCircle2 size={14} className="text-emerald-600" /></>
                ) : (
                  <>Ausente <AlertTriangle size={14} className="text-rose-600" /></>
                )}
              </div>
            </div>

            <div className="bg-white p-3 rounded-2xl border border-slate-200 shadow-sm space-y-1">
              <div className="text-[10px] uppercase font-extrabold text-slate-400">CONNECT</div>
              <div className="font-extrabold text-slate-800 flex items-center justify-center gap-1">
                {diagState?.bluetoothConnectPermission === 'granted' || diagState?.bluetoothConnectPermission === 'notRequired' ? (
                  <>Concedido <CheckCircle2 size={14} className="text-emerald-600" /></>
                ) : (
                  <>{diagState?.bluetoothConnectPermission.toUpperCase() || 'DENIED'} <AlertTriangle size={14} className="text-amber-600" /></>
                )}
              </div>
            </div>

            <div className="bg-white p-3 rounded-2xl border border-slate-200 shadow-sm space-y-1">
              <div className="text-[10px] uppercase font-extrabold text-slate-400">BLUETOOTH</div>
              <div className="font-extrabold text-slate-800 flex items-center justify-center gap-1">
                {diagState?.isBluetoothEnabled ? (
                  <>Encendido <CheckCircle2 size={14} className="text-emerald-600" /></>
                ) : (
                  <>Apagado <AlertTriangle size={14} className="text-rose-600" /></>
                )}
              </div>
            </div>

            <div className="bg-white p-3 rounded-2xl border border-slate-200 shadow-sm space-y-1">
              <div className="text-[10px] uppercase font-extrabold text-slate-400">EMPAREJADOS</div>
              <div className="font-extrabold text-blue-600 text-sm">{pairedDevices.length}</div>
            </div>

            <div className="bg-white p-3 rounded-2xl border border-slate-200 shadow-sm space-y-1 truncate">
              <div className="text-[10px] uppercase font-extrabold text-slate-400">IMPRESORA</div>
              <div className="font-bold text-slate-800 text-[11px] truncate">{selectedMac || 'Sin MAC'}</div>
            </div>

            <div className="bg-white p-3 rounded-2xl border border-slate-200 shadow-sm space-y-1">
              <div className="text-[10px] uppercase font-extrabold text-slate-400">CONEXIÓN</div>
              <div className="font-extrabold text-slate-800 flex items-center justify-center gap-1">
                {isConnectedActive ? (
                  <>Activa <CheckCircle2 size={14} className="text-emerald-600" /></>
                ) : (
                  <>Inactiva <Info size={14} className="text-slate-400" /></>
                )}
              </div>
            </div>
          </div>

          <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm space-y-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between border-b border-slate-100 pb-3 gap-3">
              <div className="flex items-center gap-2 text-slate-800 font-bold text-sm">
                <Smartphone size={18} className="text-blue-600" />
                Acciones de Permisos y Bluetooth Nativo (SDK API {diagState?.apiLevel || 'N/A'})
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={handleRequestPermissions}
                  className="px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-sm transition"
                >
                  Solicitar Permiso Dispositivos Cercanos
                </button>
                <button
                  onClick={handleEnableBluetooth}
                  className="px-3 py-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-800 font-bold text-xs transition"
                >
                  Encender Bluetooth
                </button>
                <button
                  onClick={handleOpenAppSettings}
                  className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs flex items-center gap-1 transition"
                >
                  <ExternalLink size={12} /> Abrir Configuración
                </button>
              </div>
            </div>

            {diagState && (
              <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200 text-xs space-y-1">
                <div className="font-bold text-slate-700 flex items-center gap-1.5">
                  <Info size={16} className="text-blue-600" />
                  Estado del Diagnóstico Nativo:
                </div>
                <div className="text-slate-600 font-medium">{diagState.message}</div>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="font-bold text-slate-700 block">Dispositivos Emparejados:</label>
                  <button
                    onClick={loadBluetoothStatus}
                    className="text-[11px] font-bold text-blue-600 hover:text-blue-700 flex items-center gap-1"
                  >
                    <RefreshCw size={12} /> Cargar Dispositivos Emparejados
                  </button>
                </div>
                <select
                  value={selectedMac}
                  onChange={(e) => setSelectedMac(e.target.value)}
                  className="w-full font-semibold border border-slate-200 rounded-xl p-2.5 bg-white text-slate-800 focus:outline-none focus:border-blue-500"
                >
                  {pairedDevices.length === 0 ? (
                    <option value="">No hay dispositivos emparejados</option>
                  ) : (
                    pairedDevices.map((d) => (
                      <option key={d.address} value={d.address}>
                        {d.name} ({d.address})
                      </option>
                    ))
                  )}
                </select>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Tamaño de Bloque (Chunk Size):</label>
                <select
                  value={chunkSize}
                  onChange={(e) => setChunkSize(Number(e.target.value))}
                  className="w-full font-semibold border border-slate-200 rounded-xl p-2.5 bg-white text-slate-800 focus:outline-none focus:border-blue-500"
                >
                  <option value={256}>256 Bytes (Muy seguro)</option>
                  <option value={512}>512 Bytes (Recomendado)</option>
                  <option value={1024}>1024 Bytes (Rápido)</option>
                </select>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Demora entre Bloques (Ms):</label>
                <select
                  value={chunkDelayMs}
                  onChange={(e) => setChunkDelayMs(Number(e.target.value))}
                  className="w-full font-semibold border border-slate-200 rounded-xl p-2.5 bg-white text-slate-800 focus:outline-none focus:border-blue-500"
                >
                  <option value={25}>25 ms</option>
                  <option value={50}>50 ms (Recomendado)</option>
                  <option value={100}>100 ms</option>
                </select>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* LAN Configuration Panel */}
      {adapterMode === 'network_tcp' && (
        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2 text-slate-800 font-bold text-sm">
              <Wifi size={18} className="text-blue-600" />
              Configuración de Impresora de Red TCP/IP (Puerto 9100)
            </div>
            <button
              onClick={handleTestLanConnection}
              disabled={isTestingConnection}
              className="px-4 py-2 rounded-xl bg-blue-50 hover:bg-blue-100 border border-blue-200 text-blue-700 font-bold text-xs flex items-center gap-2 transition disabled:opacity-50"
            >
              {isTestingConnection ? <RefreshCw className="animate-spin" size={14} /> : <Wifi size={14} />}
              Probar Conexión TCP
            </button>
          </div>

          {lanTestResult && (
            <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200 font-mono text-xs font-semibold">
              {lanTestResult}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 text-xs">
            <div>
              <label className="font-bold text-slate-700 block mb-1">Dirección IP o Hostname:</label>
              <input
                type="text"
                value={lanIp}
                onChange={(e) => setLanIp(e.target.value)}
                placeholder="Ej. 192.168.1.150"
                className={`w-full font-mono font-semibold border rounded-xl p-2.5 bg-white text-slate-800 focus:outline-none ${
                  isValidIpOrHost(lanIp) ? 'border-slate-200 focus:border-blue-500' : 'border-rose-300 bg-rose-50/30'
                }`}
              />
              {!isValidIpOrHost(lanIp) && (
                <p className="text-[10px] text-rose-500 font-semibold mt-1">Ingresa una IPv4 válida (ej. 192.168.1.150) o Hostname.</p>
              )}
            </div>

            <div>
              <label className="font-bold text-slate-700 block mb-1">Puerto TCP RAW (Predeterminado 9100):</label>
              <input
                type="number"
                value={lanPort}
                onChange={(e) => setLanPort(Number(e.target.value))}
                placeholder="9100"
                className={`w-full font-mono font-semibold border rounded-xl p-2.5 bg-white text-slate-800 focus:outline-none ${
                  isValidPort(lanPort) ? 'border-slate-200 focus:border-blue-500' : 'border-rose-300 bg-rose-50/30'
                }`}
              />
            </div>

            <div className="flex flex-col justify-end">
              <button
                onClick={() => setIsAdvancedLanOpen(!isAdvancedLanOpen)}
                className="py-2.5 px-3 rounded-xl border border-slate-200 text-slate-700 font-bold text-xs flex items-center justify-between hover:bg-slate-50 transition"
              >
                <span>Parámetros Avanzados TCP</span>
                {isAdvancedLanOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </button>
            </div>
          </div>

          {/* Advanced Collapsible Settings */}
          {isAdvancedLanOpen && (
            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 grid grid-cols-1 md:grid-cols-3 gap-4 text-xs pt-3">
              <div>
                <label className="font-bold text-slate-700 block mb-1">Tamaño de Bloque (Chunk Size):</label>
                <select
                  value={chunkSize}
                  onChange={(e) => setChunkSize(Number(e.target.value))}
                  className="w-full font-semibold border border-slate-200 rounded-xl p-2 bg-white text-slate-800"
                >
                  <option value={512}>512 Bytes</option>
                  <option value={1024}>1024 Bytes (Recomendado LAN)</option>
                  <option value={2048}>2048 Bytes (Rápido LAN)</option>
                </select>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Demora entre Bloques (Ms):</label>
                <select
                  value={chunkDelayMs}
                  onChange={(e) => setChunkDelayMs(Number(e.target.value))}
                  className="w-full font-semibold border border-slate-200 rounded-xl p-2 bg-white text-slate-800"
                >
                  <option value={10}>10 ms (Rápido LAN)</option>
                  <option value={25}>25 ms</option>
                  <option value={50}>50 ms</option>
                </select>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Timeout de Enlace (Ms):</label>
                <select
                  value={connectionTimeoutMs}
                  onChange={(e) => setConnectionTimeoutMs(Number(e.target.value))}
                  className="w-full font-semibold border border-slate-200 rounded-xl p-2 bg-white text-slate-800"
                >
                  <option value={3000}>3000 ms (Rápido)</option>
                  <option value={5000}>5000 ms (Recomendado)</option>
                  <option value={8000}>8000 ms</option>
                </select>
              </div>
            </div>
          )}

          <div className="p-3 bg-amber-50 border border-amber-200 rounded-2xl text-[11px] text-amber-800 font-medium flex items-center gap-2">
            <Info size={16} className="text-amber-600 shrink-0" />
            <span>Se recomienda configurar una IP fija o reserva DHCP en el router para evitar cambios de IP en la impresora.</span>
          </div>
        </div>
      )}

      {/* Action Triggers */}
      <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm space-y-3">
        <div className="text-slate-800 font-bold text-sm mb-1 flex items-center gap-2">
          <FileText size={18} className="text-blue-600" />
          Disparadores de Impresión ({adapterMode.toUpperCase()})
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <button
            onClick={handleCreateTestReceipt}
            className="px-4 py-3 rounded-2xl border border-blue-200 bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold text-xs flex items-center justify-center gap-2 transition"
          >
            <FileText size={16} /> Emitir Recibo (80mm)
          </button>
          <button
            onClick={handleCreateKitchenTicket}
            className="px-4 py-3 rounded-2xl border border-amber-200 bg-amber-50 hover:bg-amber-100 text-amber-800 font-bold text-xs flex items-center justify-center gap-2 transition"
          >
            <Printer size={16} /> Comanda Cocina
          </button>
          <button
            onClick={handleDrawerKick}
            className="px-4 py-3 rounded-2xl border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-bold text-xs flex items-center justify-center gap-2 transition"
          >
            <Zap size={16} /> Abrir Gaveta
          </button>
        </div>
      </div>

      {/* Automated Test Suite Results */}
      {testSuiteOutput && (
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h2 className="font-bold text-sm text-slate-800 flex items-center gap-2">
              <CheckCircle2 size={18} className="text-emerald-600" />
              Resultados de la Suite Completa de Verificación de Impresión
            </h2>
            <span className="text-xs font-extrabold px-3 py-1 bg-slate-100 rounded-full text-slate-700">
              {testSuiteOutput.passed} Aprobadas / {testSuiteOutput.failed} Fallidas
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-64 overflow-y-auto p-1 text-xs">
            {testSuiteOutput.results.map((res, i) => (
              <div
                key={i}
                className={`p-2.5 rounded-xl font-mono text-[11px] border ${
                  res.startsWith('✅') ? 'bg-emerald-50 border-emerald-200 text-emerald-900' : 'bg-rose-50 border-rose-200 text-rose-900'
                }`}
              >
                {res}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Queue & Job Details */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Queue List */}
        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm space-y-3">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h3 className="font-bold text-sm text-slate-800 flex items-center gap-2">
              <Database size={18} className="text-blue-600" />
              Trabajos Recientes en Cola ({recentJobs.length})
            </h3>
          </div>

          {recentJobs.length === 0 ? (
            <p className="text-xs text-slate-400 py-8 text-center italic">No hay trabajos procesados en esta sesión.</p>
          ) : (
            <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
              {recentJobs.map((job) => (
                <div
                  key={job.id}
                  onClick={() => setSelectedJob(job)}
                  className={`p-3.5 rounded-2xl border text-xs cursor-pointer transition flex items-center justify-between ${
                    selectedJob?.id === job.id ? 'border-blue-500 bg-blue-50/50 shadow-sm' : 'border-slate-100 hover:bg-slate-50'
                  }`}
                >
                  <div className="space-y-1">
                    <div className="font-bold text-slate-800 flex items-center gap-2">
                      <span>{job.targetType.toUpperCase()}</span>
                      <span className="text-[10px] text-slate-400 font-normal">{job.id.slice(0, 18)}...</span>
                    </div>
                    <div className="text-[10px] text-slate-500">
                      Terminal: {job.terminalId} | Intentos: {job.attempts}/{job.maxAttempts}
                    </div>
                  </div>

                  <span
                    className={`px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase ${
                      job.status === 'transmitted' || job.status === 'confirmed'
                        ? 'bg-emerald-100 text-emerald-800'
                        : job.status === 'unknown'
                        ? 'bg-amber-100 text-amber-800'
                        : job.status === 'failed'
                        ? 'bg-rose-100 text-rose-800'
                        : 'bg-blue-100 text-blue-800'
                    }`}
                  >
                    {job.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Selected Job Inspector */}
        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm space-y-4">
          <h3 className="font-bold text-sm text-slate-800 border-b border-slate-100 pb-3 flex items-center gap-2">
            <ShieldAlert size={18} className="text-blue-600" />
            Inspector de Trabajo e Inmutabilidad
          </h3>

          {!selectedJob ? (
            <p className="text-xs text-slate-400 py-8 text-center italic">Selecciona un trabajo de la lista para inspeccionar.</p>
          ) : (
            <div className="space-y-4 text-xs">
              <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200 space-y-1 font-mono text-[11px]">
                <div><strong className="text-slate-700">ID:</strong> {selectedJob.id}</div>
                <div><strong className="text-slate-700">IdempotencyKey:</strong> {selectedJob.idempotencyKey}</div>
                <div><strong className="text-slate-700">Estado:</strong> <span className="font-bold uppercase text-blue-600">{selectedJob.status}</span></div>
                <div><strong className="text-slate-700">Conexión:</strong> {selectedJob.connectionType}</div>
                <div><strong className="text-slate-700">Es Copia:</strong> {selectedJob.payload.isCopy ? 'SÍ (COPIA)' : 'NO'}</div>
                {selectedJob.lastError && <div className="text-rose-600"><strong className="text-rose-800">Error:</strong> {selectedJob.lastError}</div>}
              </div>

              {/* Actions for Unknown Jobs */}
              {selectedJob.status === 'unknown' && (
                <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-2xl space-y-2">
                  <div className="font-bold text-amber-900 text-xs flex items-center gap-1.5">
                    <AlertTriangle size={16} /> Resolución Manual de Estado Ambiguo
                  </div>
                  <p className="text-[11px] text-amber-800">
                    El trabajo terminó en estado ambiguo (desconexión o timeout). Confirma la resolución física:
                  </p>
                  <div className="flex flex-wrap gap-2 pt-1">
                    <button
                      onClick={() => handleResolveUnknown('printed')}
                      className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px]"
                    >
                      Sí se imprimió
                    </button>
                    <button
                      onClick={() => handleResolveUnknown('not_printed')}
                      className="px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-[11px]"
                    >
                      No se imprimió
                    </button>
                  </div>
                </div>
              )}

              {/* Authorized Reprint Button */}
              {['transmitted', 'confirmed', 'resolved'].includes(selectedJob.status) && (
                <button
                  onClick={handleRequestReprint}
                  className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-sm"
                >
                  <RotateCcw size={14} /> Solicitar Reimpresión Autorizada (Copia)
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
