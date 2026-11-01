import React, { useState } from 'react'
import {
  X,
  Package,
  Plus,
  Trash2,
  AlertTriangle,
  Save,
  Search,
} from 'lucide-react'
import type {
  ParcelBranch,
  ParcelCustomer,
  ParcelItemDeclaration,
  ParcelPackaging,
  ParcelTariffConfig,
} from '../types'
import { calculateParcelPricing } from '../domain/parcelEngine'

interface NewParcelModalProps {
  isOpen: boolean
  onClose: () => void
  branches: ParcelBranch[]
  currentBranchId: string
  existingCustomers: ParcelCustomer[]
  tariffConfig?: ParcelTariffConfig
  onSubmit: (data: {
    originBranchId: string
    destinationBranchId: string
    deliveryType: 'agency' | 'home'
    deliveryAddress?: string
    sender: ParcelCustomer
    recipient: ParcelCustomer
    items: ParcelItemDeclaration[]
    shippingFee: number
    discount: number
    paymentTiming: 'origin_paid' | 'destination_cod'
    paymentMethod: 'cash' | 'qr' | 'transfer'
    prohibitedGoodsNoticeAccepted: boolean
  }) => void
}

function createClientId(prefix: 's' | 'r'): string {
  return `c-${prefix}-${Date.now()}`
}

export function NewParcelModal({
  isOpen,
  onClose,
  branches,
  currentBranchId,
  existingCustomers,
  tariffConfig,
  onSubmit,
}: NewParcelModalProps) {
  const originBranch = branches.find(b => b.id === currentBranchId) || branches[0]
  const defaultDest = branches.find(b => b.id !== currentBranchId) || branches[1]

  const [originId, setOriginId] = useState(originBranch?.id || '')
  const [destinationId, setDestinationId] = useState(defaultDest?.id || '')
  const [deliveryType, setDeliveryType] = useState<'agency' | 'home'>('agency')
  const [deliveryAddress, setDeliveryAddress] = useState('')

  // Remitente
  const [senderName, setSenderName] = useState('')
  const [senderDoc, setSenderDoc] = useState('')
  const [senderPhone, setSenderPhone] = useState('')
  const [senderAddress, setSenderAddress] = useState('')

  // Destinatario
  const [recipientName, setRecipientName] = useState('')
  const [recipientDoc, setRecipientDoc] = useState('')
  const [recipientPhone, setRecipientPhone] = useState('')

  // Contenido declarado
  const [items, setItems] = useState<ParcelItemDeclaration[]>([
    {
      description: '',
      category: 'general',
      quantity: 1,
      packaging: 'caja',
      weightKg: 2,
      declaredValue: 0,
      isFragile: false,
    },
  ])

  // Tarifa y cobro (obtenidos de la configuración vigente)
  const [customBaseFee, setCustomBaseFee] = useState<number | undefined>(undefined)
  const [discount, setDiscount] = useState<number>(0)
  const [paymentTiming, setPaymentTiming] = useState<'origin_paid' | 'destination_cod'>('origin_paid')
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'qr' | 'transfer'>('cash')

  // Advertencia de seguridad (inicia en false por requisito de aceptación explícita)
  const [prohibitedAccepted, setProhibitedAccepted] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const addItemRow = () => {
    setItems([
      ...items,
      {
        description: '',
        category: 'general',
        quantity: 1,
        packaging: 'caja',
        weightKg: 1,
        isFragile: false,
      },
    ])
  }

  const removeItemRow = (index: number) => {
    if (items.length <= 1) return
    setItems(items.filter((_, i) => i !== index))
  }

  const updateItem = <K extends keyof ParcelItemDeclaration>(
    index: number,
    field: K,
    val: ParcelItemDeclaration[K]
  ) => {
    const next = [...items]
    next[index] = { ...next[index], [field]: val }
    setItems(next)
  }

  // Búsqueda rápida de clientes
  const selectSender = (c: ParcelCustomer) => {
    setSenderName(c.name)
    setSenderDoc(c.docNumber || '')
    setSenderPhone(c.phone)
    setSenderAddress(c.address || '')
  }

  const selectRecipient = (c: ParcelCustomer) => {
    setRecipientName(c.name)
    setRecipientDoc(c.docNumber || '')
    setRecipientPhone(c.phone)
  }

  const totalWeight = items.reduce(
    (acc, it) => acc + (typeof it.weightKg === 'number' && Number.isFinite(it.weightKg) ? it.weightKg : 0),
    0
  )
  const pricing = calculateParcelPricing({
    tariffConfig,
    customBaseFee,
    weightKg: totalWeight,
    deliveryType,
    discount,
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!senderName.trim()) {
      setError('Por favor ingresa el nombre o razón social del remitente.')
      return
    }
    if (!senderPhone.trim()) {
      setError('El teléfono del remitente es obligatorio para notificaciones.')
      return
    }
    if (!recipientName.trim()) {
      setError('Por favor ingresa el nombre de la persona que recibirá la encomienda.')
      return
    }
    if (!recipientPhone.trim()) {
      setError('El teléfono del destinatario es obligatorio.')
      return
    }
    if (deliveryType === 'home' && !deliveryAddress.trim()) {
      setError('Para entrega a domicilio debes ingresar la dirección de entrega.')
      return
    }

    const hasEmptyDescription = items.some(it => !it.description.trim())
    if (hasEmptyDescription) {
      setError('Es obligatorio describir el contenido que lleva la encomienda (ej. Ropa, Documentos, Repuestos).')
      return
    }

    if (!prohibitedAccepted) {
      setError('El remitente debe aceptar la declaración jurada sobre sustancias prohibidas y mercancías restringidas.')
      return
    }

    onSubmit({
      originBranchId: originId,
      destinationBranchId: destinationId,
      deliveryType,
      deliveryAddress: deliveryType === 'home' ? deliveryAddress.trim() : undefined,
      sender: {
        id: createClientId('s'),
        name: senderName.trim(),
        docType: senderDoc.trim() ? 'CI' : 'NINGUNO',
        docNumber: senderDoc.trim() || undefined,
        phone: senderPhone.trim(),
        address: senderAddress.trim() || undefined,
      },
      recipient: {
        id: createClientId('r'),
        name: recipientName.trim(),
        docType: recipientDoc.trim() ? 'CI' : 'NINGUNO',
        docNumber: recipientDoc.trim() || undefined,
        phone: recipientPhone.trim(),
      },
      items,
      shippingFee: pricing.baseFee,
      discount: pricing.discount,
      paymentTiming,
      paymentMethod,
      prohibitedGoodsNoticeAccepted: prohibitedAccepted,
    })
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-2 sm:p-4 overflow-y-auto">
      <div className="relative w-full max-w-4xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden my-auto max-h-[92vh] flex flex-col font-sans">
        {/* Cabecera */}
        <div className="bg-slate-900 text-white px-5 py-3.5 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-teal-500 text-slate-950 flex items-center justify-center font-bold">
              <Package className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-black tracking-tight">Nueva Encomienda</h2>
              <p className="text-xs text-slate-300">Registro rápido y generación inmediata de guía con comprobante</p>
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

        {/* Formulario */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5 text-slate-800 text-xs sm:text-sm">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl flex items-center gap-2 text-xs font-semibold">
              <AlertTriangle className="w-4 h-4 shrink-0 text-red-600" />
              <span>{error}</span>
            </div>
          )}

          {/* 1. Ruta y modalidad */}
          <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200/90 space-y-3">
            <span className="font-bold text-slate-900 text-xs uppercase tracking-wider block">
              1. Ruta de Envío y Destino
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">Agencia Origen *</label>
                <select
                  value={originId}
                  onChange={e => setOriginId(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-lg p-2 font-medium text-slate-900 focus:ring-2 focus:ring-teal-500"
                >
                  {branches.map(b => (
                    <option key={b.id} value={b.id}>{b.name} ({b.city})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">Agencia Destino *</label>
                <select
                  value={destinationId}
                  onChange={e => setDestinationId(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-lg p-2 font-medium text-slate-900 focus:ring-2 focus:ring-teal-500"
                >
                  {branches.filter(b => b.id !== originId).map(b => (
                    <option key={b.id} value={b.id}>{b.name} ({b.city})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">Modalidad de Entrega</label>
                <div className="flex bg-slate-200/80 p-0.5 rounded-lg border border-slate-300">
                  <button
                    type="button"
                    onClick={() => setDeliveryType('agency')}
                    className={`flex-1 py-1.5 rounded-md font-bold text-xs transition ${deliveryType === 'agency' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'}`}
                  >
                    Agencia
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeliveryType('home')}
                    className={`flex-1 py-1.5 rounded-md font-bold text-xs transition ${deliveryType === 'home' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'}`}
                  >
                    A Domicilio
                  </button>
                </div>
              </div>
            </div>

            {deliveryType === 'home' && (
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">Dirección de Entrega a Domicilio *</label>
                <input
                  type="text"
                  placeholder="Ej. Barrio Los Pinos, Calle Las Palmas N° 45 (o referencias)"
                  value={deliveryAddress}
                  onChange={e => setDeliveryAddress(e.target.value)}
                  className="w-full bg-white border border-amber-300 rounded-lg p-2 font-medium text-slate-900 focus:ring-2 focus:ring-amber-500"
                />
              </div>
            )}
          </div>

          {/* 2. Remitente y Destinatario */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Remitente */}
            <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200/90 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-900 text-xs uppercase tracking-wider">
                  2. Remitente (Quién Envía)
                </span>
                {existingCustomers.length > 0 && (
                  <div className="relative group">
                    <button type="button" className="text-[11px] font-semibold text-teal-700 hover:text-teal-900 flex items-center gap-1">
                      <Search className="w-3 h-3" /> Clientes guardados
                    </button>
                    <div className="absolute right-0 top-full mt-1 w-64 bg-white rounded-xl shadow-xl border border-slate-200 py-1 hidden group-hover:block z-20">
                      {existingCustomers.slice(0, 4).map(c => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => selectSender(c)}
                          className="w-full text-left px-3 py-1.5 hover:bg-slate-100 text-xs"
                        >
                          <div className="font-bold text-slate-800">{c.name}</div>
                          <div className="text-[10px] text-slate-500">Tel: {c.phone}</div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-0.5">Nombre / Razón Social *</label>
                <input
                  type="text"
                  placeholder="Ej. Juan Pérez o Comercial Los Andes"
                  value={senderName}
                  onChange={e => setSenderName(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-lg p-2 font-medium text-slate-900"
                  required
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-0.5">Teléfono / WhatsApp *</label>
                  <input
                    type="tel"
                    placeholder="Ej. 70712345"
                    value={senderPhone}
                    onChange={e => setSenderPhone(e.target.value)}
                    className="w-full bg-white border border-slate-300 rounded-lg p-2 font-medium text-slate-900"
                    required
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-0.5">Doc. CI / NIT (Opcional)</label>
                  <input
                    type="text"
                    placeholder="Ej. 4523190"
                    value={senderDoc}
                    onChange={e => setSenderDoc(e.target.value)}
                    className="w-full bg-white border border-slate-300 rounded-lg p-2 font-medium text-slate-900"
                  />
                </div>
              </div>
            </div>

            {/* Destinatario */}
            <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200/90 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-900 text-xs uppercase tracking-wider">
                  3. Destinatario (Quién Recibe)
                </span>
                {existingCustomers.length > 0 && (
                  <div className="relative group">
                    <button type="button" className="text-[11px] font-semibold text-teal-700 hover:text-teal-900 flex items-center gap-1">
                      <Search className="w-3 h-3" /> Clientes guardados
                    </button>
                    <div className="absolute right-0 top-full mt-1 w-64 bg-white rounded-xl shadow-xl border border-slate-200 py-1 hidden group-hover:block z-20">
                      {existingCustomers.slice(0, 4).map(c => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => selectRecipient(c)}
                          className="w-full text-left px-3 py-1.5 hover:bg-slate-100 text-xs"
                        >
                          <div className="font-bold text-slate-800">{c.name}</div>
                          <div className="text-[10px] text-slate-500">Tel: {c.phone}</div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-0.5">Nombre Completo *</label>
                <input
                  type="text"
                  placeholder="Ej. Pedro Morales"
                  value={recipientName}
                  onChange={e => setRecipientName(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-lg p-2 font-medium text-slate-900"
                  required
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-0.5">Teléfono de Contacto *</label>
                  <input
                    type="tel"
                    placeholder="Ej. 76498765"
                    value={recipientPhone}
                    onChange={e => setRecipientPhone(e.target.value)}
                    className="w-full bg-white border border-slate-300 rounded-lg p-2 font-medium text-slate-900"
                    required
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-0.5">CI Destinatario (Opcional)</label>
                  <input
                    type="text"
                    placeholder="Ej. 3920194"
                    value={recipientDoc}
                    onChange={e => setRecipientDoc(e.target.value)}
                    className="w-full bg-white border border-slate-300 rounded-lg p-2 font-medium text-slate-900"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* 3. Contenido Declarado Obligatorio */}
          <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200/90 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <span className="font-bold text-slate-900 text-xs uppercase tracking-wider block">
                  4. Contenido Declarado (Declaración Obligatoria)
                </span>
                <span className="text-[11px] text-slate-500">Siempre preguntar y detallar qué lleva la encomienda</span>
              </div>
              <button
                type="button"
                onClick={addItemRow}
                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-bold bg-white text-teal-800 border border-teal-300 rounded-lg hover:bg-teal-50"
              >
                <Plus className="w-3.5 h-3.5" /> Agregar artículo/bulto
              </button>
            </div>

            <div className="space-y-2.5">
              {items.map((item, idx) => (
                <div key={idx} className="p-3 bg-white rounded-xl border border-slate-200 grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-center">
                  <div className="sm:col-span-1 text-center font-bold text-slate-400 text-xs">
                    #{idx + 1}
                  </div>

                  <div className="sm:col-span-5">
                    <label className="block text-[10px] font-bold text-slate-600 mb-0.5">¿Qué contiene? *</label>
                    <input
                      type="text"
                      placeholder="Ej. Ropa surtida, 3 pantalones y zapatos"
                      value={item.description}
                      onChange={e => updateItem(idx, 'description', e.target.value)}
                      className="w-full bg-slate-50 border border-slate-300 rounded-lg p-1.5 text-xs font-medium"
                      required
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block text-[10px] font-bold text-slate-600 mb-0.5">Embalaje</label>
                    <select
                      value={item.packaging}
                      onChange={e => updateItem(idx, 'packaging', e.target.value as ParcelPackaging)}
                      className="w-full bg-slate-50 border border-slate-300 rounded-lg p-1.5 text-xs font-medium"
                    >
                      <option value="caja">Caja</option>
                      <option value="bolsa">Bolsa</option>
                      <option value="sobre">Sobre</option>
                      <option value="fardo">Fardo</option>
                      <option value="paquete">Paquete</option>
                      <option value="otro">Otro</option>
                    </select>
                  </div>

                  <div className="sm:col-span-1">
                    <label className="block text-[10px] font-bold text-slate-600 mb-0.5">Cant.</label>
                    <input
                      type="number"
                      min="1"
                      value={item.quantity}
                      onChange={e => updateItem(idx, 'quantity', parseInt(e.target.value, 10) || 1)}
                      className="w-full bg-slate-50 border border-slate-300 rounded-lg p-1.5 text-xs font-medium text-center"
                    />
                  </div>

                  <div className="sm:col-span-1">
                    <label className="block text-[10px] font-bold text-slate-600 mb-0.5">Peso kg</label>
                    <input
                      type="number"
                      step="0.5"
                      min="0"
                      value={item.weightKg || ''}
                      onChange={e => updateItem(idx, 'weightKg', parseFloat(e.target.value) || 0)}
                      className="w-full bg-slate-50 border border-slate-300 rounded-lg p-1.5 text-xs font-medium text-center"
                    />
                  </div>

                  <div className="sm:col-span-1 flex items-center justify-center pt-3 sm:pt-0">
                    <label className="inline-flex items-center gap-1 cursor-pointer" title="Marcar como frágil">
                      <input
                        type="checkbox"
                        checked={item.isFragile}
                        onChange={e => updateItem(idx, 'isFragile', e.target.checked)}
                        className="rounded text-amber-600 focus:ring-amber-500 w-4 h-4"
                      />
                      <span className="text-[10px] font-bold text-amber-800">Frágil</span>
                    </label>
                  </div>

                  <div className="sm:col-span-1 text-center">
                    {items.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeItemRow(idx)}
                        className="text-red-500 hover:text-red-700 p-1"
                        title="Eliminar fila"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 4. Tarifa, Forma de Pago y Cobro */}
          <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200/90 space-y-3">
            <span className="font-bold text-slate-900 text-xs uppercase tracking-wider block">
              5. Tarifa y Forma de Pago
            </span>

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Tarifa Base (Bs.) * {tariffConfig ? `(Vigente: ${tariffConfig.baseFee})` : ''}
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.5"
                  value={customBaseFee ?? tariffConfig?.baseFee ?? 35}
                  onChange={e => {
                    const val = parseFloat(e.target.value)
                    setCustomBaseFee(Number.isFinite(val) ? Math.max(0, val) : 0)
                  }}
                  className="w-full bg-white border border-slate-300 rounded-lg p-2 font-bold text-slate-900 text-sm"
                  required
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">Descuento (Bs.)</label>
                <input
                  type="number"
                  min="0"
                  step="0.5"
                  value={discount}
                  onChange={e => {
                    const val = parseFloat(e.target.value)
                    setDiscount(Number.isFinite(val) ? Math.max(0, val) : 0)
                  }}
                  className="w-full bg-white border border-slate-300 rounded-lg p-2 font-medium text-slate-700 text-sm"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">¿Quién Paga?</label>
                <select
                  value={paymentTiming}
                  onChange={e => setPaymentTiming(e.target.value as 'origin_paid' | 'destination_cod')}
                  className="w-full bg-white border border-slate-300 rounded-lg p-2 font-bold text-slate-900 text-xs sm:text-sm"
                >
                  <option value="origin_paid">Pagado en Origen (Ahora)</option>
                  <option value="destination_cod">Cobro en Destino (Al entregar)</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">Medio de Pago</label>
                <select
                  value={paymentMethod}
                  onChange={e => setPaymentMethod(e.target.value as 'cash' | 'qr' | 'transfer')}
                  disabled={paymentTiming === 'destination_cod'}
                  className="w-full bg-white border border-slate-300 rounded-lg p-2 font-medium text-slate-900 text-xs sm:text-sm disabled:bg-slate-100 disabled:text-slate-400"
                >
                  <option value="cash">Efectivo en Caja</option>
                  <option value="qr">Pago QR (Simple / Banco)</option>
                  <option value="transfer">Transferencia Bancaria</option>
                </select>
              </div>
            </div>

            {/* Recuadro de Total */}
            <div className="mt-3 p-3 bg-teal-50 border border-teal-200 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <span className="text-xs font-semibold text-teal-800">Total a liquidar:</span>
                <span className="text-xs text-teal-700 ml-2">
                  (Base: Bs. {pricing.baseFee.toFixed(2)}
                  {pricing.weightSurcharge > 0 ? ` + Peso (${pricing.chargeableExcessWeightKg} kg): Bs. ${pricing.weightSurcharge.toFixed(2)}` : ''}
                  {pricing.homeDeliveryFee > 0 ? ` + Domicilio: Bs. ${pricing.homeDeliveryFee.toFixed(2)}` : ''}
                  {pricing.discount > 0 ? ` - Descuento: Bs. ${pricing.discount.toFixed(2)}` : ''})
                </span>
              </div>
              <div className="text-xl font-black text-teal-900">
                Bs. {pricing.finalAmount.toFixed(2)}
              </div>
            </div>
          </div>

          {/* Advertencia Legal Obligatoria */}
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-3">
            <input
              type="checkbox"
              id="prohibitedGoods"
              checked={prohibitedAccepted}
              onChange={e => setProhibitedAccepted(e.target.checked)}
              className="mt-0.5 rounded text-amber-600 focus:ring-amber-500 w-4 h-4 cursor-pointer"
            />
            <label htmlFor="prohibitedGoods" className="text-xs text-amber-900 leading-relaxed cursor-pointer">
              <strong>Declaración de Seguridad de Transporte:</strong> El remitente declara bajo fe de juramento que la encomienda NO contiene dinero en efectivo, armas, explosivos, drogas, inflamables ni artículos de transporte prohibido por leyes del Estado Plurinacional de Bolivia.
            </label>
          </div>

          {/* Botones de acción */}
          <div className="flex flex-col-reverse sm:flex-row items-center justify-end gap-2.5 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="w-full sm:w-auto px-4 py-2.5 rounded-xl border border-slate-300 font-bold text-slate-700 hover:bg-slate-100 transition"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-500 font-bold text-white shadow-md flex items-center justify-center gap-2 transition"
            >
              <Save className="w-4 h-4" />
              <span>Guardar e Imprimir Guía</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
