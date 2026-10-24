# Bitácora de Trabajo — GEMINI (Bloques G1 y G1.2)
## Rediseño Real de la Landing + Corrección de Secciones Rotas + Carruseles Especializados y Autoservicio + Integración Segura a Main

- **Fecha:** 23 de Octubre de 2026
- **Rama de Trabajo:** `gemini/landing-distribution-tour`
- **Worktree Aislado:** `C:\PACHAX-worktrees\gemini-landing-distribution-tour`
- **Base de Origen:** `origin/main` (`bc2a6e681ba9091e0de278e67bf46d43da491468`)
- **Estado de Aislamiento:** Trabajo estrictamente confinado en el worktree aislado, sin interferir con el trabajo local de Codex (`cambios-dario`).

---

## 1. Bloque G1.2 — Resumen Ejecutivo de Correcciones Finales

En respuesta a la revisión visual del usuario sobre el commit inicial de G1 (`a121ab69`), se abordaron e implementaron con éxito los siguientes requerimientos mandatorios:

1. **Separación del Carrusel Principal en Dos Grupos Claramente Diferenciados (`HeroSection.tsx`, `TemplateCoverflow.tsx`, `commercialShowcase.ts`):**
   - **Carrusel A (Soluciones Especializadas):** Exactamente 3 plantillas (`restaurant` / Restaurante con salón, `distribution` / Producción y Distribución, `nightclub` / Nightclub & Lounge). Operaciones de alto volumen que requieren diagnóstico, configuración a medida y mantenimiento mensual. Acciones en la tarjeta activa: *"Ver demo en vivo"* y *"Solicitar asesoría"* (WhatsApp).
   - **Carrusel B (Soluciones Autoservicio):** Exactamente 2 plantillas (`hamburger` / Restaurante Rápido, `retail` / Comercio - Venta rápida). Suscripción directa autoservicio para arranque inmediato. Acciones en la tarjeta activa: *"Consultar disponibilidad"* / *"Elegir plan y comenzar"* y *"Ver demo"*.
   - **Disposición Desktop (>= 1024px):** Lado a lado (*side-by-side*) en una cuadrícula de 2 columnas (`grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-10`), cada una con su encabezado comercial, badge de modalidad, carrusel 3D independiente y controles de acción activa.
   - **Disposición Mobile (< 1024px):** Apilados verticalmente de forma ordenada (Especializadas arriba, Autoservicio abajo), conservando el touch swipe, navegación por flechas táctiles, paginador por puntos y perspectiva 3D.
   - **Discurso Editorial Actualizado:** Eliminado cualquier reclamo genérico de "planes mensuales accesibles". Se explica con honestidad técnica la coexistencia de soluciones complejas con mantenimiento vs punto de venta de autoservicio.

2. **Eliminación Total de Iconografía Decorativa Tipo IA:**
   - Retirados todos los iconos `Sparkles` decorativos en badges (`TemplatePricingSection.tsx`, `RealOnboardingSection.tsx`, `PlatformExtrasSection.tsx`).
   - Retirados los iconos de relleno (`Layers`, etc.) en cabeceras editoriales.
   - Se mantiene exclusivamente iconografía funcional y de control: `ArrowRight`, `ChevronLeft`, `ChevronRight`, `Play`, `Check` en listas de características.

3. **Rediseño Simétrico del Selector de Tutoriales (`GuidedTutorialsSection.tsx`):**
   - Sustituida la fila de botones desordenada por un control segmentado unificado de 4 columnas iguales en desktop (`grid grid-cols-2 sm:grid-cols-4 gap-1`).
   - Ninguna pestaña queda colgando en una segunda línea (como ocurría con "Comercio & Balanza").
   - Eliminados iconos decorativos dentro de los botones de pestañas, privilegiando tipografía limpia y acentos activos.
   - Enlaces de demo honestos: Restaurante abre la demo oficial con tour interactivo paso a paso (`/demo/restaurant?tour=pos`). Distribución, Nightclub y Comercio señalan con transparencia técnica *"Demo disponible · Guía interactiva en desarrollo (G2)"*.

4. **Footer Corporativo Oscuro y Compacto (`TrustFooter.tsx`):**
   - Rediseñado en una franja elegante, sobria y profesional con fondo oscuro corporativo (`#071322` / `rgb(7, 19, 34)`) y borde superior sutil (`border-slate-800`).
   - En desktop: barra horizontal compacta; en mobile: ordenado en filas limpias.
   - Logotipo oficial `BrandMark` en blanco (`variant="light"`).
   - Copyright oficial: `© 2026 PACHAX. Todos los derechos reservados.`
   - Canales oficiales verificados: WhatsApp `+591 77987776`, Facebook `Pachax - Software & Digital Marketing`.
   - Accesos discretos a `/login` y `/register`.
   - Cero badges de IA o iconos redundantes.

5. **Eliminación Definitiva del Espacio Muerto Inferior:**
   - Ajustado el espaciado inferior en `PlatformExtrasSection.tsx` (`pt-16 pb-10 sm:pt-20 sm:pb-12`).
   - `TrustFooter.tsx` se posiciona de forma compacta e inmediata al pie de la página.
   - Verificado mediante instrumentación CDP en tiempo real: **`trailingSpacePx: 0`** tanto en Desktop (1440×900) como en Mobile (390×844 y 430×932). El scroll de la página concluye exactamente al finalizar el footer.

---

## 2. Bloque G1.2 — Gating Comercial y Protección Tarifaria

Para preparar la integración segura a producción, se incorporaron controles estrictos de disponibilidad y disclaimers comerciales:

1. **Gating de Disponibilidad Real de Aprovisionamiento (`HeroSection.tsx` y `TemplatePricingSection.tsx`):**
   - Se consulta `isTemplateProvisioningAvailable(...)` antes de ofrecer flujos de registro directo.
   - Las plantillas en estado `coming_soon` (`hamburger` y `retail`) no permiten contratación inmediata en la landing. Su botón de acción se transforma automáticamente en *"Consultar disponibilidad · {Plantilla}"*, redirigiendo a consulta contextual por WhatsApp.
   - Se muestra un badge institucional en la tarjeta activa de Autoservicio: *"Próximamente disponible"*.

2. **Gating de Demos Oficiales (`canLaunchCommercialDemo`):**
   - Si una plantilla no tiene su demo comercial formalmente habilitada, el botón *"Ver demo"* se deshabilita con el texto *"Demo próximamente"* y tooltip explicativo, evitando redirecciones a pantallas no autorizadas.

3. **Disclaimers Tarifarios y de Prelanzamiento (`TemplatePricingSection.tsx`):**
   - Se incorpora en la cabecera del módulo de precios la etiqueta:
     `TARIFAS REFERENCIALES EN FASE DE LANZAMIENTO · SUJETAS A APROBACIÓN DEFINITIVA`
   - Se reemplaza la etiqueta genérica "Desde" por "Referencial" en los precios de autoservicio.
   - Se añade la advertencia formal al pie de los precios:
     `* Tarifa provisional de prelanzamiento. No constituye oferta comercial vinculante.`
   - La base de implementación especializada se etiqueta como *"Base Cloud Referencial"*.
   - Los botones de Autoservicio no disponible muestran: *"Plantilla en consolidación operativa. Tarifas referenciales no vinculantes para contratación."*

---

## 3. Arquitectura y Pendientes Específicos para Codex

### 3.1 Inconsistencia `hamburger` vs `restaurant` en Identificadores de Planes
- **Diagnóstico:** En `src/core/publicTemplates.ts`, `PLAN_ELIGIBLE_TEMPLATE_IDS = ['restaurant', 'distribution', 'nightclub', 'retail']` no incluye `'hamburger'`. Asimismo, en `functions/platform.cjs`, el backend valida rigurosamente los planes contra `PLAN_ELIGIBLE_TEMPLATE_IDS` y `OFFICIAL_COMMERCIAL_TEMPLATES`.
- **Mitigación Frontend Implementada por Gemini:** Se preservó `canonicalTemplateId: 'restaurant'` en `pricingConfig.ts` y en `commercialShowcase.ts` para que el frontend resuelva las dependencias visuales de forma coherente y segura.
- **Acción Requerida por Codex (Backend / Arquitectura):**
  - Definir si `hamburger` se promoverá a una plantilla canónica de primer orden en el backend (agregándola a `OFFICIAL_COMMERCIAL_TEMPLATES`, `PLAN_ELIGIBLE_TEMPLATE_IDS`, reglas de Firestore y Functions), o
  - Si comercialmente debe mantenerse como un `subtype: 'hamburger_shop'` dentro de la plantilla canónica `restaurant`, vinculando sus planes directamente a `templateId: 'restaurant'`.

### 3.2 Admin Control Center y Motor de Facturación (Billing)
- **Delimitación de Responsabilidad:** Gemini no implementó código de persistencia, Admin Control Center ni suscripciones en backend.
- **Arquitectura Lista para Conexión:**
  - `TemplatePricingSection.tsx` está desacoplada y lista para sustituir la lectura de `pricingConfig.ts` por una consulta reactiva a la colección Firestore de planes publicados cuando Codex implemente el backend de Platform Admin.
  - Los *Function Entitlements* declarados en `pricingConfig.ts` deberán ser validados por Codex en Cloud Functions y Firestore Rules al momento de activar o renovar tenants.

---

## 4. Auditoría de Despliegue y Aislamiento de Producción

1. **Despliegue Frontend en Vercel:**
   - El repositorio en GitHub `pachaxbo-commits/pachax-platform` está conectado al proyecto Vercel `pachax-app`.
   - La rama de producción conectada es `main`. Un merge a `main` disparará un build estático de Vite SPA (`npm run build`).
   - El build genera archivos estáticos puros en `/dist`.
2. **Aislamiento Estricto de Firebase Production:**
   - La landing page es 100% de presentación en React del lado del cliente.
   - No ejecuta ninguna mutación ni escritura en Firestore.
   - No despliega ni modifica Cloud Functions ni Firestore Security Rules (los despliegues de Firebase son manuales por el propietario mediante `firebase deploy --only firestore,functions --project ID`).
   - Cero riesgo para la base de datos ni credenciales productivas de Firebase.

---

## 5. Matriz de Pruebas y Verificación

| Suite de Verificación | Comando Ejecutado | Resultado |
| :--- | :--- | :--- |
| **Typecheck Estricto** | `npm run typecheck` (`tsc -b`) | **PASS (0 errores)** |
| **Build de Producción** | `npm run build` (`tsc -b && vite build`) | **PASS (4.70s, 0 errores)** |
| **Regresión Navegador 1440×900** | `node scripts/test-public-landing-browser.mjs` | **PASS (2 carruseles, 0 overflow, 0 trailing space)** |
| **Regresión Navegador 390×844 (Mobile)** | `node scripts/test-public-landing-browser.mjs` | **PASS (2 carruseles, 0 overflow, 0 trailing space)** |
| **Regresión Navegador 430×932 (Mobile Pro Max)** | `node scripts/test-public-landing-browser.mjs` | **PASS (2 carruseles, 0 overflow, 0 trailing space)** |
| **Suite de Plataforma** | `npm run test:platform` | **PASS (195/195 pruebas aprobadas, 0 fallidas)** |
| **Suite de Nightclub (Main bc2a6e6)** | `npm run test:nightclub` | **PASS (97/97 pruebas aprobadas, 0 fallidas)** |

---

## 6. Archivos Integrados

1. `src/public/landing/HeroSection.tsx`
2. `src/public/landing/TemplatePricingSection.tsx`
3. `src/public/landing/GuidedTutorialsSection.tsx`
4. `src/public/landing/TemplateCoverflow.tsx`
5. `src/public/landing/TrustFooter.tsx`
6. `src/public/landing/PlatformExtrasSection.tsx`
7. `src/public/landing/RealOnboardingSection.tsx`
8. `src/public/landing/PachaxBrandBackground.tsx`
9. `src/public/config/commercialShowcase.ts`
10. `src/public/config/pricingConfig.ts`
11. `src/admin/types.ts`
12. `scripts/test-public-landing-browser.mjs`
13. `docs/WORKSTREAM-GEMINI.md`
