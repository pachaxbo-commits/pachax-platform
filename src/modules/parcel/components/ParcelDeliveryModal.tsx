import { useState, useRef, useEffect } from 'react'
import {
  X,
  FileCheck,
  CheckCircle,
  FileDown,
  AlertTriangle,
  Search,
  PenTool,
  RotateCcw,
} from 'lucide-react'
import type { ParcelShipment } from '../types'
import { generateDeliveryReceiptPdf } from '../domain/parcelDocuments'

interface ParcelDeliveryModalProps {
  isOpen: boolean
  onClose: () => void
  readyShipments: ParcelShipment[]
  preselectedShipment: ParcelShipment | null
  onDeliver: (params: {
    shipmentId: string
    receiverName: string
    receiverDoc: string
    recipientRelationship: 'titular' | 'familiar' | 'apoderado' | 'empleado' | 'otro'
    deliveryNotes?: string
    authorizedChangeReason?: string
    isPayingNow?: boolean
    paymentMethod?: 'cash' | 'qr' | 'transfer'
    signatureCaptured?: string
  }) => ParcelShipment
  companyInfo?: import("../types").DocumentCompanyContext
}

export function ParcelDeliveryModal({
  isOpen,
  onClose,
  readyShipments,
  preselectedShipment,
  onDeliver,
  companyInfo,
}: ParcelDeliveryModalProps) {
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedShipment, setSelectedShipment] = useState<ParcelShipment | null>(
    preselectedShipment || readyShipments[0] || null
  )

  const [receiverName, setReceiverName] = useState(
    preselectedShipment?.recipient.name || readyShipments[0]?.recipient.name || ''
  )
  const [receiverDoc, setReceiverDoc] = useState(
    preselectedShipment?.recipient.docNumber || readyShipments[0]?.recipient.docNumber || ''
  )
  const [relationship, setRelationship] = useState<'titular' | 'familiar' | 'apoderado' | 'empleado' | 'otro'>('titular')
  const [authorizedChangeReason, setAuthorizedChangeReason] = useState('')
  const [deliveryNotes, setDeliveryNotes] = useState('')
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'qr' | 'transfer'>('cash')

  // Canvas de firma digital en pantalla
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [isDrawing, setIsDrawing] = useState(false)
  const [hasSignature, setHasSignature] = useState(false)

  const [deliveredResult, setDeliveredResult] = useState<ParcelShipment | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Configuración del canvas cuando se monta
  useEffect(() => {
    if (canvasRef.current) {
      const ctx = canvasRef.current.getContext('2d')
      if (ctx) {
        ctx.strokeStyle = '#0f172a'
        ctx.lineWidth = 2.5
        ctx.lineCap = 'round'
        ctx.lineJoin = 'round'
      }
    }
  }, [selectedShipment, isOpen])

  const clearSignature = () => {
    if (!canvasRef.current) return
    const ctx = canvasRef.current.getContext('2d')
    if (ctx) {
      ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height)
    }
    setHasSignature(false)
  }

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const scaleX = canvas.width / rect.width
    const scaleY = canvas.height / rect.height
    const x = (e.clientX - rect.left) * scaleX
    const y = (e.clientY - rect.top) * scaleY

    ctx.beginPath()
    ctx.moveTo(x, y)
    setIsDrawing(true)
    setHasSignature(true)
  }

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawing || !canvasRef.current) return
    const canvas = canvasRef.current
    const rect = canvas.getBoundingClientRect()
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const scaleX = canvas.width / rect.width
    const scaleY = canvas.height / rect.height
    const x = (e.clientX - rect.left) * scaleX
    const y = (e.clientY - rect.top) * scaleY

    ctx.lineTo(x, y)
    ctx.stroke()
  }

  const handlePointerUp = () => {
    setIsDrawing(false)
  }

  const filteredShipments = readyShipments.filter(s => {
    if (!searchTerm.trim()) return true
    const term = searchTerm.toLowerCase()
    return (
      s.trackingCode.toLowerCase().includes(term) ||
      s.recipient.name.toLowerCase().includes(term) ||
      s.recipient.phone.includes(term)
    )
  })

  const handleSelectShipment = (s: ParcelShipment) => {
    setSelectedShipment(s)
    setReceiverName(s.recipient.name)
    setReceiverDoc(s.recipient.docNumber || '')
    setRelationship('titular')
    setError(null)
    clearSignature()
  }

  const handleConfirmDelivery = (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!selectedShipment) {
      setError('Por favor selecciona una encomienda para entregar.')
      return
    }

    if (!receiverName.trim()) {
      setError('Debes ingresar el nombre de la persona que recibe la encomienda.')
      return
    }
    if (!receiverDoc.trim()) {
      setError('Debes ingresar el número de cédula / documento de identidad de quien recibe.')
      return
    }

    if (relationship !== 'titular' && !authorizedChangeReason.trim()) {
      setError('Al entregar a un familiar, apoderado o tercero, debes indicar el motivo o respaldo de la autorización.')
      return
    }

    try {
      const isCodPending = selectedShipment.paymentTiming === 'destination_cod' && selectedShipment.paymentStatus === 'pending'
      
      let signatureDataUrl: string | undefined = undefined
      if (hasSignature && canvasRef.current) {
        signatureDataUrl = canvasRef.current.toDataURL('image/png')
      }

      const updated = onDeliver({
        shipmentId: selectedShipment.id,
        receiverName: receiverName.trim(),
        receiverDoc: receiverDoc.trim(),
        recipientRelationship: relationship,
        deliveryNotes: deliveryNotes.trim() || undefined,
        authorizedChangeReason: authorizedChangeReason.trim() || undefined,
        isPayingNow: isCodPending,
        paymentMethod,
        signatureCaptured: signatureDataUrl,
      })
      setDeliveredResult(updated)
    } catch (err: unknown) {
      setError((err as Error)?.message || 'Error completando la entrega.')
    }
  }

  const handleDownloadDeliveryPdf = async () => {
    if (!deliveredResult || !deliveredResult.delivery) return
    const { url, filename } = await generateDeliveryReceiptPdf(deliveredResult, deliveredResult.delivery, companyInfo)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-2 sm:p-4 overflow-y-auto">
      <div className="relative w-full max-w-3xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden my-auto max-h-[92vh] flex flex-col font-sans">
        {/* Cabecera */}
        <div className="bg-slate-900 text-white px-5 py-3.5 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-teal-500 text-slate-950 flex items-center justify-center font-bold">
              <FileCheck className="w-5 h-5 text-slate-950" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-black tracking-tight">Entrega de Encomienda</h2>
              <p className="text-xs text-slate-300">Verificación de identidad, cobro contraentrega (si aplica) y firma</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {deliveredResult ? (
          /* Pantalla de confirmación de entrega */
          <div className="p-6 text-center space-y-4 font-sans">
            <div className="w-14 h-14 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto text-2xl">
              <CheckCircle className="w-8 h-8 text-emerald-600" />
            </div>
            <div className="space-y-1">
              <h3 className="text-lg font-black text-slate-900">¡Entrega Completada con Éxito!</h3>
              <p className="text-xs text-slate-500">
                La encomienda <strong className="font-mono text-slate-800">{deliveredResult.trackingCode}</strong> ha sido entregada y cerrada en el sistema.
              </p>
            </div>

            <div className="p-4 bg-slate-50 rounded-xl text-left text-xs space-y-1.5 border border-slate-200 max-w-md mx-auto">
              <div className="flex justify-between">
                <span className="text-slate-500">Receptor Registrado:</span>
                <span className="font-bold text-slate-900">{deliveredResult.delivery?.receivedByName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">C.I. / Documento:</span>
                <span className="font-bold text-slate-900">{deliveredResult.delivery?.receivedByDoc}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Parentesco / Relación:</span>
                <span className="font-bold text-slate-900 uppercase text-[11px]">{deliveredResult.delivery?.recipientRelationship}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Firma Registrada:</span>
                <span className="font-bold text-teal-700 text-[11px]">
                  {deliveredResult.delivery?.signatureCaptured ? 'Firma Digital en Pantalla' : 'Línea para Firma Manuscrita en Acta'}
                </span>
              </div>
              <div className="flex justify-between border-t border-slate-200 pt-1.5">
                <span className="text-slate-500">Cobro Realizado:</span>
                <span className="font-black text-emerald-800">
                  {deliveredResult.paymentTiming === 'destination_cod'
                    ? `Bs. ${deliveredResult.finalAmount.toFixed(2)} (${deliveredResult.paymentMethod?.toUpperCase()})`
                    : 'Cancelado previamente en origen'}
                </span>
              </div>
            </div>

            <div className="flex items-center justify-center gap-3 pt-3">
              <button
                type="button"
                onClick={handleDownloadDeliveryPdf}
                className="px-5 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-bold text-xs flex items-center gap-2 shadow-xs transition"
              >
                <FileDown className="w-4 h-4" />
                <span>Descargar Acta de Entrega (PDF)</span>
              </button>
              <button
                type="button"
                onClick={onClose}
                className="px-5 py-2.5 rounded-xl border border-slate-300 font-bold text-xs text-slate-700 hover:bg-slate-100 transition"
              >
                Cerrar Ventana
              </button>
            </div>
          </div>
        ) : (
          /* Formulario de Entrega */
          <form onSubmit={handleConfirmDelivery} className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 text-xs sm:text-sm">
            {error && (
              <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl flex items-center gap-2 text-xs font-semibold">
                <AlertTriangle className="w-4 h-4 shrink-0 text-red-600" />
                <span>{error}</span>
              </div>
            )}

            {/* Buscador de guías listas para entregar */}
            <div className="space-y-1.5">
              <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider">
                1. Seleccionar Encomienda Lista para Entrega *
              </label>
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  placeholder="Buscar por código de guía (ENC-...), nombre o teléfono del destinatario..."
                  className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-medium text-slate-900 focus:bg-white focus:ring-2 focus:ring-teal-500"
                />
              </div>

              {/* Lista filtrada de guías para entrega rápida */}
              <div className="max-h-36 overflow-y-auto border border-slate-200 rounded-xl divide-y divide-slate-100 bg-white">
                {filteredShipments.length === 0 ? (
                  <div className="p-3 text-center text-slate-400 text-xs">
                    No hay encomiendas listas para entrega con los criterios ingresados.
                  </div>
                ) : (
                  filteredShipments.map(s => {
                    const isSelected = selectedShipment?.id === s.id
                    return (
                      <div
                        key={s.id}
                        onClick={() => handleSelectShipment(s)}
                        className={`p-2.5 cursor-pointer flex items-center justify-between text-xs transition ${
                          isSelected ? 'bg-teal-50/80 border-l-4 border-teal-600' : 'hover:bg-slate-50'
                        }`}
                      >
                        <div>
                          <div className="font-mono font-black text-slate-900 flex items-center gap-2">
                            <span>{s.trackingCode}</span>
                            <span className="text-[10px] font-sans font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                              {s.packageCount} bulto(s) · {s.totalWeightKg} kg
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-500">
                            Destinatario: <strong className="text-slate-800">{s.recipient.name}</strong> ({s.recipient.phone})
                          </div>
                        </div>

                        <div className="text-right">
                          <span
                            className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${
                              s.paymentTiming === 'destination_cod' && s.paymentStatus === 'pending'
                                ? 'bg-amber-100 text-amber-900 font-black'
                                : 'bg-emerald-100 text-emerald-800 font-bold'
                            }`}
                          >
                            {s.paymentTiming === 'destination_cod' && s.paymentStatus === 'pending'
                              ? `Por Cobrar: Bs. ${s.finalAmount.toFixed(2)}`
                              : 'Pagado'}
                          </span>
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            </div>

            {/* Panel de Cobro Contraentrega (Si aplica) */}
            {selectedShipment && (
              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                <span className="font-bold text-slate-900 text-xs uppercase tracking-wider block">
                  Estado Financiero del Envío
                </span>
                {selectedShipment.paymentTiming === 'destination_cod' && selectedShipment.paymentStatus === 'pending' ? (
                  <div className="p-3 bg-amber-50 border border-amber-300 rounded-xl space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-amber-900 flex items-center gap-1.5">
                        <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                        Cobro Contraentrega Requerido (COD)
                      </span>
                      <span className="text-base font-black text-amber-950 font-mono">
                        Bs. {selectedShipment.finalAmount.toFixed(2)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <label className="text-[11px] font-bold text-amber-900">Cobrar con:</label>
                      <select
                        value={paymentMethod}
                        onChange={e => setPaymentMethod(e.target.value as 'cash' | 'qr' | 'transfer')}
                        className="bg-white border border-amber-300 rounded-lg px-2.5 py-1 text-xs font-bold text-slate-900"
                      >
                        <option value="cash">Efectivo en Caja</option>
                        <option value="qr">Pago QR</option>
                        <option value="transfer">Transferencia</option>
                      </select>
                    </div>
                  </div>
                ) : (
                  <div className="p-2 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-800 text-[11px] font-semibold flex items-center gap-1.5">
                    <CheckCircle className="w-4 h-4 text-emerald-600" />
                    <span>Flete previamente cancelado en origen (Bs. {selectedShipment.finalAmount.toFixed(2)}). Sin cobro pendiente.</span>
                  </div>
                )}
              </div>
            )}

            {/* Datos de quien recibe */}
            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
              <span className="font-bold text-slate-900 text-xs uppercase tracking-wider block">
                Verificación de Identidad del Receptor
              </span>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Nombre Completo *</label>
                  <input
                    type="text"
                    value={receiverName}
                    onChange={e => setReceiverName(e.target.value)}
                    className="w-full bg-white border border-slate-300 rounded-lg p-2 font-medium text-slate-900"
                    placeholder="Nombre de quien recibe"
                    required
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Cédula / Documento (CI) *</label>
                  <input
                    type="text"
                    value={receiverDoc}
                    onChange={e => setReceiverDoc(e.target.value)}
                    className="w-full bg-white border border-slate-300 rounded-lg p-2 font-medium text-slate-900"
                    placeholder="Ej. 5234190 Cbba"
                    required
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Parentesco / Relación</label>
                  <select
                    value={relationship}
                    onChange={e => setRelationship(e.target.value as 'titular' | 'familiar' | 'apoderado' | 'empleado' | 'otro')}
                    className="w-full bg-white border border-slate-300 rounded-lg p-2 font-medium text-slate-900"
                  >
                    <option value="titular">Mismo Destinatario (Titular)</option>
                    <option value="familiar">Familiar Autorizado</option>
                    <option value="apoderado">Apoderado Legal</option>
                    <option value="empleado">Empleado / Delegado</option>
                    <option value="otro">Otro Tercero</option>
                  </select>
                </div>
              </div>

              {relationship !== 'titular' && (
                <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-lg text-amber-900 text-xs space-y-1">
                  <label className="block font-bold">Respaldo / Autorización de Retiro por Tercero *</label>
                  <input
                    type="text"
                    value={authorizedChangeReason}
                    onChange={e => setAuthorizedChangeReason(e.target.value)}
                    placeholder="Ej. Autorización telefónica del remitente, carta poder o fotocopia de CI"
                    className="w-full bg-white border border-amber-300 rounded-lg p-1.5 text-xs font-medium text-slate-900"
                    required
                  />
                  <p className="text-[10px] text-amber-800">
                    Al entregar a alguien que no es el titular, debe registrarse el motivo o comprobante de autorización.
                  </p>
                </div>
              )}

              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">Observaciones de Entrega (Opcional)</label>
                <input
                  type="text"
                  value={deliveryNotes}
                  onChange={e => setDeliveryNotes(e.target.value)}
                  placeholder="Ej. Cédula verificada, paquete cerrado e intacto."
                  className="w-full bg-white border border-slate-300 rounded-lg p-2 text-xs"
                />
              </div>
            </div>

            {/* Firma del receptor: Digital en pantalla o manuscrita física */}
            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <span className="font-bold text-slate-900 text-xs uppercase tracking-wider block">
                    Firma de Conformidad del Receptor
                  </span>
                  <span className="text-[11px] text-slate-500">
                    Dibuja la firma en el recuadro con el dedo o ratón, o déjalo vacío para firmar con bolígrafo en el acta impresa.
                  </span>
                </div>
                {hasSignature && (
                  <button
                    type="button"
                    onClick={clearSignature}
                    className="text-xs text-red-600 hover:text-red-700 font-bold px-2 py-1 rounded-md hover:bg-red-50 border border-red-200 transition flex items-center gap-1"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Borrar</span>
                  </button>
                )}
              </div>

              <div className="relative border-2 border-dashed border-slate-300 rounded-xl bg-white overflow-hidden touch-none flex items-center justify-center">
                <canvas
                  ref={canvasRef}
                  width={500}
                  height={120}
                  onPointerDown={handlePointerDown}
                  onPointerMove={handlePointerMove}
                  onPointerUp={handlePointerUp}
                  className="w-full h-28 cursor-crosshair bg-white"
                />
                {!hasSignature && (
                  <div className="absolute pointer-events-none text-slate-400 text-xs flex items-center gap-1.5 font-medium select-none">
                    <PenTool className="w-4 h-4 text-slate-400" />
                    <span>Dibuja la firma aquí (o firmar en papel impreso)</span>
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl border border-slate-300 font-bold text-xs text-slate-700 hover:bg-slate-100"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={!selectedShipment}
                className="px-6 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-bold text-xs shadow-md disabled:bg-slate-300 flex items-center gap-2 transition"
              >
                <CheckCircle className="w-4 h-4" />
                <span>Confirmar Entrega y Emitir Acta</span>
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
