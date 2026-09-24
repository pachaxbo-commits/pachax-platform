import { WifiOff, Printer, ShieldCheck, Scale, Cpu, Users } from 'lucide-react'

export function OperationsFeatures() {
  const features = [
    {
      icon: WifiOff,
      title: 'Resiliencia y Operación en Ruta',
      desc: 'Diseñado para continuar vendiendo y emitiendo notas de entrega incluso si la conexión móvil falla. Las operaciones se consolidan ordenadamente.',
    },
    {
      icon: Printer,
      title: 'Impresión Térmica 58mm y 80mm',
      desc: 'Conexión nativa con impresoras portátiles Bluetooth para choferes y terminales de red TCP para comandas en cocina y tickets de caja.',
    },
    {
      icon: ShieldCheck,
      title: 'Auditoría y Arqueo Ciego',
      desc: 'Cierre de turnos donde el cajero declara su efectivo sin conocer el teórico esperado. Trazabilidad exacta de cada anulación o descuento.',
    },
    {
      icon: Scale,
      title: 'Balanza e Integración por Peso',
      desc: 'Soporte nativo para balanzas digitales en mostrador, permitiendo ventas en gramos o fracciones combinadas con artículos por unidad.',
    },
    {
      icon: Users,
      title: 'Permisos Estrictos por Rol',
      desc: 'Mozo, cajero, chofer, cocinero o administrador: cada usuario visualiza exclusivamente los módulos y acciones autorizados para su función.',
    },
    {
      icon: Cpu,
      title: 'Arquitectura preparada para crecer',
      desc: 'La separación por empresa está prevista en la plataforma. Su activación comercial requiere completar y validar el backend de aislamiento.',
    },
  ]

  return (
    <section id="producto" className="py-16 sm:py-24 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-2xl mx-auto mb-12 sm:mb-16 space-y-3">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-500 bg-slate-100 px-3 py-1 rounded-full border border-slate-200">
            Confiabilidad en Operación
          </span>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-slate-950 tracking-tight">
            Construido para el trabajo del día a día
          </h2>
          <p className="text-sm sm:text-base text-slate-600 leading-relaxed">
            Sin complejidades innecesarias. Software rápido, estable y adaptado al ritmo real de negocios que no pueden detenerse.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8">
          {features.map((f, idx) => {
            const Icon = f.icon
            return (
              <div
                key={idx}
                className="bg-slate-50/70 rounded-2xl border border-slate-200/80 p-6 space-y-3 hover:border-slate-300 hover:bg-slate-50 transition-all duration-200 group"
              >
                <div className="w-11 h-11 rounded-xl bg-white text-slate-900 border border-slate-200/80 shadow-2xs flex items-center justify-center group-hover:bg-slate-900 group-hover:text-white transition-colors">
                  <Icon className="w-5 h-5" />
                </div>
                <h3 className="text-base font-bold text-slate-900">
                  {f.title}
                </h3>
                <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                  {f.desc}
                </p>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
