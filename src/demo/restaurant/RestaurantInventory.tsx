import { useState } from 'react'
import { AlertTriangle, MoreHorizontal, Pencil, Plus, Search, Trash2 } from 'lucide-react'
import { Modal } from '../../components/ui/Modal'
import { Field, NumberInput, SelectInput, TextInput } from '../../components/ui/Form'
import type { Product } from '../../types'

type InventoryStatus = 'normal' | 'low' | 'out' | 'unavailable'
const status = (item: Product): InventoryStatus => item.isActive === false ? 'unavailable' : (item.stockBase || 0) === 0 ? 'out' : (item.stockBase || 0) <= (item.minimumStockBase || 0) ? 'low' : 'normal'
const labels: Record<InventoryStatus, string> = { normal: 'Normal', low: 'Stock bajo', out: 'Agotado', unavailable: 'No disponible' }

export function RestaurantInventory({ products, onSaveProducts }: { products: Product[]; onSaveProducts: (products: Product[]) => void }) {
  const items = products.filter(item => item.restaurantType === 'ingredient' || item.restaurantType === 'direct')
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('Todos')
  const [menu, setMenu] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [removing, setRemoving] = useState<Product | null>(null)
  const [notice, setNotice] = useState('')
  const blank = (): Product => ({ id: '', name: '', categoryId: 'cat-insumos', description: 'Productos de cocina', price: 0, image: '', availability: 'available', sortOrder: products.length, isActive: true, isVisible: false, restaurantType: 'ingredient', baseUnit: 'unit', stockBase: 0, minimumStockBase: 0, unitCost: 0 })
  const [form, setForm] = useState<Product>(blank)
  const categories = ['Todos', ...new Set(items.map(item => item.description || 'General'))]
  const shown = items.filter(item => (category === 'Todos' || item.description === category) && `${item.name} ${item.description || ''}`.toLowerCase().includes(query.toLowerCase()))
  const usedByRecipe = (item: Product) => products.some(product => product.recipe?.some(line => line.ingredientId === item.id))
  const submit = () => {
    if (!form.name.trim() || !Number.isFinite(form.stockBase) || (form.stockBase || 0) < 0 || (form.minimumStockBase || 0) < 0) { setNotice('Completa nombre y valores de stock válidos.'); return }
    const next = { ...form, id: form.id || crypto.randomUUID(), name: form.name.trim() }
    onSaveProducts(form.id ? products.map(item => item.id === next.id ? next : item) : [...products, next])
    setEditing(false)
    setNotice(form.id ? 'Insumo actualizado.' : 'Insumo creado.')
  }
  return <div className="space-y-6">
    <header className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-2xl font-bold text-slate-900">Inventario de Insumos & Cocina</h1><p className="text-sm text-slate-500">Existencias, unidades y mínimos de reposición.</p></div><button onClick={() => { setForm(blank()); setEditing(true) }} className="inline-flex min-h-11 items-center gap-2 rounded-2xl bg-slate-900 px-4 text-sm font-bold text-white"><Plus size={16} /> Nuevo insumo</button></header>
    {notice && <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-800">{notice}</p>}
    <div className="flex flex-wrap gap-2"><label className="relative flex-1"><Search size={16} className="absolute left-3 top-3 text-slate-400" /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Buscar insumo" className="w-full rounded-xl border border-slate-200 py-2 pl-9 pr-3 text-sm" /></label>{categories.map(name => <button key={name} onClick={() => setCategory(name)} className={`rounded-lg px-3 py-2 text-xs font-bold ${category === name ? 'bg-teal-500 text-slate-950' : 'bg-slate-100 text-slate-600'}`}>{name}</button>)}</div>
    {items.some(item => ['low', 'out'].includes(status(item))) && <div className="flex gap-2 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-900"><AlertTriangle size={17} /> Hay insumos en stock bajo o agotados.</div>}
    <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white"><table className="w-full min-w-[600px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="p-3">Insumo</th><th className="p-3">Categoría</th><th className="p-3 text-right">Stock actual</th><th className="p-3 text-right">Mínimo</th><th className="p-3">Estado</th><th className="p-3" /></tr></thead><tbody className="divide-y">{shown.map(item => <tr key={item.id}><td className="p-3 font-semibold">{item.name}</td><td className="p-3">{item.description || 'General'}</td><td className="p-3 text-right">{item.stockBase || 0} {item.baseUnit || 'unit'}</td><td className="p-3 text-right">{item.minimumStockBase || 0} {item.baseUnit || 'unit'}</td><td className="p-3">{labels[status(item)]}</td><td className="relative p-3"><button aria-label={`Administrar ${item.name}`} onClick={() => setMenu(menu === item.id ? null : item.id)}><MoreHorizontal size={17} /></button>{menu === item.id && <div className="absolute right-2 z-10 grid rounded-xl border bg-white p-1 shadow-lg"><button onClick={() => { setForm(item); setEditing(true); setMenu(null) }} className="flex gap-2 p-2 text-xs"><Pencil size={14} /> Editar</button><button onClick={() => { setRemoving(item); setMenu(null) }} className="flex gap-2 p-2 text-xs text-rose-700"><Trash2 size={14} /> Eliminar</button></div>}</td></tr>)}{!shown.length && <tr><td colSpan={6} className="p-6 text-center text-slate-500">Sin insumos en esta categoría.</td></tr>}</tbody></table></div>
    <Modal isOpen={editing} onClose={() => setEditing(false)} title={form.id ? 'Editar insumo' : 'Nuevo insumo'} footer={<button onClick={submit} className="w-full rounded-xl bg-slate-900 p-3 font-bold text-white">Guardar insumo</button>}><div className="grid gap-3"><Field label="Nombre" required><TextInput value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} /></Field><Field label="Categoría"><TextInput value={form.description || ''} onChange={event => setForm({ ...form, description: event.target.value })} /></Field><Field label="Unidad"><SelectInput value={form.baseUnit || 'unit'} onChange={event => setForm({ ...form, baseUnit: event.target.value as Product['baseUnit'] })}><option value="unit">Unidad</option><option value="g">Gramo</option><option value="ml">Mililitro</option></SelectInput></Field><div className="grid grid-cols-2 gap-3"><Field label="Stock actual"><NumberInput min="0" value={form.stockBase || 0} onChange={event => setForm({ ...form, stockBase: Number(event.target.value) })} /></Field><Field label="Stock mínimo"><NumberInput min="0" value={form.minimumStockBase || 0} onChange={event => setForm({ ...form, minimumStockBase: Number(event.target.value) })} /></Field></div><label className="flex gap-2 text-sm"><input type="checkbox" checked={form.isActive} onChange={event => setForm({ ...form, isActive: event.target.checked })} /> Disponible</label></div></Modal>
    <Modal isOpen={!!removing} onClose={() => setRemoving(null)} title="Eliminar insumo" footer={<div className="grid grid-cols-2 gap-2"><button onClick={() => setRemoving(null)} className="rounded-xl border p-3 font-bold">Cancelar</button><button disabled={!!removing && usedByRecipe(removing)} onClick={() => { if (removing) { onSaveProducts(products.filter(item => item.id !== removing.id)); setRemoving(null) } }} className="rounded-xl bg-rose-700 p-3 font-bold text-white disabled:opacity-40">Eliminar</button></div>}><p className="text-sm">¿Eliminar {removing?.name}?</p>{removing && usedByRecipe(removing) && <p className="mt-2 text-sm text-amber-800">Este insumo pertenece a una receta y se conserva.</p>}</Modal>
  </div>
}
