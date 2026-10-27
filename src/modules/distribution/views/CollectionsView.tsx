import { useMemo, useState } from 'react'
import { Receipt } from 'lucide-react'
import { CreditProducts } from './CreditProducts'
import { RangePicker } from './RangePicker'
import { EmptyBlock, Screen } from '../../../components/ui/Screen'
import { computeMoneySummary } from '../domain/engine'
import { KpiCard } from './shared'
import { formatBs } from './sharedFormatters'
import type { DistributionViewProps } from './DistributionApp'
import type { DistCollection } from '../types'
import { CanonicalReceiptModal } from '../../../components/receipt/CanonicalReceiptModal'
import { buildBusinessDocumentContext } from '../../../core/businessIdentity'
import { distCollectionToReceiptData, printCollectionReceipt } from '../data/distributionReceiptService'

/**
 * Historial de cobranzas del rango consultado. Los cobros son movimientos
 * financieros separados de las ventas.
 */
export function CollectionsView({ session, data, documentContext, businessIdentity }: DistributionViewProps) {
  const summary = useMemo(() => computeMoneySummary([], data.collections, []), [data.collections])
  const [selectedCollection, setSelectedCollection] = useState<DistCollection | null>(null)

  const effectiveDocContext = useMemo(
    () =>
      documentContext ||
      buildBusinessDocumentContext(businessIdentity, {
        companyName: session.restaurantName,
        branchName: 'Casa Matriz',
      }),
    [documentContext, session.restaurantName, businessIdentity]
  )

  const collectionReceiptData = useMemo(() => {
    if (!selectedCollection) return null
    return distCollectionToReceiptData(selectedCollection, {
      collectorName: selectedCollection.collectedByName,
      customerName: selectedCollection.customerName,
      customerPhone: data.customers.find((c) => c.id === selectedCollection.customerId)?.phone,
      routeName: selectedCollection.routeId,
    })
  }, [selectedCollection, data.customers])

  const handlePrintCollection = async () => {
    if (!selectedCollection) return
    return await printCollectionReceipt(selectedCollection, {
      tenantId: session.tenantId,
      branchId: 'main',
      docContext: effectiveDocContext,
      collectorName: selectedCollection.collectedByName,
      customerName: selectedCollection.customerName,
      customerPhone: data.customers.find((c) => c.id === selectedCollection.customerId)?.phone,
      routeName: selectedCollection.routeId,
    })
  }

  return (
    <Screen title="Cobros" subtitle="Cobranzas registradas en el periodo">
      <div className="grid w-full min-w-0 gap-3">
        <RangePicker dayKeys={session.dayKeys} onChange={session.setDayKeys} />
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <KpiCard label="Cobrado total" value={formatBs(summary.collectionsTotal)} tone="positive" />
          <KpiCard label="Efectivo" value={formatBs(summary.cashCollections)} />
          <KpiCard label="QR" value={formatBs(summary.qrCollections)} />
        </div>

        {data.collections.length === 0 ? (
          <EmptyBlock title="Sin cobros en el periodo" />
        ) : (
          <div className="grid gap-2">
            {data.collections.map((collection) => (
              <div
                key={collection.id}
                className="flex w-full min-w-0 items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="break-words text-xs font-extrabold text-slate-900">{collection.customerName}</p>
                  {collection.pendingConfirmation && (
                    <p className="text-xs font-semibold text-amber-700">Pendiente de confirmación</p>
                  )}
                  <CreditProducts
                    saleId={data.receivables.find((r) => r.id === collection.receivableId)?.saleId}
                    lines={
                      collection.saleLines?.length
                        ? collection.saleLines
                        : data.receivables.find((r) => r.id === collection.receivableId)?.saleLines
                    }
                  />
                  <p className="break-words text-[11px] font-semibold leading-snug text-slate-500">
                    {new Date(collection.createdAt).toLocaleString('es-BO')} · {collection.collectedByName} ·{' '}
                    {collection.method === 'mixed'
                      ? `Mixto (Ef: ${formatBs(collection.cashAmount ?? 0)} / QR: ${formatBs(collection.qrAmount ?? 0)})`
                      : collection.method === 'qr'
                      ? 'QR'
                      : 'Efectivo'}
                    {collection.allocations && collection.allocations.length > 1 && (
                      <span className="ml-1.5 inline-block rounded-md bg-indigo-50 px-1.5 py-0.5 text-[10px] font-bold text-indigo-700">
                        {collection.allocations.length} deudas (FIFO)
                      </span>
                    )}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1.5">
                  <span className="text-sm font-black tabular-nums text-emerald-600">
                    {formatBs(collection.amount)}
                  </span>
                  {!collection.pendingConfirmation && (
                    <button
                      type="button"
                      onClick={() => setSelectedCollection(collection)}
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-bold text-slate-700 hover:bg-slate-100"
                    >
                      <Receipt size={13} /> Comprobante
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {selectedCollection && collectionReceiptData && (
        <CanonicalReceiptModal
          isOpen={Boolean(selectedCollection)}
          onClose={() => setSelectedCollection(null)}
          receiptData={collectionReceiptData}
          documentContext={effectiveDocContext}
          onPrint={handlePrintCollection}
        />
      )}
    </Screen>
  )
}
