# Continuidad del proyecto PACHAX

## Checkpoint vigente: base común, routing de demos y Nightclub (25/09/2026)

Rama de integración `integrate/nightclub-routing-base`, creada desde `origin/main` en `cb2d186`. Esta sesión integra las correcciones recientes de Restaurante, corrige el cruce entre entrypoints públicos y añade la base independiente de Club nocturno / Lounge. No integra `feat/secure-tenant-onboarding`, no despliega Functions/Rules y no accede a `G:/pachax-comandero`.

### Restaurante integrado antes de construir Nightclub

Se integró `origin/feat/restaurant-next` hasta `071124f`, incluidos:

- `361bade`: sectores, mesas y floor manager.
- `52389e6`: consumo de inventario y snapshots de turno.
- `d6f037a`: stock de ingredientes visible en catálogo.
- `bb8e361`: CRM de clientes con `customerId` estable y acciones WhatsApp.
- `071124f`: consumo de recetas en gramos y mililitros.
- `54f71a4`: consumo de inventario pendiente al cobrar, integrado tras el segundo `git fetch` de cierre.

El merge fue limpio, sin conflictos. Se preservaron POS/mesa, cuentas, rondas, Caja, Historial, Reportes, `RestaurantExperience`, inventario, ledger, turnos, productos, clientes y datasets recientes.

### Bug de navegación pública resuelto

La causa quedó confirmada: `TemplateModeSelectorModal` llamaba `usePublicRouter.navigate()`, que usa `history.pushState()`, para abrir `/demo/*`. Esas rutas pertenecen a `demo.html`, mientras landing/login usan `index.html`; el cambio SPA mantenía montado `App.tsx`, que podía devolver `PublicLanding` en lugar de `DemoRuntime`.

- Se creó `navigateToDemo()` en `src/public/routing/demoNavigation.ts`, que usa `window.location.assign()` para cruzar al entrypoint real.
- `usePublicRouter` queda limitado a `/`, `/login`, `/register` y anclas del mismo entrypoint.
- Los accesos de Landing/ProductStage, TemplateShowcase, Login y el selector empty/full usan el registro canónico y la navegación de documento.
- DemoGallery, footer y accesos generales usan enlaces `<a href>` reales.
- Se corrigió además la superposición de las cuatro ventanas de ProductStage: los centros clicables ya no quedan interceptados por la tarjeta siguiente.

### Registro público único

`src/core/publicTemplates.ts` define para cada solución `id`, `businessType`, título, descripción corta, `demoPath`, `studioTemplateId` y estado. Alimenta Landing, Login/ProductStage, TemplateShowcase, DemoGallery, Register, Studio y resolución de rutas. Las rutas ya no se mantienen manualmente en cinco componentes.

Registro vigente:

- `restaurant` -> `restaurant_pos` -> `/demo/restaurant`.
- `distribution` -> `route_distribution` -> `/demo/distribution`.
- `retail` -> `gelateria_weight_cafe` -> `/demo/retail`.
- `nightclub` -> `nightclub_lounge` -> `/demo/nightclub`.

### Plantilla independiente Club nocturno / Lounge

- `BusinessType` y `BusinessTemplateRegistry` incorporan `nightclub_lounge` con capacidades de mesas, órdenes/cuentas, barra, caja, inventario, clientes, usuarios y reportes.
- `NightclubExperience` es la única interfaz canónica compartida por `NightclubDemo` y `NightclubApp`. No usa `RestaurantExperience` con flags.
- El flujo local inicial conserva una cuenta única por `tableId`: abrir mesa -> agregar varias rondas -> preparar en barra -> solicitar cuenta -> cobrar -> liberar mesa.
- Navegación prioriza Inicio, Salón, POS rápido, Cuentas abiertas, Barra/preparación, Inventario, Productos, Caja, Historial, Clientes, Usuarios, Reportes y Configuración.
- Zonas demo: General, VIP, Lounge, Barra y Terraza. Categorías: Botellas, Tragos/Cócteles, Cervezas, Mixers/Energizantes, Combos, Snacks y Cortesías.
- `createNightclubDataset('empty')` representa cinco zonas, mesas libres, turno cerrado y cero productos/cuentas/ventas. `full` incluye mesas activas, VIP, reserva, cuentas con varias rondas, comandas de barra, turno, clientes e inventario enlazados por IDs.
- Demo directa: `/demo/nightclub?data=empty` y `/demo/nightclub?data=full`.
- Studio: `/studio?template=nightclub`, con branding, rol, dataset y viewport mediante el mismo `NightclubExperience`.
- Routing productivo reconoce `businessType === 'nightclub_lounge'` y monta `NightclubApp`. Su adapter es temporal/local; no se afirma persistencia remota ni seguridad backend terminada.
- Roadmap de open tabs, división/reapertura de cuenta, reservas, floor plan, inventario, auditoría y preautorización futura en `docs/NIGHTCLUB-ROADMAP.md`.

### Vercel colaborativo verificado

- Proyecto: `pachax-app`.
- Git: `pachaxbo-commits/pachax-platform`.
- Framework/build/output: Vite, `npm run build`, `dist`.
- Production Branch: `main`, sin cambios.
- La integración Git mantiene Preview Deployments para ramas no productivas. Flujo documentado en `AGENTS.md`: branch -> push -> Pull Request -> Vercel Preview -> revisión -> merge.
- No se deshabilitó Vercel Authentication. Los previews protegidos requieren miembro del proyecto o shareable protected-preview link.

### Pruebas y QA de esta integración

- `npm run typecheck`: aprobado.
- `npm run test:restaurant`: 25/25.
- `npm run test:cash`: 1/1.
- `npm run test:nightclub`: 4/4.
- `npm run test:platform`: 24/24, incluidos registro público, targets de navegación y resolución Nightclub.
- `npm run test:distribution`: 55/55.
- `npm run build:emulator`: aprobado; conserva advertencias no bloqueantes de chunks grandes y Firebase Functions importado estática/dinámicamente.
- Navegador real en modo emulador: Landing -> Restaurante/Distribución/Retail/Nightclub -> empty/full cargó las ocho URLs correctas en `DemoRuntime`; ninguna volvió a `PublicLanding`.
- `/login` mostró el formulario y las cuatro soluciones; `/demo` mostró las cuatro demos; `/demo/nightclub` funcionó pegando URL; `/studio?template=nightclub` montó `NightclubExperience` dentro del iframe. Sin errores de consola detectados.

### Pendientes reales después de esta base

- Diseño visual profundo de Nightclub por Helmy dentro de sus carpetas propias.
- Rediseño/correcciones de Restaurante por Dario sin modificar Nightclub.
- Persistencia backend real de Nightclub: paths tenant, roles, Rules/Functions, idempotencia, auditoría y aislamiento A/B/C.
- Open tabs sin mesa, división/reapertura autorizada, reservas avanzadas, floor plan gráfico y procesamiento de preautorizaciones.
- Consolidación productiva de `QuickRetailExperience` para Comercio / Venta rápida.
- Rediseño editorial definitivo de las tarjetas públicas con arte por industria.

Los checkpoints inferiores se conservan como historial. Si contradicen este bloque, este checkpoint superior describe el estado vigente.

## Clientes Restaurante (24/09/2026, feat/restaurant-next)

- `RestaurantCustomers` pasó de una lista calculada por nombre a un CRM ligero dentro de la experiencia canónica. La demo persiste clientes en `pachax:restaurant-demo:operations:v2:customers:v1`; los pedidos antiguos con nombre se migran a contactos sin teléfono, sin inventar datos. Restablecer demo limpia esta clave con las demás.
- Los clientes nuevos tienen ID estable, teléfono normalizado con código de país, nombre, apellido y campos opcionales. Mesas permite seleccionarlos o crearlos con nombre y teléfono sin salir de la cuenta; POS también permite seleccionarlos. Las órdenes nuevas guardan `customerId` y snapshots de nombre/teléfono. Pedidos legacy se relacionan por teléfono normalizado o, únicamente cuando carecen de teléfono, por nombre de contacto migrado.
- Visitas, última visita y total consumido derivan de órdenes pagadas no canceladas. Editar el teléfono no pierde historial vinculado por ID. El WhatsApp visible usa `wa.me` con saludo/reserva prellenados, sin envío automático ni API paga. Roles owner/admin/team editan, archivan y ven historial; cashier/waiter crean, buscan y abren WhatsApp. Archivar es lógico y conserva órdenes. La producción todavía requiere un repositorio tenant y permisos de escritura reales; su adaptador actual no persiste clientes.
- QA en origen demo aislado `127.0.0.1:5193`: crear cliente, bloquear teléfono duplicado, crear otro desde Mesa 2, asociarlo a orden #045, vender y cobrar Bs 58, ver 1 visita/Bs 58 en Clientes, editar teléfono y conservar historial. `test:restaurant` cubre normalización, URL WhatsApp, enlace legacy e historial por ID. Typecheck, las pruebas de Restaurante/Caja/Plataforma/Distribución y `build:emulator` aprobaron. El lint focal de los archivos nuevos y conectores de Restaurante aprobó; `CajaView` y el lint global aún tienen errores heredados (243 errores/6 avisos en global). `npm run build` normal sigue bloqueado por las variables Firebase ausentes del nuevo proyecto; no se modificó backend.

## Integración Restaurante + experiencia pública (24/09/2026)

- Rama de integración `integrate/restaurant-public-studio`, iniciada en `origin/main` (`a3603ec`). Se integró primero `feat/restaurant-next` y luego `feat/codex-premium-public-redesign`. Los conflictos de `RestaurantDemo.tsx` y este documento se resolvieron conservando el motor operativo nuevo y la historia de ambas ramas.
- Restaurante mantiene `RestaurantExperience` como vista única: producción usa su adaptador; Studio usa `StudioShell` → iframe `/demo/restaurant?embed=studio` → `DemoRuntime` → `RestaurantDemo` → `RestaurantExperience`. Studio sincroniza rol, nombre, logo, colores y dataset por `PACHAX_STUDIO_SYNC`.
- El dataset `empty` arranca con 12 mesas disponibles, turno cerrado, sin productos ni pedidos. `full` usa catálogo, recetas e insumos, 4 mesas ocupadas, lotes KDS, una venta histórica pagada y turno abierto. Las órdenes y mesas se enlazan por `tableId`/`activeOrderId`; el total de la venta pagada y el efectivo del turno derivan de la misma orden. La demo persiste sobre el esquema v2, reconcilia el legado y limpia todas las claves locales de Restaurante al cambiar dataset o restablecer.
- Las tres previews públicas se rehacieron como ventanas claras y compactas del producto; toman nombres, cifras y estados de las factories `full`. Se conservan hero y login editoriales, selector `empty/full` y vitrina única. Se corrigieron afirmaciones públicas de multiempresa aún no validada.
- QA de navegador local en `dev:emulator`: landing y login de escritorio; login/registro a 360 y 390 px sin desborde horizontal; seis rutas `/demo/{restaurant,distribution,retail}?data={empty,full}` sin errores de consola; Studio con iframe canónico; Restaurante vacío: abrir turno, crear producto, verlo en TODOS, enviarlo desde POS a Mesa 2 y ver la misma cuenta. Reinicio de full devolvió la cuenta de Bs 154 de prueba a Bs 146 original. En full, el cobro de Mesa 3 por Bs 108 la liberó; KDS, Historial, Caja y Reportes mostraron la misma venta. Se corrigió el `shiftId` ausente de las órdenes iniciales (Caja pasó de Bs 58 a Bs 166 tras el cobro) y el formato horario de mesas que aparecía como `Invalid Date`. La impresión física y el backend tenant no se probaron en esta integración.
- `npm run typecheck`, `npm run test:restaurant` (10), `npm run test:cash` (1), `npm run test:platform` (21), `npm run test:distribution` (55) y `npm run build:emulator` aprobaron. `test:restaurant-cash` no existe; el equivalente es `test:cash`. El build de producción requiere variables Firebase del nuevo proyecto. Queda pendiente validación de hardware y servicios reales antes del despliegue. `feat/secure-tenant-onboarding` y `feat/platform-security-backend` permanecen aisladas.

Las secciones históricas siguientes describen estados de sus respectivas fechas. En particular, las previews oscuras, las cuatro mesas del fixture viejo y las afirmaciones de multiempresa del checkpoint público del 22/09 fueron sustituidas por este estado integrado.

## Restaurante: pagos combinados y base de recetas/inventario (22/09/2026)

- `RestaurantExperience` sigue siendo la única experiencia visual para producción, Studio y demo; los adaptadores mantienen separados los datos y efectos.
- Mesas conserva el selector múltiple con cantidad y observación y añade el acceso directo `+ Abrir mesa`.
- El cobro acepta efectivo, QR, tarjeta y pago dividido. La suma dividida debe coincidir con el total y el cambio se calcula solo sobre la parte en efectivo.
- El catálogo compartido admite metadatos opcionales de restaurante: tipo, unidad base, stock, mínimo, costo, proveedor y receta.
- `restaurantEngine.ts` calcula pagos, costo teórico y consumo de inventario. Cada tanda usa `command:{orderId}:{batchId}` como clave idempotente para descontar stock una sola vez.
- El adaptador demo persiste los movimientos localmente y deja los contratos listos para un repositorio Firebase posterior.
- Usuarios de Restaurante usa ahora tarjetas y jerarquía visual coherentes con Distribución, roles canónicos (`owner`, `admin`, `cashier`, `waiter`, `kitchen`), creación local y registro automático de entrada/salida. La asistencia se guarda en el adaptador local y queda preparada para sustituirse por repositorio.
- CRUD local añadido a Restaurante sin cambiar su experiencia canónica: Usuarios permite crear, editar, activar y eliminar con confirmación; Productos permite ver, crear, editar y eliminar conservando relaciones de recetas/inventario; Inventario permite categorías, unidades, filtros, stock mínimo, estados calculados y eliminación protegida de insumos de recetas.
- Caja / Turnos incorpora `cashEngine.ts`, una fuente única de cálculo para ventas por método, movimientos manuales, efectivo esperado y diferencia. Los movimientos y cierres se persisten localmente por turno; QR/tarjeta aparecen en ventas, pero no alteran el efectivo físico esperado. El arqueo requiere efectivo contado y bloquea el cierre si hay cuentas abiertas.

## Checkpoint vigente: PACHAX Premium Public Experience (22/09/2026)
## Avance de rediseño público editorial (22/09/2026)

Rama aislada `feat/codex-premium-public-redesign`, creada desde `origin/feat/public-template-showcase` (`6d7d953`). Se reemplazó el hero centrado por una composición oscura asimétrica con tres ventanas seleccionables de Restaurante, Distribución y Comercio. La sección de plantillas usa filas editoriales con vistas amplias; cada selección conserva el modal y los parámetros `?data=empty|full`. El login ahora ocupa la pantalla en un split oscuro/marfil con las tres vistas de producto y formulario compacto; en móvil se prioriza el formulario. El registro recibió ajustes visuales sin conectar onboarding. Se eliminó el badge decorativo del header.

Se preservaron `src/demo/datasets/**`, DemoRuntime, Studio, motores de dominio, Auth y backend seguro. El modal conserva Escape y añade ciclo de foco y restauración. Verificados `npm run typecheck`, `npm run test:platform` (20/20), `npm run test:distribution` (55/55) y `npm run build:emulator`. `npm run build` requiere la configuración Firebase del nuevo proyecto y falla explícitamente sin ella. Revisión visual en navegador local: `/`, `/login`, `/register`; rutas `/demo` y las tres demos con `?data=full` cargan con sus controles de dataset. Pendiente: revisar paridad de previews cuando llegue Restaurant Next; no mezclar la rama paralela. No se desplegó ni modificó main.


## Checkpoint vigente: TemplateShowcaseSection y Arquitectura Dual de Datasets (22/09/2026)

Rama `feat/public-template-showcase`. Se implementó la vitrina protagonista de plantillas (`<TemplateShowcaseSection />`) reemplazando funcionalmente a `SolutionsExplorer` en la experiencia pública (`/`). Incorpora dirección de arte premium (Deep Slate `#0B1F2A`, Petroleum `#1F3B4D`, Ivory `#FAF9F6`, Controlled Azure `#2F7DD7`, Amber `#E0A24A`, tipografía editorial y microinteracciones) junto con la arquitectura de exploración dual por plantilla: **Empezar desde cero (`?data=empty`)** vs **Ver negocio completo (`?data=full`)**.

### Realizado en esta fase

1. **Arquitectura de Datasets Inmutables (`src/demo/datasets/`)**:
   - `types.ts`: Definición de `DemoDatasetMode = 'empty' | 'full'` y los tipos canónicos de dataset para Restaurante (`RestaurantDataset`), Distribución (`DistributionDataset`) y Comercio (`RetailDataset`).
   - `restaurant/restaurantDatasets.ts`:
     - `createEmptyRestaurantDataset()`: Empresa vacía recién configurada con 4 mesas en estado disponible (`available`), 0 productos en catálogo, 0 pedidos y turno no abierto (`null`).
     - `createFullRestaurantDataset()`: Catálogo gastronómico completo con imágenes reales de comida y categorías (Bebidas, Platos Fuertes, Postres, etc.), mesas distribuidas en los 4 estados canónicos reales (`available`, `occupied`, `reserved`, `bill_requested`), pedidos activos con comanda KDS en lote #2 ("En preparación") y turno de caja abierto (T-04).
   - `distribution/distributionDatasets.ts`:
     - `createEmptyDistributionDataset()`: Almacén Central + Ruta Principal, 0 productos, 0 despachos, 0 entregas y 0 cobranzas.
     - `createFullDistributionDataset()`: Respeta con total fidelidad las cifras y tests del motor operativo `distributionEngine.ts`: Viena 25 kg cargados (20 kg inicial + 5 kg aumento), 6 kg vendidos, 18.5 kg retorno físico (variance de -0.5 kg `FALTANTE`), ventas efectivo Bs 288, cobranzas Bs 100, gastos Bs 20 $\rightarrow$ efectivo esperado a rendir Bs 368 (`paymentKind: 'mixed'`).
   - `retail/retailDatasets.ts`:
     - `createEmptyRetailDataset()`: 0 productos, 0 ventas.
     - `createFullRetailDataset()`: Productos a peso (Helado artesanal 325 g @ Bs 60/kg = Bs 19.50) y productos por unidad (Café Latte, Croissant), tickets emitidos y efectivo con vuelto.
   - **Factories inmutables**: Se utilizan funciones factory que devuelven clones nuevos en cada invocación, garantizando que el reinicio de demo o mutaciones de prueba no contaminen singletons.

2. **Adaptación de Demos Canónicas y Runtime**:
   - `RestaurantDemo.tsx`: Acepta `datasetMode` y `resetKey`. Se eliminaron referencias obsoletas a `savedOrders` delegando directamente al estado sincronizado de `orders`.
   - `DistributionDemo.tsx`: Acepta `datasetMode` y `resetKey`, suministrando el dataset correspondiente a la capa canónica `DistributionExperience`.
   - `QuickRetailDemo.tsx`: Acepta `datasetMode` y `resetKey`, inicializando catálogo y ventas limpiamente.
   - `DemoRuntime.tsx`:
     - Control central de `datasetMode`: lee `?data=empty` o `?data=full` desde URL y escucha eventos `PACHAX_STUDIO_SYNC.payload.datasetMode`.
     - Barra de control superior discreta en demos públicas: permite alternar entre `Empezar desde cero` y `Ver negocio completo`, además de incluir botón accesible de **Restablecer demo** (`resetKey`).
   - `StudioShell.tsx`:
     - Incorpora selector de dataset `[Vacío | Completo]` en la barra superior de Studio, propagándolo por iframe query param y por `postMessage`.

3. **Mini Previews Ligeras de Landing (`src/public/landing/previews/`)**:
   - `TemplatePreviewRestaurant.tsx`: Vista visual de salón con mesas en estados reales (`Libre`, `Ocupada`, `Reserva`, `Por cerrarse`), ticket de comanda activa, KDS en preparación (12m) y arqueo de turno T-04.
   - `TemplatePreviewDistribution.tsx`: Visualización de carga física (25 kg cargados, 6 kg entregados, 18.5 kg retorno, 0.5 kg faltante) y cuadratura de caja (Bs 368 a rendir).
   - `TemplatePreviewRetail.tsx`: Balanza digital conectada (325 g @ Bs 60/kg = Bs 19.50) con desglose de ticket (Bs 51.50) y pago con vuelto (Bs 8.50).
   - **Principio canónico**: Son componentes puramente visuales y ligeros, sin lógica duplicada ni cuartas implementaciones, alimentados por los mismos datos conceptuales de los datasets canónicos.

4. **Vitrina Protagonista de Selección (`src/public/landing/`)**:
   - `TemplateShowcaseSection.tsx`: Reemplaza a `SolutionsExplorer` en `PublicLanding.tsx`. Encabezado con badge editorial, grilla responsive de 3 columnas para las tarjetas canónicas y panel complementario para proyectos especiales a medida.
   - `TemplateShowcaseCard.tsx`: Tarjeta interactiva con acento cromático contextual, preview integrada, features clave y CTA de exploración.
   - `TemplateModeSelectorModal.tsx`: Diálogo modal accesible que presenta con total claridad las dos alternativas al hacer clic en cualquier plantilla: *Empezar desde cero* (`/demo/{slug}?data=empty`) y *Ver negocio completo* (`/demo/{slug}?data=full`).
   - Preserva la funcionalidad del formulario de requerimientos a medida con contacto honesto vía WhatsApp y portapapeles.

5. **Verificaciones y Pruebas**:
   - `npm run typecheck`: 0 errores.
   - `npm run test:platform`: 20/20 aprobadas.
   - `npm run test:distribution`: 55/55 aprobadas.
   - `npm run build`: Build de Vite completado exitosamente sin warnings bloqueantes.
   - Working tree limpio en la rama `feat/public-template-showcase`. No se hizo merge a `main`.

---

## Checkpoint anterior: PACHAX Premium Public Experience (22/09/2026)


Rama `feat/premium-public-experience`. Se transformó la entrada comercial y pública de PACHAX en una experiencia SaaS premium, adaptable, visualmente coherente y de alta conversión, manteniendo intactas las capas canónicas operativas y la lógica Firebase.

### Definición de Identidad y Branding
- **Branding institucional PACHAX = pendiente de definición**: no se inventó un isotipo, símbolo ni monograma definitivo.
- Se encapsuló la representación de marca exclusivamente en el componente `src/public/components/BrandMark.tsx` (wordmark tipográfico con composición editorial, tracking y variantes light/dark).
- Todas las vistas públicas (`LandingHeader`, `PublicLoginView`, `PublicRegisterView`, `DemoGallery`, `LandingFooter`) consumen centralmente `<BrandMark />`, permitiendo que en el futuro sea reemplazado por `<PachaxLogo />` en un único punto sin rediseñar las páginas.

### Realizado y Ajustado en esta fase

1. **Landing Comercial Premium (`/`)**:
   - `LandingHeader`: Navegación fija con backdrop blur, enlaces a Producto, Soluciones, Personalización y Demos, y botones dinámicos para login o acceso al sistema si el usuario ya está autenticado. Sin referencias a `/studio`.
   - `LandingHero`: Copy riguroso y honesto (*"Tu negocio. Tu forma de trabajar. Un solo sistema."*) sin métricas no demostrables ni claims falsos.
   - `HeroProductShowcase`: Vitrina de producto viva con tres paneles interactivos que alternan entre Restaurante (mesas, comanda KDS, turno), Distribución (carga física, variance, cobranza de cartera) y Comercio (balanza digital en gramos, carrito mixto, cobro QR/efectivo).
   - `SolutionsExplorer` (*Encuentra tu PACHAX*): Selector interactivo para las 3 plantillas canónicas (`restaurant_pos`, `route_distribution`, `gelateria_weight_cafe`) con CTAs directos para probar demo o iniciar registro, más la 4ta opción *Necesito algo diferente* con formulario de requerimientos a medida y adaptador honesto de contacto (`src/public/config/publicContact.ts` con WhatsApp y copia de solicitud al portapapeles, sin falsa persistencia en base de datos).
   - `BrandingPreviewSection`: Demostración interactiva de cómo PACHAX adapta nombre y colores corporativos para el cliente.
   - `OperationsFeatures`: Pilares técnicos de resiliencia contextualizados por caso de uso (offline en ruta, impresión térmica 58/80mm en cocina y móvil, auditoría ciega de caja, balanza digital en mostrador, multiempresa estricto).
   - `LandingFooter`: Pie de página institucional completo y limpio, sin enlaces a `/studio` ni páginas legales fantasma no existentes.

2. **Inicio de Sesión Rediseñado (`/login`)**:
   - Implementado `src/public/auth/PublicLoginView.tsx`.
   - Conserva al 100% la lógica Firebase existente (`auth.signIn`, estados `isLoading` y `error`).
   - En móvil: formulario ultrarrápido y táctil sin distracciones visuales.
   - En desktop: split editorial elegante con vitrina de confianza y seguridad a la izquierda y tarjeta de acceso a la derecha.

3. **Onboarding Visual Guiado y Alineado al Backend (`/register`)**:
   - Implementado `src/public/register/PublicRegisterView.tsx` con flujo en 5 pasos: Cuenta $\rightarrow$ Empresa $\rightarrow$ Plantilla $\rightarrow$ Marca $\rightarrow$ Revisión.
   - Eliminado campo manual de sucursal (`branchName`), alineándose al contrato backend de onboarding que autogenera la sucursal principal (`branches/main`).
   - Paso 5 honesto: muestra la revisión previa con botón "Crear mi empresa" provisionalmente inactivo y aclaración explícita de que la conexión directa al backend de registro se integrará en la siguiente fase.
   - Preselecciona automáticamente la plantilla si se accede con `/register?template=restaurant_pos`, etc.
   - Cero escrituras directas a Firestore o creación simulada de tenants.

4. **Enrutamiento Público y Desacople de Firebase en Web (`App.tsx`)**:
   - `usePublicRouter`: Hook liviano de enrutamiento del lado del cliente sincronizado con History API y scroll a anclas.
   - `App.tsx`: Las rutas públicas `/` y `/register` se muestran en web sin requerir configuración previa de Firebase. La vista `/login` y los entornos operativos mantienen intacta su validación estricta de Firebase.
   - En aplicación nativa instalada (`Capacitor.isNativePlatform()`), los usuarios operativos van directamente al login/sistema.
   - `DemoGallery`: Desvinculada de `/studio`, enlazando limpiamente de regreso a `/`.

5. **Verificación y Pruebas**:
   - `npm run typecheck`: 0 errores de TypeScript.
   - `npm run test:platform`: 20/20 pasadas.
   - `npm run test:distribution`: 55/55 pasadas.
   - `npm run build`: Éxito en 3.37s con chunks optimizados por Vite.

## Checkpoint previo: Arquitectura Canónica de Restaurante e Integración con PACHAX Studio (22/09/2026)

Rama `fix/restaurant-canonical-preview`. Se aplicó el principio de **Single Canonical Template Experience** a Restaurante (`restaurant_pos`), igualando la arquitectura canónica previamente implementada en Producción y distribución.

### Realizado en esta fase

1. **Capa Canónica de Restaurante (`RestaurantExperience`)**:
   - Se creó `src/modules/restaurant/views/RestaurantExperience.tsx` como la única capa visual compartida y canónica.
   - Header responsive: logo de empresa personalizable (`logoUrl`), nombre de la empresa, indicador interactivo de turno (abierto/cerrado), usuario, rol activo y botón de cerrar sesión.
   - Navegación responsive estandarizada:
     - Desktop (`md:flex` a >=768px): barra lateral de 56 unidades (`w-56`) con acceso a los 14 módulos canónicos permitidos según el rol del usuario, estilizada con tokens `--primary`, `--primary-soft` y `--primary-hover`.
     - Mobile (`md:hidden` a <768px): barra inferior `BottomNav` fija con 3 o 4 accesos directos prioritarios por rol (ej. POS, Pedidos, Mesas o Cocina) más botón modal de "Más opciones" para los restantes módulos.
     - Diálogo de confirmación accesible para cerrar sesión.
   - Contenedor canónico modular: renderiza los 14 módulos operativos (`dashboard`, `pos`, `orders`, `tables`, `kitchen`, `history`, `cash`, `inventory`, `products`, `customers`, `users`, `reports`, `settings`, `printers`).

2. **Entrada Productiva de Restaurante (`RestaurantApp`)**:
   - Creado `src/modules/restaurant/views/RestaurantApp.tsx`.
   - Aplica el tema de Restaurante (`applyTenantTheme`) y delega la presentación a `RestaurantExperience`.

3. **Adaptador de Demo y Studio (`RestaurantDemo`)**:
   - Refactorizado `src/demo/restaurant/RestaurantDemo.tsx` para actuar estrictamente como adaptador de estado y mock data local hacia `RestaurantExperience`.
   - **Preservación total del trabajo previo**: conserva el 100% de la lógica de turnos (`Shift`), ciclo de vida de mesas (`RestaurantTable`), comandas por lotes con impresión (`submittedBatches`), pagos, eventos de auditoría y persistencia `localStorage`.
   - Eliminada por completo la barra de navegación horizontal paralela y duplicada.

4. **Conexión Productiva Estricta en `src/App.tsx`**:
   - Se utiliza `getActiveTenant()?.businessType` (origen canónico `restaurant_pos`, `route_distribution`, `gelateria_weight_cafe`).
   - Evita la colisión provocada por el adapter legacy de `authStore.ts` (que mapea todo lo que no sea distribución a `restaurant`).
   - Mapeo productivo:
     - `restaurant_pos` -> `RestaurantApp`
     - `route_distribution` -> `DistributionShell` / `DistributionApp`
     - `gelateria_weight_cafe` u otras plantillas -> `UnauthorizedView` ("La plantilla de esta empresa todavía no tiene una interfaz operativa habilitada.") hasta implementar `QuickRetailExperience`.

5. **Sincronización en Tiempo Real de Branding en Studio y Demos**:
   - `DemoRuntime.tsx` propaga `branding.logoUrl` y `branding.companyName` a `RestaurantDemo`.
   - Los cambios de logo y nombre en `BrandingDrawer` se reflejan de inmediato en el iframe del simulador responsive.

6. **Verificación y Pruebas**:
   - `npm run typecheck`: 0 errores.
   - `npm run test:platform`: 20/20 aprobadas.
   - `npm run test:distribution`: 55/55 aprobadas.
   - `npm run build`: bundle generado exitosamente (incluye chunk optimizado `RestaurantExperience-*.js`).

## Checkpoint vigente: PACHAX Studio Canónico e Integración Canónica de Distribución (22/09/2026)

Rama `fix/studio-canonical-preview`. Se refactorizó la arquitectura de PACHAX Studio para convertirlo en un visor fiel de las interfaces canónicas reales, eliminando implementaciones visuales paralelas y garantizando paridad 1:1.

### Realizado en esta fase

1. **Capa Canónica de Distribución (`DistributionExperience`)**:
   - Se extrajo `src/modules/distribution/views/DistributionExperience.tsx` como el único componente presentacional compartido.
   - `DistributionApp.tsx` (producción) conserva sus hooks reales (`useDistributionData`, `useSyncStatus`, `useBackButtonBridge`) y delega el renderizado a `DistributionExperience`.
   - `DistributionDemo.tsx` (Studio / Demos) inyecta `previewData`, estado de sincronización mockeado y sesión simulada directamente a `DistributionExperience`, sin llamar hooks ni repositorios productivos.
   - **Paridad absoluta**: Mismo header, misma barra lateral en desktop (`md:flex`), mismo `BottomNav` en móvil, mismo modal de "Más opciones", y mismos componentes operativos.

2. **Simulador Responsive con Iframe Aislado**:
   - Se reemplazó el contenedor `div` por un `<iframe>` aislado cuyas dimensiones físicas activan de manera auténtica las media queries CSS y breakpoints de Tailwind (`sm:`, `md:`):
     - `360×800` (Mobile compacto): activa BottomNav móvil, oculta sidebar de escritorio.
     - `390×844` (Mobile estándar): vista móvil estándar.
     - `768×1024` (Tablet): activa el breakpoint `md:` de forma natural (muestra sidebar lateral, oculta BottomNav).
     - `1366×768` (Laptop / Desktop compacto).
     - `Responsive`: 100% del espacio disponible.
   - Sin hacks de `transform: scale()` ni zoom que alteren el cálculo responsive.

3. **Comunicación Segura Studio ↔ Preview**:
   - Puente `postMessage` bidireccional con validación de origen (`window.location.origin`).
   - El iframe emite `PACHAX_PREVIEW_READY` al montarse, y StudioShell sincroniza en tiempo real rol (`PACHAX_STUDIO_SYNC`) y branding sin recargas forzadas del iframe.

4. **Branding Unificado y Carga de Logo Local**:
   - Se unificó el sistema de diseño sobre las variables canónicas de la aplicación: `--primary`, `--primary-hover`, `--primary-soft`, `--accent`, `--accent-soft`, `--background`, `--surface`, `--sidebar`.
   - `BrandingDrawer` incorpora la carga de **Logo de empresa** exclusivamente para formatos PNG, JPEG y WebP (máx. 300 KB), almacenado localmente en `localStorage` sin subir nada a Firebase.
   - La cabecera canónica muestra el logo y nombre de la empresa del cliente, con un discreto "Powered by PACHAX" secundario. Fallback seguro a `/brand/pachax-logo.png` si no se especifica logo.

5. **Patrón Arquitectónico para Próximas Plantillas**:
   ```
   interfaz real Restaurante / Comercio
          ↑
   datos reales / mock adapter
          ↑
   producción / Studio / demo pública
   ```
   - **Restaurante**: No fue modificado en esta fase (desarrollo paralelo en otra rama). Cuando se integre, adoptará este mismo patrón de extracción presentacional.
   - **Comercio / Venta rápida**: Se migrará a este patrón en su turno.

### Verificaciones y pruebas
- `npm run typecheck`: Aprobado (0 errores).
- `npm run test:platform`: 20/20 comprobaciones aprobadas.
- `npm run test:distribution`: 55/55 pruebas del motor de distribución aprobadas.
- `npm run build`: Compilación limpia de producción en 5.14s.
- Motores de negocio, repositorios, Firebase, Auth, Firestore Rules y Functions 100% intactos.
- Rama: `fix/studio-canonical-preview` (sin merge a `main`).

---

## Checkpoint anterior: PACHAX Studio & Demos Desacopladas (22/09/2026)

### Realizado en esta fase

1. **Entorno PACHAX Studio (`src/studio/`)**:
   - Acceso independiente mediante `npm run studio` o ruta `/studio` (`studio.html`).
   - Funciona localmente sin `.env.local` ni configuración remota.
   - Portada profesional con tres tarjetas: *Restaurante*, *Producción y distribución*, y *Comercio / Venta rápida*.
   - **Modo Equipo**: seleccionado por defecto con acceso completo a todos los módulos sin requerir autenticación ni cambio de usuario.
   - **Simular rol**: selector opcional por plantilla (Restaurante: Dueño, Admin, Caja, Mesero, Cocina, Inventario; Distribución: Admin, Almacén, Distribuidor; Comercio: Dueño, Admin, Caja, Ventas, Inventario).
   - **Simulador de viewports**: selector interactivo para pantallas móviles (360×800, 390×844), tablet (768×1024), laptop (1366×768) y escritorio.
   - **Personalización de Empresa (Branding)**: panel flotante en tiempo real con tokens visuales CSS (`--studio-primary`, `--studio-sidebar`, `--studio-accent`, `--studio-bg`, etc.), adaptable al formato canónico `Tenant.branding` y persistido localmente sin tocar Firebase.

2. **Demos Desacopladas (`src/demo/`)**:
   - Arquitectura separada: las plantillas y demos no dependen de `StudioShell`.
   - **Rutas públicas disponibles**: `/demo` (galería de las 3 soluciones), `/demo/restaurant` (Bistró Demo), `/demo/distribution` (Distribuidora Demo), `/demo/retail` (Amapola Demo).
   - Demos públicas limpias sin controles de desarrollo ni selector de viewport, con aviso discreto de *Demostración con datos ficticios* y botón CTA *Quiero una solución para mi negocio*.

3. **Plantillas integradas**:
   - **Restaurante (Bistró Demo)**: 14 módulos operativos con mock data (Inicio, POS/Caja, Pedidos, Mesas con plano de salón, Cocina KDS, Historial, Caja/Turnos, Inventario, Productos, Clientes, Usuarios, Reportes, Configuración, Impresoras térmicas). Desacoplado de Firebase mediante wrappers locales.
   - **Producción y distribución (Distribuidora Demo)**: Los 17 accesos completos navegables desde Modo Equipo reutilizando `previewData` y vistas de distribución sin alterar lógica financiera ni de inventario.
   - **Comercio / Venta rápida (Amapola Demo)**: Venta combinada en un mismo carrito de productos por peso (gramos) y por unidad. Reutilización estricta de `src/core/sales.ts` (`createSaleLine`, `saleTotal`, `validatePayments`, `cashClosure`). Módulos de inicio, POS, ventas, caja, inventario en gramos/unidades, productos, clientes, usuarios, reportes y configuración.
   - Contratos intactos: nombre visible *Comercio / Venta rápida*, manteniendo el ID técnico interno `gelateria_weight_cafe`.

4. **Compatibilidad y Protección Vercel**:
   - Flag `VITE_ENABLE_TEAM_STUDIO`: activo en local/dev y en Vercel Preview (`VITE_ENABLE_TEAM_STUDIO=true`), bloqueado en Production. Las rutas `/demo/...` permanecen públicas con mocks.
   - Rewrites en `vercel.json` y middleware dev en `vite.config.ts` para `/studio` y `/demo`.
   - `docs/TEAM-SETUP.md` actualizado para clonar desde `main` y utilizar `npm run studio`.

### Verificaciones y pruebas
- `npm run typecheck`: Aprobado (0 errores).
- `npm run test:platform`: 20/20 comprobaciones aprobadas.
- `npm run test:distribution`: 55/55 pruebas del motor de distribución aprobadas.
- `npm run build`: Generación correcta de artefactos `dist/index.html`, `dist/studio.html`, `dist/demo.html`, `dist/preview.html`.
- Reglas, Auth, Cloud Functions y Firestore Rules sin modificaciones.

---

## Checkpoint anterior: núcleo multiempresa (22/09/2026)

Rama `codex/pachax-platform`. El checkpoint solicitado quedó limitado a contexto activo, paths tenant, Functions, Rules y aislamiento A/B/C. **No continuar todavía con onboarding, `/platform`, Support View, conexión operativa de templates ni UI hasta nueva indicación.** No hubo merge, push, despliegue, Firebase real ni acceso a `G:/pachax-comandero`.

### Núcleo terminado

- Auth resuelve todas las memberships activas mediante `tenantGateway`; una cuenta puede pertenecer a varias empresas. La selección persistida y el perfil cacheado usan claves separadas por `uid + tenantId`.
- `ActiveTenantContext` es la fuente única de tenant, membership, rol, permisos, businessType, template, branding, branch y route. Cambiar empresa limpia contexto y repositorios antes de exponer el siguiente tenant.
- Distribución usa `tenants/{tenantId}/dist*`; la cola incluye `tenantId` y `branchId`. Los documentos producidos por Functions conservan el scope tenant. El adapter legacy `restaurants/pachax` permanece únicamente para las pruebas y consumidores históricos, con TODO explícito.
- `users/{uid}` contiene perfil global y `users/{uid}/tenantLinks/{tenantId}` permite descubrir memberships; los permisos efectivos viven en `tenants/{tenantId}/members/{uid}` y roles tenant.
- `tenantGateway` crea tenants de forma idempotente, lista/selecciona memberships, actualiza configuración y administra usuarios internos. Todas las mutaciones vuelven a verificar membership, estado, permiso, capability y tenant en servidor.
- Los triggers tenant de operaciones, créditos, clientes y mantenimiento apuntan a `tenants/{tenantId}`. Una operación valida actor, empresa, branch, tipo de negocio, permiso y estado antes de mutar inventario o finanzas.
- Firestore Rules bloquea escrituras directas de perfiles, memberships, roles y tenant; autoriza por membership activa, rol/permisos, branch y route. Las rutas Platform permanecen cerradas; su autorización real está pendiente.

### Evidencia del checkpoint

- `npm run test:tenant-core`: 21 comprobaciones aprobadas desde emuladores limpios `demo-pachax-platform` con Auth, Firestore y Functions. Crea Restaurante A, Distribuidora B y Heladería C; cada owner lee solo su tenant; actor A no muta B; miembro desactivado no lee; distribuidor lee su ruta y no otra; caja no lista/crea memberships; owner crea un usuario mediante callable; una operación tenant se confirma y conserva `tenantId`.
- La misma prueba se repitió con Functions ejecutándose en Node `22.23.2`: 21/21 aprobadas.
- Pruebas unitarias con Node 22: 20/20 de core/entorno/dominio y 55/55 de distribución. Suite legacy de reglas/operaciones: 56/56 con Node 22. Typecheck y build de emulador aprobados.
- ESLint global continúa con deuda heredada; el barrido focalizado también encuentra reglas React/lint anteriores en archivos de distribución no originadas por esta fase. No se declara lint global limpio.

### Pendiente después del checkpoint

- Autorización Platform server-side, bootstrap del primer Platform owner, Support View/read-only/elevación/auditoría Platform.
- Onboarding y selector visual de empresa; `/platform`; conexión operativa de `restaurant_pos` y `gelateria_weight_cafe`.
- Migrar los repositorios históricos de restaurante que todavía conservan `restaurantId`/`restaurants/*`; retirar el adapter y entrypoints `restaurants/pachax` solo después de migrar y repetir su suite.
- Storage de branding, índices finales, pruebas Android de este cambio y QA visual. Storage sigue fail-closed.

## Estado anterior y requisitos de referencia (21/09/2026)

Los documentos completos del propietario están conservados en docs/requirements/2026-09-21-producto.md y docs/requirements/2026-09-21-platform.md. **Reemplazan el orden anterior de esperar Firebase antes de desarrollar:** se autoriza avanzar localmente con la plataforma SaaS y consola interna, sin desplegar ni conectar recursos remotos. No pedir nuevamente autorización para continuar esas tareas. No están terminadas.

Rama: codex/pachax-platform, creada desde main limpio. Sin remoto ni proyecto Firebase seleccionado. No se accedió ni modificó G:/pachax-comandero; no hubo push, despliegue ni escrituras remotas. Toda escritura de pruebas fue a demo-pachax-platform.

### Realizado

- Auditoría inicial de conexiones, stack, Auth, módulos y mapa semántico restaurantId en docs/AUDITORIA-PLATAFORMA.md.
- Validación pura de Firebase compartida por Vite y runtime: producción sin configuración completa falla explícitamente; configuración parcial también falla en desarrollo; emuladores solo aceptan demo-pachax-platform; proyecto demo sin emuladores rechazado. `npm run build:emulator` permite compilar el artefacto aislado. `npm run build` sin variables debe fallar intencionalmente.
- Storage helper apunta al puerto 9295 en modo emulador. firebase/storage.rules niega todo mientras no se implemente branding con membresías. No afirmar que logos/uploads están habilitados. El comando emulators actual arranca Auth, Firestore y Functions; Storage requiere añadirlo explícitamente.
- Android/Capacitor, paquetes Java de plugins y prueba instrumental migrados coordinadamente a net.pachax.app. Nombre visible PACHAX.
- src/core/platform.ts, templates.ts, sales.ts y finance.ts definen contratos canónicos tenantId, tres businessTypes, módulos/capacidades/presets, autorización de UI Platform separada y sesiones de soporte conceptuales. **No constituyen autorización de servidor ni reemplazan todavía el esquema legacy.** El registry devuelve copias independientes; billingEnforcement=false, aiAssistant=false. El menú legado filtra Bot con el flag; sus archivos siguen disponibles.
- Dominio monetario en centavos y peso en gramos, BigInt para productos/intermedios y redondeo half-up por línea. Pruebas 250g/325g a Bs60 y carrito mixto Bs54; caja excluye QR. Aún no hay POS heladería conectado ni escrituras de estas ventas.
- Login rediseñado, claro crema/petróleo, composición desktop y login directo móvil; animación CSS de nodos con prefers-reduced-motion. Reemplazadas referencias PACHAX Flow en src, incluidos tickets de diagnóstico y componentes heredados.
- docs/SETUP-PACHAX.md y docs/research/amapola.md. La página oficial Facebook fue bloqueada por el proveedor (`Online fetch throttled`); no se usaron homónimos, no hay catálogo/precios/branding confirmados públicamente.

### Verificaciones de esta entrega parcial

- Typecheck aprobado; build de emulador aprobado, con advertencia heredada de bundles grandes.
- 16 pruebas nuevas de entorno/dominio/política UI: `npm run test:platform`. Son pruebas unitarias, **no pruebas de seguridad Platform en Firestore**.
- 55 pruebas de distribución y etiquetas de reportes aprobadas.
- 56 comprobaciones de reglas/operaciones existentes aprobadas mediante `npm run test:rules` con triggers del emulador. No certifican todavía aislamiento multiempresa del nuevo esquema.
- `npx cap sync android`, `:app:assembleDebug` y `:app:assembleDebugAndroidTest` aprobados. No ejecutados en hardware. Artefacto debug generado con configuración demo; no distribuir como producción.
- Login inspeccionado visualmente desktop/móvil; dimensiones sin overflow horizontal comprobadas en 360×640, 375×812, 390×844, 412×915, 768×1024, 1366×768 y 1920×1080. No se ha realizado QA responsive de las tres plantillas.
- ESLint focalizado en archivos nuevos/core/login/config/tests aprobado. ESLint global falla: 211 errores y 30 advertencias en código heredado y artefactos generados. No ocultar ni afirmar lint global aprobado. En la base actual eslint.config.js solo ignora dist; falta excluir correctamente productos de build Android y resolver deuda TS.
- Functions agotó el descubrimiento inicial (10s); iniciar con FUNCTIONS_DISCOVERY_TIMEOUT=60 resolvió. El CLI local usó Node24 aunque Functions declara Node22; falta repetir con el runtime objetivo. En PowerShell usar firebase.cmd y el argumento `--only "firestore,auth,functions"` entre comillas.

### Trabajo pendiente autorizado (no presentar como terminado)

1. Migrar Auth/membership, contexto, repositorios, triggers, mantenimiento, cachés, reglas e índices de restaurants/pachax a tenants/{tenantId}; comprobar aislamiento real y no hacer reemplazo textual global.
2. Implementar autorización Platform en servidor/colección protegida o claims, bootstrap seguro y tests negativos; los helpers src/core son solo contratos de UI.
3. Onboarding transaccional seguro, alta de owner/empresa, branding Storage y usuarios internos en servidor; selector de empresa.
4. /platform completo: directorio paginado, ficha, quick settings, auditoría, Support View con rol visual/identidad persistente, solo lectura efectiva, elevación con confirmación/motivo/expiración; Template Preview con datos ficticios. Nada de esto está conectado hoy.
5. Generalizar distribución conservando P0; integrar/rediseñar restaurante; conectar POS peso/unidad, inventario comercial y caja de heladería. Reutilizar un motor de impresión y uno offline. El registry no prueba que los módulos estén implementados; offlineOperations se deja vacío hasta validar adaptadores nuevos.
6. Completar QA de reglas y operaciones multiempresa/Platform, responsive de todas las plantillas, índices/paginación, contraste de branding y Android físico. Billing/finanzas solo preparados, sin datos reales ni pasarela.

Este párrafo describía el estado anterior fijo en `pachax`; el estado vigente está en el checkpoint superior. No vender ni describir esta entrega como SaaS multiempresa terminado.

## Solicitud y límites

El propietario quiere convertir el flujo de producción, almacenes, distribución, ventas y cobros en la primera categoría de PACHAX, y añadir posteriormente tiendas, restaurantes y otros negocios. El nombre de la aplicación es PACHAX. La marca visual actual es provisional; el rediseño se hará después de conectar el nuevo entorno.

Esta copia parte del estado de trabajo de la app del cliente al 11/09/2026, versión Android 1.2.5. Se copió el código actual, incluidos cambios sin commit, sin copiar el historial Git. El original está en G:/pachax-comandero y este proyecto en C:/PACHAX. Son proyectos independientes. La limpieza futura del código exclusivo del cliente pertenece al chat original y NO se hizo como parte de esta clonación.

## Categoría inicial: Producción y distribución

Pensada para fabricantes y distribuidores con productos, lotes, fechas de vencimiento, almacenes, rutas y cartera de clientes. El sistema maneja costos de producción, pero todavía no constituye un sistema industrial completo de recetas, órdenes de fabricación y consumo de materias primas.

## Funciones heredadas a conservar

- Administración: panel, ventas directas, clientes, productos con foto y costos, inventario, lotes, alertas, despachos, transferencias, gastos, créditos y cobros, confirmación QR, cambios/devoluciones, cierres, reportes y usuarios.
- Almacén: inventario y movimientos, despacho y retorno de productos, transferencias y conciliación física. Sin ventas financieras, clientes ni impresoras en su menú.
- Distribuidor: venta de su ruta, gastos, cobros y cierre propio. La cartera de créditos es compartida entre Administración y distribuidores; las ventas y cierres de otros distribuidores no deben quedar expuestos.
- Soporte: configuración técnica y proceso de limpieza con doble confirmación y respaldo restringido; sin acceso comercial ordinario.
- CI como identificador de cliente, fotos opcionales, crédito vencido que bloquea ventas, stock por lote y vencimiento, confirmación QR separada del efectivo.
- Historial general de inventario con PDF, Excel/PDF generales en español, estado de cuenta, tickets térmicos Bluetooth ESC/POS y configuraciones de impresión.
- Persistencia sin conexión y cola de operaciones con confirmación del servidor. Inicio de sesión requiere internet si se cerró la sesión.
- Merma por redondeo: NO inventar reglas. Quedó pendiente de definición comercial.

## Adaptación histórica realizada el 11/09/2026 (Android vigente: net.pachax.app)

- Identidad visible PACHAX; recursos nuevos y provisionales. Retirado logo térmico específico del cliente; el ticket conserva el nombre textual.
- Android com.pachax.app, versión 0.1.0, código 1. No reutilizar el identificador de la app original.
- Empresa técnica inicial `pachax`; frontend, funciones y reglas apuntan al mismo valor.
- Funciones renombradas a processPachaxOperation, refreshPachaxCredit, initializePachaxCredit y changePachaxMemberPassword, junto con sus llamadas cliente.
- Sin configuración Firebase de producción ni remoto Git. Emuladores ficticios demo-pachax-platform, con puertos propios.
- Excluidos datos descargados, informes, copias de seguridad, credenciales, binarios APK, cachés e historial Git originales. Ejemplos locales anonimizados; catálogo opcional de ejemplo genérico.

## Arquitectura y restricciones importantes

React + TypeScript + Vite; Capacitor Android; Firestore/Auth; Functions Node 22; impresión Bluetooth y TCP; ExcelJS y jsPDF.

La colección `restaurants` y el tipo `mobile_distribution` siguen siendo nombres internos del esquema. Se conservan para no romper referencias, permisos y operaciones. El nombre comercial de la categoría es Producción y distribución.

La app inicia directamente el módulo distribution. Permanecen módulos y servicios anteriores de restaurantes como material reutilizable y dependencias; NO están conectados como categorías terminadas. No borrarlos sin analizar imports y pruebas. El sistema actual opera una sola empresa técnica `pachax`: no usarlo aún para clientes independientes en el mismo Firebase. Multiempresa exige parametrizar frontend, triggers, mantenimiento, permisos y pruebas de aislamiento, no solamente añadir correos diferentes.

Las fotos del flujo distribution se comprimen y guardan en los documentos; hay un helper heredado para Storage. No dar por habilitado Storage hasta definir su uso y reglas. La configuración web conserva el campo del bucket por compatibilidad de inicialización.

## Orden acordado para continuar

1. Usuario entrega configuración web del NUEVO Firebase y URL del NUEVO repositorio GitHub.
2. Configurar servicios, primera cuenta administrativa, reglas/índices/funciones, pruebas y firma propia. Leer docs/CONFIGURACION.md.
3. Rediseñar la primera categoría para PACHAX, aprovechando el orden funcional existente.
4. Definir y desarrollar aislamiento multiempresa y catálogo de módulos; después otras categorías.

## Preferencias del propietario

Quiere trabajo autónomo, sin alterar funciones sin avisar; buen diseño en celular y tablet; menús legibles y formularios sencillos; pruebas reales en entorno aislado; resumen de cambios y pendientes; documentación que permita continuar desde otro chat. No prometer ausencia absoluta de errores: indicar qué se comprobó y qué falta probar con servicios/hardware reales.

## Cómo retomar en un chat nuevo

Abrir C:/PACHAX como proyecto y pedir: «Lee AGENTS.md y CONTEXTO.md, revisa el estado de las pruebas y continúa con la configuración independiente de PACHAX». No es necesario acceder al historial completo del chat original.

## Verificación de la copia (11/09/2026)

- Instalación reproducible con npm ci en frontend y functions, sin vulnerabilidades reportadas por npm en esa ejecución.
- Compilación TypeScript/Vite y sincronización Capacitor correctas.
- Android assembleDebug correcto con com.pachax.app. Firma debug únicamente.
- Compilación del APK de prueba instrumental de la app (`:app:assembleDebugAndroidTest`) correcta; no ejecutado en un dispositivo físico. El comando global assembleDebugAndroidTest también intenta compilar pruebas propias de dependencias y encontró versiones Kotlin duplicadas en capacitor-cordova-android-plugins. Usar el objetivo :app para las pruebas de esta aplicación; revisar esa dependencia antes de ampliar pruebas de plugins.
- 55 pruebas del motor de distribución y prueba de traducciones de reportes aprobadas.
- 50 comprobaciones de reglas y operaciones del servidor aprobadas en demo-pachax-platform, incluidas transacciones, concurrencia, créditos cruzados y permisos de soporte.
- Acceso desde Chrome a las cinco cuentas ficticias aprobado, sin error de permisos en sus pantallas iniciales. Esta prueba no reemplaza un simulacro exhaustivo de cada botón en el nuevo Firebase.
- Huellas de los 192 archivos fuente copiados contrastadas con el original: ninguno fue modificado en el proyecto original.
- Búsqueda en código activo sin nombre, identificador Firebase, identificador Android ni datos personales detectados del cliente original. Las referencias de procedencia solo quedan en documentación y en el manifiesto de huellas.
- Node local utilizado en estas pruebas: 24; Functions declara Node 22 para despliegue. Verificar nuevamente con ese runtime y el proyecto real al conectar servicios.
- No hubo despliegue, push a GitHub, migración de datos ni creación de usuarios reales.

Pendientes reales: configuración y permisos del nuevo Firebase, repositorio remoto, administrador real, firma de publicación, validación Bluetooth con dispositivo físico, rediseño de PACHAX y arquitectura multiempresa. No presentar esta preparación como una plataforma multiempresa ya lista para vender.

## Gestión administrativa de usuarios (11/09/2026)

- Administración puede editar el nombre y el correo de acceso de cada usuario. El cambio se coordina en Firebase Authentication, el perfil de miembro y el mapa interno del usuario; el correo nuevo se usa en el siguiente inicio de sesión.
- Administración puede desactivar, reactivar, cambiar la contraseña o eliminar el acceso. La eliminación conserva ventas, despachos y movimientos históricos porque esos registros guardan sus propios datos de auditoría.
- No se permite eliminar la propia cuenta ni desactivar, eliminar o cambiar de rol a la última cuenta administrativa activa.
- Las modificaciones y bajas pasan por `changePachaxMemberPassword`; las reglas bloquean cambios directos para que no se pueda evitar la protección del servidor.
- Validación local aprobada: TypeScript, ESLint, build web, 55 pruebas del motor, etiquetas de reportes en español, 56 comprobaciones de reglas/operaciones y prueba visual de gestión de usuarios a 360 x 800.
- `scripts/validate-user-management.cjs` es destructivo y se debe ejecutar únicamente contra `demo-pachax-platform` después de `npm run seed:demo`, con los emuladores y Vite activos. Puede necesitar `PLAYWRIGHT_MODULE` si Playwright no está instalado en el proyecto.

## Avance: flujo restaurante en PACHAX Studio (22/09/2026)

Rama `codex/restaurante-turnos-mesas`. Trabajo acotado a la plantilla Restaurante de Studio (`src/demo/restaurant`), sin conectar Firebase ni alterar la aplicaci�n de distribuci�n.

- Turno local persistido en `localStorage`: apertura con usuario/fondo, ventas por m�todo, resumen, efectivo esperado, bloqueo del POS y cierre impedido mientras haya mesas/cuentas abiertas. Historial de turnos y campos de conciliaci�n preparados.
- Mesas clicables con detalle, apertura y consumo, solicitud/reapertura de cuenta, selector r�pido de productos, creaci�n de producto asociado al cat�logo local y pago con c�lculo del vuelto; mesa se libera despu�s del cobro.
- Pedidos, l�neas/timestamps, lotes de comanda, identificadores de turno/mesa, pago y eventos de auditor�a guardados en datos demo locales. Impresi�n del navegador se usa para la vista imprimible; batch y sus l�neas quedan trazables y bloqueadas. Adaptaci�n opcional compatible en `src/types.ts`.
- POS/caja del template utiliza estado compartido y no acepta nuevas �rdenes ni cobros sin turno.
- Verificaci�n: `npm run typecheck`, lint focalizado y `npm run build:emulator` aprobados. `npm run lint` global mantiene 232 errores/6 advertencias heredados; el build normal requiere Firebase deliberadamente sin configurar. Dev server local en puerto 5190 (`npm run dev:emulator -- --host 0.0.0.0`).
- Pendiente: revisi�n manual completa en viewport m�vil; completar soporte de m�todo tarjeta/otro en el esquema com�n de `PaymentMethod`; entrega conectada requiere repositorios tenant/backend y cola/idempotencia del servidor. Los datos de Studio son demo, locales al navegador y no constituyen caja transaccional multiusuario.
## Avance: comprobante físico de arqueo (23/09/2026)

- Caja / Turnos permite imprimir un resumen desde la vista activa y desde el modal de arqueo. El comprobante incluye fondo inicial, ventas en efectivo/QR/tarjeta, entradas y salidas de efectivo, esperado, contado, diferencia y movimientos manuales.
- `cashPrint.ts` genera HTML para impresión térmica de 80 mm o papel normal. Por ahora abre el diálogo estándar del navegador y queda aislado para un proveedor de impresión o Bluetooth.

## Auditoría canónica Restaurante (24/09/2026, feat/restaurant-next)

- Fuente visual única: RestaurantExperience. RestaurantApp la usa para producción; StudioShell crea el iframe /demo/restaurant?embed=studio, DemoRuntime monta RestaurantDemo y este monta RestaurantExperience. No existe RestaurantStudioView ni una copia visual. El proveedor de producción conserva sus adaptadores actuales; la persistencia transaccional multiusuario queda pendiente de backend.
- La base BurgerLab sigue en CajaView (POS, carrito, pedidos, historial, origen WhatsApp, entrega/recojo, cobro) y CocinaView (KDS). PACHAX les pasa órdenes, productos y callbacks del proveedor demo. Se eliminó localOrders del POS. Order.tableId es la identidad estable; tableInfo es snapshot legible y fallback legacy centralizado en restaurantOperations.ts.
- RestaurantDemo gobierna órdenes, mesas, catálogo, turno, stock y auditoría. POS ocupa la mesa real; nuevas líneas se agregan a la misma orden; una cuenta solicitada exige reapertura; pagar o cancelar libera mesa. Pedidos, KDS, Historial, Caja y Reportes comparten órdenes. Clientes deriva visitas y consumo desde órdenes. Caja lee el personal guardado en Usuarios.
- Productos activos, visibles y disponibles se comparten entre Productos, POS y selector múltiple de Mesas. POS inicia en TODOS. Insumos y recetas enlazan por ID. Inventario se descuenta al imprimir comanda una sola vez; los lotes guardan itemIds y una nueva impresión contiene solo líneas nuevas. Documento de comanda separado para 80 mm.
- Caja deriva ventas de órdenes pagadas del turno y movimientos manuales; efectivo, QR, tarjeta y mixto llegan al mismo resumen. El cambio no aumenta ventas. El cierre exige arqueo y ninguna cuenta abierta.
- Demo migra operaciones v1 a v2, reconcilia tableInfo legacy con tableId y conserva la marca de fixtures antiguos para limpiarlos al abrir turno. Una demo nueva inicia con mesas libres y sin órdenes, conservando catálogo e inventario. Restablecer demo explícitamente limpia todas las keys pachax:restaurant-demo:* y tickets locales; no toca datos de producción.
- Branding usa --primary, --accent, --background y foreground legible generado por utilidad central. POS usa acento configurable en Agregar y primario en selección. CajaView mantiene bot management para BurgerLab legacy; PACHAX lo desactiva por capability y no hace polling de bot. WhatsApp como origen sigue activo. Retraso general y pausa pertenecen al control de bot legado; tiempos KDS permanecen en órdenes/items.
- Prueba manual local: turno Bs 200, producto nuevo Bs 25, POS a Mesa 2, adición de dos bebidas Bs 30, KDS Cocina/Barra preparar/listo/entregar, comanda bloqueada, solicitud de cuenta, efectivo Bs 60 con cambio Bs 5, mesa libre, Caja Bs 55 y efectivo esperado Bs 255, Historial y Reportes Bs 55. Otra comanda de Lomo redujo insumo 18 500 a 18 220 g y papas 45 000 a 44 800 g. Studio mostró la misma orden y reaccionó al nombre y colores claros.
- Suites: typecheck, test:restaurant (10), test:cash (1), test:platform (21), test:distribution (55), build:emulator y git diff --check aprobaron. Build normal exige variables Firebase de producción ausentes. Pendiente: backend tenant/multiusuario, hardware de impresión, confirmación física de impresión. QA visual de Studio embed completado en 390×844 y 768×1024 mediante Chrome aislado; la herramienta de interacción dejó de responder y el flujo interactivo final se realizó antes de esa falla.
- Lint focal de dominio/proveedor Restaurante aprueba; lint global actualmente reporta 236 errores y 6 avisos heredados, incluidos 11 de CajaView legacy. No se hizo un refactor global fuera de Restaurante.

## Configuración de salón y mesas (24/09/2026, feat/restaurant-next)

- `RestaurantExperience` mantiene la interfaz visual única. La configuración de sectores y mesas vive en el proveedor de demo (`RestaurantDemo`) y se entrega a `RestaurantTables` como datos y acciones; producción conserva su proveedor separado, pendiente de repositorio tenant.
- `restaurantFloor.ts` define acciones de crear, editar, archivar y reordenar sectores y mesas; los IDs son estables. Una mesa con cuenta activa no puede desactivarse ni archivarse. Archivar un sector con mesas exige trasladarlas a otro sector. El archivo es lógico para conservar referencias históricas.
- El modo «Administrar salón» se muestra a owner/admin/team. La operación normal usa los mismos componentes de Mesas y POS: sectores por `sectorId`, mesa por `tableId`; el nombre es solo presentación. Las mesas inactivas o archivadas no se ofrecen para nuevas ventas. Dashboard calcula métricas desde mesas activas visibles.
- La demo persiste sectores junto a mesas en `pachax:restaurant-demo:operations:v2` con `schemaVersion: 3`. Una migración asigna `sectorId` a mesas legacy; los datasets full/empty tienen un grafo coherente, y empty permite crear el primer sector y mesa. Restablecer demo limpia ambas entidades con el resto del fixture.
- Validación manual local: crear sector Patio y Mesa Patio A, seleccionar la mesa en POS, registrar pedido de Bs 58, comprobar cuenta en Mesas y persistencia tras recarga; dashboard mostró 2/13. Pruebas de dominio cubren CRUD, archivo seguro, migración y POS por ID.

## Inventario operativo Restaurante (24/09/2026, feat/restaurant-next)

- Productos → Ingredientes muestra el stock actual con su unidad base (por ejemplo, Lomo Fino Vacuno en gramos) desde el mismo estado de inventario que POS y Mesas actualizan al confirmar consumos. La demo también escucha cambios de `inventory-store:v1` de otra pestaña del mismo origen para refrescar el saldo visible sin recargar; la sincronización entre dispositivos sigue pendiente del repositorio transaccional de producción.
- `RestaurantExperience` sigue siendo la UI canónica. `RestaurantDemo` conserva el estado local compartido de productos, órdenes, mesas, movimientos y turnos. El proveedor de producción todavía no tiene repositorio transaccional de inventario; antes de usar varios dispositivos reales hay que implementar validación y escritura atómica en backend con clave idempotente por línea de pedido.
- `inventoryEngine.ts` concentra cálculo por producto directo o receta, conversiones g/kg y ml/L, validación de stock, consumo al confirmar pedido POS o nueva tanda de Mesa, devolución parcial/total, movimientos con stock anterior/final, IDs de orden/línea/mesa/turno y usuario. Reimprimir una comanda no repite el descuento. Cancelar la última unidad cierra la cuenta anulada y libera la mesa; el historial permanece.
- `RestaurantInventory` muestra stock actual, mínimo, estado y movimientos filtrables. Productos permite configurar stock directo, etiqueta de unidad y recetas por ID. Los movimientos de compra, merma, pérdida, cortesía, consumo interno y ajuste se distinguen de ventas; Caja recibe únicamente pagos y movimientos de dinero. Reportes muestra consumo confirmado aunque la cuenta esté abierta.
- La apertura de turno guarda snapshot de stock; el cierre requiere conteo físico y guarda teórico, físico y diferencia sin modificar stock por esa diferencia. El arqueo aparece en Caja, impresión y Turnos cerrados de Historial. Los datos demo actuales migran a `schemaVersion: 4` y guardan productos+movimientos juntos en `inventory-store:v1`; discrepancias detectadas entre ambos al cargar se anotan como movimientos explícitos de reconciliación local para revisión.
- Prueba manual en origen local aislado: turno Bs 200, Corona con 24 unidades, POS Mesa 1 vende 2 → 22; Mesa 2 vende 3 → 19 con cuentas abiertas; cancelación parcial desde Mesas; pago Mesa 2 Bs 30 con recibido Bs 50; cierre con efectivo esperado/contado Bs 230, conteo físico 21 frente a teórico 22, diferencia -1 guardada en Historial. Luego se probó la cancelación de la última unidad, que liberó la mesa; un ajuste a stock 2 bloqueó un nuevo pedido de 3 sin crear cuenta. Una confirmación nativa de navegador durante la prueba produjo una brecha local entre stock y libro; se sustituyó por modal, se centralizó la actualización del par stock/movimientos y la migración ahora registra la reconciliación. No se ha validado concurrencia entre usuarios reales.
- Validación: `npm run typecheck`, `npm run test:restaurant` (21), `npm run test:cash`, `npm run test:platform`, `npm run test:distribution` y `git diff --check` aprobados. `npm run build` normal sigue bloqueado por las variables Firebase de producción ausentes; usar `npm run build:emulator` para esta rama local. Lint global conserva errores heredados fuera de este cambio.

## Corrección de recetas con gramos y mililitros (25/09/2026, feat/restaurant-next)

- El catálogo full modela Lomo con gramos de carne/papas, Limonada con 350 ml de base y Copa de vino con 200 ml. La venta descuenta esos insumos desde el mismo motor de inventario y deja sus movimientos trazables por orden y línea.
- La carga local migra de forma no destructiva inventarios persistidos: restaura recetas de fixture que antes quedaron vacías, transforma la reserva histórica de vino de botellas a mililitros, convierte movimientos y conteos de turno asociados, y agrega la base de limonada sin borrar productos ni movimientos creados por el usuario. `schemaVersion` pasa a 5.
- Pruebas de dominio verifican el catálogo real: una venta de lomo, dos limonadas y una copa deja carne en 18 220 g, papas en 44 800 g, base de limonada en 11 300 ml y vino en 17 800 ml.
- El cobro ahora es una salvaguarda final de inventario: si una cuenta de Mesa se pagó sin haber pasado antes por POS o por impresión de comanda, confirma sus líneas pendientes al cobrar. La clave idempotente por orden/línea evita descontar por segunda vez productos ya confirmados. Todos los platos y bebidas del fixture full tienen receta; productos nuevos pueden usar receta o stock directo. `schemaVersion` pasa a 6.
