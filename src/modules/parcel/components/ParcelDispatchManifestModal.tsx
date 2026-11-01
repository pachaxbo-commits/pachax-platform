import React, { useState } from 'react'
import {
  X,
  Truck,
  CheckSquare,
  Square,
  AlertCircle,
  FileText,
  Save,
} from 'lucide-react'
import type { ParcelBranch, ParcelShipment, DispatchManifest } from '../types'
import { generateManifestPdf } from '../domain/parcelDocuments'

interface ParcelDispatchManifestModalProps {
  isOpen: boolean
  onClose: () => void
  branches: ParcelBranch[]
  currentBranchId: string
  availableShipments: ParcelShipment[]
  onSubmit: (data: {
    originBranchId: string
    destinationBranchId: string
    driverOrResponsible: string
    vehiclePlate?: string
    parcelIds: string[]
  }) => DispatchManifest
  companyInfo?: import("../types").DocumentCompanyContext
}

export function ParcelDispatchManifestModal({
  isOpen,
  onClose,
  branches,
  currentBranchId,
  availableShipments,
  onSubmit,
  companyInfo,
}: ParcelDispatchManifestModalProps) {
  const defaultDest = branches.find(b => b.id !== currentBranchId) || branches[1]
  const [destinationId, setDestinationId] = useState(defaultDest?.id || '')
  const [driver, setDriver] = useState('')
  const [vehiclePlate, setVehiclePlate] = useState('')
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [createdManifest, setCreatedManifest] = useState<DispatchManifest | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Encomiendas filtradas hacia el destino seleccionado que estén listas para despacho
  const eligibleShipments = availableShipments.filter(
    s => s.destinationBranchId === destinationId && (s.status === 'received' || s.status === 'pending_dispatch')
  )

  const toggleSelectAll = () => {
    if (selectedIds.length === eligibleShipments.length) {
      setSelectedIds([])
    } else {
      setSelectedIds(eligibleShipments.map(s => s.id))
    }
  }

  const toggleSelect = (id: string) => {
    if (selectedIds.includes(id)) {
      setSelectedIds(selectedIds.filter(i => i !== id))
    } else {
      setSelectedIds([...selectedIds, id])
    }
  }

  const handleCreateManifest = (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!driver.trim()) {
      setError('Por favor ingresa el nombre del chofer o responsable del traslado.')
      return
    }
    if (selectedIds.length === 0) {
      setError('Debes seleccionar al menos una encomienda para incluir en el manifiesto.')
      return
    }

    try {
      const manifest = onSubmit({
        originBranchId: currentBranchId,
        destinationBranchId: destinationId,
        driverOrResponsible: driver.trim(),
        vehiclePlate: vehiclePlate.trim() || undefined,
        parcelIds: selectedIds,
      })
      setCreatedManifest(manifest)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error creando el manifiesto de despacho.')
    }
  }

  const handleDownloadManifestPdf = async () => {
    if (!createdManifest) return
    const { url, filename } = await generateManifestPdf(createdManifest, availableShipments, companyInfo)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }

  const totalPackagesSelected = eligibleShipments
    .filter(s => selectedIds.includes(s.id))
    .reduce((acc, s) => acc + s.packageCount, 0)

  const totalWeightSelected = eligibleShipments
    .filter(s => selectedIds.includes(s.id))
    .reduce((acc, s) => acc + s.totalWeightKg, 0)

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-2 sm:p-4 overflow-y-auto">
      <div className="relative w-full max-w-3xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden my-auto max-h-[92vh] flex flex-col font-sans">
        {/* Cabecera */}
        <div className="bg-slate-900 text-white px-5 py-3.5 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-teal-500 text-slate-950 flex items-center justify-center font-bold">
              <Truck className="w-5 h-5 text-slate-950" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-black tracking-tight">Despacho & Manifiesto de Carga</h2>
              <p className="text-xs text-slate-300">Agrupar encomiendas y emitir manifiesto de traslado interdepartamental</p>
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

        {createdManifest ? (
          /* Pantalla de confirmación con descarga de PDF */
          <div className="p-6 text-center space-y-4">
            <div className="w-14 h-14 bg-teal-100 text-teal-800 rounded-full flex items-center justify-center mx-auto">
              <Truck className="w-8 h-8" />
            </div>
            <h3 className="text-xl font-black text-slate-900">¡Manifiesto Emitido Exitosamente!</h3>
            <p className="text-sm text-slate-600">
              Manifiesto N° <strong className="font-mono text-teal-800">{createdManifest.manifestNumber}</strong> generado con{' '}
              <strong>{createdManifest.parcelIds.length}</strong> encomiendas asignadas al viaje.
            </p>

            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl text-left max-w-md mx-auto text-xs space-y-1">
              <div><strong>Destino:</strong> {createdManifest.destinationCity}</div>
              <div><strong>Conductor:</strong> {createdManifest.driverOrResponsible}</div>
              <div><strong>Placa:</strong> {createdManifest.vehiclePlate || 'Sin placa'}</div>
              <div><strong>Total Bultos / Peso:</strong> {createdManifest.totalPackages} bultos · {createdManifest.totalWeightKg} kg</div>
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-2.5 pt-3">
              <button
                type="button"
                onClick={handleDownloadManifestPdf}
                className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-bold text-xs shadow-md flex items-center justify-center gap-2 transition cursor-pointer"
              >
                <FileText className="w-4 h-4" />
                <span>Descargar Manifiesto (PDF)</span>
              </button>
              <button
                type="button"
                onClick={onClose}
                className="w-full sm:w-auto px-4 py-2.5 rounded-xl border border-slate-300 font-bold text-xs text-slate-700 hover:bg-slate-100 transition cursor-pointer"
              >
                Cerrar
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleCreateManifest} className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 text-xs sm:text-sm">
            {error && (
              <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl flex items-center gap-2 text-xs font-semibold">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">Agencia Destino *</label>
                <select
                  value={destinationId}
                  onChange={e => {
                    setDestinationId(e.target.value)
                    setSelectedIds([])
                  }}
                  className="w-full bg-white border border-slate-300 rounded-lg p-2 font-bold text-slate-900"
                >
                  {branches.filter(b => b.id !== currentBranchId).map(b => (
                    <option key={b.id} value={b.id}>{b.name} ({b.city})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">Conductor / Chofer Responsable *</label>
                <input
                  type="text"
                  placeholder="Ej. Donato Flores Mamani"
                  value={driver}
                  onChange={e => setDriver(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-lg p-2 font-medium text-slate-900"
                  required
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">Placa Vehículo (Bus / Camión)</label>
                <input
                  type="text"
                  placeholder="Ej. 1422-XBC"
                  value={vehiclePlate}
                  onChange={e => setVehiclePlate(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-lg p-2 font-medium text-slate-900 uppercase"
                />
              </div>
            </div>

            {/* Listado de encomiendas disponibles */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-900 text-xs uppercase tracking-wider">
                  Seleccionar Encomiendas a Despachar ({eligibleShipments.length} disponibles)
                </span>
                {eligibleShipments.length > 0 && (
                  <button
                    type="button"
                    onClick={toggleSelectAll}
                    className="text-xs font-bold text-teal-700 hover:text-teal-900 flex items-center gap-1"
                  >
                    {selectedIds.length === eligibleShipments.length ? 'Deseleccionar todas' : 'Seleccionar todas'}
                  </button>
                )}
              </div>

              {eligibleShipments.length === 0 ? (
                <div className="p-6 bg-slate-50 border border-slate-200 rounded-xl text-center text-slate-500 text-xs">
                  No hay encomiendas pendientes de despacho hacia este destino.
                </div>
              ) : (
                <div className="border border-slate-200 rounded-xl overflow-hidden divide-y divide-slate-100 max-h-60 overflow-y-auto">
                  {eligibleShipments.map(s => {
                    const isSelected = selectedIds.includes(s.id)
                    return (
                      <div
                        key={s.id}
                        onClick={() => toggleSelect(s.id)}
                        className={`p-3 flex items-center justify-between gap-3 cursor-pointer transition ${isSelected ? 'bg-teal-50/70' : 'hover:bg-slate-50'}`}
                      >
                        <div className="flex items-center gap-2.5">
                          {isSelected ? (
                            <CheckSquare className="w-5 h-5 text-teal-600 shrink-0" />
                          ) : (
                            <Square className="w-5 h-5 text-slate-400 shrink-0" />
                          )}
                          <div>
                            <div className="font-black text-slate-900 text-xs font-mono">{s.trackingCode}</div>
                            <div className="text-[11px] text-slate-600">
                              Para: <strong>{s.recipient.name}</strong> ({s.destinationCity})
                            </div>
                            <div className="text-[10px] text-slate-500">{s.declaredSummary}</div>
                          </div>
                        </div>

                        <div className="text-right text-xs shrink-0">
                          <span className="font-bold text-slate-800">{s.packageCount} bulto(s)</span>
                          <span className="text-slate-500 block text-[10px]">{s.totalWeightKg} kg</span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Resumen del manifiesto */}
            <div className="p-3 bg-slate-100 rounded-xl flex items-center justify-between text-xs font-bold text-slate-800">
              <div>
                <span>Seleccionadas: {selectedIds.length} guías</span>
                <span className="text-slate-500 font-normal ml-2">
                  ({totalPackagesSelected} bultos totales · {totalWeightSelected} kg)
                </span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl border border-slate-300 font-bold text-xs text-slate-700 hover:bg-slate-100"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={selectedIds.length === 0}
                className="px-6 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-bold text-xs shadow-md disabled:bg-slate-300 disabled:cursor-not-allowed flex items-center gap-2"
              >
                <Save className="w-4 h-4" />
                <span>Generar Manifiesto de Despacho</span>
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
