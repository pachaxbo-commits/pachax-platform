import { AlertTriangle, LoaderCircle, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { fetchSalesResetStatus, resetSalesData, type SalesResetStatus } from '../lib/botApi'
import { Button } from './ui/Button'

/**
 * Borra todo el historial de ventas para entregar el sistema limpio.
 *
 * Sirve para que los pedidos de prueba no queden inflando el historial, los totales de
 * dia/semana/mes ni el conteo de insumos (pan, carne), que se calculan a partir de los pedidos.
 *
 * Limitado a DOS usos: uno para probar y otro para la entrega final. El contador lo lleva el
 * bot en sus ajustes, no el navegador, asi que no se reinicia borrando datos del navegador.
 *
 * NO toca el menu, los usuarios ni la configuracion del bot.
 */
export function ResetSalesPanel() {
  const [estado, setEstado] = useState<SalesResetStatus | null>(null)
  const [cargando, setCargando] = useState(true)
  const [borrando, setBorrando] = useState(false)
  const [mensaje, setMensaje] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let vigente = true
    fetchSalesResetStatus()
      .then((datos) => vigente && setEstado(datos))
      .catch(() => vigente && setError('No se pudo conectar con el bot para saber cuantos usos quedan.'))
      .finally(() => vigente && setCargando(false))
    return () => {
      vigente = false
    }
  }, [])

  const sinUsos = estado ? estado.restantes <= 0 : false

  const borrar = async () => {
    const aviso = [
      'ATENCION: esto borra TODOS los pedidos y ventas del sistema.',
      '',
      'Se pierden el historial, los totales de dia, semana y mes, y el conteo de insumos.',
      'El menu, los usuarios y la configuracion del bot NO se tocan.',
      '',
      estado ? `Te quedan ${estado.restantes} de ${estado.maximo} usos. Esta accion NO se puede deshacer.` : '',
      '',
      'Continuar?',
    ].join('\n')

    if (!window.confirm(aviso)) return
    // Segunda confirmacion a proposito: es irreversible y se puede usar solo dos veces.
    if (!window.confirm('Ultima confirmacion. Se van a borrar todas las ventas. Estas seguro?')) return

    setBorrando(true)
    setError(null)
    setMensaje(null)
    try {
      const resultado = await resetSalesData()
      setMensaje(`Listo: se borraron ${resultado.pedidosBorrados} pedidos de ${resultado.diasBorrados} dias. Quedan ${resultado.restantes} usos.`)
      setEstado((anterior) => (anterior ? { ...anterior, usados: anterior.usados + 1, restantes: resultado.restantes } : anterior))
    } catch (fallo) {
      setError(fallo instanceof Error ? fallo.message : 'No se pudo borrar el historial de ventas.')
    } finally {
      setBorrando(false)
    }
  }

  return (
    <div className="rounded-2xl border border-red-200 bg-red-50/60 p-5 space-y-3">
      <div className="flex items-start gap-3">
        <AlertTriangle size={20} className="text-red-700 shrink-0 mt-0.5" />
        <div className="min-w-0">
          <h3 className="text-sm font-black text-red-900">Borrar historial de ventas</h3>
          <p className="mt-1 text-xs leading-5 text-red-900/80">
            Deja el sistema en cero para entregarlo sin los pedidos de prueba: se borran el historial, los
            totales de dia, semana y mes, y el conteo de insumos. El menu, los usuarios y la configuracion
            del bot no se tocan.
          </p>
        </div>
      </div>

      <div className="text-xs font-bold text-red-900">
        {cargando ? 'Consultando usos disponibles...' : estado ? `Usos disponibles: ${estado.restantes} de ${estado.maximo}` : 'Usos disponibles: desconocido'}
      </div>

      {mensaje ? <div className="rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-900">{mensaje}</div> : null}
      {error ? <div className="rounded-xl border border-red-300 bg-white px-3 py-2 text-xs font-bold text-red-800">{error}</div> : null}

      <Button
        tone="secondary"
        className="border-red-300 bg-red-600 text-white hover:bg-red-700 flex items-center gap-2"
        disabled={borrando || cargando || sinUsos}
        onClick={() => void borrar()}
      >
        {borrando ? <LoaderCircle size={16} className="animate-spin" /> : <Trash2 size={16} />}
        {sinUsos ? 'Sin usos disponibles' : 'Borrar todas las ventas'}
      </Button>
    </div>
  )
}
