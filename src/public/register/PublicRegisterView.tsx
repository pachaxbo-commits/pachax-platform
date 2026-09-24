import { useState, useEffect } from 'react'
import {
  ArrowRight,
  ArrowLeft,
  Utensils,
  Truck,
  Store,
  Check,
} from 'lucide-react'
import { BrandMark } from '../components/BrandMark'
import { usePublicRouter } from '../routing/usePublicRouter'
import '../publicExperience.css'

type BusinessType = 'restaurant_pos' | 'route_distribution' | 'gelateria_weight_cafe'

interface ColorPreset {
  id: string
  name: string
  primary: string
  accent: string
}

const BRAND_PALETTES: ColorPreset[] = [
  { id: 'sapphire', name: 'Zafiro & Cian', primary: '#2563EB', accent: '#0EA5A8' },
  { id: 'emerald', name: 'Esmeralda & Ámbar', primary: '#0D9488', accent: '#F59E0B' },
  { id: 'slate', name: 'Carbón & Azul', primary: '#1E293B', accent: '#3B82F6' },
  { id: 'amber', name: 'Ámbar & Café', primary: '#B45309', accent: '#D97706' },
]

export function PublicRegisterView() {
  const { navigate, templateParam } = usePublicRouter()

  // Pasos: 1 = Cuenta, 2 = Empresa, 3 = Plantilla, 4 = Personalización, 5 = Confirmación
  const [currentStep, setCurrentStep] = useState<number>(1)

  // Datos del formulario
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [companyName, setCompanyName] = useState('')

  // Plantilla preseleccionada desde query param
  const [selectedTemplate, setSelectedTemplate] = useState<BusinessType>(() => {
    if (templateParam === 'restaurant_pos' || templateParam === 'restaurant') return 'restaurant_pos'
    if (templateParam === 'route_distribution' || templateParam === 'distribution') return 'route_distribution'
    if (templateParam === 'gelateria_weight_cafe' || templateParam === 'retail') return 'gelateria_weight_cafe'
    return 'restaurant_pos'
  })

  // Paleta de personalización
  const [selectedPalette, setSelectedPalette] = useState<ColorPreset>(BRAND_PALETTES[0])

  useEffect(() => {
    if (templateParam) {
      if (templateParam === 'restaurant_pos' || templateParam === 'restaurant') {
        setSelectedTemplate('restaurant_pos')
      } else if (templateParam === 'route_distribution' || templateParam === 'distribution') {
        setSelectedTemplate('route_distribution')
      } else if (templateParam === 'gelateria_weight_cafe' || templateParam === 'retail') {
        setSelectedTemplate('gelateria_weight_cafe')
      }
    }
  }, [templateParam])

  const handleNext = (e: React.FormEvent) => {
    e.preventDefault()
    if (currentStep < 5) {
      setCurrentStep((prev) => prev + 1)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }

  const handlePrev = () => {
    if (currentStep > 1) {
      setCurrentStep((prev) => prev - 1)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } else {
      navigate('/')
    }
  }

  return (
    <main className="register-public min-h-screen w-full bg-slate-50 flex flex-col justify-between selection:bg-slate-900 selection:text-white font-sans">
      {/* Barra superior */}
      <div className="w-full max-w-5xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
        <button
          onClick={handlePrev}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-900 transition cursor-pointer p-1"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>{currentStep === 1 ? 'Volver al inicio' : 'Paso anterior'}</span>
        </button>

        <BrandMark
          size="sm"
          href="/"
          onClick={(e) => {
            e.preventDefault()
            navigate('/')
          }}
        />

        <button
          onClick={() => navigate('/login')}
          className="text-xs font-semibold text-slate-700 hover:text-slate-950 transition cursor-pointer"
        >
          Ya tengo cuenta
        </button>
      </div>

      {/* Contenido principal del Onboarding */}
      <div className="flex-1 flex items-center justify-center p-4 sm:p-6">
        <div className="w-full max-w-2xl bg-white rounded-3xl border border-slate-200/90 shadow-xl p-6 sm:p-10 ring-1 ring-slate-900/5">
          {/* Indicador de pasos visual */}
          <div className="mb-8">
            <div className="flex items-center justify-between text-xs font-bold text-slate-400 mb-2">
              <span className={currentStep >= 1 ? 'text-slate-900' : ''}>1. Cuenta</span>
              <span className={currentStep >= 2 ? 'text-slate-900' : ''}>2. Empresa</span>
              <span className={currentStep >= 3 ? 'text-slate-900' : ''}>3. Plantilla</span>
              <span className={currentStep >= 4 ? 'text-slate-900' : ''}>4. Marca</span>
              <span className={currentStep === 5 ? 'text-slate-900' : ''}>5. Resumen</span>
            </div>
            <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-slate-900 transition-all duration-300 rounded-full"
                style={{ width: `${(currentStep / 5) * 100}%` }}
              />
            </div>
          </div>

          {/* PASO 1: CUENTA */}
          {currentStep === 1 && (
            <form onSubmit={handleNext} className="space-y-5 animate-in fade-in duration-200">
              <div>
                <span className="text-xs font-bold text-teal-700 bg-teal-50 px-2.5 py-0.5 rounded-full border border-teal-200">
                  Paso 1 de 5
                </span>
                <h1 className="text-2xl font-extrabold text-slate-950 tracking-tight mt-2">
                  Crea tu cuenta de administrador
                </h1>
                <p className="text-xs sm:text-sm text-slate-500 mt-1">
                  Esta será la cuenta propietaria y administradora inicial de la empresa en PACHAX.
                </p>
              </div>

              <div className="space-y-3.5">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Nombre completo *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ej. Martín Soliz"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 sm:py-3 text-sm text-slate-900 placeholder-slate-400 focus:outline-hidden focus:border-slate-900 focus:bg-white transition"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Correo electrónico laboral *
                  </label>
                  <input
                    type="email"
                    required
                    placeholder="nombre@miempresa.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 sm:py-3 text-sm text-slate-900 placeholder-slate-400 focus:outline-hidden focus:border-slate-900 focus:bg-white transition"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Contraseña *
                  </label>
                  <input
                    type="password"
                    required
                    minLength={6}
                    placeholder="Mínimo 6 caracteres"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 sm:py-3 text-sm text-slate-900 placeholder-slate-400 focus:outline-hidden focus:border-slate-900 focus:bg-white transition"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={!fullName.trim() || !email.trim() || password.length < 6}
                className="w-full py-3.5 text-sm font-bold text-white bg-slate-900 hover:bg-slate-800 disabled:bg-slate-300 rounded-xl transition shadow-xs cursor-pointer flex items-center justify-center gap-2 mt-4"
              >
                <span>Continuar a datos de empresa</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>
          )}

          {/* PASO 2: EMPRESA */}
          {currentStep === 2 && (
            <form onSubmit={handleNext} className="space-y-5 animate-in fade-in duration-200">
              <div>
                <span className="text-xs font-bold text-teal-700 bg-teal-50 px-2.5 py-0.5 rounded-full border border-teal-200">
                  Paso 2 de 5
                </span>
                <h1 className="text-2xl font-extrabold text-slate-950 tracking-tight mt-2">
                  Datos de tu empresa
                </h1>
                <p className="text-xs sm:text-sm text-slate-500 mt-1">
                  Tu empresa contará con su propio espacio aislado y catálogo independiente.
                </p>
              </div>

              <div className="space-y-3.5">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Nombre comercial de la empresa *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ej. Distribuidora Santa Cruz o Bistró 10"
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 sm:py-3 text-sm text-slate-900 placeholder-slate-400 focus:outline-hidden focus:border-slate-900 focus:bg-white transition"
                  />
                  <p className="text-[11px] text-slate-400 mt-1.5">
                    El backend creará automáticamente tu sucursal principal.
                  </p>
                </div>
              </div>

              <button
                type="submit"
                disabled={!companyName.trim()}
                className="w-full py-3.5 text-sm font-bold text-white bg-slate-900 hover:bg-slate-800 disabled:bg-slate-300 rounded-xl transition shadow-xs cursor-pointer flex items-center justify-center gap-2 mt-4"
              >
                <span>Continuar a selección de plantilla</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>
          )}

          {/* PASO 3: PLANTILLA */}
          {currentStep === 3 && (
            <form onSubmit={handleNext} className="space-y-5 animate-in fade-in duration-200">
              <div>
                <span className="text-xs font-bold text-teal-700 bg-teal-50 px-2.5 py-0.5 rounded-full border border-teal-200">
                  Paso 3 de 5
                </span>
                <h1 className="text-2xl font-extrabold text-slate-950 tracking-tight mt-2">
                  Selecciona la plantilla inicial
                </h1>
                <p className="text-xs sm:text-sm text-slate-500 mt-1">
                  Determina los módulos de inicio. Siempre podrás habilitar módulos adicionales.
                </p>
              </div>

              <div className="space-y-3">
                {[
                  {
                    id: 'restaurant_pos' as BusinessType,
                    name: 'Restaurante & Gastronomía',
                    icon: Utensils,
                    badgeColor: 'text-amber-700 bg-amber-50 border-amber-200',
                    desc: 'Mesas, cuentas activas, comandas por lote a cocina (KDS), POS y turnos con arqueo ciego.',
                  },
                  {
                    id: 'route_distribution' as BusinessType,
                    name: 'Producción y distribución',
                    icon: Truck,
                    badgeColor: 'text-blue-700 bg-blue-50 border-blue-200',
                    desc: 'Carga de camión, despacho de rutas, créditos de cartera, liquidación de choferes y almacenes.',
                  },
                  {
                    id: 'gelateria_weight_cafe' as BusinessType,
                    name: 'Comercio / Venta rápida',
                    icon: Store,
                    badgeColor: 'text-teal-700 bg-teal-50 border-teal-200',
                    desc: 'Mostrador ágil, balanza de peso digital en gramos, carrito mixto y cobro rápido con QR o efectivo.',
                  },
                ].map((item) => {
                  const Icon = item.icon
                  const isSelected = selectedTemplate === item.id
                  return (
                    <div
                      key={item.id}
                      onClick={() => setSelectedTemplate(item.id)}
                      className={`p-4 rounded-2xl border transition cursor-pointer flex items-start gap-4 ${
                        isSelected
                          ? 'border-slate-950 bg-slate-900/5 shadow-xs ring-1 ring-slate-950'
                          : 'border-slate-200 hover:border-slate-300 bg-white'
                      }`}
                    >
                      <div
                        className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border ${item.badgeColor}`}
                      >
                        <Icon className="w-5 h-5" />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center justify-between">
                          <h4 className="text-sm font-bold text-slate-900">{item.name}</h4>
                          {isSelected && <Check className="w-4 h-4 text-slate-950" />}
                        </div>
                        <p className="text-xs text-slate-500 mt-1 leading-relaxed">{item.desc}</p>
                      </div>
                    </div>
                  )
                })}
              </div>

              <button
                type="submit"
                className="w-full py-3.5 text-sm font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-xl transition shadow-xs cursor-pointer flex items-center justify-center gap-2 mt-4"
              >
                <span>Continuar a personalización visual</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>
          )}

          {/* PASO 4: PERSONALIZACIÓN */}
          {currentStep === 4 && (
            <form onSubmit={handleNext} className="space-y-5 animate-in fade-in duration-200">
              <div>
                <span className="text-xs font-bold text-teal-700 bg-teal-50 px-2.5 py-0.5 rounded-full border border-teal-200">
                  Paso 4 de 5
                </span>
                <h1 className="text-2xl font-extrabold text-slate-950 tracking-tight mt-2">
                  Identidad visual de tu empresa
                </h1>
                <p className="text-xs sm:text-sm text-slate-500 mt-1">
                  Elige los colores con los que tu equipo identificará su sistema diario.
                </p>
              </div>

              {/* Previsualización en vivo */}
              <div className="rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
                <div
                  className="px-4 py-3 text-white flex items-center justify-between transition-colors duration-200"
                  style={{ backgroundColor: selectedPalette.primary }}
                >
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-lg bg-white/20 flex items-center justify-center font-bold text-xs">
                      {companyName ? companyName[0].toUpperCase() : 'E'}
                    </div>
                    <span className="text-xs font-bold tracking-tight">
                      {companyName || 'Tu Empresa'}
                    </span>
                  </div>
                  <span
                    className="text-[10px] font-bold px-2 py-0.5 rounded-full text-white"
                    style={{ backgroundColor: selectedPalette.accent }}
                  >
                    Activo
                  </span>
                </div>
                <div className="p-3 bg-slate-50 text-xs text-slate-500 flex justify-between">
                  <span>Sucursal principal</span>
                  <span>Plantilla: {selectedTemplate === 'restaurant_pos' ? 'Restaurante' : selectedTemplate === 'route_distribution' ? 'Distribución' : 'Comercio'}</span>
                </div>
              </div>

              {/* Paletas */}
              <div className="space-y-2">
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Selecciona una paleta de marca
                </label>
                <div className="grid grid-cols-2 gap-2.5">
                  {BRAND_PALETTES.map((palette) => (
                    <button
                      key={palette.id}
                      type="button"
                      onClick={() => setSelectedPalette(palette)}
                      className={`p-3 rounded-xl border text-left text-xs transition cursor-pointer flex items-center justify-between ${
                        selectedPalette.id === palette.id
                          ? 'border-slate-900 bg-slate-900/5 font-bold text-slate-950 ring-1 ring-slate-900'
                          : 'border-slate-200 hover:border-slate-300 text-slate-600'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <div className="flex -space-x-1">
                          <span
                            className="w-4 h-4 rounded-full border border-white"
                            style={{ backgroundColor: palette.primary }}
                          />
                          <span
                            className="w-4 h-4 rounded-full border border-white"
                            style={{ backgroundColor: palette.accent }}
                          />
                        </div>
                        <span>{palette.name}</span>
                      </div>
                      {selectedPalette.id === palette.id && (
                        <Check className="w-3.5 h-3.5 text-slate-900" />
                      )}
                    </button>
                  ))}
                </div>
              </div>

              <button
                type="submit"
                className="w-full py-3.5 text-sm font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-xl transition shadow-xs cursor-pointer flex items-center justify-center gap-2 mt-4"
              >
                <span>Continuar al resumen final</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>
          )}

          {/* PASO 5: REVISIÓN / RESUMEN PREVIO */}
          {currentStep === 5 && (
            <div className="space-y-5 animate-in fade-in duration-200">
              <div className="text-center space-y-2">
                <span className="text-xs font-bold text-slate-600 bg-slate-100 px-2.5 py-0.5 rounded-full border border-slate-200">
                  Paso 5 de 5
                </span>
                <h1 className="text-2xl font-extrabold text-slate-950 tracking-tight mt-2">
                  Revisa tu configuración
                </h1>
                <p className="text-xs sm:text-sm text-slate-500 max-w-md mx-auto leading-relaxed">
                  Estos serán los datos iniciales de tu empresa cuando completes el registro y se active tu entorno.
                </p>
              </div>

              {/* Resumen en tarjeta */}
              <div className="bg-slate-50 rounded-2xl border border-slate-200/80 p-4 sm:p-5 space-y-3 text-xs">
                <div className="flex justify-between py-1 border-b border-slate-200/60">
                  <span className="text-slate-500">Cuenta administradora:</span>
                  <span className="font-bold text-slate-900">{fullName} ({email})</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-200/60">
                  <span className="text-slate-500">Empresa:</span>
                  <span className="font-bold text-slate-900">{companyName}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-200/60">
                  <span className="text-slate-500">Plantilla seleccionada:</span>
                  <span className="font-bold text-slate-900">
                    {selectedTemplate === 'restaurant_pos'
                      ? 'Restaurante & Gastronomía'
                      : selectedTemplate === 'route_distribution'
                      ? 'Producción y distribución'
                      : 'Comercio / Venta rápida'}
                  </span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-200/60">
                  <span className="text-slate-500">Sucursal inicial:</span>
                  <span className="font-bold text-slate-900">Sucursal principal</span>
                </div>
                <div className="flex justify-between py-1 items-center">
                  <span className="text-slate-500">Paleta de marca:</span>
                  <div className="flex items-center gap-1.5 font-bold text-slate-900">
                    <span
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: selectedPalette.primary }}
                    />
                    <span>{selectedPalette.name}</span>
                  </div>
                </div>
              </div>

              <div className="pt-2 space-y-3">
                <button
                  type="button"
                  disabled
                  className="w-full py-3.5 text-sm font-bold text-white bg-slate-400 rounded-xl transition shadow-xs cursor-not-allowed flex items-center justify-center gap-2 opacity-90"
                >
                  <span>Crear mi empresa</span>
                </button>

                <p className="text-[11px] text-slate-400 text-center leading-relaxed">
                  El registro directo y la creación automática de empresas se conectará en la siguiente fase de despliegue.
                </p>

                <div className="text-center pt-1">
                  <button
                    type="button"
                    onClick={() => setCurrentStep(1)}
                    className="text-xs text-slate-600 hover:text-slate-950 font-semibold underline cursor-pointer"
                  >
                    Editar datos configurados
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Footer discreto */}
      <div className="w-full max-w-5xl mx-auto px-4 py-4 text-center text-xs text-slate-400">
        PACHAX Software Empresarial Adaptable • Registro de nuevas organizaciones
      </div>
    </main>
  )
}
