import { useEffect, useMemo, useRef, useState } from 'react'
import { submitOperation } from '../data/operationQueue'
import type { DistCreditStatus } from '../types'
import { Plus, Printer, Receipt, Search, Send, ShoppingCart, Trash2, UserPlus } from 'lucide-react'
import { Modal } from '../../../components/ui/Modal'
import { Field, NumberInput, Segmented, TextInput } from '../../../components/ui/Form'
import { ChoiceButton, ChoiceModal } from '../../../components/ui/ChoiceModal'
import { EmptyBlock, Screen } from '../../../components/ui/Screen'
import { CanonicalReceiptModal } from '../../../components/receipt/CanonicalReceiptModal'
import { buildBusinessDocumentContext } from '../../../core/businessIdentity'
import { shareReceipt } from '../../../core/receiptService'
import {
  computeSaleTotal,
  round2,
  splitPayment,
  validateSalePayment,
  validateStockAvailability,
} from '../domain/engine'
import { newOperationId, registerSale, saveCustomer } from '../data/distributionRepository'
import { distSaleToReceiptData, printSaleReceipt } from '../data/distributionReceiptService'
import { useStockIndex } from '../state/useDistributionStore'
import { KpiCard, PrimaryButton, SecondaryButton } from './shared'
import { formatBs, formatQty } from './sharedFormatters'
import type { DistributionViewProps } from './DistributionApp'
import type { DistProduct, DistSale, DistSaleLine, PaymentKind } from '../types'

interface CartLine extends DistSaleLine {
  lineId: string
}

const PAYMENT_OPTIONS: { value: PaymentKind; label: string }[] = [
  { value: 'cash', label: 'Efectivo' },
  { value: 'qr', label: 'QR' },
  { value: 'credit', label: 'Credito' },
  { value: 'mixed', label: 'Mixto' },
]

/**
 * Venta rapida pensada para la calle: buscar, cantidad, precio editable,
 * confirmar. El precio de referencia del producto es solo el valor por
 * defecto; lo que se guarda es el precio aplicado realmente.
 */
export function SellView({ session, data, documentContext, businessIdentity }: DistributionViewProps) {
  const isDistributor = session.role === 'distributor'
  const sourceLocation = isDistributor ? 'route' : 'centralWarehouse'

  const openDispatch = useMemo(
    () => data.openDispatches.find((dispatch) => !session.routeId || dispatch.routeId === session.routeId) ?? null,
    [data.openDispatches, session.routeId],
  )

  const [directRouteId, setDirectRouteId] = useState('route-directa')
  const [isRouteOpen, setIsRouteOpen] = useState(false)
  const routeId = isDistributor ? (session.routeId ?? '') : directRouteId
  const routeName = data.routes.find((route) => route.id === routeId)?.name ?? 'Venta directa'

  const effectiveDocContext = useMemo(
    () =>
      documentContext ||
      buildBusinessDocumentContext(businessIdentity, {
        companyName: session.restaurantName,
        branchName: `RUTA: ${routeName}`,
      }),
    [documentContext, businessIdentity, session.restaurantName, routeName]
  )

  const { central, route } = useStockIndex(data.balances, isDistributor ? session.routeId : null)
  const availableStock = isDistributor ? route : central

  const [search, setSearch] = useState('')
  const [cart, setCart] = useState<CartLine[]>([])
  const [editingProduct, setEditingProduct] = useState<DistProduct | null>(null)
  const [quantity, setQuantity] = useState('1')
  const [unitPrice, setUnitPrice] = useState('0')
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false)
  const [isReceiptModalOpen, setIsReceiptModalOpen] = useState(false)
  const [saleKind, setSaleKind] = useState<'normal' | 'courtesy'>('normal')
  const [courtesyReason, setCourtesyReason] = useState('')
  const [paymentKind, setPaymentKind] = useState<PaymentKind>('cash')
  const [mixedCash, setMixedCash] = useState('0')
  const [mixedQr, setMixedQr] = useState('0')
  const [customerId, setCustomerId] = useState('')
  const [customerSearch, setCustomerSearch] = useState('')
  const [isCustomerOpen, setIsCustomerOpen] = useState(false)
  const [newCustomerName, setNewCustomerName] = useState('')
  const [newCustomerIdentity, setNewCustomerIdentity] = useState('')
  const [newCustomerPhone, setNewCustomerPhone] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [lastSale, setLastSale] = useState<DistSale | null>(null)
  const [printState, setPrintState] = useState<{ ok: boolean; message: string; uncertain?: boolean } | null>(null)
  const [isPrinting, setIsPrinting] = useState(false)
  useEffect(() => {
    if (!lastSale?.pendingConfirmation) return
    const confirmed = data.sales.find(s => s.id === lastSale.id && !s.pendingConfirmation)
    if (!confirmed) return
    const update = window.setTimeout(() => { setLastSale(confirmed); setPrintState(null) }, 0)
    return () => window.clearTimeout(update)
  }, [data.sales, lastSale])

  // Un id de operacion por intento de venta: evita duplicar por doble toque y
  // permite reintentar la sincronizacion sin crear una venta nueva.
  const operationIdRef = useRef<string | null>(null)

  const activeProducts = useMemo(() => data.products.filter((product) => product.active !== false), [data.products])

  const filteredProducts = useMemo(() => {
    const term = search.trim().toLowerCase()
    const list = term
      ? activeProducts.filter(
          (product) =>
            product.name.toLowerCase().includes(term) ||
            (product.presentation || '').toLowerCase().includes(term) ||
            product.category.toLowerCase().includes(term),
        )
      : activeProducts
    return list
  }, [activeProducts, search])

  const total = computeSaleTotal(cart)
  const selectedCustomer = data.customers.find((customer) => customer.id === customerId) ?? null

  const filteredCustomers = useMemo(() => {
    const term = customerSearch.trim().toLowerCase()
    const list = term ? data.customers.filter((customer) => [customer.name, customer.customerCode, customer.identityNumber, customer.phone].join(' ').toLowerCase().includes(term)) : data.customers
    return list.filter(customer => customer.active !== false).slice(0, 30)
  }, [customerSearch, data.customers])

  const openProduct = (product: DistProduct) => {
    setError(null)
    setEditingProduct(product)
    setQuantity('1')
    setUnitPrice(String(product.referencePrice))
  }

  const addToCart = () => {
    if (!editingProduct) return
    const qty = round2(Number(quantity))
    const price = round2(Number(unitPrice))
    if (!(qty > 0)) {
      setError('La cantidad debe ser mayor a cero.')
      return
    }
    if (price < 0) {
      setError('El precio no puede ser negativo.')
      return
    }

    setCart((current) => [
      ...current,
      {
        lineId: newOperationId('line'),
        productId: editingProduct.id,
        productNameSnapshot: editingProduct.presentation
          ? `${editingProduct.name} - ${editingProduct.presentation}`
          : editingProduct.name,
        quantity: qty,
        unitType: editingProduct.unitType,
        actualUnitPrice: price,
        subtotal: round2(qty * price),
      },
    ])
    setEditingProduct(null)
    setError(null)
  }

  const removeLine = (lineId: string) => {
    setCart((current) => current.filter((line) => line.lineId !== lineId))
  }

  const resetSale = () => {
    setCart([])
    setCustomerId('')
    setPaymentKind('cash')
    setMixedCash('0')
    setMixedQr('0')
    setLastSale(null)
    setError(null)
    setPrintState(null)
    setIsCheckoutOpen(false)
    operationIdRef.current = null
  }

  const createCustomer = async () => {
    if (!newCustomerName.trim()) return
    try {
    const customer = await saveCustomer({
      name: newCustomerName,
      identityNumber: newCustomerIdentity,
      phone: newCustomerPhone,
      routeId: routeId || undefined,
    })
    setCustomerId(customer.id)
    setNewCustomerName('')
    setNewCustomerPhone('')
    setNewCustomerIdentity('')
    setIsCustomerOpen(false)
    } catch (err) { setError((err as Error).message) }
  }

  const confirmSale = async () => {
    if (isSubmitting) return
    setError(null)

    if (cart.length === 0) {
      setError('Agrega al menos un producto.')
      return
    }
    if (isDistributor && !openDispatch) {
      setError('Tu ruta no tiene un despacho abierto. Pide a almacen que registre tu carga.')
      return
    }

    const isCourtesy = saleKind === 'courtesy'
    if (isCourtesy && courtesyReason.trim().length < 4) {
      setError('La venta de cortesía requiere un motivo de al menos 4 caracteres.')
      return
    }

    const cashInput = round2(Number(mixedCash) || 0)
    const qrInput = round2(Number(mixedQr) || 0)
    const split = isCourtesy
      ? { cashAmount: 0, qrAmount: 0, creditAmount: 0 }
      : splitPayment(total, paymentKind, {
          cashAmount: cashInput,
          qrAmount: qrInput,
          creditAmount: round2(total - cashInput - qrInput),
        })

    if (!isCourtesy) {
      const paymentError = validateSalePayment(total, split)
      if (paymentError) {
        setError(paymentError)
        return
      }
      if (split.creditAmount > 0 && !customerId) {
        setError('Una venta con credito necesita cliente.')
        return
      }
    }

    if (selectedCustomer) {
      if (!selectedCustomer.identityNumber) {
        setError('Completa el CI del cliente antes de vender.')
        return
      }
      if (!isCourtesy && split.creditAmount > 0) {
        setIsSubmitting(true)
        let freshStatus: DistCreditStatus
        try {
          freshStatus = await submitOperation<DistCreditStatus>(
            'creditStatus',
            { customerId: selectedCustomer.id },
            newOperationId('credit-status'),
          )
        } catch (e) {
          setIsSubmitting(false)
          setError((e as Error).message)
          return
        }
        setIsSubmitting(false)
        if (freshStatus.blocked) {
          const blockDays = freshStatus.creditBlockDays || data.supportSettings.creditBlockDays || 7
          setError(
            `Venta a crédito bloqueada: el cliente tiene créditos pendientes de ${blockDays} días o más. Requiere autorización de administración.`,
          )
          return
        }
      }
    }

    const stockError = validateStockAvailability(
      cart.map((line) => ({
        productId: line.productId,
        productName: line.productNameSnapshot,
        quantity: line.quantity,
        unitType: line.unitType,
      })),
      availableStock,
    )
    if (stockError) {
      setError(stockError)
      return
    }

    setIsSubmitting(true)
    try {
      if (!operationIdRef.current) operationIdRef.current = newOperationId('sale')

      const sale = await registerSale({
        operationId: operationIdRef.current,
        sourceLocation,
        routeId,
        routeName,
        sellerUid: session.uid,
        sellerName: session.userName,
        // Una venta de Administración sale del almacén central y no pertenece
        // al despacho abierto que pueda estar visible en paralelo.
        dispatchId: isDistributor ? openDispatch?.id : undefined,
        customerId: customerId || undefined,
        customerName: selectedCustomer?.name,
        customerCode: selectedCustomer?.customerCode || selectedCustomer?.identityNumber,
        lines: cart.map((line) => ({
          productId: line.productId,
          productNameSnapshot: line.productNameSnapshot,
          quantity: line.quantity,
          unitType: line.unitType,
          actualUnitPrice: isCourtesy ? 0 : line.actualUnitPrice,
          subtotal: isCourtesy ? 0 : line.subtotal,
          referenceUnitPriceSnapshot: line.actualUnitPrice,
          referenceSubtotal: line.subtotal,
        })),
        total: isCourtesy ? 0 : total,
        paymentKind: isCourtesy ? 'cash' : paymentKind,
        cashAmount: split.cashAmount,
        qrAmount: split.qrAmount,
        creditAmount: split.creditAmount,
        saleKind: isCourtesy ? 'courtesy' : 'normal',
        courtesyReason: isCourtesy ? courtesyReason.trim() : undefined,
      })

      setIsCheckoutOpen(false)
      setCart([])
      setSaleKind('normal')
      setCourtesyReason('')
      operationIdRef.current = null
      setPrintState(
        sale.pendingConfirmation
          ? {
              ok: false,
              message: 'Venta pendiente de confirmación al sincronizar. Revisa Operaciones pendientes.',
            }
          : null,
      )
      setLastSale(sale)
    } catch (submitError) {
      if ((submitError as { rejected?: boolean }).rejected) operationIdRef.current = null
      setError((submitError as Error).message || 'No se pudo registrar la venta.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const lastSaleCustomer = useMemo(
    () => (lastSale?.customerId ? data.customers.find((c) => c.id === lastSale.customerId) : null),
    [data.customers, lastSale]
  )

  const lastSaleReceiptData = useMemo(() => {
    if (!lastSale) return null
    return distSaleToReceiptData(lastSale, {
      routeName,
      distributorName: session.userName,
      creditBalance: lastSale.creditAmount,
      customerPhone: lastSaleCustomer?.phone,
      isCopy: Boolean(printState?.ok || printState?.uncertain),
    })
  }, [lastSale, routeName, session.userName, lastSaleCustomer?.phone, printState?.ok, printState?.uncertain])

  const handlePrintSale = async () => {
    if (!lastSale || isPrinting || lastSale.pendingConfirmation) return
    setIsPrinting(true)
    try {
      const res = await printSaleReceipt(lastSale, {
        tenantId: session.tenantId,
        branchId: 'main',
        docContext: effectiveDocContext,
        isCopy: Boolean(printState?.ok || printState?.uncertain),
        routeName,
        distributorName: session.userName,
        creditBalance: lastSale.creditAmount,
        customerPhone: lastSaleCustomer?.phone,
      })
      setPrintState(res)
      return res
    } finally {
      setIsPrinting(false)
    }
  }

  const handleShareSale = async () => {
    if (!lastSale || !lastSaleReceiptData) return
    await shareReceipt(effectiveDocContext, lastSaleReceiptData, {
      customerPhone: lastSaleCustomer?.phone,
    })
  }

  const mixedRemainder = round2(total - (Number(mixedCash) || 0) - (Number(mixedQr) || 0))

  return (
    <Screen
      title="Vender"
      subtitle={
        isDistributor
          ? openDispatch
            ? `Ruta ${routeName} · despacho abierto`
            : 'Sin despacho abierto'
          : 'Venta directa desde almacen central'
      }
    >
      <div className="flex w-full min-w-0 flex-col gap-3">
        {!isDistributor && (
          <div className="w-full rounded-2xl border border-slate-200 bg-white p-3">
            <Field label="Canal de la venta" hint="El stock se descuenta del almacen central.">
              <ChoiceButton label={routeName} placeholder="Selecciona una ruta" onClick={() => setIsRouteOpen(true)} />
            </Field>
          </div>
        )}

        {isDistributor && !openDispatch && (
          <p className="rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800">
            Tu ruta no tiene despacho abierto: no se pueden registrar ventas todavia.
          </p>
        )}

                <div className="flex w-full min-w-0 items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-xs">
          <div className="min-w-0 flex-1">
            <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">Cliente de entrega</span>
            <span className="block truncate text-xs font-black text-slate-900">
              {selectedCustomer ? `${selectedCustomer.name} (${selectedCustomer.customerCode || selectedCustomer.identityNumber || 'Asignado'})` : 'Venta rápida (sin cliente)'}
            </span>
          </div>
          <SecondaryButton
            data-tutorial-target="sell-customer-selector"
            data-customer-id={customerId || undefined}
            onClick={() => setIsCustomerOpen(true)}
            
          >
            {selectedCustomer ? 'Cambiar' : 'Elegir cliente'}
          </SecondaryButton>
        </div>

        <div className="relative w-full">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <TextInput
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar producto..."
            className="pl-9"
          />
        </div>

        <div className="grid w-full min-w-0 grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-4" data-tutorial-target="sell-products-catalog">
          {filteredProducts.map((product) => {
            const stock = availableStock.get(product.id) ?? 0
            return (
              <button
                key={product.id}
                type="button"
                data-tutorial-target={`product-card-${product.id}`}
                data-product-id={product.id}
                onClick={() => openProduct(product)}
                className="flex min-h-[116px] w-full min-w-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white text-left shadow-sm transition active:scale-[0.99] active:bg-slate-50"
              >
                {product.photoDataUrl && <img src={product.photoDataUrl} alt={`Foto de ${product.name}`} onError={(event) => { event.currentTarget.style.display = 'none' }} className="aspect-[16/9] w-full object-cover" />}
                <span className="flex min-w-0 flex-1 flex-col justify-between gap-2 p-3">
                  <span className="block text-xs font-extrabold leading-snug text-slate-900">{product.name}</span>
                  <span className="flex flex-wrap items-end justify-between gap-1">
                    <span className={`text-[10px] font-bold tabular-nums ${stock > 0 ? 'text-slate-500' : 'text-rose-600'}`}>
                      {stock > 0 ? `${formatQty(stock, product.unitType)} disponibles` : 'Sin existencia'}
                    </span>
                    <span className="text-xs font-black tabular-nums" style={{ color: 'var(--primary)' }}>
                    {formatBs(product.referencePrice)}
                    </span>
                  </span>
                </span>
              </button>
            )
          })}
        </div>

        {filteredProducts.length === 0 && (
          <EmptyBlock title="Sin productos" description="Revisa el catalogo o el termino de busqueda." />
        )}

        {/* Espacio para que la barra de carrito no tape el ultimo producto */}
        {cart.length > 0 && <div className="h-20" aria-hidden />}
      </div>

      {cart.length > 0 && (
        <div
          data-tutorial-target="sell-cart-summary" className="fixed bottom-0 left-0 right-0 z-30 border-t border-slate-200 bg-white px-3 py-2.5"
          style={{ paddingBottom: 'calc(0.625rem + var(--safe-bottom) + var(--bottom-nav-height))' }}
        >
          <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] font-extrabold uppercase text-slate-500">
                {cart.length} linea{cart.length > 1 ? 's' : ''}
              </p>
              <p className="truncate text-lg font-black tabular-nums text-slate-900">{formatBs(total)}</p>
            </div>
            <PrimaryButton data-tutorial-target="sell-checkout-btn" onClick={() => setIsCheckoutOpen(true)}>
              <ShoppingCart size={16} /> Cobrar
            </PrimaryButton>
          </div>
        </div>
      )}

      {!isDistributor && <ChoiceModal
        isOpen={isRouteOpen}
        onClose={() => setIsRouteOpen(false)}
        title="Canal de la venta"
        subtitle="La mercadería saldrá del almacén central"
        searchable
        options={data.routes.map(option => ({ value: option.id, label: option.name }))}
        selectedValue={directRouteId}
        onSelect={setDirectRouteId}
      />}

      {/* Cantidad y precio */}
      <Modal
        isOpen={Boolean(editingProduct)}
        onClose={() => setEditingProduct(null)}
        title={editingProduct?.name ?? ''}
        subtitle={editingProduct?.presentation}
        footer={
          <PrimaryButton data-tutorial-target="sell-add-to-cart-btn" full onClick={addToCart}>
            <Plus size={16} /> Agregar {formatBs(round2(Number(quantity) * Number(unitPrice)))}
          </PrimaryButton>
        }
      >
        <div className="grid gap-3">
          <Field
            label={editingProduct?.unitType === 'kg' ? 'Cantidad (kg)' : 'Cantidad'}
            hint={`Disponible: ${formatQty(availableStock.get(editingProduct?.id ?? '') ?? 0, editingProduct?.unitType ?? 'unit')}`}
          >
            <NumberInput
              value={quantity}
              min={0}
              step={editingProduct?.unitType === 'kg' ? 0.1 : 1}
              onChange={(event) => setQuantity(event.target.value)}
            />
          </Field>
          <Field
            label={editingProduct?.unitType === 'kg' ? 'Precio por kilo (Bs)' : 'Precio unitario (Bs)'}
            hint={isDistributor ? "Precio definido por Administración." : "Solo Administración puede modificarlo."}
          >
            <NumberInput disabled={isDistributor} value={unitPrice} min={0} step={0.5} onChange={(event) => setUnitPrice(event.target.value)} />
          </Field>

          {/* En granel el calculo tiene que estar a la vista: se pesa y se cobra. */}
          <div className="flex items-center justify-between gap-2 rounded-2xl bg-slate-50 px-3 py-2.5">
            <span className="text-[11px] font-bold text-slate-500">
              {round2(Number(quantity) || 0)}
              {editingProduct?.unitType === 'kg' ? ' kg' : editingProduct?.unitType === 'package' ? ' paq' : ' u'} ×{' '}
              {formatBs(round2(Number(unitPrice) || 0))}
            </span>
            <span className="text-base font-black tabular-nums text-slate-900">
              {formatBs(round2((Number(quantity) || 0) * (Number(unitPrice) || 0)))}
            </span>
          </div>

          {error && <p className="text-xs font-bold text-rose-600">{error}</p>}
        </div>
      </Modal>

      {/* Cobro */}
      <Modal
        isOpen={isCheckoutOpen}
        onClose={() => setIsCheckoutOpen(false)}
        title={saleKind === 'courtesy' ? 'Registrar cortesía / muestra' : 'Cobrar venta'}
        subtitle={saleKind === 'courtesy' ? 'Sin cobro comercial (Bs 0.00)' : formatBs(total)}
        footer={
          <PrimaryButton data-tutorial-target="sell-confirm-btn" full disabled={isSubmitting} onClick={() => void confirmSale()}>
            {isSubmitting
              ? 'Registrando...'
              : saleKind === 'courtesy'
                ? 'Confirmar entrega de cortesía'
                : `Confirmar ${formatBs(total)}`}
          </PrimaryButton>
        }
      >
        <div className="grid gap-3">
          <Field label="Tipo de entrega / venta">
            <Segmented
              value={saleKind}
              options={[
                { value: 'normal', label: 'Venta comercial' },
                { value: 'courtesy', label: 'Muestra / Cortesía' },
              ]}
              onChange={(value) => {
                setSaleKind(value)
                setError(null)
              }}
            />
          </Field>

          {saleKind === 'courtesy' && (
            <div className="rounded-2xl border border-indigo-200 bg-indigo-50/70 p-3">
              <p className="text-xs font-bold text-indigo-900">Entrega de muestra comercial auditada</p>
              <p className="mt-0.5 text-[11px] text-indigo-700">
                Se descuenta del stock físico de ruta y queda registrada con su valor referencial ({formatBs(total)}) pero sin movimiento monetario.
              </p>
              <div className="mt-2.5">
                <Field label="Motivo de la cortesía" required hint="Mínimo 4 caracteres">
                  <TextInput
                    value={courtesyReason}
                    onChange={(e) => setCourtesyReason(e.target.value)}
                    placeholder="Ej. Muestra para degustación de nuevo cliente..."
                  />
                </Field>
              </div>
            </div>
          )}

          <div className="grid gap-1.5">
            {cart.map((line) => (
              <div key={line.lineId} className="flex items-center justify-between gap-2 rounded-2xl bg-slate-50 px-3 py-2">
                <div className="min-w-0">
                  <p className="break-words text-xs font-extrabold text-slate-900">{line.productNameSnapshot}</p>
                  <p className="text-[11px] font-semibold text-slate-500">
                    {formatQty(line.quantity, line.unitType)} × {formatBs(line.actualUnitPrice)}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="text-xs font-black tabular-nums text-slate-900">
                    {saleKind === 'courtesy' ? 'Bs 0.00 (Cortesía)' : formatBs(line.subtotal)}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeLine(line.lineId)}
                    aria-label="Quitar linea"
                    className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-400 hover:bg-white hover:text-rose-600"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            ))}
          </div>

          {saleKind === 'normal' && (
            <>
              <div data-tutorial-target="sell-payment-methods" className="w-full"><Field label="Forma de pago">
                <Segmented value={paymentKind} options={PAYMENT_OPTIONS} onChange={setPaymentKind} /></Field></div>

              {paymentKind === 'mixed' && (
                <div className="grid gap-2 sm:grid-cols-2">
                  <Field label="Efectivo (Bs)">
                    <NumberInput value={mixedCash} min={0} onChange={(event) => setMixedCash(event.target.value)} />
                  </Field>
                  <Field label="QR (Bs)">
                    <NumberInput value={mixedQr} min={0} onChange={(event) => setMixedQr(event.target.value)} />
                  </Field>
                  <p className="text-[11px] font-bold text-slate-500 sm:col-span-2">
                    Resto a credito: {formatBs(Math.max(0, mixedRemainder))}
                    {mixedRemainder < 0 ? ' (el desglose supera el total)' : ''}
                  </p>
                </div>
              )}
            </>
          )}

          <Field
            label="Cliente"
            hint={
              saleKind === 'courtesy'
                ? 'Opcional para identificar a quién se entregó.'
                : paymentKind === 'credit' || mixedRemainder > 0
                  ? 'Obligatorio cuando hay credito.'
                  : 'Opcional en venta al contado.'
            }
          >
            <SecondaryButton data-tutorial-target="sell-customer-selector" full onClick={() => setIsCustomerOpen(true)}>
              {selectedCustomer ? `${selectedCustomer.name} · ${selectedCustomer.customerCode || selectedCustomer.identityNumber || ''}` : 'Seleccionar cliente'}
            </SecondaryButton>
          </Field>

          {error && <p className="text-xs font-bold text-rose-600">{error}</p>}
        </div>
      </Modal>

      {/* Cliente */}
      <Modal isOpen={isCustomerOpen} onClose={() => setIsCustomerOpen(false)} title="Cliente">
        <div className="grid gap-3">
          <TextInput
            value={customerSearch}
            onChange={(event) => setCustomerSearch(event.target.value)}
            placeholder="Nombre, codigo o carnet..."
          />
          <div className="grid max-h-56 gap-1.5 overflow-y-auto">
            <button
              type="button"
              onClick={() => {
                setCustomerId('')
                setIsCustomerOpen(false)
              }}
              className="min-h-[44px] rounded-2xl border border-slate-200 px-3 text-left text-xs font-bold text-slate-600"
            >
              Sin cliente (venta rapida al contado)
            </button>
            {filteredCustomers.map((customer) => (
              <button
                key={customer.id}
                type="button"
                data-tutorial-target={`customer-item-${customer.id}`}
                data-customer-id={customer.id}
                onClick={() => {
                  setCustomerId(customer.id)
                  setIsCustomerOpen(false)
                }}
                className="min-h-[44px] rounded-2xl border border-slate-200 px-3 text-left text-xs font-bold text-slate-800"
              >
                {customer.name} · {customer.customerCode || customer.identityNumber || 'CI pendiente'}
                {customer.phone ? <span className="ml-2 text-slate-400">{customer.phone}</span> : null}
              </button>
            ))}
          </div>

          <div className="rounded-2xl border border-dashed border-slate-300 p-3">
            <p className="mb-2 text-[11px] font-extrabold uppercase text-slate-500">Cliente nuevo</p>
            <div className="grid gap-2">
              <TextInput
                value={newCustomerName}
                onChange={(event) => setNewCustomerName(event.target.value)}
                placeholder="Nombre"
              />
              <TextInput
                value={newCustomerPhone}
                onChange={(event) => setNewCustomerPhone(event.target.value)}
                placeholder="Telefono (opcional)"
              />
              <TextInput value={newCustomerIdentity} onChange={e => setNewCustomerIdentity(e.target.value)} placeholder="CI / código del cliente" />
              {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
              <SecondaryButton full onClick={() => void createCustomer()}>
                <UserPlus size={16} /> Crear y seleccionar
              </SecondaryButton>
            </div>
          </div>
        </div>
      </Modal>

      {/* Venta confirmada */}
      <Modal
        isOpen={Boolean(lastSale)}
        onClose={resetSale}
        title="Venta registrada"
        subtitle={lastSale ? formatBs(lastSale.total) : ''}
        footer={
          <PrimaryButton full onClick={resetSale}>
            <Plus size={16} /> Nueva venta
          </PrimaryButton>
        }
      >
        {lastSale && (
          <div className="grid gap-3">
            <div className="grid grid-cols-2 gap-2">
              <KpiCard label="Total" value={formatBs(lastSale.total)} tone="primary" />
              <KpiCard
                label={lastSale.creditAmount > 0 ? 'Saldo generado' : 'Cobrado'}
                value={formatBs(lastSale.creditAmount > 0 ? lastSale.creditAmount : lastSale.total)}
                tone={lastSale.creditAmount > 0 ? 'warning' : 'positive'}
              />
            </div>
            {lastSale.pendingConfirmation ? (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-xs font-bold text-amber-900">
                Venta registrada localmente (pendiente de confirmación con el servidor). El comprobante definitivo y la impresión estarán disponibles una vez sincronizada.
              </div>
            ) : (
              <>
                <SecondaryButton
                  full
                  onClick={() => setIsReceiptModalOpen(true)}
                >
                  <Receipt size={16} /> Ver / Compartir comprobante digital
                </SecondaryButton>

                <SecondaryButton
                  full
                  disabled={isPrinting}
                  onClick={() => void handlePrintSale()}
                >
                  <Printer size={16} />
                  {isPrinting
                    ? 'Imprimiendo...'
                    : printState?.uncertain
                    ? 'Imprimir copia (revisa el papel)'
                    : printState?.ok
                    ? 'Imprimir copia'
                    : printState
                    ? 'Reintentar impresión'
                    : 'Imprimir ticket'}
                </SecondaryButton>

                {printState && (
                  <p
                    className={`rounded-2xl px-3 py-2 text-[11px] font-bold ${
                      printState.ok ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-800'
                    }`}
                  >
                    {printState.message}
                  </p>
                )}

                <SecondaryButton full onClick={() => void handleShareSale()}>
                  <Send size={16} /> Compartir por WhatsApp
                </SecondaryButton>
              </>
            )}
          </div>
        )}
      </Modal>

      {isReceiptModalOpen && lastSaleReceiptData && (
        <CanonicalReceiptModal
          isOpen={isReceiptModalOpen}
          onClose={() => setIsReceiptModalOpen(false)}
          receiptData={lastSaleReceiptData}
          documentContext={effectiveDocContext}
          onPrint={handlePrintSale}
        />
      )}
    </Screen>
  )
}
