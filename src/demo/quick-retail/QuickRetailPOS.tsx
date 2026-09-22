import { useState } from 'react'
import {
  Scale,
  Package,
  Trash2,
  CheckCircle2,
  QrCode,
  Banknote,
  Split,
  X,
  Search,
} from 'lucide-react'
import { createSaleLine, saleTotal, validatePayments, type SaleLine } from '../../core/sales'
import type { RetailProduct, CompletedRetailSale } from '../mocks/retailMock'

export function QuickRetailPOS({
  products,
  onCompleteSale,
}: {
  products: RetailProduct[]
  onCompleteSale: (sale: CompletedRetailSale) => void
}) {
  const [cart, setCart] = useState<SaleLine[]>([])
  const [selectedCategory, setSelectedCategory] = useState<string>('all')
  const [searchTerm, setSearchTerm] = useState('')

  // Modal para ingresar peso en gramos
  const [weightModalProduct, setWeightModalProduct] = useState<RetailProduct | null>(null)
  const [inputGrams, setInputGrams] = useState<number>(325)

  // Modal de pago
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false)
  const [paymentKind, setPaymentKind] = useState<'cash' | 'qr' | 'mixed'>('cash')
  const [cashInput, setCashInput] = useState<string>('')
  const [qrInput, setQrInput] = useState<string>('')
  const [customerName, setCustomerName] = useState<string>('')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [successReceipt, setSuccessReceipt] = useState<string | null>(null)

  const categories = Array.from(new Set(products.map((p) => p.category)))

  const filteredProducts = products.filter((p) => {
    if (selectedCategory !== 'all' && p.category !== selectedCategory) return false
    if (!searchTerm.trim()) return true
    return p.name.toLowerCase().includes(searchTerm.toLowerCase())
  })

  const cartTotalMinor = cart.length ? saleTotal(cart) : 0
  const cartTotalBs = (cartTotalMinor / 100).toFixed(2)

  const handleAddUnitProduct = (product: RetailProduct) => {
    try {
      const newLine = createSaleLine(product, 1)
      setCart((prev) => {
        const existingIdx = prev.findIndex((l) => l.productId === product.id)
        if (existingIdx >= 0) {
          const updated = [...prev]
          const cur = updated[existingIdx]
          updated[existingIdx] = createSaleLine(product, cur.enteredQuantity + 1)
          return updated
        }
        return [...prev, newLine]
      })
    } catch (err: any) {
      alert(err.message)
    }
  }

  const handleConfirmWeight = () => {
    if (!weightModalProduct) return
    try {
      const newLine = createSaleLine(weightModalProduct, inputGrams)
      setCart((prev) => [...prev, newLine])
      setWeightModalProduct(null)
      setInputGrams(325)
    } catch (err: any) {
      alert(err.message)
    }
  }

  const handleRemoveLine = (index: number) => {
    setCart((prev) => prev.filter((_, idx) => idx !== index))
  }

  const handleOpenCheckout = () => {
    if (!cart.length) return
    setPaymentKind('cash')
    setCashInput((cartTotalMinor / 100).toFixed(2))
    setQrInput('0.00')
    setErrorMessage(null)
    setIsCheckoutOpen(true)
  }

  const handleProcessPayment = () => {
    setErrorMessage(null)
    const totalMinor = cartTotalMinor
    let cashMinor = 0
    let qrMinor = 0

    if (paymentKind === 'cash') {
      cashMinor = totalMinor
      qrMinor = 0
    } else if (paymentKind === 'qr') {
      cashMinor = 0
      qrMinor = totalMinor
    } else {
      cashMinor = Math.round((parseFloat(cashInput) || 0) * 100)
      qrMinor = Math.round((parseFloat(qrInput) || 0) * 100)
    }

    try {
      // Reutiliza la validación pura de src/core/sales.ts
      validatePayments(totalMinor, cashMinor, qrMinor)

      const receiptNumber = `TCK-${String(Math.floor(1000 + Math.random() * 9000))}`
      const newSale: CompletedRetailSale = {
        id: `sale-${Date.now()}`,
        receiptNumber,
        timestamp: new Date().toISOString(),
        lines: [...cart],
        totalMinor,
        paymentKind,
        cashMinor,
        qrMinor,
        customerName: customerName.trim() || undefined,
        cashierName: 'Caja Mostrador',
      }

      onCompleteSale(newSale)
      setCart([])
      setIsCheckoutOpen(false)
      setSuccessReceipt(receiptNumber)
      setTimeout(() => setSuccessReceipt(null), 4000)
    } catch (err: any) {
      setErrorMessage(err.message || 'Error al validar importes de pago')
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Columna Izquierda: Catálogo de Productos */}
      <div className="lg:col-span-2 space-y-4">
        {/* Banner de éxito temporal */}
        {successReceipt && (
          <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-xl flex items-center justify-between text-xs font-semibold animate-fadeIn">
            <span className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              ¡Venta registrada con éxito! Comprobante: {successReceipt}
            </span>
          </div>
        )}

        {/* Buscador y Categorías */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs space-y-3">
          <div className="flex items-center gap-3">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Buscar por nombre o rubro..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-xs border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-400"
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-1.5">
            <button
              onClick={() => setSelectedCategory('all')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition ${
                selectedCategory === 'all'
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              Todos los productos
            </button>
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition ${
                  selectedCategory === cat
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* Grid de Productos */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {filteredProducts.map((p) => {
            const isWeight = p.soldBy === 'weight'
            const priceBs = (p.priceMinor / 100).toFixed(2)

            return (
              <button
                key={p.id}
                onClick={() => {
                  if (isWeight) {
                    setWeightModalProduct(p)
                  } else {
                    handleAddUnitProduct(p)
                  }
                }}
                className="p-4 bg-white rounded-2xl border border-slate-200/80 hover:border-slate-400 hover:shadow-xs text-left transition flex flex-col justify-between group"
              >
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span
                      className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                        isWeight ? 'bg-amber-100 text-amber-900' : 'bg-blue-100 text-blue-900'
                      }`}
                    >
                      {isWeight ? <Scale className="w-3 h-3" /> : <Package className="w-3 h-3" />}
                      {isWeight ? 'Por Peso' : 'Por Unidad'}
                    </span>
                    <span className="text-[11px] text-slate-400">{p.category}</span>
                  </div>
                  <h3 className="text-sm font-bold text-slate-900 group-hover:text-teal-700 transition">
                    {p.name}
                  </h3>
                </div>

                <div className="mt-4 pt-2 border-t border-slate-100 flex items-center justify-between">
                  <div className="text-sm font-extrabold text-slate-900">
                    Bs {priceBs}
                    <span className="text-[11px] font-normal text-slate-500">
                      {isWeight ? '/kg' : ''}
                    </span>
                  </div>
                  <span className="w-7 h-7 rounded-lg bg-slate-100 text-slate-700 flex items-center justify-center font-bold text-xs group-hover:bg-slate-900 group-hover:text-white transition">
                    +
                  </span>
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* Columna Derecha: Carrito Mixto */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs flex flex-col h-full min-h-[500px]">
        {/* Header Carrito */}
        <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/70 rounded-t-2xl">
          <div>
            <h2 className="text-sm font-bold text-slate-900">Venta Actual</h2>
            <p className="text-xs text-slate-500">Carrito mixto: peso y unidades</p>
          </div>
          {cart.length > 0 && (
            <button
              onClick={() => setCart([])}
              className="text-xs text-rose-600 hover:text-rose-800 font-medium"
            >
              Vaciar
            </button>
          )}
        </div>

        {/* Lista de Líneas */}
        <div className="flex-1 p-4 overflow-y-auto space-y-3 divide-y divide-slate-100">
          {cart.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center text-slate-400 py-12">
              <Package className="w-10 h-10 mb-2 opacity-40" />
              <p className="text-xs">El carrito está vacío</p>
              <p className="text-[11px] text-slate-400">Selecciona productos a la izquierda</p>
            </div>
          ) : (
            cart.map((line, idx) => {
              const isWeight = line.soldBy === 'weight'
              const subtotalBs = (line.subtotalMinor / 100).toFixed(2)
              const unitPriceBs = (line.unitPriceMinor / 100).toFixed(2)

              return (
                <div key={idx} className="pt-3 first:pt-0 flex items-start justify-between gap-2 text-xs">
                  <div className="flex-1">
                    <div className="font-bold text-slate-900">{line.productNameSnapshot}</div>
                    <div className="text-slate-500 text-[11px] mt-0.5">
                      {isWeight ? (
                        <span>
                          <strong>{line.enteredQuantity} g</strong> (a Bs {unitPriceBs}/kg)
                        </span>
                      ) : (
                        <span>
                          <strong>{line.enteredQuantity} unid.</strong> x Bs {unitPriceBs}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <span className="font-extrabold text-slate-900">Bs {subtotalBs}</span>
                    <button
                      onClick={() => handleRemoveLine(idx)}
                      className="p-1 text-slate-400 hover:text-rose-600 rounded transition"
                      title="Quitar"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )
            })
          )}
        </div>

        {/* Footer Totales & Cobrar */}
        <div className="p-4 border-t border-slate-200 bg-slate-50/50 rounded-b-2xl space-y-3">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Líneas agregadas:</span>
            <span className="font-semibold text-slate-800">{cart.length}</span>
          </div>

          <div className="flex items-baseline justify-between pt-1">
            <span className="text-sm font-bold text-slate-700">Total a Pagar:</span>
            <span className="text-2xl font-black text-slate-900">Bs {cartTotalBs}</span>
          </div>

          <button
            onClick={handleOpenCheckout}
            disabled={cart.length === 0}
            className={`w-full py-3 rounded-xl font-bold text-sm transition flex items-center justify-center gap-2 shadow-sm ${
              cart.length > 0
                ? 'bg-slate-900 hover:bg-slate-800 text-white cursor-pointer'
                : 'bg-slate-200 text-slate-400 cursor-not-allowed'
            }`}
          >
            <Banknote className="w-4 h-4" />
            Cobrar Venta (Bs {cartTotalBs})
          </button>
        </div>
      </div>

      {/* MODAL PARA INGRESAR PESO (GRAMOS) */}
      {weightModalProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 animate-fadeIn">
          <div className="bg-white rounded-2xl max-w-sm w-full p-5 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Scale className="w-5 h-5 text-amber-600" />
                <h3 className="text-sm font-bold text-slate-900">Pesar: {weightModalProduct.name}</h3>
              </div>
              <button
                onClick={() => setWeightModalProduct(null)}
                className="text-slate-400 hover:text-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="text-xs text-slate-500">
              Precio unitario: <strong>Bs {(weightModalProduct.priceMinor / 100).toFixed(2)} / kg</strong>
            </div>

            {/* Input en gramos */}
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                Peso en balanza (Gramos)
              </label>
              <div className="relative">
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={inputGrams}
                  onChange={(e) => setInputGrams(parseInt(e.target.value) || 0)}
                  className="w-full text-xl font-bold px-3 py-2 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-400 text-right pr-10"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-400">
                  g
                </span>
              </div>
            </div>

            {/* Botones rápidos de peso */}
            <div className="grid grid-cols-4 gap-2">
              {[100, 250, 325, 500].map((grams) => (
                <button
                  key={grams}
                  type="button"
                  onClick={() => setInputGrams(grams)}
                  className={`py-1.5 text-xs font-bold rounded-lg border transition ${
                    inputGrams === grams
                      ? 'bg-amber-100 border-amber-300 text-amber-900'
                      : 'border-slate-200 text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {grams}g
                </button>
              ))}
            </div>

            {/* Subtotal estimado en vivo */}
            <div className="p-3 bg-slate-50 rounded-xl flex items-center justify-between text-xs">
              <span className="text-slate-600">Subtotal exacto:</span>
              <span className="text-base font-bold text-slate-900">
                Bs{' '}
                {(
                  Number(
                    (BigInt(inputGrams) * BigInt(weightModalProduct.priceMinor) + 500n) / 1000n
                  ) / 100
                ).toFixed(2)}
              </span>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setWeightModalProduct(null)}
                className="flex-1 py-2 text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmWeight}
                className="flex-1 py-2 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-xl transition shadow-xs"
              >
                Agregar al Carrito
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE COBRO / CHECKOUT */}
      {isCheckoutOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 animate-fadeIn">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">Confirmar Pago</h3>
                <p className="text-xs text-slate-500">Selecciona el método y asienta el cobro</p>
              </div>
              <button onClick={() => setIsCheckoutOpen(false)} className="text-slate-400 hover:text-slate-700">
                <X className="w-5 h-5" />
              </button>
            </div>

            {errorMessage && (
              <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded-xl font-medium">
                {errorMessage}
              </div>
            )}

            {/* Total */}
            <div className="p-4 bg-slate-900 text-white rounded-xl flex items-center justify-between">
              <span className="text-xs text-slate-300 uppercase tracking-wider font-semibold">Total Venta</span>
              <span className="text-2xl font-black">Bs {cartTotalBs}</span>
            </div>

            {/* Nombre del cliente opcional */}
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                Cliente (Opcional)
              </label>
              <input
                type="text"
                placeholder="Nombre del cliente para el recibo"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg"
              />
            </div>

            {/* Métodos de Pago */}
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1.5">
                Método de Pago
              </label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setPaymentKind('cash')}
                  className={`p-2.5 rounded-xl border text-xs font-bold transition flex flex-col items-center gap-1.5 ${
                    paymentKind === 'cash'
                      ? 'bg-teal-50 border-teal-400 text-teal-900 ring-2 ring-teal-400/30'
                      : 'border-slate-200 text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <Banknote className="w-4 h-4" />
                  Efectivo
                </button>
                <button
                  type="button"
                  onClick={() => setPaymentKind('qr')}
                  className={`p-2.5 rounded-xl border text-xs font-bold transition flex flex-col items-center gap-1.5 ${
                    paymentKind === 'qr'
                      ? 'bg-teal-50 border-teal-400 text-teal-900 ring-2 ring-teal-400/30'
                      : 'border-slate-200 text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <QrCode className="w-4 h-4" />
                  QR Digital
                </button>
                <button
                  type="button"
                  onClick={() => setPaymentKind('mixed')}
                  className={`p-2.5 rounded-xl border text-xs font-bold transition flex flex-col items-center gap-1.5 ${
                    paymentKind === 'mixed'
                      ? 'bg-teal-50 border-teal-400 text-teal-900 ring-2 ring-teal-400/30'
                      : 'border-slate-200 text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <Split className="w-4 h-4" />
                  Mixto
                </button>
              </div>
            </div>

            {/* Desglose mixto si aplica */}
            {paymentKind === 'mixed' && (
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                <div className="text-xs font-semibold text-slate-700">Dividir importes exactos:</div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[11px] text-slate-500 block mb-1">Efectivo (Bs)</label>
                    <input
                      type="number"
                      step="0.10"
                      value={cashInput}
                      onChange={(e) => setCashInput(e.target.value)}
                      className="w-full px-2.5 py-1 text-xs border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-slate-500 block mb-1">QR (Bs)</label>
                    <input
                      type="number"
                      step="0.10"
                      value={qrInput}
                      onChange={(e) => setQrInput(e.target.value)}
                      className="w-full px-2.5 py-1 text-xs border border-slate-300 rounded-lg"
                    />
                  </div>
                </div>
              </div>
            )}

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsCheckoutOpen(false)}
                className="flex-1 py-2.5 text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition"
              >
                Volver
              </button>
              <button
                type="button"
                onClick={handleProcessPayment}
                className="flex-1 py-2.5 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-xl transition shadow-xs"
              >
                Confirmar Cobro
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
