# Bitácora de Trabajo — GEMINI (Bloques G1 y G1.2)
## Rediseño Real de la Landing + Corrección de Secciones Rotas + Carruseles Especializados y Autoservicio

- **Fecha:** 23 de Octubre de 2026
- **Rama de Trabajo Exclusiva:** `gemini/landing-distribution-tour`
- **Worktree Aislado:** `C:\PACHAX-worktrees\gemini-landing-distribution-tour`
- **Base de Origen:** `origin/main` (`958cbac36f78bc2b772c7aeeae397c88b0ea1a94`)
- **Estado de Aislamiento:** Trabajo estrictamente confinado en el worktree aislado, sin interferir con `main` ni con el trabajo de Codex (`cambios-dario`).

---

## 1. Bloque G1.2 — Resumen Ejecutivo de Correcciones Finales

En respuesta a la revisión visual del usuario sobre el commit inicial de G1 (`a121ab69`), se abordaron e implementaron con éxito los siguientes requerimientos mandatorios:

1. **Separación del Carrusel Principal en Dos Grupos Claramente Diferenciados (`HeroSection.tsx`, `TemplateCoverflow.tsx`, `commercialShowcase.ts`):**
   - **Carrusel A (Soluciones Especializadas):** Exactamente 3 plantillas (`restaurant` / Restaurante con salón, `distribution` / Producción y Distribución, `nightclub` / Nightclub & Lounge). Operaciones de alto volumen que requieren diagnóstico, configuración a medida y mantenimiento mensual. Acciones en la tarjeta activa: *"Ver demo en vivo"* y *"Solicitar asesoría"* (WhatsApp).
   - **Carrusel B (Soluciones Autoservicio):** Exactamente 2 plantillas (`hamburger` / Restaurante Rápido, `retail` / Comercio - Venta rápida). Suscripción directa autoservicio para arranque inmediato. Acciones en la tarjeta activa: *"Elegir plan y comenzar"* (`/register?template=...`) y *"Ver demo"*.
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

## 2. Detalle de Archivos Modificados en G1.2

1. **`src/public/config/commercialShowcase.ts`**
   - Agregada definición comercial `HAMBURGER_SHOWCASE_ITEM` (`id: 'hamburger'`, `canonicalTemplateId: 'restaurant'`).
   - Exportadas las dos vitrinas separadas:
     - `SPECIALIZED_SHOWCASE_TEMPLATES` (3 plantillas: Restaurante con salón, Producción y Distribución, Nightclub & Lounge).
     - `SELF_SERVICE_SHOWCASE_TEMPLATES` (2 plantillas: Restaurante Rápido, Comercio / Venta rápida).
   - Preservado `COMMERCIAL_TEMPLATES` oficial (5 plantillas) para compatibilidad total con pruebas de plataforma y admin.

2. **`src/public/config/pricingConfig.ts`**
   - Ampliado el tipo `TemplateKey` con `'hamburger'`.
   - Incorporados los 3 planes de autoservicio para `'hamburger'` en `PLANS_BY_TEMPLATE` (`status: 'draft'`).

3. **`src/admin/types.ts`**
   - Actualizada la definición de `CommercialTemplateItem` para admitir `templateId: TemplateKey | 'custom'` y `canonicalTemplateId: TemplateKey | null`.

4. **`src/public/landing/TemplateCoverflow.tsx`**
   - Soporte para prop opcional `templates?: readonly CommercialTemplateItem[]`.
   - Soporte para prop `compact?: boolean` optimizado para grillas de 2 columnas.
   - Navegación táctil, swipe por pointer, teclas de dirección y puntos adaptados dinámicamente a 2 o 3 elementos.

5. **`src/public/landing/HeroSection.tsx`**
   - Reestructuración completa en layout de dos carruseles paralelos en desktop (side-by-side) y apilados en mobile.
   - Estados de navegación independientes: `activeIndexSpecialized` y `activeIndexSelfService`.
   - Acciones diferenciadas por modalidad:
     - Especializadas: *"Ver demo en vivo"* + *"Solicitar asesoría"* (WhatsApp).
     - Autoservicio: *"Elegir plan y comenzar"* (`/register?template=...`) + *"Ver demo"*.

6. **`src/public/landing/TemplatePricingSection.tsx`**
   - Eliminados iconos `Sparkles` y `Layers` en cabeceras y banner de desarrollo a medida.

7. **`src/public/landing/RealOnboardingSection.tsx`**
   - Eliminado icono `Sparkles` del badge de cabecera.

8. **`src/public/landing/PlatformExtrasSection.tsx`**
   - Eliminado icono `Sparkles` del badge.
   - Reducido padding inferior para eliminar huecos visuales antes del footer.

9. **`src/public/landing/GuidedTutorialsSection.tsx`**
   - Segmented control simétrico (`grid-cols-2 sm:grid-cols-4`) sin saltos de línea desordenados.
   - Eliminada iconografía decorativa de los selectores.
   - Texto de enlace transparente y honesto según la disponibilidad de tours.

10. **`src/public/landing/TrustFooter.tsx`**
    - Rediseñado como footer corporativo oscuro (`#071322`), compacto, limpio y sobrio.

11. **`scripts/test-public-landing-browser.mjs`**
    - Actualizada la suite de regresión visual de navegador para validar la presencia de ambos carruseles independientes (3 especializadas, 2 autoservicio), ausencia de desbordamiento horizontal y ausencia estricta de espacio muerto (`trailingSpacePx === 0`).

---

## 3. Matriz de Pruebas y Verificación

| Suite de Verificación | Comando Ejecutado | Resultado |
| :--- | :--- | :--- |
| **Typecheck Estricto** | `npm run typecheck` (`tsc -b`) | **PASS (0 errores)** |
| **Build de Producción** | `npm run build` (`tsc -b && vite build`) | **PASS (5.30s, 0 errores)** |
| **Regresión Navegador 1440×900** | `npm run test:landing-browser` | **PASS (2 carruseles, 0 overflow, 0 trailing space)** |
| **Regresión Navegador 390×844 (Mobile)** | `npm run test:landing-browser` | **PASS (2 carruseles, 0 overflow, 0 trailing space)** |
| **Regresión Navegador 430×932 (Mobile Pro Max)** | `npm run test:landing-browser` | **PASS (2 carruseles, 0 overflow, 0 trailing space)** |
| **Suite de Plataforma** | `npm run test:platform` | **PASS (195/195 pruebas aprobadas, 0 fallidas)** |

---

## 4. Política Git y Seguridad

- **Rama:** `gemini/landing-distribution-tour`
- **Worktree:** `C:\PACHAX-worktrees\gemini-landing-distribution-tour`
- Todo el trabajo se entrega en la rama exclusiva `gemini/landing-distribution-tour`.
- Ningún cambio toca la rama `main` ni `cambios-dario`.
