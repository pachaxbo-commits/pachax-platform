import { useState } from 'react'
import { Copy } from 'lucide-react'
import { useCommercialConfig } from '../../store/commercialConfigStore'
import type { MediaAssetItem } from '../../types'

export function MediaSection() {
  const { mediaAssets } = useCommercialConfig()
  const [selectedAsset, setSelectedAsset] = useState<MediaAssetItem>(mediaAssets[0])
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null)

  const handleCopy = (url: string) => {
    navigator.clipboard?.writeText(url)
    setCopiedUrl(url)
    setTimeout(() => setCopiedUrl(null), 2000)
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
            Supervisa los conceptos visuales oficiales en WebP/JPG utilizados en la vitrina 3D y catálogo.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Grilla de Assets */}
        <div className="lg:col-span-7 space-y-4">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-400 block mb-1">
            Imágenes de Concepto Registradas ({mediaAssets.length})
          </span>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {mediaAssets.map((asset) => {
              const isSelected = selectedAsset.id === asset.id
              return (
                <div
                  key={asset.id}
                  onClick={() => setSelectedAsset(asset)}
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

        {/* Previsualización en Detalle del Asset Seleccionado */}
        <div className="lg:col-span-5 bg-white rounded-2xl p-6 border border-slate-200/90 shadow-2xs space-y-5 sticky top-6">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
              Detalle del Asset
            </h3>
            <span className="text-xs text-slate-400 font-mono">
              {selectedAsset.category}
            </span>
          </div>

          <div className="rounded-xl overflow-hidden bg-[#06101c] border border-slate-200 shadow-inner">
            <img
              src={selectedAsset.url}
              alt={selectedAsset.name}
              style={{ objectPosition: selectedAsset.focalPointDefault }}
              className="w-full h-56 object-cover"
            />
          </div>

          <div className="space-y-2 text-xs">
            <div>
              <span className="font-bold text-slate-500 uppercase tracking-wider text-[10px] block">Nombre</span>
              <p className="font-semibold text-slate-900 mt-0.5">{selectedAsset.name}</p>
            </div>

            <div>
              <span className="font-bold text-slate-500 uppercase tracking-wider text-[10px] block">Ruta local / URL</span>
              <p className="font-mono text-slate-700 bg-slate-50 p-2 rounded-lg border border-slate-100 break-all mt-0.5">
                {selectedAsset.url}
              </p>
            </div>

            <div>
              <span className="font-bold text-slate-500 uppercase tracking-wider text-[10px] block">Punto focal recomendado</span>
              <p className="font-semibold text-[#0066FF] mt-0.5">{selectedAsset.focalPointDefault}</p>
            </div>

            {selectedAsset.recommendedTemplate && (
              <div>
                <span className="font-bold text-slate-500 uppercase tracking-wider text-[10px] block">Plantilla asignada</span>
                <p className="font-semibold text-slate-800 capitalize mt-0.5">{selectedAsset.recommendedTemplate}</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
