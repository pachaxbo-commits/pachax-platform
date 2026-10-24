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


---

## 7. Bloque G2 — Tutorial Interactivo Universal de Distribución

### 7.1 Objetivos y Alcance Implementado
Se desarrolló el motor de tutorial interactivo completo para la plantilla **Producción y Distribución**, dotándola del mismo nivel de excelencia visual, interactividad con controles reales y filosofía de spotlight que el tutorial de Restaurante, adaptado minuciosamente a la realidad operativa de una distribuidora mayorista y de reparto.

1. **Soporte Dinámico para los 9 Sectores Comerciales Canónicos:**
   - `food` (Alimentos): *Distribuidora Valle Alimentos* (arroz 5 kg, aceite 1 L, frijol en conserva).
   - `beverages` (Bebidas): *Distribuidora Refrescos del Valle* (agua mineral caja 12, gaseosa cola 350 ml, jugo néctar 1 L).
   - `cleaning` (Limpieza): *Distribuidora Limpieza Integral* (detergente concentrado 1 L, lavandina 2 L, esponja multiuso).
   - `hardware` (Ferretería): *Distribuidora FerreMax* (tornillos autoperforantes caja 100, alicate universal, pintura sintética 1 L).
   - `pharmacy` (Farmacia): *Distribuidora Salud Comercial* (venda elástica 10 cm, alcohol 70% 500 ml, guantes látex caja 100).
   - `pets` (Mascotas): *Distribuidora Mundo Mascotas* (alimento perro 5 kg, arena gato 4 kg, plato acero inox).
   - `stationery` (Papelería): *Distribuidora Escolar* (cuaderno espiral 100 hojas, bolígrafos caja 12, archivador palanca).
   - `spare_parts` (Repuestos): *Distribuidora AutoPartes* (aceite motor 20W50 1 L, pastillas freno, filtro aceite).
   - `mixed` (Comercio Integral): *Distribuidora Comercial Integral* (artículos de muestra, empaque y granel).

2. **Datasets Auténticos y Deterministas por Rubro (`profileDatasets.ts`):**
   - Cada sector genera productos reales con SKU, presentaciones comerciales, costos y precios de referencia.
   - Respeta estrictamente las limitaciones canónicas de unidades: unidades transaccionales permitidas son `kg`, `unit` o `package`. No se inventaron conversiones automáticas ni atributos no soportados.
   - Generación coherente de clientes asignados a la ruta (`route-norte`), stock inicial en almacén central, despacho abierto, ventas, cuentas por cobrar, cobros y gastos.

3. **Gating Estricto de Recorridos por Rol:**
   - **Propietario / Administrador:** Acceso a los 6 recorridos temáticos (*Primeros pasos*, *Inventario y almacén central*, *Rutas y despachos*, *Ventas y cobranzas*, *Retornos y conciliación*, *Administración y reportes*).
   - **Distribuidor:** Acceso exclusivo a recorridos de operación en carretera (*Primeros pasos*, *Ventas en ruta*, *Declaración de retorno y cierre*). Sin acceso a inventario general ni finanzas.
   - **Almacén:** Acceso exclusivo a control físico (*Primeros pasos*, *Inventario y lotes*, *Despacho de camiones*, *Recepción física de retornos*). Sin acceso a ventas ni cobranzas.
   - **Contabilidad:** Acceso a *Arqueo de dinero*, *Cartera de créditos* y *Reportes*.

4. **Motor de Posicionamiento Inteligente (`tutorialLayout.ts`):**
   - Algoritmo que calcula el cuadrante óptimo (arriba, abajo, izquierda, derecha) para la tarjeta de instrucciones según la posición del elemento objetivo.
   - En pantallas móviles (< 768px), invierte automáticamente arriba/abajo para no tapar el objetivo táctil ni superponerse con la barra de navegación inferior.
   - Detección de elementos objetivo ausentes o en carga con aviso amigable y botón de reintento/avance.

5. **Aislamiento y Modo Práctica Seguro:**
   - Progreso guardado de forma aislada en el almacenamiento de sesión de demo (`demoContext.ts`), particionado por rol y sector.
   - Botón *"Reiniciar datos de práctica"* en el Centro de Tutoriales que limpia mutaciones temporales y restablece el dataset limpio sin tocar datos de otros roles ni plantillas.

6. **Integración con Navegación y Landing:**
   - Parámetros de URL transparentes: `/demo/distribution?tour=start&profile=beverages` abre de inmediato el Centro de Tutoriales con el sector preseleccionado.
   - Botón CTA de Distribución en la landing (`GuidedTutorialsSection.tsx`) actualizado para enlazar directamente al tour interactivo.

---

### 7.2 Matriz de Verificación y Evidencia

| Verificación | Herramienta / Comando | Resultado |
| :--- | :--- | :--- |
| **Typecheck TypeScript** | `npm run typecheck` (`tsc -b`) | **PASS (0 errores en todo el proyecto)** |
| **Build de Producción** | `npm run build` (`tsc -b && vite build`) | **PASS (4.80s, bundles generados)** |
| **Suite de Plataforma** | `npm run test:platform` | **PASS (202/202 pruebas aprobadas)** |
| **Suite de Tutoriales G2** | `node --experimental-strip-types --test tests/distributionTutorials.test.ts` | **PASS (7/7 pruebas aprobadas)** |
| **Navegador Headless 360×800** | `node scripts/test-distribution-tour-browser.mjs` | **PASS (Modal 9 sectores, spotlight, navegación)** |
| **Navegador Headless 390×844** | `node scripts/test-distribution-tour-browser.mjs` | **PASS (Cambio a Bebidas, tracks de rol)** |
| **Navegador Headless 430×932** | `node scripts/test-distribution-tour-browser.mjs` | **PASS (Disposición Pro Max validada)** |
| **Navegador Headless 768×1024** | `node scripts/test-distribution-tour-browser.mjs` | **PASS (Tablet vertical validada)** |
| **Navegador Headless 1440×900** | `node scripts/test-distribution-tour-browser.mjs` | **PASS (Desktop sidebar + spotlight)** |
| **Aislamiento Rol Distribuidor** | `node scripts/test-distribution-tour-browser.mjs` | **PASS (Sin almacén ni finanzas)** |
| **Capturas de Evidencia** | 11 screenshots generados en directorio de artefactos | **COMPLETADO (45 KB a 135 KB c/u)** |

---

### 7.3 Archivos Creados y Modificados en G2

**Archivos Creados:**
1. `src/demo/datasets/distribution/profileDatasets.ts` (9 sectores comerciales, metadatos, productos y clientes).
2. `src/modules/distribution/tutorials/tutorialLayout.ts` (motor de cálculo de coordenadas y cuadrantes).
3. `src/modules/distribution/tutorials/distributionTutorials.ts` (contratos de datos, generador dinámico de 6 recorridos y persistencia).
4. `src/modules/distribution/tutorials/DistributionTutorial.tsx` (componente de spotlight, overlay oscurecido y auto-scroll).
5. `src/modules/distribution/tutorials/DistributionTutorialCenter.tsx` (modal interactivo con selector de 9 sectores y tracks por rol).
6. `tests/distributionTutorials.test.ts` (suite exhaustiva de pruebas unitarias y de integración de G2).
7. `scripts/test-distribution-tour-browser.mjs` (script de automatización CDP para pruebas en navegador real en 5 viewports).

**Archivos Modificados:**
1. `src/demo/datasets/distribution/distributionDatasets.ts` (inyección de perfiles respetando 100% retrocompatibilidad con `p-viena`).
2. `src/demo/distribution/demoDistributionRepository.ts` (métodos `switchProfile` y `reset` con perfil).
3. `src/demo/distribution/DistributionDemo.tsx` (manejo de query params `?tour=...`, `?profile=...`, switch de perfil y reset).
4. `src/modules/distribution/views/DistributionExperience.tsx` (montaje del Centro de Tutoriales, spotlight flotante, botones de cabecera y sidebar).
5. `src/components/ui/BottomNav.tsx` (atributos `data-tutorial-target` para navegación inferior).
6. `src/modules/distribution/views/DashboardView.tsx` (atributos `data-tutorial-target`).
7. `src/modules/distribution/views/DistributorHomeView.tsx` (atributos `data-tutorial-target`).
8. `src/modules/distribution/views/InventoryView.tsx` (atributos `data-tutorial-target`).
9. `src/modules/distribution/views/DispatchesView.tsx` (atributos `data-tutorial-target`).
10. `src/modules/distribution/views/SellView.tsx` (atributos `data-tutorial-target`).
11. `src/modules/distribution/views/ClosureView.tsx` (atributos `data-tutorial-target`).
12. `src/modules/distribution/views/ReportsView.tsx` (atributos `data-tutorial-target`).
13. `src/public/landing/GuidedTutorialsSection.tsx` (vínculo directo al tour interactivo de Distribución).
14. `docs/WORKSTREAM-GEMINI.md` (bitácora actualizada).


---

## 8. Bloque G1.3 Focal — Navegación Segura de Demos en la Landing

### 8.1 Diagnóstico de Causa Raíz
1. **Ruta Obsoleta en Vitrina Comercial (`commercialShowcase.ts`):**
   - El elemento `HAMBURGER_SHOWCASE_ITEM` conservaba la ruta heredada y obsoleta `demoRoute: '/demo/restaurant?mode=counter'` y `canonicalTemplateId: 'restaurant'`.
   - La identidad canónica de servicio rápido en PACHAX es `'hamburger'` y su ruta de demostración canónica es `'/demo/hamburger'` (o `'/demo.html?template=hamburger'`).
   - Dejar una ruta obsoleta rompía la coherencia arquitectónica y abría la posibilidad de invocar la experiencia de salón en lugar de la experiencia de autoservicio rápido.
2. **Bypass de Disponibilidad en Coverflow Autoservicio (`HeroSection.tsx`):**
   - El evento `onSelectActiveCard` de Carrusel B ejecutaba directamente la navegación a `template.demoRoute` sin consultar previamente `canLaunchCommercialDemo(template)`.
   - Al pulsar la tarjeta activa o usar atajos de teclado, se permitía la apertura de una demo aún en desarrollo (`coming_soon`).

### 8.2 Solución Implementada
1. **Normalización Canónica de Vitrina (`src/public/config/commercialShowcase.ts`):**
   - Se actualizó `HAMBURGER_SHOWCASE_ITEM` con:
     - `canonicalTemplateId: 'hamburger'`
     - `demoRoute: '/demo/hamburger'`
     - `demoPath: '/demo/hamburger'`
     - `demoEnabled: false` (gating estricto de prelanzamiento).
2. **Gating Estricto en Carrusel B (`src/public/landing/HeroSection.tsx`):**
   - Se creó el manejador protegido `handleLaunchSelfServiceDemo`:
     - Valida `canLaunchCommercialDemo(template)`.
     - Si la demo está deshabilitada (`demoEnabled: false`), bloquea cualquier intento de navegación y redirige el foco o la acción hacia consulta de disponibilidad.
   - Se asoció `handleLaunchSelfServiceDemo` tanto al clic/Enter/Space sobre la tarjeta activa del Coverflow como al botón de acción *"Ver demo"*.
3. **Soporte de Teclado Accesible (`src/public/landing/TemplateCoverflow.tsx`):**
   - Soporte para teclas `Enter` y `Space` que delegan al manejador del padre respetando el gating comercial.
4. **Protección en Secciones Secundarias (`TemplatePricingSection.tsx` y `GuidedTutorialsSection.tsx`):**
   - Sustituido el enlace a demo por un botón deshabilitado *"Demo próximamente"* con tooltip institucional cuando `canLaunchCommercialDemo` devuelve falso.
5. **Suite de Pruebas Automatizadas (`tests/adminPlatformSecurity.test.ts`):**
   - Se agregó la prueba **Test 25**: *"G1.3 focal — Commercial Showcase demo routes and gating invariants"*, certificando que `HAMBURGER_SHOWCASE_ITEM` apunta a `hamburger`, ruta `/demo/hamburger`, y que las tres plantillas en desarrollo (`hamburger`, `retail`, `nightclub`) están bloqueadas contra navegación accidental.

---

## 9. Bloque G2.1 — Corrección Funcional y Certificación del Tutorial Universal de Distribución

### 9.1 Diagnóstico de Problemas Funcionales en G2
1. **Falsa Interactividad:** La mayoría de los pasos de venta e inventario utilizaban `interaction: 'observe'`, permitiendo avanzar simplemente pulsando *"Siguiente"* sin ejecutar las operaciones en el sistema.
2. **Sobrescritura de Estado en Finalización (`DistributionTutorial.tsx`):** La función `finish()` invocaba `onComplete()` y acto seguido `onDismiss()`. Esto provocaba que `onDismiss` sobreescribiera el estado recién guardado de `'completed'` por `'omitted'`.
3. **Auto-Navegación Intrusiva:** Al cambiar de paso, el motor forzaba `onNavigate(step.module)`, quitándole el control al usuario e impidiendo que aprendiera a navegar por sí mismo.
4. **Roles Incompletos:** Soporte carecía de un track adaptado a sus permisos (`dist.support` y `printer-settings`), dependiendo erróneamente de paneles que no podía ver.
5. **Mezcla de Progresos Demo vs Real Tenant:** No existía aislamiento de almacenamiento por trabajador (`tenantId` + `uid` + `planId`).
6. **Manejo de Parámetros de URL:** Parámetros como `?profile=invalido` no contaban con fallback seguro a `'food'`.

### 9.2 Correcciones Arquitectónicas Implementadas
1. **Motor de Interactividad Real con Gating de Acción (`DistributionTutorial.tsx`):**
   - Pasos clasificados rigurosamente entre:
     - `interaction: 'observe'`: Permiten continuar tras leer la explicación.
     - `interaction: 'navigate'`: Requieren que el usuario pulse conscientemente el menú o pestaña de navegación hacia el módulo de destino (`activeModule === step.module`). Se eliminó la auto-navegación intrusiva.
     - `interaction: 'action'`: El botón *"Siguiente"* permanece deshabilitado hasta que el usuario realiza la acción concreta (seleccionar cliente, elegir producto, agregar al carrito, confirmar cobro, etc.).
   - Banner de advertencia visual en la tarjeta cuando la acción está pendiente: *"Acción requerida: {requiredActionHint}"*.
2. **Ciclo de Vida y Persistencia Excluyente (`distributionTutorials.ts` y `DistributionExperience.tsx`):**
   - Se corrigió `finish()` para ejecutar exclusivamente `onComplete()`, eliminando la llamada redundante a `onDismiss()`.
   - Estados mutuamente excluyentes: `completed` (completado), `in_progress` (pausado/en curso con índice guardado), `omitted` (omitido en paso 0).
   - Reanudar retoma desde el último paso válido (`resumeIndex`), mientras que Repetir inicia desde el paso 0.
   - El reinicio de datos de práctica (`handleResetPractice`) restaura el inventario sin borrar el avance del tutorial del usuario.
3. **Aislamiento Multi-Tenant vs Demostración:**
   - **En empresas reales (`isDemo === false`):**
     - Progreso particionado por `tut_progress:${tenantId}:${uid}:${planId}` (un trabajador no sobreescribe a otro).
     - Bloqueada la selección de rubro (fijada al rubro configurado de la empresa).
     - Oculto el botón de reinicio de práctica.
     - Operaciones tratadas con datos contables reales.
   - **En modo demostración (`isDemo === true`):**
     - Progreso almacenado en clave temporal `tut_progress:demo:${role}:${profile}:${planId}`.
     - Selector interactivo de los 9 rubros disponible en el Centro de Tutoriales.
     - Botón de reinicio de práctica disponible.
4. **Matriz Completa de Roles (6 Perfiles Operativos):**
   - **Distribuidor (`distributor`):** Venta en ruta, cobranza autorizada, gastos menores y declaración de retorno en cierre.
   - **Almacén (`warehouse`):** Inventario físico, despacho de camiones, recepción y verificación de retornos. Sin dependencia de ventas.
   - **Contabilidad (`accountant`):** Conciliación de caja, cobranzas, cartera de créditos y reportes contables.
   - **Soporte (`support`):** Track específico `dist.support` y `printer-settings` sin requerir dashboard ni ventas.
   - **Administrador y Propietario (`admin` / `owner`):** Acceso integral a los 6 recorridos de la empresa.
5. **Certificación de los 9 Rubros Comerciales y Unidades Canónicas:**
   - Verificados los 9 perfiles (`food`, `beverages`, `cleaning`, `hardware`, `pharmacy`, `pets`, `stationery`, `spare_parts`, `mixed`).
   - Unidades transaccionales estrictamente canónicas: `kg`, `unit` y `package`. Sin inventos de factores de conversión frontend.
   - Sanitización de URL: `?profile=invalid` cae limpiamente a `'food'`.

### 9.3 Resultados de Verificación y Pruebas E2E en Navegador Real

| Prueba / Entorno | Comando / Instrumentación | Resultado |
| :--- | :--- | :--- |
| **Typecheck TypeScript** | `npm run typecheck` (`tsc -b`) | **PASS (0 errores)** |
| **Build de Producción** | `npm run build` (`tsc -b && vite build`) | **PASS (4.79s, 0 advertencias críticas)** |
| **Suite de Plataforma PACHAX** | `npm run test:platform` | **PASS (209/209 pruebas aprobadas)** |
| **Prueba E2E G1.3 Navegador** | `node scripts/test-distribution-tour-browser.mjs` | **PASS (Carrusel B honest demo gating verificado)** |
| **Prueba E2E 5 Viewports (G2.1)** | `node scripts/test-distribution-tour-browser.mjs` | **PASS (360×800, 390×844, 430×932, 768×1024, 1440×900)** |
| **Prueba E2E Switch Rubro Ferretería** | `node scripts/test-distribution-tour-browser.mjs` | **PASS (FerreMax, unidades canónicas, productos reales)** |
| **Prueba E2E Venta Interactiva en Ruta** | `node scripts/test-distribution-tour-browser.mjs` | **PASS (Selección cliente -> Producto -> Carrito -> Cobro)** |
| **Prueba E2E Aislamiento Rol Soporte** | `node scripts/test-distribution-tour-browser.mjs` | **PASS (Diagnóstico y hardware aislado sin dashboard)** |
| **Prueba E2E Sanitización URL** | `node scripts/test-distribution-tour-browser.mjs` | **PASS (Fallback de profile inválido a 'food')** |

### 9.4 Evidencias Fotográficas Generadas (Directorio de Artefactos)
- `g1-3-landing-honest-gating-desktop.png`: Verificación visual del gating comercial honesto en Carrusel B y botones deshabilitados.
- `g2-tour-center-sectors-360x800.png`: Centro de tutoriales y 9 sectores en móvil compacto (360×800).
- `g2-tour-center-sectors-390x844.png`: Centro de tutoriales en iPhone estándar (390×844).
- `g2-tour-center-sectors-430x932.png`: Centro de tutoriales en iPhone Pro Max (430×932).
- `g2-tour-center-sectors-768x1024.png`: Centro de tutoriales en iPad / Tablet vertical (768×1024).
- `g2-tour-center-sectors-1440x900.png`: Centro de tutoriales en Desktop de alta resolución (1440×900).
- `g2-hardware-sector-loaded-390x844.png`: Rubro de Ferretería cargado con catálogo de tornillos, alicates y pintura.
- `g2-interactive-step-spotlight-390x844.png`: Visor de tutorial con spotlight enfocado y requerimiento de acción interactiva.
- `g2-interactive-sale-completed-390x844.png`: Venta ficticia completada y confirmada en el adaptador de demostración.
- `g2-support-role-isolated-390x844.png`: Operación aislada del rol Soporte en herramientas de diagnóstico.
