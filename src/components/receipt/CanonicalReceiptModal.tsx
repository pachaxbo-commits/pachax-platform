import { useState } from 'react'
import { Printer, Share2, Download, Check } from 'lucide-react'
import { Modal } from '../ui/Modal'
import type { BusinessDocumentContext } from '../../core/businessIdentity'
import type { CanonicalReceiptData } from '../../core/receiptService'
import { shareReceipt, generateReceiptPdf } from '../../core/receiptService'

export function CanonicalReceiptModal({
  isOpen,
  onClose,
  documentContext,
  receiptData,
  onPrint,
}: {
  isOpen: boolean
  onClose: () => void
  documentContext: BusinessDocumentContext
  receiptData: CanonicalReceiptData
  onPrint?: () => unknown | Promise<unknown>
}) {
  const [sharing, setSharing] = useState(false)
  const [printing, setPrinting] = useState(false)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)

  if (!isOpen) return null

  const handleShare = async () => {
    if (sharing) return
    setSharing(true)
    setStatusMessage(null)
    try {
      const res = await shareReceipt(documentContext, receiptData, {
        customerPhone: receiptData.customer?.phone,
      })
      if (res.success) {
        setStatusMessage('Recibo compartido correctamente')
        setTimeout(() => setStatusMessage(null), 3000)
      }
    } catch (_err: unknown) {
      setStatusMessage('Error al compartir recibo')
    } finally {
      setSharing(false)
    }
  }

  const handlePrint = async () => {
    if (printing || !onPrint) return
    setPrinting(true)
    setStatusMessage(null)
    try {
      const res = await onPrint()
      if (typeof res === 'string' && res.trim().length > 0) {
        setStatusMessage(res)
      } else if (res && typeof res === 'object' && 'message' in res && typeof (res as any).message === 'string') {
        setStatusMessage((res as any).message)
      } else {
        setStatusMessage('Ticket enviado a impresión')
      }
      setTimeout(() => setStatusMessage(null), 3000)
    } catch (_err: unknown) {
      setStatusMessage('Fallo al enviar a impresora')
    } finally {
      setPrinting(false)
    }
  }

  const handleDownloadPdf = async () => {
    try {
      const pdfBytes = await generateReceiptPdf(documentContext, receiptData)
      const blob = new Blob([pdfBytes as unknown as BlobPart], { type: 'application/pdf' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `Recibo_${receiptData.receiptNumber}.pdf`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      setTimeout(() => URL.revokeObjectURL(url), 30000)
    } catch (err) {
      console.error('Error descargando PDF:', err)
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Recibo digital"
      subtitle={`Comprobante #${receiptData.receiptNumber}`}
      footer={
        <div className="flex flex-col sm:flex-row gap-2 w-full">
          {onPrint && (
            <button
              type="button"
              disabled={printing}
              onClick={handlePrint}
              className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-3 text-xs font-bold text-slate-800 hover:bg-slate-50 transition shadow-xs cursor-pointer disabled:opacity-50"
            >
              <Printer size={16} />
              <span>{printing ? 'Imprimiendo...' : 'Imprimir recibo'}</span>
            </button>
          )}

          <button
            type="button"
            disabled={sharing}
            onClick={handleShare}
            style={{ backgroundColor: 'var(--primary)', color: 'var(--primary-foreground)' }}
            className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-xs font-bold transition shadow-xs cursor-pointer hover:opacity-95 disabled:opacity-50"
          >
            <Share2 size={16} />
            <span>{sharing ? 'Compartiendo...' : 'Compartir recibo'}</span>
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        {statusMessage && (
          <div className="flex items-center gap-2 rounded-xl bg-emerald-50 border border-emerald-200 p-2.5 text-xs font-semibold text-emerald-800">
            <Check size={14} className="text-emerald-600" />
            <span>{statusMessage}</span>
          </div>
        )}

        {/* Tarjeta simulada de comprobante / ticket térmico */}
        <div className="rounded-2xl border border-slate-200 bg-slate-50/50 p-4 sm:p-5 font-mono text-xs text-slate-800 shadow-inner space-y-3">
          {/* Logo y Encabezado de Empresa */}
          <div className="text-center space-y-1">
            {documentContext.showLogo && documentContext.logoUrl ? (
              <img
                src={documentContext.logoUrl}
                alt="Logo"
                className="max-h-12 max-w-[140px] mx-auto object-contain mb-2"
                onError={(e) => {
                  ;(e.target as HTMLElement).style.display = 'none'
                }}
              />
            ) : null}

            <h3 className="font-bold text-sm tracking-wide text-slate-900 font-sans uppercase">
              {documentContext.companyName}
            </h3>

            {documentContext.legalName && documentContext.legalName !== documentContext.companyName && (
              <p className="text-[11px] text-slate-500 font-sans">{documentContext.legalName}</p>
            )}

            {documentContext.formattedHeaderLines.map((line, idx) => (
              <p key={idx} className="text-[11px] text-slate-600 font-sans">
                {line}
              </p>
            ))}
          </div>

          <div className="border-t border-dashed border-slate-300 pt-2" />

          {/* Datos del Ticket */}
          <div className="space-y-1 text-[11px]">
            <div className="flex justify-between items-center font-bold">
              <span>TICKET: #{receiptData.receiptNumber}</span>
              {receiptData.isCopy && <span className="text-amber-700 uppercase">(Copia)</span>}
            </div>
            <div className="flex justify-between text-slate-600">
              <span>Fecha:</span>
              <span>{new Date(receiptData.dateIso).toLocaleString('es-BO')}</span>
            </div>
            {receiptData.tableOrPoint && (
              <div className="flex justify-between text-slate-600">
                <span>Destino / Mesa:</span>
                <span className="font-semibold text-slate-900">{receiptData.tableOrPoint}</span>
              </div>
            )}
            {receiptData.customer?.name && (
              <div className="flex justify-between text-slate-600">
                <span>Cliente:</span>
                <span className="font-semibold text-slate-900">{receiptData.customer.name}</span>
              </div>
            )}
            {receiptData.customer?.taxId && (
              <div className="flex justify-between text-slate-600">
                <span>NIT / CI:</span>
                <span>{receiptData.customer.taxId}</span>
              </div>
            )}
          </div>

          <div className="border-t border-dashed border-slate-300 pt-2" />

          {/* Lista de productos */}
          <div className="space-y-2">
            <div className="flex justify-between font-bold text-[10px] text-slate-500 uppercase">
              <span>Cant. Descripción</span>
              <span>Total</span>
            </div>

            <div className="divide-y divide-slate-100">
              {receiptData.items.map((item, index) => (
                <div key={index} className="py-1.5 flex justify-between items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-slate-900 leading-tight">
                      <span className="font-bold mr-1">{item.quantity}×</span>
                      {item.name}
                    </p>
                    {item.modifiers && item.modifiers.length > 0 && (
                      <div className="text-[10px] text-slate-500 italic mt-0.5 space-y-0.5">
                        {item.modifiers.map((mod, mIdx) => (
                          <div key={mIdx}>└ {mod}</div>
                        ))}
                      </div>
                    )}
                  </div>
                  <span className="font-bold text-slate-900 shrink-0">
                    Bs {item.lineTotal.toFixed(2)}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="border-t border-dashed border-slate-300 pt-2" />

          {/* Desglose y Totales */}
          <div className="space-y-1 text-xs">
            {receiptData.discountTotal && receiptData.discountTotal > 0 ? (
              <>
                <div className="flex justify-between text-slate-600">
                  <span>Subtotal:</span>
                  <span>Bs {receiptData.subtotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-emerald-700">
                  <span>Descuento:</span>
                  <span>-Bs {receiptData.discountTotal.toFixed(2)}</span>
                </div>
              </>
            ) : null}

            {receiptData.deliveryFee && receiptData.deliveryFee > 0 ? (
              <div className="flex justify-between text-slate-600">
                <span>Delivery:</span>
                <span>Bs {receiptData.deliveryFee.toFixed(2)}</span>
              </div>
            ) : null}

            <div className="flex justify-between items-baseline font-bold text-sm text-slate-950 pt-1 font-sans">
              <span>TOTAL:</span>
              <span className="text-base font-extrabold">Bs {receiptData.total.toFixed(2)}</span>
            </div>

            {receiptData.paymentMethod && (
              <div className="flex justify-between text-[11px] text-slate-600 pt-1">
                <span>Forma de pago:</span>
                <span className="font-bold uppercase text-slate-800">
                  {receiptData.paymentMethod}
                </span>
              </div>
            )}

            {receiptData.cashReceived ? (
              <div className="flex justify-between text-[11px] text-slate-600">
                <span>Recibido:</span>
                <span>Bs {receiptData.cashReceived.toFixed(2)}</span>
              </div>
            ) : null}

            {receiptData.changeAmount ? (
              <div className="flex justify-between text-[11px] text-slate-600">
                <span>Cambio:</span>
                <span>Bs {receiptData.changeAmount.toFixed(2)}</span>
              </div>
            ) : null}
          </div>

          {/* Pie de Recibo */}
          <div className="border-t border-dashed border-slate-300 pt-3 text-center space-y-1">
            {documentContext.receiptFooter && (
              <p className="text-[11px] text-slate-600 font-sans">{documentContext.receiptFooter}</p>
            )}
            {documentContext.showManagedBy && (
              <p className="text-[9px] text-slate-400 font-sans tracking-wide">
                Gestionado con PACHAX
              </p>
            )}
          </div>
        </div>

        {/* Botón secundario para descargar PDF */}
        <div className="flex justify-center">
          <button
            type="button"
            onClick={handleDownloadPdf}
            className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-900 transition underline cursor-pointer"
          >
            <Download size={13} />
            <span>Descargar archivo PDF</span>
          </button>
        </div>
      </div>
    </Modal>
  )
}
