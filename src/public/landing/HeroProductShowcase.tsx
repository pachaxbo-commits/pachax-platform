import { useState } from 'react'
import {
  Utensils,
  Truck,
  Store,
  CheckCircle2,
  Clock,
  Printer,
  Scale,
  Banknote,
  QrCode,
  ShieldCheck,
} from 'lucide-react'

export type HeroTemplateKey = 'restaurant' | 'distribution' | 'retail'

export function HeroProductShowcase() {
  const [activeTab, setActiveTab] = useState<HeroTemplateKey>('restaurant')

  return (
    <div className="w-full max-w-5xl mx-auto">
      {/* Contenedor principal de la ventana de producto */}
      <div className="rounded-2xl sm:rounded-3xl bg-white border border-slate-200/90 shadow-2xl shadow-slate-200/70 overflow-hidden ring-1 ring-slate-900/5 transition-all duration-300">
        {/* Barra superior de la ventana del sistema */}
        <div className="bg-slate-50/90 border-b border-slate-200/80 px-4 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-3">
          {/* Controles de ventana y etiqueta de software */}
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="flex items-center gap-1.5" aria-hidden="true">
              <div className="w-2.5 h-2.5 rounded-full bg-slate-300" />
              <div className="w-2.5 h-2.5 rounded-full bg-slate-300" />
              <div className="w-2.5 h-2.5 rounded-full bg-slate-300" />
            </div>
            <div className="h-3.5 w-px bg-slate-200 hidden sm:block" />
            <span className="text-xs font-bold text-slate-700 tracking-tight flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              PACHAX Entorno Operativo
            </span>
          </div>

          {/* Selector interactivo de plantillas */}
          <div className="flex items-center p-1 bg-slate-200/70 rounded-xl text-xs font-semibold">
            <button
              onClick={() => setActiveTab('restaurant')}
              className={`px-2.5 sm:px-3 py-1.5 rounded-lg transition-all cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'restaurant'
                  ? 'bg-white text-slate-900 shadow-xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Utensils className="w-3.5 h-3.5 text-amber-600" />
              <span className="hidden xs:inline">Restaurante</span>
            </button>
            <button
              onClick={() => setActiveTab('distribution')}
              className={`px-2.5 sm:px-3 py-1.5 rounded-lg transition-all cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'distribution'
                  ? 'bg-white text-slate-900 shadow-xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Truck className="w-3.5 h-3.5 text-blue-600" />
              <span className="hidden xs:inline">Distribución</span>
            </button>
            <button
              onClick={() => setActiveTab('retail')}
              className={`px-2.5 sm:px-3 py-1.5 rounded-lg transition-all cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'retail'
                  ? 'bg-white text-slate-900 shadow-xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Store className="w-3.5 h-3.5 text-teal-600" />
              <span className="hidden xs:inline">Comercio</span>
            </button>
          </div>
        </div>

        {/* Cuerpo interactivo del showcase */}
        <div className="p-4 sm:p-7 bg-slate-50/40 min-h-[380px] sm:min-h-[420px] flex flex-col justify-between">
          {/* VISTA 1: RESTAURANTE */}
          {activeTab === 'restaurant' && (
            <div className="space-y-5 animate-in fade-in duration-300">
              {/* Encabezado contextual */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-3.5 sm:p-4 rounded-xl border border-slate-200/80 shadow-2xs">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-amber-50 text-amber-700 flex items-center justify-center font-bold text-sm border border-amber-200/60">
                    M-04
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-bold text-slate-900">Salón Principal • Mesa 4</h4>
                      <span className="text-[11px] font-semibold text-amber-800 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                        Consumiendo
                      </span>
                    </div>
                    <p className="text-xs text-slate-500">3 comensales • Mozo: Carlos R. • Abierta hace 24 min</p>
                  </div>
                </div>

                <div className="flex items-center gap-2 text-xs">
                  <span className="text-slate-500 font-medium">Consumo acumulado:</span>
                  <span className="text-base font-extrabold text-slate-900">Bs 142.50</span>
                </div>
              </div>

              {/* Paneles de división operativa */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* 1. Estado de Mesas */}
                <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-2xs space-y-3">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                    <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                      Plano de Salón
                    </span>
                    <span className="text-[11px] font-semibold text-slate-400">8 mesas</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="p-2 rounded-lg bg-amber-50 border border-amber-200/80">
                      <span className="font-bold text-amber-900 block">Mesa 4</span>
                      <span className="text-[11px] text-amber-700">Bs 142.50</span>
                    </div>
                    <div className="p-2 rounded-lg bg-emerald-50 border border-emerald-200/80">
                      <span className="font-bold text-emerald-900 block">Mesa 2</span>
                      <span className="text-[11px] text-emerald-700">Disponible</span>
                    </div>
                    <div className="p-2 rounded-lg bg-blue-50 border border-blue-200/80">
                      <span className="font-bold text-blue-900 block">Mesa 7</span>
                      <span className="text-[11px] text-blue-700">Cuenta pedida</span>
                    </div>
                    <div className="p-2 rounded-lg bg-emerald-50 border border-emerald-200/80">
                      <span className="font-bold text-emerald-900 block">Barra 1</span>
                      <span className="text-[11px] text-emerald-700">Disponible</span>
                    </div>
                  </div>
                </div>

                {/* 2. Comandas en Cocina (KDS) */}
                <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-2xs space-y-2.5">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                    <span className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-amber-600" />
                      Comanda en Cocina
                    </span>
                    <span className="text-[11px] font-bold text-teal-700 bg-teal-50 px-1.5 py-0.5 rounded">
                      Lote #2
                    </span>
                  </div>
                  <ul className="text-xs space-y-1.5 text-slate-700 font-medium">
                    <li className="flex items-center justify-between">
                      <span>2× Hamburguesa Suprema</span>
                      <span className="text-[11px] text-slate-400">Término medio</span>
                    </li>
                    <li className="flex items-center justify-between">
                      <span>1× Porción Papas Trufadas</span>
                      <span className="text-[11px] text-emerald-600 font-bold">Listo</span>
                    </li>
                    <li className="flex items-center justify-between">
                      <span>2× Limonada con Menta</span>
                      <span className="text-[11px] text-slate-400">Bar</span>
                    </li>
                  </ul>
                  <div className="pt-2 text-[11px] text-slate-400 flex items-center justify-between border-t border-slate-100">
                    <span>Ticket #1084</span>
                    <span className="flex items-center gap-1 text-slate-600">
                      <Printer className="w-3 h-3 text-slate-400" /> Comandera Cocina
                    </span>
                  </div>
                </div>

                {/* 3. Turno de Caja */}
                <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-2xs space-y-2.5">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                    <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                      Turno T-04
                    </span>
                    <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                      Abierto
                    </span>
                  </div>
                  <div className="space-y-1 text-xs">
                    <div className="flex justify-between text-slate-600">
                      <span>Fondo inicial:</span>
                      <span className="font-semibold text-slate-900">Bs 200.00</span>
                    </div>
                    <div className="flex justify-between text-slate-600">
                      <span>Ventas en efectivo:</span>
                      <span className="font-semibold text-slate-900">Bs 650.00</span>
                    </div>
                    <div className="flex justify-between text-slate-600">
                      <span>Cobros con QR:</span>
                      <span className="font-semibold text-slate-900">Bs 380.00</span>
                    </div>
                  </div>
                  <div className="pt-2 border-t border-slate-100 flex justify-between items-center text-xs">
                    <span className="font-bold text-slate-800">Efectivo en caja:</span>
                    <span className="font-extrabold text-slate-900 text-sm">Bs 850.00</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* VISTA 2: DISTRIBUCIÓN */}
          {activeTab === 'distribution' && (
            <div className="space-y-5 animate-in fade-in duration-300">
              {/* Encabezado contextual */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-3.5 sm:p-4 rounded-xl border border-slate-200/80 shadow-2xs">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-blue-50 text-blue-700 flex items-center justify-center font-bold text-sm border border-blue-200/60">
                    R-03
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-bold text-slate-900">Ruta Norte • Camión 02</h4>
                      <span className="text-[11px] font-semibold text-blue-800 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-200">
                        En reparto
                      </span>
                    </div>
                    <p className="text-xs text-slate-500">Chofer: Hugo Morales • Almacén Central • 14 clientes visitados</p>
                  </div>
                </div>

                <div className="flex items-center gap-2 text-xs">
                  <span className="text-slate-500 font-medium">Venta del día:</span>
                  <span className="text-base font-extrabold text-slate-900">Bs 447.00</span>
                </div>
              </div>

              {/* Paneles de distribución */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* 1. Control de Carga Física */}
                <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-2xs space-y-3">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                    <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                      Despacho y Carga
                    </span>
                    <span className="text-[11px] font-semibold text-slate-400">Kilos</span>
                  </div>
                  <div className="space-y-2 text-xs">
                    <div className="p-2 rounded-lg bg-slate-50 border border-slate-200/60">
                      <div className="flex justify-between font-bold text-slate-800">
                        <span>Salchicha Viena</span>
                        <span>25 kg desp.</span>
                      </div>
                      <div className="flex justify-between text-[11px] text-slate-500 mt-1">
                        <span>Vendido: 6 kg</span>
                        <span className="text-emerald-600 font-semibold">Retorno: 19 kg</span>
                      </div>
                    </div>
                    <div className="p-2 rounded-lg bg-slate-50 border border-slate-200/60">
                      <div className="flex justify-between font-bold text-slate-800">
                        <span>Chorizo Parrillero</span>
                        <span>10 kg desp.</span>
                      </div>
                      <div className="flex justify-between text-[11px] text-slate-500 mt-1">
                        <span>Vendido: 3 kg</span>
                        <span className="text-emerald-600 font-semibold">Retorno: 7 kg</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 2. Cobranza y Créditos */}
                <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-2xs space-y-2.5">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                    <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                      Créditos y Cartera
                    </span>
                    <span className="text-[11px] font-bold text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded">
                      2 cobros
                    </span>
                  </div>
                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between text-slate-700">
                      <span>Venta en efectivo:</span>
                      <span className="font-semibold text-slate-900">Bs 288.00</span>
                    </div>
                    <div className="flex justify-between text-slate-700">
                      <span>Crédito otorgado:</span>
                      <span className="font-semibold text-amber-700">Bs 159.00</span>
                    </div>
                    <div className="flex justify-between text-slate-700">
                      <span>Cobros de deuda previa:</span>
                      <span className="font-semibold text-emerald-700">Bs 100.00</span>
                    </div>
                    <div className="flex justify-between text-slate-700">
                      <span>Gastos de combustible:</span>
                      <span className="font-semibold text-rose-600">- Bs 20.00</span>
                    </div>
                  </div>
                </div>

                {/* 3. Cuadre de Chofer */}
                <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-2xs space-y-2.5">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                    <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                      Liquidación Chofer
                    </span>
                    <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200 flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" /> Cuadrado
                    </span>
                  </div>
                  <div className="space-y-1.5 text-xs text-slate-600">
                    <div className="flex justify-between">
                      <span>Efectivo a entregar:</span>
                      <span className="font-bold text-slate-900 text-sm">Bs 368.00</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Efectivo declarado:</span>
                      <span className="font-semibold text-slate-800">Bs 368.00</span>
                    </div>
                    <div className="flex justify-between text-[11px] text-slate-500 pt-1 border-t border-slate-100">
                      <span>Variance de inventario:</span>
                      <span className="font-bold text-emerald-600">0.0 kg (Exacto)</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* VISTA 3: COMERCIO / VENTA RÁPIDA */}
          {activeTab === 'retail' && (
            <div className="space-y-5 animate-in fade-in duration-300">
              {/* Encabezado contextual */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-3.5 sm:p-4 rounded-xl border border-slate-200/80 shadow-2xs">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-teal-50 text-teal-700 flex items-center justify-center font-bold text-sm border border-teal-200/60">
                    <Scale className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-bold text-slate-900">Mostrador #1 • Venta Mixta</h4>
                      <span className="text-[11px] font-semibold text-teal-800 bg-teal-50 px-2 py-0.5 rounded-full border border-teal-200">
                        Balanza Conectada
                      </span>
                    </div>
                    <p className="text-xs text-slate-500">Unidades y peso en la misma transacción • Cliente en mostrador</p>
                  </div>
                </div>

                <div className="flex items-center gap-2 text-xs">
                  <span className="text-slate-500 font-medium">Total Ticket:</span>
                  <span className="text-base font-extrabold text-slate-900">Bs 51.50</span>
                </div>
              </div>

              {/* Paneles de comercio */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* 1. Lectura de Balanza */}
                <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-2xs space-y-3">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                    <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                      Lectura de Balanza
                    </span>
                    <span className="text-[11px] font-bold text-teal-600 bg-teal-50 px-1.5 py-0.5 rounded">
                      En vivo
                    </span>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-900 text-white text-center space-y-1">
                    <span className="text-xs text-slate-400 block">Queso Criollo Seleccionado</span>
                    <span className="text-2xl font-black font-mono tracking-tight text-emerald-400">
                      0.325 kg
                    </span>
                    <span className="text-[11px] text-slate-300 block">
                      @ Bs 60.00/kg = <strong className="text-white">Bs 19.50</strong>
                    </span>
                  </div>
                </div>

                {/* 2. Carrito Mixto */}
                <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-2xs space-y-2.5">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                    <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                      Ticket en Curso
                    </span>
                    <span className="text-[11px] font-semibold text-slate-400">3 líneas</span>
                  </div>
                  <ul className="text-xs space-y-2 text-slate-700">
                    <li className="flex justify-between">
                      <span>1× Helado Artesanal (vaso)</span>
                      <span className="font-semibold text-slate-900">Bs 18.00</span>
                    </li>
                    <li className="flex justify-between bg-teal-50/70 p-1 rounded font-medium text-teal-900">
                      <span>325g Queso Criollo</span>
                      <span className="font-bold">Bs 19.50</span>
                    </li>
                    <li className="flex justify-between">
                      <span>2× Jugo Natural 300ml</span>
                      <span className="font-semibold text-slate-900">Bs 14.00</span>
                    </li>
                  </ul>
                </div>

                {/* 3. Cobro Inmediato */}
                <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-2xs space-y-2.5">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                    <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                      Cobro Rápido
                    </span>
                    <span className="text-[11px] font-semibold text-slate-400">Métodos</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="p-2 rounded-lg bg-emerald-50 border border-emerald-200 text-center font-bold text-emerald-900 flex flex-col items-center gap-1">
                      <Banknote className="w-4 h-4 text-emerald-700" />
                      <span>Efectivo</span>
                    </div>
                    <div className="p-2 rounded-lg bg-blue-50 border border-blue-200 text-center font-bold text-blue-900 flex flex-col items-center gap-1">
                      <QrCode className="w-4 h-4 text-blue-700" />
                      <span>Cobro QR</span>
                    </div>
                  </div>
                  <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
                    <span className="text-slate-500">Vuelto calculado:</span>
                    <span className="font-bold text-slate-900">Bs 8.50 (paga Bs 60)</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Micro-pills inferiores de confiabilidad */}
          <div className="pt-5 border-t border-slate-200/70 flex flex-wrap items-center justify-between gap-3 text-[11px] sm:text-xs text-slate-500 font-medium">
            <div className="flex items-center gap-4 flex-wrap">
              <span className="inline-flex items-center gap-1 text-slate-700 font-semibold">
                <ShieldCheck className="w-3.5 h-3.5 text-teal-600" />
                Aislamiento multiempresa estricto
              </span>
              <span className="inline-flex items-center gap-1 text-slate-700 font-semibold">
                <Printer className="w-3.5 h-3.5 text-blue-600" />
                Impresión térmica Bluetooth & Red
              </span>
            </div>
            <span className="text-slate-400">Diseñado para celular, tablet y mostrador</span>
          </div>
        </div>
      </div>
    </div>
  )
}
