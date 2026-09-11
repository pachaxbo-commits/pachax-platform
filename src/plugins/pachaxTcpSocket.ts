import { registerPlugin } from '@capacitor/core'

export interface TestConnectionOptions {
  host: string
  port?: number
  timeoutMs?: number
}

export interface TestConnectionResult {
  connected: boolean
  errorType?: 'timeout' | 'connection_refused' | 'host_not_found' | 'invalid_address' | 'unknown'
  message: string
}

export interface ConnectOptions {
  host: string
  port?: number
  timeoutMs?: number
}

export interface ConnectResult {
  connectionId: string
  connected: boolean
}

export interface WriteOptions {
  connectionId: string
  bytesBase64: string
}

export interface WriteResult {
  bytesWritten: number
}

export interface PachaxTcpSocketPlugin {
  testConnection(options: TestConnectionOptions): Promise<TestConnectionResult>
  connect(options: ConnectOptions): Promise<ConnectResult>
  write(options: WriteOptions): Promise<WriteResult>
  disconnect(options: { connectionId: string }): Promise<{ disconnected: boolean }>
  isConnected(options: { connectionId: string }): Promise<{ connected: boolean }>
}

const mockSockets = new Set<string>()

const PachaxTcpSocket = registerPlugin<PachaxTcpSocketPlugin>('PachaxTcpSocket', {
  web: {
    async testConnection(options: TestConnectionOptions): Promise<TestConnectionResult> {
      if (!options.host || options.host === '0.0.0.0') {
        return { connected: false, errorType: 'invalid_address', message: 'Dirección IP/Host inválida' }
      }
      return { connected: true, message: `Conexión TCP simulada exitosa a ${options.host}:${options.port || 9100}` }
    },
    async connect(_options: ConnectOptions): Promise<ConnectResult> {
      const connId = `web_tcp_${Date.now()}`
      mockSockets.add(connId)
      return { connectionId: connId, connected: true }
    },
    async write(options: WriteOptions): Promise<WriteResult> {
      if (!mockSockets.has(options.connectionId)) {
        throw new Error('Socket TCP no conectado')
      }
      const rawLen = Math.floor((options.bytesBase64.length * 3) / 4)
      return { bytesWritten: rawLen }
    },
    async disconnect(options: { connectionId: string }): Promise<{ disconnected: boolean }> {
      mockSockets.delete(options.connectionId)
      return { disconnected: true }
    },
    async isConnected(options: { connectionId: string }): Promise<{ connected: boolean }> {
      return { connected: mockSockets.has(options.connectionId) }
    },
  },
})

export default PachaxTcpSocket
