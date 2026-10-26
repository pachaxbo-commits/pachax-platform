import { useState, useRef } from 'react'
import {
  Eye,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Tag,
  Trash2,
  Image as ImageIcon,
  Upload,
  X,
  AlertCircle,
  CookingPot,
} from 'lucide-react'
import { Modal } from '../../../components/ui/Modal'
import { Field, NumberInput, SelectInput, TextArea, TextInput } from '../../../components/ui/Form'
import type { CatalogCategory, Order, Product } from '../../../types'
import { RestaurantProductInventoryFields } from './RestaurantProductInventoryFields'
import { IngredientStock } from './IngredientStock'
import {
  validateImageFile,
  compressProductImage,
} from '../../../demo/restaurant/demoProductImageStorage'

type ProductType = 'prepared' | 'ingredient' | 'beverage'
const categoryNames = ['Entradas', 'Platos principales', 'Bebidas', 'Postres']

export function RestaurantProducts({
  categories,
  products,
  onSaveProducts,
  onArchiveProduct,
  onStartTour,
}: {
  categories: CatalogCategory[]
  products: Product[]
  orders?: Order[]
  onSaveProducts: (products: Product[]) => void
  onArchiveProduct?: (productId: string) => Promise<void> | void
  onDeleteProduct?: (productId: string) => Promise<void> | void
  onStartTour?: () => void
}) {
  const catalog = products
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<'all' | 'sale' | 'ingredient' | 'beverage'>('all')
  const [menu, setMenu] = useState<string | null>(null)
  const [editing, setEditing] = useState<Product | null>(null)
  const [viewing, setViewing] = useState<Product | null>(null)
  const [removing, setRemoving] = useState<Product | null>(null)
  const [notice, setNotice] = useState('')
  const [imageError, setImageError] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)
  const [isCompressingImage, setIsCompressingImage] = useState(false)

  const fileInputRef = useRef<HTMLInputElement>(null)

  const blank = (): Product => ({
    id: '',
    name: '',
    description: '',
    categoryId: categories[0]?.id || 'cat-entradas',
    price: 0,
    image: '',
    availability: 'available',
    sortOrder: catalog.length,
    isActive: true,
    isVisible: true,
    restaurantType: 'prepared',
    baseUnit: 'unit',
  })

  const [form, setForm] = useState<Product>(blank)
  const save = onSaveProducts

  const filtered = catalog.filter((product) => {
    const matchesFilter =
      filter === 'sale'
        ? product.restaurantType !== 'ingredient'
        : filter === 'ingredient'
        ? product.restaurantType === 'ingredient'
        : filter === 'beverage'
        ? product.restaurantType === 'beverage'
        : true

    const matchesQuery =
      !query ||
      `${product.name} ${product.description || ''}`
        .toLowerCase()
        .includes(query.toLowerCase())

    return matchesFilter && matchesQuery
  })

  const handleOpenNew = () => {
    setImageError('')
    setForm(blank())
    setEditing(blank())
  }

  const handleOpenEdit = (product: Product) => {
    setImageError('')
    setForm({ ...product })
    setEditing(product)
    setMenu(null)
  }

  const handleImageFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    setImageError('')
    const file = event.target.files?.[0]
    if (!file) return

    const validation = validateImageFile(file)
    if (!validation.ok) {
      setImageError(validation.error || 'Archivo de imagen no válido.')
      if (fileInputRef.current) fileInputRef.current.value = ''
      return
    }

    setIsCompressingImage(true)
    try {
      const compressedDataUrl = await compressProductImage(file, 800, 0.82)
      setForm((prev) => ({ ...prev, image: compressedDataUrl }))
    } catch (err) {
      setImageError(
        err instanceof Error
          ? err.message
          : 'No se pudo procesar la imagen seleccionada.'
      )
    } finally {
      setIsCompressingImage(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleRemoveImage = () => {
    setImageError('')
    setForm((prev) => ({ ...prev, image: '' }))
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const submit = () => {
    if (!form.name.trim() || !Number.isFinite(form.price) || form.price < 0) {
      setNotice('Completa nombre y un precio válido.')
      return
    }

    if (
      (form.stockBase !== undefined &&
        (!Number.isFinite(form.stockBase) || form.stockBase < 0)) ||
      (form.unitCost !== undefined &&
        (!Number.isFinite(form.unitCost) || form.unitCost < 0)) ||
      form.recipe?.some(
        (part) =>
          !Number.isFinite(part.quantityBase) ||
          part.quantityBase <= 0 ||
          !catalog.some((item) => item.id === part.ingredientId && item.stockBase !== undefined)
      )
    ) {
      setNotice('Revisa stock e ingredientes de la receta.')
      return
    }

    const product: Product = {
      ...form,
      id: form.id || crypto.randomUUID(),
      name: form.name.trim(),
      description: form.description?.trim(),
      categoryId: form.categoryId || categories[0]?.id || 'cat-entradas',
    }

    save(
      form.id
        ? catalog.map((item) => (item.id === product.id ? product : item))
        : [...catalog, product]
    )

    setEditing(null)
    setNotice(
      form.id
        ? 'Producto actualizado correctamente.'
        : 'Producto creado correctamente.'
    )
  }

  const handleArchive = async (product: Product) => {
    setIsProcessing(true)
    try {
      if (onArchiveProduct) {
        await onArchiveProduct(product.id)
      } else {
        save(
          catalog.map((item) =>
            item.id === product.id
              ? { ...item, isActive: false, isVisible: false, availability: 'archived' }
              : item
          )
        )
      }
      setRemoving(null)
      setNotice('Producto archivado correctamente.')
    } catch (err: unknown) {
      setNotice(err instanceof Error ? err.message : 'Error al archivar el producto.')
    } finally {
      setIsProcessing(false)
    }
  }

  return (
    <div data-tour="products-board" className="space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Catálogo de Productos y Platos</h1>
          <p className="text-sm text-slate-500">
            Gestión de menú, precios y disponibilidad en salón.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {onStartTour && (
            <button
              type="button"
              onClick={onStartTour}
              className="inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 transition hover:bg-slate-50 cursor-pointer"
            >
              ¿Cómo funciona?
            </button>
          )}
          <button
            type="button"
            data-tour="products-create"
            onClick={handleOpenNew}
            style={{ backgroundColor: 'var(--primary)', color: 'var(--primary-foreground)' }}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-bold shadow-xs transition hover:opacity-95 cursor-pointer"
          >
            <Plus size={16} /> Nuevo producto
          </button>
        </div>
      </header>

      {notice && (
        <p
          role="status"
          className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-800"
        >
          {notice}
        </p>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-3 text-slate-400" size={16} />
          <input
            data-tour="products-search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar plato o bebida..."
            className="w-full rounded-xl border border-slate-200 py-2 pl-9 pr-3 text-sm"
          />
        </div>
        <div className="flex gap-1 overflow-x-auto">
          {(
            [
              ['all', 'Todos'],
              ['sale', 'Venta'],
              ['ingredient', 'Ingredientes'],
              ['beverage', 'Bebidas'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setFilter(id)}
              style={
                filter === id
                  ? { backgroundColor: 'var(--primary)', color: 'var(--primary-foreground)' }
                  : undefined
              }
              className={`whitespace-nowrap rounded-lg px-3 py-2 text-xs font-bold transition cursor-pointer ${
                filter === id
                  ? 'shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200/70'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div data-tour="products-catalog" className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        <table className="w-full min-w-[650px] text-left">
          <thead>
            <tr className="bg-slate-50 text-xs uppercase text-slate-500">
              <th className="p-3">Producto</th>
              <th className="p-3">Categoría</th>
              <th className="p-3 text-right">Precio</th>
              <th className="p-3 text-right">Stock actual</th>
              <th className="p-3 text-center">Estado</th>
              <th className="p-3" />
            </tr>
          </thead>
          <tbody className="divide-y">
            {filtered.map((product) => {
              const cat = categories.find((item) => item.id === product.categoryId)
              return (
                <tr key={product.id}>
                  <td className="p-3">
                    <div className="flex items-center gap-3">
                      {product.image ? (
                        <img
                          src={product.image}
                          alt={product.name}
                          className="h-10 w-10 shrink-0 rounded-xl object-cover border border-slate-200"
                        />
                      ) : (
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-400">
                          <CookingPot size={20} />
                        </div>
                      )}
                      <div>
                        <strong className="block text-sm">{product.name}</strong>
                        <span className="text-xs text-slate-500">
                          {product.restaurantType === 'ingredient'
                            ? 'Ingrediente'
                            : product.restaurantType === 'beverage'
                            ? 'Bebida'
                            : 'Venta'}
                          {product.description ? ` · ${product.description}` : ''}
                        </span>
                      </div>
                    </div>
                  </td>
                  <td className="p-3 text-xs">
                    <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-1">
                      <Tag size={12} />
                      {cat?.name ||
                        categoryNames.find((name) => name.toLowerCase() === product.categoryId) ||
                        'General'}
                    </span>
                  </td>
                  <td className="p-3 text-right text-sm font-bold">
                    Bs {product.price.toFixed(2)}
                  </td>
                  <td className="p-3 text-right">
                    <IngredientStock product={product} />
                  </td>
                  <td className="p-3 text-center">
                    <span
                      className={`rounded-full px-2 py-1 text-[10px] font-bold ${
                        product.isActive
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-slate-100 text-slate-500'
                      }`}
                    >
                      {product.isActive ? 'Activo en salón' : 'No disponible'}
                    </span>
                  </td>
                  <td className="relative p-3 text-right">
                    <button
                      type="button"
                      onClick={() => setMenu(menu === product.id ? null : product.id)}
                      className="rounded-lg p-2 hover:bg-slate-100 cursor-pointer"
                      aria-label="Más acciones del producto"
                    >
                      <MoreHorizontal size={17} />
                    </button>
                    {menu === product.id && (
                      <div className="absolute right-3 top-10 z-10 grid w-32 rounded-xl border bg-white p-1 shadow-lg">
                        <button
                          type="button"
                          onClick={() => {
                            setViewing(product)
                            setMenu(null)
                          }}
                          className="flex items-center gap-2 rounded-lg p-2 text-xs hover:bg-slate-50 cursor-pointer"
                        >
                          <Eye size={14} /> Ver
                        </button>
                        <button
                          type="button"
                          data-tour="products-edit"
                          onClick={() => handleOpenEdit(product)}
                          className="flex items-center gap-2 rounded-lg p-2 text-xs hover:bg-slate-50 cursor-pointer"
                        >
                          <Pencil size={14} /> Editar
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setRemoving(product)
                            setMenu(null)
                          }}
                          className="flex items-center gap-2 rounded-lg p-2 text-xs text-amber-700 hover:bg-amber-50 cursor-pointer"
                        >
                          <Trash2 size={14} /> Archivar
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Modal Crear / Editar Producto */}
      <Modal
        isOpen={Boolean(editing)}
        onClose={() => setEditing(null)}
        title={form.id ? 'Editar producto' : 'Nuevo producto'}
        footer={
          <button
            type="button"
            data-tour="products-save"
            onClick={submit}
            style={{ backgroundColor: 'var(--primary)', color: 'var(--primary-foreground)' }}
            className="w-full rounded-xl p-3 font-bold shadow-xs hover:opacity-95 transition cursor-pointer"
          >
            Guardar producto
          </button>
        }
      >
        <div data-tour="products-form-fields" className="grid gap-4">
          {/* Sección de Fotografía del Producto */}
          <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-3.5">
            <span className="block text-xs font-bold text-slate-700 mb-2">
              Fotografía del producto (demo local)
            </span>
            <div className="flex flex-wrap items-center gap-3.5">
              {form.image ? (
                <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs">
                  <img
                    src={form.image}
                    alt="Vista previa de producto"
                    className="h-full w-full object-cover"
                  />
                </div>
              ) : (
                <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white text-slate-400">
                  <ImageIcon size={28} />
                </div>
              )}

              <div className="flex-1 min-w-[200px] space-y-1.5">
                <input
                  type="file"
                  ref={fileInputRef}
                  accept="image/jpeg,image/png,image/webp"
                  onChange={handleImageFileChange}
                  className="hidden"
                />
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={isCompressingImage}
                    onClick={() => fileInputRef.current?.click()}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 shadow-xs hover:bg-slate-50 disabled:opacity-50 cursor-pointer"
                  >
                    <Upload size={14} />
                    {form.image ? 'Cambiar fotografía' : 'Subir fotografía'}
                  </button>
                  {form.image && (
                    <button
                      type="button"
                      onClick={handleRemoveImage}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-xs font-bold text-rose-700 hover:bg-rose-100 cursor-pointer"
                    >
                      <X size={14} /> Quitar
                    </button>
                  )}
                </div>
                <p className="text-[11px] text-slate-500">
                  Formatos JPG, PNG o WebP. Se optimiza y almacena localmente en esta sesión.
                </p>
                {isCompressingImage && (
                  <p className="text-[11px] font-semibold text-blue-600 animate-pulse">
                    Optimizando fotografía...
                  </p>
                )}
                {imageError && (
                  <div className="flex items-center gap-1.5 text-[11px] font-bold text-rose-600">
                    <AlertCircle size={13} className="shrink-0" />
                    <span>{imageError}</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          <Field label="Nombre" required>
            <TextInput
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
            />
          </Field>
          <Field label="Descripción">
            <TextArea
              value={form.description || ''}
              onChange={(event) => setForm({ ...form, description: event.target.value })}
            />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Categoría">
              <SelectInput
                value={form.categoryId}
                onChange={(event) => setForm({ ...form, categoryId: event.target.value })}
              >
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </SelectInput>
            </Field>
            <Field label="Precio" required>
              <NumberInput
                min="0"
                step="0.01"
                value={form.price}
                onChange={(event) => setForm({ ...form, price: Number(event.target.value) })}
              />
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Tipo">
              <SelectInput
                value={form.restaurantType || 'prepared'}
                onChange={(event) =>
                  setForm({ ...form, restaurantType: event.target.value as ProductType })
                }
              >
                <option value="prepared">Venta</option>
                <option value="ingredient">Ingrediente</option>
                <option value="beverage">Bebida</option>
              </SelectInput>
            </Field>
            <Field label="Unidad">
              <SelectInput
                value={form.baseUnit || 'unit'}
                onChange={(event) =>
                  setForm({ ...form, baseUnit: event.target.value as Product['baseUnit'] })
                }
              >
                <option value="unit">Unidad</option>
                <option value="g">g</option>
                <option value="ml">ml</option>
              </SelectInput>
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Área de preparación">
              <SelectInput
                value={form.preparationArea || 'Cocina'}
                onChange={(event) =>
                  setForm({ ...form, preparationArea: event.target.value as Product['preparationArea'] })
                }
              >
                <option>Cocina</option>
                <option>Barra</option>
                <option>Otro</option>
              </SelectInput>
            </Field>
            <Field label="Disponibilidad">
              <SelectInput
                value={form.availability}
                onChange={(event) =>
                  setForm({ ...form, availability: event.target.value as Product['availability'] })
                }
              >
                <option value="available">Disponible</option>
                <option value="soldout">Agotado</option>
              </SelectInput>
            </Field>
          </div>
          <div data-tour="products-recipe-fields">
            <RestaurantProductInventoryFields form={form} products={catalog} onChange={setForm} />
          </div>
          <div className="flex gap-4">
            <label className="flex items-center gap-2 text-sm font-semibold">
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(event) => setForm({ ...form, isActive: event.target.checked })}
              />{' '}
              Activo
            </label>
            <label className="flex items-center gap-2 text-sm font-semibold">
              <input
                type="checkbox"
                checked={form.isVisible}
                onChange={(event) => setForm({ ...form, isVisible: event.target.checked })}
              />{' '}
              Visible en ventas
            </label>
          </div>
        </div>
      </Modal>

      {/* Modal Ver Producto */}
      <Modal isOpen={Boolean(viewing)} onClose={() => setViewing(null)} title={viewing?.name || 'Producto'}>
        <div className="grid gap-4 text-sm">
          {viewing?.image && (
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
              <img
                src={viewing.image}
                alt={viewing.name}
                className="max-h-60 w-full object-cover"
              />
            </div>
          )}
          <dl className="grid gap-3">
            <div>
              <dt className="text-xs text-slate-500">Descripción</dt>
              <dd className="font-semibold text-slate-800">{viewing?.description || 'Sin descripción'}</dd>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <dt className="text-xs text-slate-500">Precio</dt>
                <dd className="font-bold text-slate-900">Bs {viewing?.price.toFixed(2)}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Tipo</dt>
                <dd className="font-semibold text-slate-800">{viewing?.restaurantType || 'Venta'}</dd>
              </div>
            </div>
          </dl>
        </div>
      </Modal>

      {/* Modal Archivar Producto */}
      <Modal
        isOpen={Boolean(removing)}
        onClose={() => setRemoving(null)}
        title="Archivar producto"
        footer={
          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              onClick={() => setRemoving(null)}
              className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-bold cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={isProcessing}
              onClick={() => removing && handleArchive(removing)}
              className="rounded-xl bg-amber-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-amber-700 disabled:opacity-50 cursor-pointer"
            >
              Confirmar archivo
            </button>
          </div>
        }
      >
        <p className="text-sm">
          ¿Deseas archivar <strong>{removing?.name}</strong>?
        </p>
        <p className="mt-2 text-xs text-slate-500">
          Archivar desactiva el producto del menú y de las ventas sin alterar las recetas ni el historial de pedidos anteriores.
        </p>
      </Modal>
    </div>
  )
}
