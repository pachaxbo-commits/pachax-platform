import { useState } from 'react'
import {
  X,
  Printer,
  FileDown,
  CheckCircle,
} from 'lucide-react'
import type { ParcelShipment } from '../types'
import {
  generateShipmentReceptionPdf,
  DEFAULT_PARCEL_COMPANY,
} from '../domain/parcelDocuments'

interface ParcelReceptionTicketModalProps {
  shipment: ParcelShipment | null
  isOpen: boolean
  onClose: () => void
  isReprint?: boolean
  companyInfo?: import("../types").DocumentCompanyContext
}

export function ParcelReceptionTicketModal({
  shipment,
  isOpen,
  onClose,
  isReprint = false,
  companyInfo,
}: ParcelReceptionTicketModalProps) {
  const [activeFormat, setActiveFormat] = useState<'80mm' | 'a4'>('80mm')
  const [isGenerating, setIsGenerating] = useState(false)

  const handleDownloadPdf = async (format: '80mm' | 'a4') => {
    if (!shipment) return
    setIsGenerating(true)
    try {
      const result = await generateShipmentReceptionPdf(shipment, {
        company,
        format,
        isCopy: isReprint,
        copyLabel: isReprint ? 'REIMPRESIÓN / COPIA' : 'ORIGINAL CLIENTE',
      })

      // Descargar archivo
      const a = document.createElement('a')
      a.href = result.url
      a.download = result.filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
    } catch (err) {
      console.error('Error generando PDF de guía:', err)
    } finally {
      setIsGenerating(false)
    }
  }

  const handlePrintNative = () => {
    window.print()
  }

  if (!isOpen || !shipment) return null

  const company = companyInfo || DEFAULT_PARCEL_COMPANY
  const timingLabel = shipment.paymentTiming === 'origin_paid' ? 'PAGADO EN ORIGEN' : 'COBRO EN DESTINO (COD)'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-2 sm:p-4 overflow-y-auto">
      <div className="relative w-full max-w-2xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden my-auto max-h-[92vh] flex flex-col font-sans">
        {/* Cabecera */}
        <div className="bg-slate-900 text-white px-5 py-3.5 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-teal-500 text-slate-950 flex items-center justify-center font-bold">
              <CheckCircle className="w-5 h-5 text-slate-950" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-black tracking-tight">
                {isReprint ? 'Reimpresión de Guía' : '¡Encomienda Registrada Exitosamente!'}
              </h2>
              <p className="text-xs text-slate-300">
                Guía N° <span className="font-mono font-bold text-teal-400">{shipment.trackingCode}</span>
                {isReprint && <span className="ml-2 text-amber-300 font-bold">(COPIA)</span>}
              </p>
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

        {/* Barra de opciones */}
        <div className="bg-slate-100 border-b border-slate-200 px-4 py-2.5 flex flex-wrap items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-1 bg-white p-0.5 rounded-lg border border-slate-300 text-xs font-bold">
            <button
              type="button"
              onClick={() => setActiveFormat('80mm')}
              className={`px-3 py-1 rounded-md transition ${activeFormat === '80mm' ? 'bg-slate-900 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'}`}
            >
              Ticket Térmico (80mm)
            </button>
            <button
              type="button"
              onClick={() => setActiveFormat('a4')}
              className={`px-3 py-1 rounded-md transition ${activeFormat === 'a4' ? 'bg-slate-900 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'}`}
            >
              Documento A4
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => handleDownloadPdf(activeFormat)}
              disabled={isGenerating}
              className="px-3 py-1.5 rounded-lg bg-white border border-slate-300 hover:bg-slate-50 font-bold text-xs text-slate-800 flex items-center gap-1.5 shadow-xs transition"
            >
              <FileDown className="w-3.5 h-3.5 text-slate-600" />
              <span>{isGenerating ? 'Generando…' : `Descargar PDF (${activeFormat.toUpperCase()})`}</span>
            </button>

            <button
              type="button"
              onClick={handlePrintNative}
              className="px-4 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-500 font-bold text-xs text-white flex items-center gap-1.5 shadow-xs transition"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Imprimir</span>
            </button>
          </div>
        </div>

        {/* Vista previa imprimible */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-slate-50 flex justify-center">
          {activeFormat === '80mm' ? (
            /* Simulación de Ticket Térmico de 80mm */
            <div className="w-[320px] bg-white border border-slate-300 rounded-xl p-5 shadow-sm font-mono text-[11px] text-slate-900 space-y-3 leading-tight select-all">
              <div className="text-center space-y-1">
                {company.logoUrl && (
                  <img
                    src={company.logoUrl}
                    alt={company.name}
                    className="h-10 mx-auto object-contain mb-1"
                  />
                )}
                <div className="font-bold text-xs uppercase tracking-wide">{company.name}</div>
                <div className="text-[10px] text-slate-600">{company.legalName}</div>
                <div className="text-[10px] text-slate-600">{company.city} · Telf: {company.phone}</div>
                <div className="border-t border-dashed border-slate-400 my-2" />
                <div className="font-black text-sm text-slate-950">GUÍA: {shipment.trackingCode}</div>
                <div className="text-[10px] italic text-slate-500">
                  [{isReprint ? 'REIMPRESIÓN / COPIA' : 'ORIGINAL CLIENTE'}]
                </div>
              </div>

              <div className="border-t border-dashed border-slate-300 pt-2 space-y-1">
                <div><strong>Fecha:</strong> {new Date(shipment.createdAt).toLocaleString('es-BO')}</div>
                <div><strong>Origen:</strong> {shipment.originCity.toUpperCase()}</div>
                <div><strong>Destino:</strong> {shipment.destinationCity.toUpperCase()} ({shipment.deliveryType === 'home' ? 'A Domicilio' : 'Agencia'})</div>
              </div>

              <div className="border-t border-dashed border-slate-300 pt-2 space-y-1">
                <div><strong>REMITENTE:</strong> {shipment.sender.name}</div>
                <div>Tel: {shipment.sender.phone} {shipment.sender.docNumber ? `· CI: ${shipment.sender.docNumber}` : ''}</div>
                <div className="mt-1"><strong>DESTINATARIO:</strong> {shipment.recipient.name}</div>
                <div>Tel: {shipment.recipient.phone} {shipment.recipient.docNumber ? `· CI: ${shipment.recipient.docNumber}` : ''}</div>
                {shipment.deliveryType === 'home' && shipment.deliveryAddress && (
                  <div className="text-[10px] text-slate-700"><strong>Dirección:</strong> {shipment.deliveryAddress}</div>
                )}
              </div>

              <div className="border-t border-dashed border-slate-300 pt-2 space-y-1">
                <div className="font-bold">CONTENIDO DECLARADO:</div>
                <div className="text-[10px]">{shipment.declaredSummary}</div>
                <div className="text-[10px] text-slate-600">
                  Bultos: {shipment.packageCount} | Peso: {shipment.totalWeightKg || '-'} kg {shipment.isFragile ? '| FRÁGIL' : ''}
                </div>
              </div>

              <div className="border-t border-dashed border-slate-300 pt-2 space-y-1">
                <div className="font-bold text-xs uppercase">{timingLabel}</div>
                <div className="text-sm font-black">TOTAL FLETE: Bs. {shipment.finalAmount.toFixed(2)}</div>
                <div className="text-[10px] text-slate-500">Atendido por: {shipment.cashierName}</div>
              </div>

              <div className="border-t border-dashed border-slate-300 pt-3 text-[9px] text-slate-500 leading-normal text-justify">
                Declaro bajo fe de juramento que la encomienda no contiene dinero, sustancias controladas, explosivos ni artículos prohibidos por ley.
              </div>

              <div className="pt-6 grid grid-cols-2 gap-4 text-center text-[9px]">
                <div className="border-t border-slate-400 pt-1 font-bold">Firma Remitente</div>
                <div className="border-t border-slate-400 pt-1 font-bold">Firma Operador</div>
              </div>
            </div>
          ) : (
            /* Simulación de A4 */
            <div className="w-full max-w-xl bg-white border border-slate-300 rounded-xl p-6 shadow-sm font-sans text-xs text-slate-900 space-y-4">
              <div className="flex items-start justify-between border-b pb-3">
                <div className="flex items-center gap-3">
                  {company.logoUrl && (
                    <img
                      src={company.logoUrl}
                      alt={company.name}
                      className="h-12 w-12 object-contain rounded-lg border border-slate-200 p-0.5 bg-white"
                    />
                  )}
                  <div>
                    <h3 className="font-black text-sm text-slate-900">{company.name}</h3>
                    <p className="text-[11px] text-slate-600">{company.legalName} · NIT: {company.taxId}</p>
                    <p className="text-[10px] text-slate-500">{company.city} · Telf: {company.phone}</p>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-black text-teal-800">GUÍA: {shipment.trackingCode}</div>
                  <div className="text-[10px] font-bold text-slate-500">[{isReprint ? 'COPIA' : 'ORIGINAL'}]</div>
                  <div className="text-[10px] text-slate-500">{new Date(shipment.createdAt).toLocaleDateString('es-BO')}</div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 bg-slate-50 p-3 rounded-lg border border-slate-200">
                <div>
                  <span className="font-bold text-[11px] block text-slate-700">REMITENTE:</span>
                  <div className="font-semibold text-slate-900">{shipment.sender.name}</div>
                  <div className="text-slate-600 text-[11px]">Telf: {shipment.sender.phone} · Doc: {shipment.sender.docNumber || 'S/N'}</div>
                  <div className="text-slate-500 text-[10px]">Origen: {shipment.originCity}</div>
                </div>
                <div>
                  <span className="font-bold text-[11px] block text-slate-700">DESTINATARIO:</span>
                  <div className="font-semibold text-slate-900">{shipment.recipient.name}</div>
                  <div className="text-slate-600 text-[11px]">Telf: {shipment.recipient.phone} · Doc: {shipment.recipient.docNumber || 'S/N'}</div>
                  <div className="text-slate-500 text-[10px]">Destino: {shipment.destinationCity} ({shipment.deliveryType === 'home' ? 'A Domicilio' : 'Retiro en Agencia'})</div>
                </div>
              </div>

              <div>
                <span className="font-bold text-slate-800 block mb-1">Contenido Declarado:</span>
                <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200">
                  <div className="font-medium text-slate-900">{shipment.declaredSummary}</div>
                  <div className="text-[11px] text-slate-500 mt-1">
                    Bultos: {shipment.packageCount} | Peso: {shipment.totalWeightKg || '-'} kg {shipment.isFragile ? '| FRÁGIL' : ''}
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between p-3 bg-teal-50 border border-teal-200 rounded-lg">
                <div>
                  <div className="font-bold text-teal-900 uppercase text-xs">{timingLabel}</div>
                  <div className="text-[11px] text-teal-700">Atendido por: {shipment.cashierName}</div>
                </div>
                <div className="text-right">
                  <div className="text-lg font-black text-teal-950">Bs. {shipment.finalAmount.toFixed(2)}</div>
                </div>
              </div>

              <div className="pt-8 grid grid-cols-2 gap-8 text-center text-xs">
                <div className="border-t border-slate-400 pt-1 font-bold text-slate-700">Firma Remitente</div>
                <div className="border-t border-slate-400 pt-1 font-bold text-slate-700">Firma Agente Receptor</div>
              </div>
            </div>
          )}
        </div>

        {/* Pie de modal */}
        <div className="bg-white border-t border-slate-200 px-4 py-3 flex items-center justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs shadow-xs transition"
          >
            Listo / Cerrar
          </button>
        </div>
      </div>
    </div>
  )
}
