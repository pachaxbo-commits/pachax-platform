# Bitácora de Trabajo — GEMINI (Bloque G1)
## Rediseño Real de la Landing + Corrección de Secciones Rotas

- **Fecha:** 23 de Octubre de 2026
- **Rama de Trabajo:** `gemini/landing-distribution-tour`
- **Worktree Aislado:** `C:\PACHAX-worktrees\gemini-landing-distribution-tour`
- **Base de Origen:** `origin/main` (`958cbac36f78bc2b772c7aeeae397c88b0ea1a94`)
- **Estado de Aislamiento:** Trabajo completamente aislado de la rama de Codex (`nightclub-main-reconcile`) y de la rama local de Darío (`cambios-dario`).

---

## 1. Diagnóstico Inicial y Problemas Resueltos

| Sección | Estado Anterior | Causa Raíz | Solución Implementada en G1 |
| :--- | :--- | :--- | :--- |
| **Sección de Planes** (`TemplatePricingSection.tsx`) | Rota / En blanco en web pública. | Todos los planes en `pricingConfig.ts` tenían `status: 'draft'`, por lo que `publishedPlansByTemplate` devolvía un array vacío `[]`. | Re-arquitectura en dos caminos diferenciados: **Implementación Especializada** (para Distribución, Restaurante Salón y Nightclub) y **Autoservicio con Planes Directos** (Restaurante Rápido y Comercio Balanza) con toggle mensual/anual (-15%), cálculo de ahorros y CTA a `/register`. |
| **Sección de Onboarding** (`RealOnboardingSection.tsx`) | Estética de IA genérica con 5 pasos desfasados del producto real. | Disociación con el asistente real `OnboardingWizard.tsx`. | Rediseño en 4 pasos canónicos (Empresa & NIT, Plantilla Canónica, Paleta Oficial PACHAX & Logo, y Aprovisionamiento Seguro) con simulador interactivo en viewport azul noche. |
| **Sección de Tutoriales** (`GuidedTutorialsSection.tsx`) | Simulación estática y limitada a un solo flujo genérico. | No reflejaba los distintos rubros ni el componente real `RestaurantInteractiveTour.tsx`. | Rediseño completo con selector por tabs para los 4 rubros (Restaurante, Distribución, Nightclub, Comercio), foco de atención tipo spotlight (`ring-4 ring-amber-300`) y botón directo para abrir la demo interactiva. |
| **Extras y Cierre de Página** (`PlatformExtrasSection.tsx`) | Espacio en blanco excesivo al final, desborde horizontal en móviles. | Elementos absolutos sin recorte de overflow y padding desproporcionado. | Re-estructuración del contenedor con `overflow-hidden`, estilización de los servicios complementarios y banner heroico de cierre con iluminación volumétrica nocturna y WhatsApp directo (`+591 77987776`). |
| **Footer Profesional** (`TrustFooter.tsx`) | Falta de canales oficiales verificados y año desactualizado. | Estructura simplificada sin datos corporativos. | Incorporación de WhatsApp oficial `+591 77987776`, Facebook verificado `Pachax - Software & Digital Marketing`, copyright 2026 PACHAX Platform, pilares de ingeniería y tarjeta de sesión activa. |
| **Fondo y Atmósfera** (`PachaxBrandBackground.tsx`) | Fondo plano con gradientes tenues. | Falta de profundidad espacial acorde a la identidad tecnológica de marca. | Halos volumétricos azul portal (#030C1A, #002b66, #0066FF, #0284C7), grid blueprint técnico y chevrons abstractos a 55 grados. |

---

## 2. Detalle de Archivos Modificados

1. **`src/public/config/pricingConfig.ts`**
   - Agregada la estructura `SPECIALIZED_IMPLEMENTATION_MODELS` para Producción & Distribución, Restaurante con Salón y Nightclub & Lounge.
   - Agregada la estructura `QUICK_SERVICE_CATALOG` para Autoservicio directo (Restaurante Rápido y Comercio Balanza).
   - Preservado el estado del fallback estándar para garantizar el cumplimiento de las pruebas de seguridad de plataforma.

2. **`src/public/landing/TemplatePricingSection.tsx`**
   - Reemplazada la grilla monolítica vacía por dos bloques visualmente equilibrados:
     - **Columna 1 (Izquierda):** Implementación Especializada (fondo oscuro `#071322`, tabs de rubro, 3 etapas de despliegue: diagnóstico gratuito, puesta en marcha y mantenimiento cloud, botón a WhatsApp y botón a demo interactiva).
     - **Columna 2 (Derecha):** Autoservicio con Planes Directos (fondo blanco/tarjeta, tabs de categoría, selector de nivel 1/2/3, toggle mensual/anual con -15% y CTA directo a registro).
   - Banner inferior de "Desarrollo de Software e Ingeniería a Medida".

3. **`src/public/landing/RealOnboardingSection.tsx`**
   - 4 pasos interactivos en sincronía con `OnboardingWizard.tsx`:
     1. Identidad comercial y fiscal (Razón social, NIT, teléfono, ciudad).
     2. Plantilla operativa canónica (Distribución, Salón, Rápido, Nightclub, Balanza).
     3. Paleta corporativa PACHAX (Zafiro, Esmeralda, Carbón, Ámbar) y logotipo.
     4. Aprovisionamiento seguro (Tenant ID aislado, sucursal central y caja 01 con turno ciego).
   - Simulador interactivo en viewport con atmósfera azul noche.

4. **`src/public/landing/GuidedTutorialsSection.tsx`**
   - Selector por pestañas de rubro: Restaurante Salón, Producción & Distribución, Nightclub & Lounge, Comercio & Balanza.
   - 3 pasos interactivos por rubro con spotlight visual idéntico a `RestaurantInteractiveTour.tsx` (`ring-4 ring-amber-300`).
   - Botón CTA directo para abrir la demo técnica correspondiente con el tour activado.

5. **`src/public/landing/PlatformExtrasSection.tsx`**
   - Estilización premium de servicios complementarios (Marketing, Branding, Soporte VIP, Automatización).
   - Tarjeta destacada para Desarrollo e Integración a Medida.
   - Banner de cierre heroico con atmósfera volumétrica azul portal, enlace a WhatsApp oficial y registro.

6. **`src/public/landing/TrustFooter.tsx`**
   - Copyright 2026 PACHAX Platform.
   - WhatsApp verificado `+591 77987776`.
   - Facebook oficial `Pachax - Software & Digital Marketing`.
   - 3 pilares de confianza y tarjeta de sesión activa para usuarios autenticados.

7. **`src/public/landing/PachaxBrandBackground.tsx`**
   - Atmósfera volumétrica profunda inspirada en el arte de referencia.
   - Retícula técnica blueprint extremadamente tenue y chevrons diagonales.

---

## 3. Matriz de Pruebas y Verificación

| Prueba | Comando Ejecutado | Resultado |
| :--- | :--- | :--- |
| **Typecheck Global** | `npm run typecheck` (`tsc -b`) | **PASS (0 errores)** |
| **Build de Producción** | `npm run build` (`tsc -b && vite build`) | **PASS (4.88s, 0 errores)** |
| **Regresión Navegador 1440×900** | `scripts/test-public-landing-browser.mjs` | **PASS (sin scroll horizontal)** |
| **Regresión Navegador 390×844 (Mobile)** | `scripts/test-public-landing-browser.mjs` | **PASS (sin scroll horizontal)** |
| **Regresión Navegador 430×932 (Mobile Pro Max)** | `scripts/test-public-landing-browser.mjs` | **PASS (sin scroll horizontal)** |
| **Restauración de Caché Pública** | `scripts/test-public-landing-browser.mjs` | **PASS** |
| **Contraste Accesibilidad Paletas** | `npm run test:brand-palettes` | **PASS (WCAG AA)** |
| **Seguridad y Suite de Plataforma** | `npm run test:platform` | **PASS (195 pruebas pasadas, 0 fallidas)** |

---

## 4. Política Git y Entrega

- Rama de trabajo: `gemini/landing-distribution-tour`
- Todo el código se encuentra confinado en el worktree `C:\PACHAX-worktrees\gemini-landing-distribution-tour`.
- Ningún commit ni push se realiza hacia `main`.
- La rama de Codex y el branch local de Darío permanecen intactos y sin colisiones.
