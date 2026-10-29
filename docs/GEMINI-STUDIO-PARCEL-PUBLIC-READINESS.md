# INFORME DE INTEGRACIÓN CONTROLADA: PACHAX STUDIO + ENCOMIENDAS PÚBLICA

**Autor:** Gemini / Antigravity  
**Fecha:** 29 de octubre de 2026  
**Rama de trabajo:** `gemini/studio-parcel-public-preparation`  
**Base origin/main:** `8907780` (post PR #9 y PR #10)  
**Estado:** ✅ Verificado, compilación limpia, 0 errores de TypeScript y suite de pruebas superada al 100%.

---

## 1. Resumen Ejecutivo

En cumplimiento de las instrucciones de la dirección de PACHAX Platform, este trabajo resuelve de raíz la estabilidad operativa de **PACHAX Studio** y prepara la apertura pública controlada de **PACHAX Encomiendas Estándar**, manteniendo un aislamiento estricto de la **Edición Sindicato** y preservando la frontera arquitectónica con Codex (Billing Core, Planes Comerciales y Facturación).

### Logros Principales:
1. **PACHAX Studio Estabilizado al 100%:** Diagnóstico y corrección integral del problema reportado en **Restaurante de Servicio Rápido (Hamburger)** y **Comercio / Venta Rápida (Retail)**. Ahora ambas experiencias cargan la aplicación canónica completa dentro del sandbox de Studio, sincronizan marca, roles simulados, modo equipo, escenarios de datos y viewport switcher sin bloqueos de iframe ni degradación de interfaz.
2. **Separación de Ediciones de Encomiendas:**
   - **PACHAX Encomiendas Estándar (Pública SaaS):** Habilitada como demo interactiva abierta en `/demo/parcel` y `/demo/encomiendas`. Operación completa (guías, QR, manifiestos, firmas, COD, reportes) con datos ficticios locales (`pachax:parcel-demo`) sin requerir autenticación de Platform Operator ni exponer módulos gremiales.
   - **PACHAX Encomiendas — Edición Sindicato (Exclusiva Studio):** Módulos de padrón de socios, cuotas, choferes/personal y balance gremial confinados a PACHAX Studio con guardia fail-closed de autenticación en producción (`useAdminAuth`).
   - **Protección contra Inyección:** Bloqueo inmutable contra manipulación de URL (`?profile=sindicato` o `?edition=sindicato` en rutas públicas son neutralizados automáticamente hacia `standard`).
3. **Conexión con PACHAX Core:** Documentos oficiales (A4 y tickets térmicos de 80mm) unificados con el contrato canónico `BusinessIdentity` y `BusinessDocumentContext` de PACHAX Core.
4. **Límite con Codex Respetado:** Cero mutaciones a `CommercialTemplateItem`, planes o precios. Definición editorial canónica aislada en `PARCEL_EDITORIAL_SHOWCASE_ITEM` y contrato documentado para la futura incorporación a cargo de Codex.

---

## 2. Diagnóstico y Corrección de PACHAX Studio (Prioridad Máxima)

### 2.1. Causa Raíz Identificada

El propietario reportó que Restaurante Rápido (Hamburger) y Comercio Rápido (Retail) no funcionaban correctamente dentro de Studio. La auditoría exhaustiva reveló una triple discrepancia en la cadena de previsualización:

1. **Conflicto de Routing en Desarrollo (`vite.config.ts`):**  
   El middleware de desarrollo capturaba cualquier ruta `/demo/hamburger*` o `/demo/retail*` y la reescribía incondicionalmente hacia `/demo-isolated.html`, ignorando el parámetro `?embed=studio`.
2. **Desconexión Arquitectónica de `demo-isolated.html`:**  
   `demo-isolated.html` monta `DemoOnlyApp.tsx`, una aplicación mínima diseñada para navegación pública directa, la cual:
   - Carecía de listeners para el evento `postMessage` `PACHAX_STUDIO_SYNC`.
   - No emitía `PACHAX_PREVIEW_READY` hacia el padre `StudioShell`.
   - Renderizaba su propia barra superior fija con botones "Volver a PACHAX" y "Galería", interfiriendo visualmente con el shell de Studio.
   - No soportaba modo equipo, roles simulados, temas de marca ni el cajón de personalización (`BrandingDrawer`).
3. **Bloqueo de Seguridad en Producción Vercel (`vercel.json`):**  
   Las rutas `/demo/hamburger` y `/demo/retail` tenían configurados encabezados estrictos de seguridad:  
   `X-Frame-Options: DENY` y `Content-Security-Policy: ... frame-ancestors 'none'`.  
   En consecuencia, en producción cualquier intento de incrustar `/demo/hamburger` o `/demo/retail` en un `<iframe>` dentro de `studio.html` era rechazado tajantemente por el navegador web, mostrando una pantalla en blanco o error de carga.

### 2.2. Solución Canónica Implementada

Se implementó una solución elegante y consistente con AGENTS.md ("Single Canonical Template Experience"), sin debilitar la seguridad pública de los demos aislados:

1. **Ruta Canónica de Incrustación en `StudioShell.tsx`:**  
   Se unificó la URL del iframe para todas las plantillas:  
   `const iframeSrc = '/demo?template=' + templateId + '&embed=studio'`  
   - En **Vercel**, el path es `/demo`, por lo que reescribe limpiamente a `demo.html` sin activar las cabeceras `X-Frame-Options: DENY` asociadas exclusivamente a los endpoints directos de landing.
   - En **Vite DEV**, el middleware de desarrollo permite el paso de cualquier consulta con `embed=studio` hacia `demo.html`.
2. **Resolución de Rutas Unificada (`resolveDemoRoute.ts`):**  
   `resolveDemoRoute` identifica `?template=hamburger`, `?template=retail`, etc., resolviendo `isStudioEmbed: true` y montando `DemoRuntime.tsx`.
3. **Sincronización Bidireccional (`DemoRuntime.tsx`):**  
   `DemoRuntime` monta en modo Studio las experiencias canónicas (`RestaurantDemo` con `profile="counter_service"`, `QuickRetailDemo`, `DistributionDemo`, `NightclubDemo`, `ParcelDemo`), escucha `PACHAX_STUDIO_SYNC` y aplica tokens de diseño, roles simulados y reseteos sin recargas de página.
4. **Adaptación de `QuickRetailDemo.tsx`:**  
   Se añadieron propiedades de identidad (`companyName`, `isStudioEmbed`), padding responsivo cuando está incrustado y protección para reajustar automáticamente el módulo activo si el operador cambia a un rol con permisos restringidos (ej. Cajero o Inventario).
5. **Cero Mutaciones de Motores:**  
   Los motores de cálculo y lógica operativa (`restaurantEngine`, `restaurantOperations`, `retailRepository`) se mantuvieron 100% intactos.

---

## 3. Separación Rigurosa de las Dos Ediciones de Encomiendas

De acuerdo con la directiva, se desacoplaron totalmente la experiencia comercial pública y el módulo sindical privado:

```
                               ┌──────────────────────────────────────────────┐
                               │       PACHAX PLATFORM — ENCOMIENDAS          │
                               └──────────────────────┬───────────────────────┘
                                                      │
                       ┌──────────────────────────────┴──────────────────────────────┐
                       ▼                                                             ▼
       ┌───────────────────────────────┐                             ┌───────────────────────────────┐
       │   PACHAX Encomiendas Estándar │                             │  Edición Sindicato (Privada)  │
       │         (Pública SaaS)        │                             │      (Exclusiva Studio)       │
       ├───────────────────────────────┤                             ├───────────────────────────────┤
       │ • Ruta pública: /demo/parcel  │                             │ • Acceso: Studio (Admin Auth) │
       │ • Acceso libre sin login      │                             │ • Padrón de Socios gremiales  │
       │ • Edición forzada a standard  │                             │ • Mensualidades & Cuotas      │
       │ • Parámetros sindicato nulos  │                             │ • Trabajadores & Pagos chofer │
       │ • Selector perfil OCULTO      │                             │ • Gastos gremiales & Balance  │
       │ • Tabs gremiales OCULTAS      │                             │ • Selector de perfil ACTIVO   │
       │ • Almacenamiento: parcel-demo │                             │ • Almacenamiento: parcel-studio│
       └───────────────────────────────┘                             └───────────────────────────────┘
```

### 3.1. PACHAX Encomiendas Estándar (Pública SaaS)
- **Rutas de acceso:** `/demo/parcel` y el alias `/demo/encomiendas`.
- **Autonomía:** No requiere credenciales ni sesión administrativa.
- **Inmutabilidad de Edición:** `ParcelDemo.tsx` evalúa si el contexto es público (`isPublicDemo` o ruta pública fuera de Studio). Si es público, la edición se fija **forzosamente** en `'standard'`.
- **Protección contra Inyección:** Cualquier parámetro en la URL como `?profile=sindicato` o `?edition=sindicato` es descartado.
- **Interfaz Limpia:**
  - El selector de perfil de operación en la cabecera se oculta (`allowEditionSwitch={false}`).
  - Las pestañas de "Padrón de Socios", "Mensualidades & Cuotas", "Trabajadores & Pagos" y "Gastos del Sindicato" quedan excluidas de la vista.
  - El banner contextual refleja: *"Perfil Estándar Activo: Gestión simplificada de encomiendas de mostrador, manifiestos y entregas."*
- **Aislamiento de Almacenamiento:** El controlador opera con `storageScope: 'demo'`, utilizando la clave `pachax:parcel-demo:standard:[mode]:v1`, garantizando que ninguna acción pública afecte el entorno de pruebas de Studio.

### 3.2. PACHAX Encomiendas — Edición Sindicato (Privada / Studio)
- **Ubicación:** Accesible exclusivamente desde PACHAX Studio (`studio.html` / `StudioHome.tsx`).
- **Seguridad en Producción:** Bloqueo fail-closed mediante `useAdminAuth()`. Si un usuario no autenticado como Platform Operator intenta cargar la edición sindical en producción, la aplicación muestra una pantalla de bloqueo con requerimiento de sesión administrativa.
- **Operación Completa:** Padrón de afiliados, cuotas multianuales, aportes con medios auditables, anticipos/sueldos de choferes, gastos y balance consolidado.
- **Conmutador Habilitado:** Dentro de Studio, el operador dispone del selector visual para alternar en tiempo real entre Encomiendas Estándar y Edición Sindicato.

---

## 4. Conexión con PACHAX Core sin Duplicaciones

### 4.1. Integración con `BusinessIdentity`
En lugar de mantener tipos propietarios aislados, se conectaron los generadores de comprobantes de `parcelDocuments.ts` con la interfaz canónica `BusinessIdentity` y `BusinessDocumentContext` de `src/core/businessIdentity.ts`.

Se introdujo el adaptador `toDocumentCompanyContext(source)`:
- Acepta objetos de tipo `BusinessIdentity`, `BusinessDocumentContext` o `DocumentCompanyContext`.
- Mapea `tradeName`, `legalName`, `taxId` (NIT), `phone`/`whatsapp`, `address`, `city` y `logoUrl`.
- Garantiza que la emisión de Guías de Recepción (A4 y 80mm), Manifiestos de Despacho, Constancias de Entrega con Firma, Recibos de Cuotas e Informes de Carga consuman los datos corporativos del tenant sin duplicación.

### 4.2. Preparación del `BusinessType` Canónico
Actualmente, las encomiendas utilizan provisionalmente `'route_distribution'` para compatibilidad con las Cloud Functions de aprovisionamiento existentes. Para la transición limpia hacia el tipo canónico definitivo:
- Se documenta el identificador canónico: `'parcel_delivery'`.
- Se deja estructurado el registro de capacidades (`orders`, `cash`, `dispatch`, `routes`) y roles (`owner`, `admin`, `cashier`, `driver`, `inventory`, `accountant`) de modo que Codex pueda registrar `'parcel_delivery'` en el backend cuando se incorpore a Planes Core, sin romper los tests de aprovisionamiento actuales.

---

## 5. Preparación Comercial y Límite con Codex

En estricta observancia de los límites de trabajo, no se modificaron los contratos comerciales de planes ni los esquemas de facturación que Codex está desarrollando.

Se preparó la definición editorial oficial en `src/public/config/parcelEditorialShowcase.ts`:
- **Exportación:** `PARCEL_EDITORIAL_SHOWCASE_ITEM`.
- **Contenido:** Presentación de valor, subtítulo, descripción técnica, 6 viñetas clave, 6 características detalladas, enlaces a demostración `/demo/parcel?data=full`, insignia *"Nuevo"*, acento verde azulado (`#14B8A6`) e icono de logística (`truck`).
- **Interfaz para Codex:**
  ```typescript
  // Interfaz de integración comercial recomendada para PACHAX Planes:
  export interface ParcelCommercialCorePlanExtension {
    templateId: 'parcel'
    businessType: 'parcel_delivery' // o 'route_distribution' provisional
    planTiers: ('starter' | 'professional' | 'enterprise')[]
    entitlements: {
      maxBranches: number
      allowDigitalSignature: boolean
      allowCashShiftReconciliation: boolean
      allowSyndicateModule: boolean // true solo para contratos sindicato específicos
    }
  }
  ```

---

## 6. Contrato de Plantillas en Admin Control Center

Se deja preparado el modelo de control administrativo para que el Platform Admin gestione la plantilla de Encomiendas:

| Campo Administrativo | Tipo | Comportamiento |
| :--- | :--- | :--- |
| `isTemplateEnabled` | `boolean` | Habilita o suspende la plantilla a nivel de plataforma. |
| `isPublicVisible` | `boolean` | Controla si la tarjeta editorial aparece en el catálogo público y carrusel. |
| `isDemoActive` | `boolean` | Permite abrir o pausar el acceso a `/demo/parcel`. Si está inactivo, muestra aviso de mantenimiento. |
| `editorialOverride` | `Partial<CommercialTemplateItem>` | Permite a Marketing ajustar títulos y viñetas sin despliegues de código. |

---

## 7. Matriz de Pruebas y Verificación

Se ejecutó la suite completa de pruebas unitarias, de integración, tipado y construcción:

| Suite / Verificación | Comando | Resultado | Notas |
| :--- | :--- | :---: | :--- |
| **Pruebas de Rutas Demo** | `npm run test:free-demo-routes` | ✅ PASS | Verifica `/demo/parcel` en modo full y empty, y aislamiento de aprovisionamiento. |
| **Aislamiento Studio y Encomiendas** | `node --test tests/parcelStudioIsolation.test.ts` | ✅ PASS (8/8) | Comprueba 6 plantillas públicas, bloqueo de sindicato en público, fail-closed auth en producción y aislamiento de scopes `demo` vs `studio`. |
| **Dominio y Operaciones Encomiendas** | `node --test tests/parcelDomain.test.ts` | ✅ PASS (22/22) | Comprueba tarifas dinámicas, conciliación de caja cerrada, entregas a terceros, anulación vs reversión, transferencias, periodos multianuales e integración `BusinessIdentity`. |
| **Preparación Studio y Nightclub** | `node --test tests/adminStudioReadiness.test.ts` | ✅ PASS (5/5) | Comprueba resolución de roles en registro canónico y 6 plantillas públicas. |
| **Catálogo Público Editorial** | `node --test tests/publicTemplateCatalog.test.ts` | ✅ PASS (3/3) | Verifica que el fallback editorial utilice plantillas aprobadas sin planes draft. |
| **Verificación TypeScript** | `npm run typecheck` (`tsc -b`) | ✅ PASS (0 errores) | Cero errores de tipos en todo el proyecto. |
| **Linter ESLint** | `npx eslint [archivos tocados]` | ✅ PASS (0 errores) | Cero errores o advertencias en los módulos modificados. |
| **Compilación de Producción** | `npm run build` | ✅ PASS (0 errores) | Construcción exitosa de `index.html`, `studio.html`, `demo.html`, `preview.html`, assets y `demo-isolated.html`. |

---

## 8. Verificación Visual Local

Para revisar interactivamente esta implementación:
1. Iniciar el servidor local:
   ```powershell
   npm run dev
   ```
2. **Probar PACHAX Studio:**
   - Abrir `http://localhost:5190/studio`.
   - Seleccionar **Restaurante de Servicio Rápido (Hamburger)**: verificar carga completa del POS de mostrador, cocina KDS, cambio de rol simulado, personalización de colores y viewport switcher móvil/tablet.
   - Seleccionar **Comercio / Venta Rápida (Retail)**: verificar panel de inicio, ventas por peso (gramos) y unidades, cobros en efectivo/QR y módulos según rol.
   - Seleccionar **PACHAX Encomiendas**: verificar conmutación fluida entre Encomiendas Estándar y Edición Sindicato.
3. **Probar Demo Pública de Encomiendas:**
   - Abrir `http://localhost:5190/demo/parcel`.
   - Comprobar que carga directamente en modo Estándar sin pedir login.
   - Intentar ingresar a `http://localhost:5190/demo/parcel?profile=sindicato`: confirmar que se mantiene en Estándar y no muestra módulos sindicales.
   - Probar alternancia de datos (Completo vs Desde cero) y reinicio local.
