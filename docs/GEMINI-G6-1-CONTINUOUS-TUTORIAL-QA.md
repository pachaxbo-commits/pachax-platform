# PACHAX PLATFORM — CERTIFICACIÓN TÉCNICA Y AUDITORÍA G6.1
## Corrección Focal, Integración de Estados y Certificación Real E2E del Tutorial Continuo

- **Fecha de certificación**: 2026-10-27
- **Entorno de trabajo**: Worktree aislado `C:\PACHAX-worktrees\gemini-g6-seamless-tutorial`
- **Rama activa**: `gemini/g6-seamless-tutorial-experience`
- **Base `main`**: `a2d821f549200463fc001afbb2a718ed48c8d724`
- **Pull Request objetivo**: [PR #3 — https://github.com/pachaxbo-commits/pachax-platform/pull/3](https://github.com/pachaxbo-commits/pachax-platform/pull/3)
- **Áreas protegidas**: Inalteradas (Zero cambios en Codex PR #2, catálogos comerciales, billing, Cloud Functions o Firestore Rules).

---

### 1. Corrección del Reinicio Completo (`restartAll`)

- **Problema previo**: En G6, `restartAll()` invocaba `clearTutorialOrchestratorState(scope)` y luego `startContinuousSequence()`. Sin embargo, esto dejaba `completedSectionIds` en memoria y no sincronizaba el estado legado (`in-progress` / `started`) de los Centros de Aprendizaje de Restaurante y Distribución.
- **Solución implementada**:
  - En [`useTutorialOrchestrator.ts`](file:///c:/PACHAX-worktrees/gemini-g6-seamless-tutorial/src/components/tutorials/useTutorialOrchestrator.ts), `restartAll()` sobreescribe atómicamente el estado React en memoria y el almacenamiento persistente con:
    ```ts
    completedSectionIds: [],
    completedAll: false,
    currentSectionId: firstSection ? firstSection.id : null,
    currentStepIndex: 0,
    isContinuousActive: Boolean(firstSection),
    isPaused: false,
    welcomeDismissed: true,
    welcomeSkipped: false
    ```
  - Se añadió la opción callback `onResetAllStatuses?: () => void` al hook `useTutorialOrchestrator`.
  - En [`RestaurantExperience.tsx`](file:///c:/PACHAX-worktrees/gemini-g6-seamless-tutorial/src/modules/restaurant/views/RestaurantExperience.tsx), `resetAllTourStatuses()` purga las claves `learningStorageKeys` de `localStorage` y reinicia el estado React `learningStatuses` a `{}`.
  - En [`DistributionExperience.tsx`](file:///c:/PACHAX-worktrees/gemini-g6-seamless-tutorial/src/modules/distribution/views/DistributionExperience.tsx), `resetAllDistributionStatuses()` restablece todos los planes a `status: 'not_started'` y limpia `progressMap`.
  - **Aislamiento de negocio**: Las ventas, mesas, inventario, productos, fotos y turnos de caja quedan 100% intactos; solo se reinicia el progreso pedagógico.

---

### 2. Restauración Confiable tras Recarga (Refresh)

- **Problema previo**: Si el usuario recargaba la página durante el recorrido continuo, `isContinuousActive: true` podía provocar reentradas o no activar la opción de reanudación si la sección actual era la primera (índice 0).
- **Solución implementada**:
  - En [`useTutorialOrchestrator.ts`](file:///c:/PACHAX-worktrees/gemini-g6-seamless-tutorial/src/components/tutorials/useTutorialOrchestrator.ts), la inicialización síncrona `useState(() => ...)` detecta si `isContinuousActive === true` tras recargar la página y lo conmuta inmediatamente a `isContinuousActive: false, isPaused: true`, guardándolo en almacenamiento.
  - Esto evita abrir el tour de manera automática e invasiva tras recargar la ventana.
  - `hasResumableSequence` ahora evalúa `true` siempre que exista cualquier cursor en progreso (`isPaused`, `currentSectionId !== null`, o avance de pasos), incluso si está en el paso > 0 de la sección 0.
  - El Centro de Aprendizaje presenta el banner **«Continuar donde lo dejaste»** indicando la sección y el número de paso exacto. Al pulsar «Continuar recorrido», el tour se reanuda en el paso idéntico donde el usuario lo dejó.

---

### 3. Pausar y Salir sin Forzar Paso Cero

- **Problema previo**: `handleTourDismiss` en `RestaurantExperience.tsx` llamaba a `orchestrator.pauseSequence(0)` con un 0 hardcodeado, borrando el cursor del paso.
- **Solución implementada**:
  - Se modificaron las firmas de `RestaurantInteractiveTour.tsx` para aceptar y emitir el índice de paso activo:
    - `onStepChange?: (stepIndex: number) => void`
    - `onPause?: (stepIndex: number) => void`
    - `onDismiss: (stepIndex: number) => void`
  - Se conectó `onStepChange={(idx) => orchestrator.updateStepIndex(idx)}` en los 11 módulos de `RestaurantExperience.tsx` y en `DistributionExperience.tsx`.
  - `orchestrator.pauseSequence(currentStepIndex)` acepta el índice de paso y lo persiste en la tupla `(currentSectionId, currentStepIndex)`.

---

### 4. Instrucciones No Salteadas (Eliminación de Auto-Avance Involuntario)

- **Problema previo**: En `RestaurantInteractiveTour.tsx` existía un efecto `advanceWhen` (líneas 62-72) que avanzaba automáticamente el paso al detectar elementos en el DOM, pasando por alto la lectura de la tarjeta sin que el usuario hiciera clic.
- **Solución implementada**:
  - Se retiró el auto-avance no solicitado en `RestaurantInteractiveTour.tsx`.
  - Para pasos informativos y de navegación se habilitó de manera segura el botón **«Siguiente»** (`rounded-xl bg-slate-900`) para que el usuario pueda leer la instrucción con calma y avanzar conscientemente cuando lo decida.

---

### 5. Transición entre Secciones con Barra de Progreso

- **Implementación**:
  - Temporizador unificado a 3500 ms (o 1200 ms si el sistema operativo tiene activado `prefers-reduced-motion: reduce`).
  - [`TutorialSectionTransition.tsx`](file:///c:/PACHAX-worktrees/gemini-g6-seamless-tutorial/src/components/tutorials/TutorialSectionTransition.tsx) incluye una barra de progreso inferior animada (`bg-emerald-400/80`) sincronizada con el tiempo restante.
  - Botón **«Ir ahora»**: cancela el temporizador y navega inmediatamente al siguiente módulo.
  - Botón **«Pausar»** (`aria-label="Pausar recorrido continuo"`): detiene la transición y guarda el cursor en la sección completada/siguiente.
  - Limpieza rigurosa de timers en desmontaje para prevenir ejecuciones dobles.

---

### 6. Aislamiento por Usuario (`uid`) y Migración Transparente

- **Formato de clave actualizado**:
  `pachax:tutorial-orchestrator:${env}:${tenant}:${uid}:${tpl}:${dataMode}:${prof}:${role}:v1`
  - Donde `uid` aísla de forma determinista el progreso de múltiples usuarios dentro de una misma empresa o demostración. Si no se provee `uid`, se establece `'anon'`.
- **Migración transparente**:
  - [`tutorialOrchestratorStorage.ts`](file:///c:/PACHAX-worktrees/gemini-g6-seamless-tutorial/src/components/tutorials/tutorialOrchestratorStorage.ts) implementa `loadTutorialOrchestratorState` con búsqueda secuencial: si la clave moderna no existe, consulta la clave legada (sin `uid`), importa el estado y lo guarda automáticamente en la clave moderna, eliminando la duplicidad.
- **Cierre de tour por cambio de rol**:
  - Si el usuario conmuta de rol en la barra superior de la demo, `useTutorialOrchestrator` detecta el cambio en `prevScopeRef`, cancela los temporizadores de transición y cierra de forma segura cualquier visor de tour del rol anterior.

---

### 7. Certificación Real E2E en Navegador Headless (Chrome CDP)

Se actualizó [`scripts/test-g6-browser.mjs`](file:///c:/PACHAX-worktrees/gemini-g6-seamless-tutorial/scripts/test-g6-browser.mjs) eliminando todas las inyecciones artificiales de estado (`completedAll: true`). Todas las pruebas interactúan a través de clics DOM reales:

1. **Suite 1 — Restaurante con salón (Desktop 1440x900)**:
   - Apertura automática del modal de bienvenida (11 secciones, rol Dueño/Administración).
   - Clic en «Iniciar tutorial» -> arranque en módulo POS paso 1.
   - Avance interactivo paso a paso pulsando «Siguiente» y «Finalizar».
   - Verificación del banner de transición con barra de progreso, «Ir ahora» y «Pausar».
   - Clic en «Ir ahora» -> navegación automática al módulo Mesas sin pasar por el Centro de Aprendizaje.
   - Avance al Paso 2 en Mesas con clic real y pausa voluntaria.
2. **Suite 2 — Refresh & Reanudación exacta**:
   - Recarga completa de la página (`Page.navigate`).
   - El modal de bienvenida no reaparece (`welcomeDismissed: true`).
   - El tour permanece en pausa sin irrumpir automáticamente.
   - Apertura del Centro de Aprendizaje mediante el botón «Aprender».
   - Detección del banner «Continuar donde lo dejaste: Mesas · Paso 2».
   - Clic en «Continuar recorrido» -> el tour se reanuda en el Paso 2 exacto de Mesas.
3. **Suite 3 — Restaurante Rápido (Mobile 390x844)**:
   - Vista móvil con 10 secciones y exclusión estricta del módulo de Mesas.
   - Flujo de «Saltar por ahora» con diálogo educativo de confirmación y cierre limpio.
4. **Suite 4 — Distribución (Desktop 1440x900)**:
   - Modal de bienvenida con pistas por rubro de distribución.
5. **Suite 5 — Finalización 100% Auténtica y Reinicio Completo**:
   - Recorrido completo iniciado desde la bienvenida avanzando por todas las secciones secuenciales vía clics «Siguiente», «Finalizar» y «Ir ahora».
   - Al terminar la última sección, el modal **«¡Tutorial completado!»** se abre automáticamente por lógica de dominio.
   - Detección del 100% de secciones completadas.
   - Clic en «Reiniciar tutorial completo» -> reset atómico de React y `localStorage` (`completedSectionIds: []`), inicio limpio en el primer módulo sin tocar datos operativos.

---

### 8. Resultados de la Suite de Pruebas

| Suite / Verificación | Comando | Resultado |
|---|---|---|
| **TypeScript Typecheck** | `npm run typecheck` | **PASS** (0 errores) |
| **ESLint** | `npx eslint <modified_files>` | **PASS** (0 errores, 0 warnings) |
| **Pruebas Restaurante** | `npm run test:restaurant` | **PASS** (117 / 117 tests) |
| **Pruebas Distribución (Engine)** | `npm run test:distribution` | **PASS** (59 / 59 tests) |
| **Pruebas Distribución (Tutoriales)** | `node --test tests/distributionTutorials.test.ts` | **PASS** (18 / 18 tests) |
| **Pruebas Orquestador (G6.1)** | `node --test tests/tutorialOrchestrator.test.ts` | **PASS** (5 / 5 tests) |
| **Demo Isolated Guard** | `npm run test:demos-only:guard` | **PASS** (0 fugas de dependencias) |
| **Build Isolated Demos** | `npm run build:demos-only` | **PASS** (Artefacto compilado exitosamente) |
| **Build Emulator & Production** | `npm run build:emulator` | **PASS** (dist/ listo para previews) |
| **E2E Browser Real (Chrome CDP)** | `node scripts/test-g6-browser.mjs` | **PASS** (10 / 10 comprobaciones exitosas) |

---

### 9. Artefactos y Capturas Generadas

- [g6-1-verification-metrics.json](file:///C:/Users/fabri/.gemini/antigravity/brain/40ec324b-7de2-4d03-b5ca-22638c551a00/g6-1-verification-metrics.json)
- [g6-restaurant-salon-welcome-desktop-1440x900.png](file:///C:/Users/fabri/.gemini/antigravity/brain/40ec324b-7de2-4d03-b5ca-22638c551a00/g6-restaurant-salon-welcome-desktop-1440x900.png)
- [g6-restaurant-salon-continuous-pos-desktop-1440x900.png](file:///C:/Users/fabri/.gemini/antigravity/brain/40ec324b-7de2-4d03-b5ca-22638c551a00/g6-restaurant-salon-continuous-pos-desktop-1440x900.png)
- [g6-1-transition-countdown-desktop-1440x900.png](file:///C:/Users/fabri/.gemini/antigravity/brain/40ec324b-7de2-4d03-b5ca-22638c551a00/g6-1-transition-countdown-desktop-1440x900.png)
- [g6-restaurant-salon-learning-center-resume-desktop-1440x900.png](file:///C:/Users/fabri/.gemini/antigravity/brain/40ec324b-7de2-4d03-b5ca-22638c551a00/g6-restaurant-salon-learning-center-resume-desktop-1440x900.png)
- [g6-1-restaurant-tables-resumed-step1-desktop-1440x900.png](file:///C:/Users/fabri/.gemini/antigravity/brain/40ec324b-7de2-4d03-b5ca-22638c551a00/g6-1-restaurant-tables-resumed-step1-desktop-1440x900.png)
- [g6-fastfood-welcome-mobile-390x844.png](file:///C:/Users/fabri/.gemini/antigravity/brain/40ec324b-7de2-4d03-b5ca-22638c551a00/g6-fastfood-welcome-mobile-390x844.png)
- [g6-distribution-welcome-desktop-1440x900.png](file:///C:/Users/fabri/.gemini/antigravity/brain/40ec324b-7de2-4d03-b5ca-22638c551a00/g6-distribution-welcome-desktop-1440x900.png)
- [g6-completion-summary-desktop-1440x900.png](file:///C:/Users/fabri/.gemini/antigravity/brain/40ec324b-7de2-4d03-b5ca-22638c551a00/g6-completion-summary-desktop-1440x900.png)
