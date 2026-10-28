import { useEffect, useState } from 'react'
import { Copy, Plus, Save, Trash2, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react'
import { useCommercialConfig } from '../../store/commercialConfigStore'
import { useAdminAuth } from '../../auth/adminAuthStore'
import type { MediaAssetItem } from '../../types'
import type { TemplateKey } from '../../../public/config/pricingConfig'

export function MediaSection() {
  const { user } = useAdminAuth()
  const canPublish = user?.role === 'platform_owner' || user?.role === 'platform_admin'
  const { mediaAssets, updateMediaAsset, createMediaAsset, deleteMediaAsset } = useCommercialConfig()
  const [selectedAsset, setSelectedAsset] = useState<MediaAssetItem>(mediaAssets[0])
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const [showAddForm, setShowAddForm] = useState(false)

  // Formulario nuevo asset
  const [newAsset, setNewAsset] = useState<MediaAssetItem>({
    id: '',
    name: '',
    url: '',
    category: 'showcase',
    focalPointDefault: '50% 50%',
    status: 'draft',
  })

  // Formulario edición asset seleccionado
  const [editForm, setEditForm] = useState<MediaAssetItem>(selectedAsset || mediaAssets[0])

  useEffect(() => {
    queueMicrotask(() => {
      const match = mediaAssets.find(item => item.id === selectedAsset?.id) || mediaAssets[0]
      if (match) {
        setSelectedAsset(match)
        setEditForm(JSON.parse(JSON.stringify(match)))
      }
    })
  }, [mediaAssets, selectedAsset?.id])

  const handleCopy = (url: string) => {
    navigator.clipboard?.writeText(url)
    setCopiedUrl(url)
    setTimeout(() => setCopiedUrl(null), 2000)
  }

  const handleSelect = (asset: MediaAssetItem) => {
    setSelectedAsset(asset)
    setEditForm(JSON.parse(JSON.stringify(asset)))
    setFeedback(null)
    setError(null)
  }

  const handleSaveEdit = async () => {
    if (!editForm) return
    if (editForm.status === 'published' && !canPublish) {
      setError('Solo Platform Owner o Admin puede publicar assets multimedia.')
      return
    }
    if (editForm.status === 'published' && selectedAsset?.status !== 'published'
      && !window.confirm('Este asset quedará disponible en el catálogo público. Confirma que la imagen está aprobada.')) return
    setIsProcessing(true)
    setFeedback(null)
    setError(null)
    const res = await updateMediaAsset(editForm.id, editForm)
    setIsProcessing(false)
    if (res.success) {
      setFeedback('Asset multimedia guardado correctamente.')
      setTimeout(() => setFeedback(null), 3000)
    } else {
      setError(res.error || 'Error al guardar asset multimedia.')
    }
  }

  const handleDelete = async (id: string, name: string) => {
    if (!window.confirm(`¿Eliminar el asset "${name}" de la biblioteca?`)) return
    setIsProcessing(true)
    setFeedback(null)
    setError(null)
    const res = await deleteMediaAsset(id)
    setIsProcessing(false)
    if (res.success) {
      setFeedback(`Asset "${name}" eliminado.`)
      setTimeout(() => setFeedback(null), 3000)
    } else {
      setError(res.error || 'Error al eliminar el asset.')
    }
  }

  const handleCreateAsset = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newAsset.name.trim() || !newAsset.url.trim()) {
      setError('Nombre y URL de la imagen son obligatorios.')
      return
    }
    setIsProcessing(true)
    setFeedback(null)
    setError(null)
    const assetToSave: MediaAssetItem = {
      ...newAsset,
      id: crypto.randomUUID(),
    }
    const res = await createMediaAsset(assetToSave)
    setIsProcessing(false)
    if (res.success) {
      setFeedback(`Asset "${assetToSave.name}" agregado a la biblioteca.`)
      setShowAddForm(false)
      setNewAsset({
        id: '',
        name: '',
        url: '',
        category: 'showcase',
        focalPointDefault: '50% 50%',
        status: 'draft',
      })
      handleSelect(assetToSave)
      setTimeout(() => setFeedback(null), 3000)
    } else {
      setError(res.error || 'Error al agregar el asset.')
    }
  }

  return (
    <div className="space-y-8">
      {/* Encabezado */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-6 border-b border-slate-200">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
            Biblioteca de Assets y Miniaturas
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Supervisa y edita los conceptos visuales oficiales en WebP/JPG utilizados en la vitrina 3D y catálogo.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowAddForm(!showAddForm)}
          className="px-4 py-2.5 rounded-xl text-xs font-bold bg-[#0066FF] hover:bg-[#0052cc] text-white shadow-xs inline-flex items-center gap-1.5 transition-all cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>{showAddForm ? 'Cancelar' : 'Agregar asset'}</span>
        </button>
      </div>

      {feedback && (
        <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-semibold flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{feedback}</span>
        </div>
      )}

      {error && (
        <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-900 text-xs font-semibold flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Formulario para agregar nuevo asset */}
      {showAddForm && (
        <form onSubmit={handleCreateAsset} className="bg-white rounded-2xl p-6 border border-slate-200/90 shadow-sm space-y-4">
          <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
            Nuevo Asset de Imagen
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Nombre descriptivo</label>
              <input
                type="text"
                placeholder="Ej. Restaurante Premium Concept"
                value={newAsset.name}
                onChange={(e) => setNewAsset({ ...newAsset, name: e.target.value })}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-900"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Ruta o URL</label>
              <input
                type="text"
                placeholder="/brand/showcase/ejemplo.webp"
                value={newAsset.url}
                onChange={(e) => setNewAsset({ ...newAsset, url: e.target.value })}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-mono text-slate-900"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Categoría</label>
              <select
                value={newAsset.category}
                onChange={(e) => setNewAsset({ ...newAsset, category: e.target.value as MediaAssetItem['category'] })}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900"
              >
                <option value="showcase">Showcase (Vitrina)</option>
                <option value="brand">Brand (Marca)</option>
                <option value="icon">Icon (Ícono)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Punto focal recomendado</label>
              <input
                type="text"
                placeholder="50% 50%"
                value={newAsset.focalPointDefault}
                onChange={(e) => setNewAsset({ ...newAsset, focalPointDefault: e.target.value })}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Plantilla recomendada</label>
              <select
                value={newAsset.recommendedTemplate || ''}
                onChange={(e) => setNewAsset({ ...newAsset, recommendedTemplate: (e.target.value as TemplateKey) || undefined })}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900"
              >
                <option value="">General / Ninguna</option>
                <option value="restaurant">Restaurante</option>
                <option value="distribution">Distribuidora</option>
                <option value="nightclub">Nightclub</option>
                <option value="retail">Ventas Express</option>
              </select>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setShowAddForm(false)}
              className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isProcessing}
              className="px-5 py-2 rounded-xl text-xs font-bold bg-[#0066FF] hover:bg-[#0052cc] text-white cursor-pointer disabled:opacity-50"
            >
              Guardar nuevo asset
            </button>
          </div>
        </form>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Grilla de Assets */}
        <div className="lg:col-span-7 space-y-4">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-400 block mb-1">
            Imágenes Registradas ({mediaAssets.length})
          </span>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {mediaAssets.map((asset) => {
              const isSelected = selectedAsset?.id === asset.id
              return (
                <div
                  key={asset.id}
                  onClick={() => handleSelect(asset)}
                  className={`bg-white rounded-2xl p-3 border transition-all cursor-pointer flex flex-col justify-between ${
                    isSelected
                      ? 'border-[#0066FF] shadow-sm ring-2 ring-blue-500/10'
                      : 'border-slate-200/80 hover:border-slate-300'
                  }`}
                >
                  <div className="aspect-16/10 rounded-xl overflow-hidden bg-[#06101c] mb-2.5 relative border border-slate-100">
                    <img
                      src={asset.url}
                      alt={asset.name}
                      style={{ objectPosition: asset.focalPointDefault }}
                      className="w-full h-full object-cover"
                    />
                  </div>

                  <div>
                    <h4 className="text-xs font-bold text-slate-900 truncate">
                      {asset.name}
                    </h4>
                    <p className="text-[11px] font-mono text-slate-400 truncate mt-0.5">
                      {asset.url}
                    </p>
                    <span className={`inline-flex mt-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${asset.status === 'published' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
                      {asset.status === 'published' ? 'Publicado' : 'Borrador'}
                    </span>
                  </div>

                  <div className="mt-2 pt-2 border-t border-slate-100 flex items-center justify-between text-[11px]">
                    <span className="text-slate-500 font-medium">
                      Foco: {asset.focalPointDefault}
                    </span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleCopy(asset.url)
                      }}
                      className="text-[#0066FF] font-bold hover:underline inline-flex items-center gap-1 cursor-pointer"
                    >
                      <Copy className="w-3 h-3" />
                      <span>{copiedUrl === asset.url ? '¡Copiado!' : 'Copiar URL'}</span>
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Previsualización y Edición en Detalle del Asset Seleccionado */}
        {selectedAsset && (
          <div className="lg:col-span-5 bg-white rounded-2xl p-6 border border-slate-200/90 shadow-2xs space-y-5 sticky top-6">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
                Detalle y Edición de Asset
              </h3>
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400 font-mono">
                  {editForm.category}
                </span>
                <button
                  type="button"
                  onClick={() => handleDelete(editForm.id, editForm.name)}
                  className="text-xs text-red-500 hover:text-red-700 px-1.5 py-1 rounded hover:bg-red-50 cursor-pointer"
                  title="Eliminar este asset"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            <div className="rounded-xl overflow-hidden bg-[#06101c] border border-slate-200 shadow-inner">
              <img
                src={editForm.url}
                alt={editForm.name}
                style={{ objectPosition: editForm.focalPointDefault }}
                className="w-full h-52 object-cover"
              />
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-slate-700 uppercase tracking-wider text-[10px] block mb-1">Nombre</label>
                <input
                  type="text"
                  value={editForm.name}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-900"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 uppercase tracking-wider text-[10px] block mb-1">Ruta local / URL</label>
                <input
                  type="text"
                  value={editForm.url}
                  onChange={(e) => setEditForm({ ...editForm, url: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-mono text-slate-800"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 uppercase tracking-wider text-[10px] block mb-1">Punto focal</label>
                  <select
                    value={editForm.focalPointDefault}
                    onChange={(e) => setEditForm({ ...editForm, focalPointDefault: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-xs text-slate-900"
                  >
                    <option value="50% 35%">Superior (50% 35%)</option>
                    <option value="50% 38%">Medio-Superior (50% 38%)</option>
                    <option value="50% 42%">Ligeramente arriba (50% 42%)</option>
                    <option value="50% 48%">Casi centro (50% 48%)</option>
                    <option value="50% 50%">Centro exacto (50% 50%)</option>
                    <option value="50% 60%">Inferior (50% 60%)</option>
                  </select>
                </div>

                <div>
                  <label className="font-bold text-slate-700 uppercase tracking-wider text-[10px] block mb-1">Estado del asset</label>
                  <select
                    value={editForm.status || 'draft'}
                    onChange={(e) => setEditForm({ ...editForm, status: e.target.value as 'published' | 'draft' })}
                    disabled={!canPublish}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 disabled:opacity-50"
                  >
                    <option value="draft">Borrador / privado de la biblioteca pública</option>
                    <option value="published">Publicado en el catálogo público</option>
                  </select>
                </div>

                <div>
                  <label className="font-bold text-slate-700 uppercase tracking-wider text-[10px] block mb-1">Plantilla asignada</label>
                  <select
                    value={editForm.recommendedTemplate || ''}
                    onChange={(e) => setEditForm({ ...editForm, recommendedTemplate: (e.target.value as TemplateKey) || undefined })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-xs text-slate-900"
                  >
                    <option value="">General / Ninguna</option>
                    <option value="restaurant">Restaurante</option>
                    <option value="distribution">Distribuidora</option>
                    <option value="nightclub">Nightclub</option>
                    <option value="retail">Ventas Express</option>
                  </select>
                </div>
              </div>

              <div className="pt-2 flex justify-end">
                <button
                  type="button"
                  onClick={handleSaveEdit}
                  disabled={isProcessing}
                  className="px-5 py-2 rounded-xl bg-[#0066FF] hover:bg-[#0052cc] text-white text-xs font-bold shadow-xs inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {isProcessing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                  <span>{isProcessing ? 'Guardando...' : 'Guardar asset'}</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
