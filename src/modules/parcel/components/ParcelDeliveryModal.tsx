import React, { useState } from 'react'
import {
  X,
  CheckCircle,
  AlertTriangle,
  Search,
  FileCheck,
  DollarSign,
  FileDown,
} from 'lucide-react'
import type { ParcelShipment } from '../types'
import { generateDeliveryReceiptPdf } from '../domain/parcelDocuments'

interface ParcelDeliveryModalProps {
  isOpen: boolean
  onClose: () => void
  readyShipments: ParcelShipment[]
  preselectedShipment?: ParcelShipment | null
  onDeliver: (params: {
    shipmentId: string
    receiverName: string
    receiverDoc: string
    recipientRelationship: 'titular' | 'familiar' | 'apoderado' | 'empleado' | 'otro'
    deliveryNotes?: string
    isPayingNow?: boolean
    paymentMethod?: 'cash' | 'qr' | 'transfer'
  }) => ParcelShipment
}

export function ParcelDeliveryModal({
  isOpen,
  onClose,
  readyShipments,
  preselectedShipment,
  onDeliver,
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
  const [deliveryNotes, setDeliveryNotes] = useState('')
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'qr' | 'transfer'>('cash')

  const [deliveredResult, setDeliveredResult] = useState<ParcelShipment | null>(null)
  const [error, setError] = useState<string | null>(null)

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

    try {
      const isCodPending = selectedShipment.paymentTiming === 'destination_cod' && selectedShipment.paymentStatus === 'pending'
      const updated = onDeliver({
        shipmentId: selectedShipment.id,
        receiverName: receiverName.trim(),
        receiverDoc: receiverDoc.trim(),
        recipientRelationship: relationship,
        deliveryNotes: deliveryNotes.trim() || undefined,
        isPayingNow: isCodPending,
        paymentMethod,
      })
      setDeliveredResult(updated)
    } catch (err: any) {
      setError(err?.message || 'Error completando la entrega.')
    }
  }

  const handleDownloadDeliveryPdf = async () => {
    if (!deliveredResult || !deliveredResult.delivery) return
    const { url, filename } = await generateDeliveryReceiptPdf(deliveredResult, deliveredResult.delivery)
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
              <p className="text-xs text-slate-300">Verificación de identidad, cobro contraentrega (si aplica) y conformidad</p>
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
          <div className="p-6 text-center space-y-4">
            <div className="w-14 h-14 bg-teal-100 text-teal-800 rounded-full flex items-center justify-center mx-auto">
              <CheckCircle className="w-8 h-8" />
            </div>
            <h3 className="text-xl font-black text-slate-900">¡Encomienda Entregada Conforme!</h3>
            <p className="text-sm text-slate-600">
              Guía <strong className="font-mono text-teal-800">{deliveredResult.trackingCode}</strong> entregada a{' '}
              <strong>{deliveredResult.delivery?.receivedByName}</strong> (CI: {deliveredResult.delivery?.receivedByDoc}).
            </p>

            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl text-left max-w-md mx-auto text-xs space-y-1">
              <div><strong>Fecha y Hora:</strong> {new Date(deliveredResult.delivery?.deliveredAt || '').toLocaleString('es-BO')}</div>
              <div><strong>Parentesco / Rol:</strong> {deliveredResult.delivery?.recipientRelationship?.toUpperCase()}</div>
              <div><strong>Contenido:</strong> {deliveredResult.declaredSummary}</div>
              <div><strong>Cobro Liquidado:</strong> Bs. {deliveredResult.finalAmount.toFixed(2)}</div>
            </div>

            <div className="flex items-center justify-center gap-3 pt-3">
              <button
                type="button"
                onClick={handleDownloadDeliveryPdf}
                className="px-5 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-bold text-xs shadow-md flex items-center gap-2 transition"
              >
                <FileDown className="w-4 h-4" />
                <span>Descargar Constancia de Entrega (PDF)</span>
              </button>
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2.5 rounded-xl border border-slate-300 font-bold text-xs text-slate-700 hover:bg-slate-100 transition"
              >
                Listo / Cerrar
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleConfirmDelivery} className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 text-xs sm:text-sm">
            {error && (
              <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl flex items-center gap-2 text-xs font-semibold">
                <AlertTriangle className="w-4 h-4 shrink-0 text-red-600" />
                <span>{error}</span>
              </div>
            )}

            {/* Selector / Buscador de encomiendas por entregar */}
            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1">Buscar Guía o Destinatario</label>
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Escribe número de guía, nombre o teléfono..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-medium focus:ring-2 focus:ring-teal-500"
                />
              </div>

              {filteredShipments.length > 0 && !preselectedShipment && (
                <div className="mt-2 border border-slate-200 rounded-xl divide-y max-h-36 overflow-y-auto bg-white">
                  {filteredShipments.map(s => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => handleSelectShipment(s)}
                      className={`w-full text-left p-2.5 text-xs flex items-center justify-between transition ${selectedShipment?.id === s.id ? 'bg-teal-50 border-l-4 border-teal-600' : 'hover:bg-slate-50'}`}
                    >
                      <div>
                        <span className="font-mono font-bold text-slate-900">{s.trackingCode}</span>
                        <span className="text-slate-600 ml-2">Destinatario: {s.recipient.name}</span>
                        <span className="text-slate-500 block text-[10px]">{s.declaredSummary}</span>
                      </div>
                      <div className="text-right">
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">
                          {s.originCity} → {s.destinationCity}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Ficha de la encomienda seleccionada */}
            {selectedShipment && (
              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="font-bold text-slate-900 text-xs">
                    Datos del Paquete: <span className="font-mono text-teal-800">{selectedShipment.trackingCode}</span>
                  </div>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-teal-100 text-teal-800">
                    {selectedShipment.packageCount} bulto(s) · {selectedShipment.totalWeightKg} kg
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div><strong>Destinatario Esperado:</strong> {selectedShipment.recipient.name} (Tel: {selectedShipment.recipient.phone})</div>
                  <div><strong>Origen:</strong> {selectedShipment.originCity} (Remite: {selectedShipment.sender.name})</div>
                  <div className="col-span-2"><strong>Contenido:</strong> {selectedShipment.declaredSummary}</div>
                </div>

                {/* ALERTA DE COBRO CONTRAENTREGA (COD) */}
                {selectedShipment.paymentTiming === 'destination_cod' && selectedShipment.paymentStatus === 'pending' ? (
                  <div className="p-3 bg-amber-50 border border-amber-300 rounded-xl flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <DollarSign className="w-5 h-5 text-amber-700" />
                      <div>
                        <div className="font-bold text-amber-950 text-xs uppercase">
                          Cobro Obligatorio Contraentrega (COD)
                        </div>
                        <div className="text-[11px] text-amber-800">
                          El destinatario debe cancelar el flete para completar la entrega.
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <select
                        value={paymentMethod}
                        onChange={e => setPaymentMethod(e.target.value as any)}
                        className="bg-white border border-amber-400 rounded-lg p-1.5 text-xs font-bold text-slate-900"
                      >
                        <option value="cash">Efectivo en Caja</option>
                        <option value="qr">Pago QR Banco</option>
                        <option value="transfer">Transferencia</option>
                      </select>
                      <div className="text-base font-black text-amber-950">
                        Bs. {selectedShipment.finalAmount.toFixed(2)}
                      </div>
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
                    onChange={e => setRelationship(e.target.value as any)}
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

              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">Observaciones de Entrega (Opcional)</label>
                <input
                  type="text"
                  value={deliveryNotes}
                  onChange={e => setDeliveryNotes(e.target.value)}
                  placeholder="Ej. Verificado con cédula original, paquete intacto."
                  className="w-full bg-white border border-slate-300 rounded-lg p-2 text-xs"
                />
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
                className="px-6 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-bold text-xs shadow-md disabled:bg-slate-300 flex items-center gap-2"
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
