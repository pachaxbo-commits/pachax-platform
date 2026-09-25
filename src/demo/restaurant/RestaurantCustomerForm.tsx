import { useRef, useState } from 'react'
import { Modal } from '../../components/ui/Modal'
import type { RestaurantCustomer } from '../../modules/restaurant/domain/restaurantCustomers'
import { normalizeCustomerPhone } from '../../modules/restaurant/domain/restaurantCustomers'

export type CustomerDraft = Pick<RestaurantCustomer, 'firstName' | 'lastName' | 'countryCode' | 'phone' | 'email' | 'birthday' | 'notes'>

export function RestaurantCustomerForm({ customer, customers, quick = false, onClose, onSave, onDuplicate }: {
  customer?: RestaurantCustomer
  customers: RestaurantCustomer[]
  quick?: boolean
  onClose: () => void
  onSave: (draft: CustomerDraft, id?: string) => void
  onDuplicate?: (customer: RestaurantCustomer) => void
}) {
  const [form, setForm] = useState<CustomerDraft>({ firstName: customer?.firstName || '', lastName: customer?.lastName || '', countryCode: customer?.countryCode || '591', phone: customer?.phone || '', email: customer?.email || '', birthday: customer?.birthday || '', notes: customer?.notes || '' })
  const [error, setError] = useState('')
  const [duplicate, setDuplicate] = useState<RestaurantCustomer | null>(null)
  const submitting = useRef(false)
  const submit = () => {
    if (submitting.current) return
    if (!form.firstName.trim() || !form.phone.trim()) { setError('Nombre y teléfono son obligatorios.'); return }
    const normalized = normalizeCustomerPhone(form.countryCode, form.phone)
    if (!normalized || normalized.length < 9 || normalized.length > 15) { setError('Escribe un teléfono válido con código de país.'); return }
    const existing = customers.find(item => item.id !== customer?.id && item.normalizedPhone === normalized)
    if (existing) { setDuplicate(existing); setError('Ya existe un cliente con este número.'); return }
    submitting.current = true
    onSave({ ...form, firstName: form.firstName.trim(), lastName: form.lastName?.trim(), phone: form.phone.trim(), email: form.email?.trim(), notes: form.notes?.trim() }, customer?.id)
  }
  const input = 'mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-teal-500'
  return <Modal isOpen onClose={onClose} title={customer ? 'Editar cliente' : quick ? 'Nuevo cliente para esta mesa' : 'Nuevo cliente'} footer={<div className="flex gap-2"><button type="button" onClick={onClose} className="flex-1 rounded-xl border border-slate-200 px-3 py-3 text-sm font-semibold">Cancelar</button><button type="button" onClick={submit} className="flex-1 rounded-xl bg-slate-900 px-3 py-3 text-sm font-bold text-white">{customer ? 'Guardar cambios' : 'Crear cliente'}</button></div>}>
    <div className="space-y-3">
      <label className="block text-xs font-semibold text-slate-700">Nombre *<input autoFocus className={input} value={form.firstName} onChange={event => setForm({ ...form, firstName: event.target.value })} /></label>
      {!quick && <label className="block text-xs font-semibold text-slate-700">Apellido<input className={input} value={form.lastName} onChange={event => setForm({ ...form, lastName: event.target.value })} /></label>}
      <div className="grid grid-cols-[110px_minmax(0,1fr)] gap-2"><label className="block text-xs font-semibold text-slate-700">País<select className={input} value={form.countryCode} onChange={event => setForm({ ...form, countryCode: event.target.value })}><option value="591">+591</option><option value="54">+54</option><option value="56">+56</option><option value="51">+51</option><option value="1">+1</option><option value="34">+34</option></select></label><label className="block text-xs font-semibold text-slate-700">Teléfono / WhatsApp *<input type="tel" inputMode="tel" className={input} value={form.phone} onChange={event => setForm({ ...form, phone: event.target.value })} placeholder="70712345" /></label></div>
      {!quick && <><label className="block text-xs font-semibold text-slate-700">Email<input type="email" className={input} value={form.email} onChange={event => setForm({ ...form, email: event.target.value })} /></label><label className="block text-xs font-semibold text-slate-700">Cumpleaños<input type="date" className={input} value={form.birthday} onChange={event => setForm({ ...form, birthday: event.target.value })} /></label><label className="block text-xs font-semibold text-slate-700">Notas<textarea className={input} rows={2} value={form.notes} onChange={event => setForm({ ...form, notes: event.target.value })} placeholder="Preferencias del cliente" /></label></>}
      {error && <p role="alert" className="text-xs font-semibold text-rose-700">{error}</p>}
      {duplicate && onDuplicate && <button type="button" className="text-xs font-bold text-teal-700 underline" onClick={() => onDuplicate(duplicate)}>Ver cliente existente</button>}
    </div>
  </Modal>
}
