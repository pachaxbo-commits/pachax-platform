import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const repoRoot = process.cwd()
const forbiddenModulePatterns = [
  /(?:^|\/)node_modules\/(?:firebase|@firebase)\//,
  /(?:^|\/)src\/lib\/firebase\.ts$/,
  /(?:^|\/)src\/lib\/botApi\.ts$/,
  /(?:^|\/)src\/lib\/escpos\.ts$/,
  /(?:^|\/)src\/services\/gateway\.ts$/,
  /(?:^|\/)src\/(?:admin|onboarding)\//,
  /(?:^|\/)src\/modules\/(?:restaurant|retail)\/data\//,
]
const virtualPrinterModuleId = '\0pachax-demo-only-printer-bootstrap'
const virtualBotApiModuleId = '\0pachax-demo-only-bot-api'
const virtualEscposModuleId = '\0pachax-demo-only-escpos'

const demoIsolationBuildGuard = {
  name: 'demo-only-build-guard',
  enforce: 'pre' as const,
  resolveId(source: string) {
    if (/(?:^|\/)services\/printing\/printerBootstrap(?:\.ts)?$/.test(source)) {
      return virtualPrinterModuleId
    }
    if (/(?:^|\/)lib\/botApi(?:\.ts)?$/.test(source)) {
      return virtualBotApiModuleId
    }
    if (/(?:^|\/)lib\/escpos(?:\.ts)?$/.test(source)) {
      return virtualEscposModuleId
    }
    if (/^firebase\//.test(source) || /(?:^|\/)lib\/firebase(?:\.ts)?$/.test(source) || /(?:^|\/)services\/gateway(?:\.ts)?$/.test(source)) {
      this.error(`Forbidden production dependency in demo-only build: ${source}`)
    }
    return null
  },
  load(id: string) {
    if (id === virtualBotApiModuleId) return `
      export const botApiUrl = '';
      export const botAdminToken = '';
      export const BOT_HEALTH_CHANGED_EVENT = 'demo-only:bot-disabled';
      export const emitBotHealthChanged = () => {};
      export const onBotHealthChanged = () => () => {};
      export const fetchBotHealth = async () => ({ ok: false, botEnabled: false, whatsappConnected: false });
      export const setBotAcceptingOrders = async () => {};
      export const setBotEnabled = async () => {};
      export const fetchBotSettings = async () => ({ acceptingOrders: false, acceptingOrdersPausedUntil: '', acceptingOrdersPauseReason: '', pickupOnlyMode: false, pickupOnlyMessage: '', autoRepliesEnabled: false, deliveryGroupName: '', deliveryGroupId: '', ownerAlertGroupName: '', ownerAlertChatId: '', closedMessage: '', pausedOrdersMessage: '', qrPaymentMessage: '', deliveryPricingMessage: '', humanHelpMessage: '', personality: '' });
      export const saveBotSettings = async () => ({});
      export const fetchWhatsappGroups = async () => [];
      export const fetchWhatsappQr = async () => ({ connected: false });
      export const logoutWhatsappSession = async () => {};
      export const notifyBotOrderConfirmed = async () => {};
      export const fetchSalesResetStatus = async () => ({ usados: 0, restantes: 0, maximo: 0 });
      export const resetSalesData = async () => ({ pedidosBorrados: 0, diasBorrados: 0, restantes: 0 });
    `
    if (id === virtualEscposModuleId) return `
      export class Ticket { constructor() {} iniciar() { return this; } alinear() { return this; } negrita() { return this; } doble() { return this; } linea() { return this; } separador() { return this; } avanzar() { return this; } cortar() { return this; } aBase64() { return ''; } }
      export const ticketClienteBase64 = () => '';
      export const ticketCocinaBase64 = () => '';
      export const ticketPruebaBase64 = () => '';
      export const enviarARawBt = () => false;
      export const esAndroid = () => false;
      export const modoImpresion = () => 'browser';
      export const guardarModoImpresion = () => {};
    `
    if (id !== virtualPrinterModuleId) return null
    return `
      export const getActiveReceiptPrinter = () => null;
      export const getActiveKitchenPrinter = () => null;
      export const getActiveBarPrinter = () => null;
      export const getActivePrinterForRole = () => null;
      export const loadPrinterProfiles = () => [];
      export const savePrinterProfile = () => {};
      export const deletePrinterProfile = () => {};
      export const initializePrinting = () => {};
      export const getPrinterStorageKey = () => 'demo-only:no-printer-storage';
      export const persistPrinterProfiles = () => {};
      export const savePrinterProfileLocal = () => null;
      export const deletePrinterProfileLocal = () => {};
    `
  },
  generateBundle(_options: unknown, bundle: Record<string, { type: string; modules?: Record<string, unknown>; fileName?: string; code?: string }>) {
    const modules = Object.values(bundle)
      .filter((item) => item.type === 'chunk')
      .flatMap((item) => Object.keys(item.modules || {}))
    const forbidden = modules.filter((id) => forbiddenModulePatterns.some((pattern) => pattern.test(id.replaceAll('\\', '/'))))
    if (forbidden.length > 0) this.error(`Demo-only bundle contains forbidden modules:\n${forbidden.join('\n')}`)
    const forbiddenBundlePatterns = [/pachax-bot-local-2026/i, /VITE_BOT_ADMIN_TOKEN/i, /identitytoolkit\.googleapis\.com/i, /firestore\.googleapis\.com/i, /cloudfunctions\.net/i, /firebaseio\.com/i, /firebase(?:app|auth|firestore|storage):\/\//i, /intent:base64/i, /ru\.a402\.rawbtprinter/i]
    const leakedChunks = Object.values(bundle)
      .filter((item) => item.type === 'chunk' && forbiddenBundlePatterns.some((pattern) => pattern.test(item.code || '')))
      .map((item) => item.fileName || 'unknown chunk')
    if (leakedChunks.length > 0) this.error(`Demo-only bundle contains a forbidden credential or Firebase endpoint in: ${leakedChunks.join(', ')}`)
  },
}

export default defineConfig({
  base: '/',
  plugins: [demoIsolationBuildGuard, react()],
  build: {
    outDir: 'dist-demo-isolated',
    assetsDir: 'demo-assets',
    emptyOutDir: true,
    sourcemap: false,
    manifest: false,
    rollupOptions: {
      input: { demo: resolve(repoRoot, 'demo-isolated.html') },
    },
  },
})
