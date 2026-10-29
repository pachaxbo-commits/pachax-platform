# INFORME DE ESTABILIZACIÓN: PACHAX STUDIO + ENCOMIENDAS INTERNA

**Autor:** Gemini / Antigravity  
**Fecha:** 29 de octubre de 2026  
**Rama de trabajo:** `gemini/studio-parcel-public-preparation`  
**Base origin/main:** `8907780` (post PR #9 y PR #10)  
**Pull Request:** #11 (Draft)  
**Estado:** ✅ Verificado, compilación limpia, 0 errores de TypeScript y suite de pruebas superada al 100%.

---

## 1. Resumen Ejecutivo y Ajuste Focal de Alcance

En estricto cumplimiento de las instrucciones de la dirección de PACHAX Platform:
- **Prioridad 1 Cumplida:** Se resolvió de raíz la estabilidad operativa de **Restaurante Rápido (Hamburger)** y **Comercio Rápido (Retail)** dentro de PACHAX Studio.
- **Decisión sobre Encomiendas:** La plantilla **PACHAX Encomiendas** permanece como **plantilla interna exclusiva de PACHAX Studio** para revisión y validación de ambas ediciones (Estándar y Sindicato) desde Admin.
- **Cero Fuga Pública:** Se retiraron todas las publicaciones en `PUBLIC_TEMPLATES`, `FREE_DEMO_TEMPLATE_IDS`, `DemoGallery` y rutas públicas `/demo/parcel` y `/demo/encomiendas`.
- **Tarjeta Unificada en Studio:** Se corrigió la duplicación en `StudioHome.tsx`. Queda una **única tarjeta interna** con selector dinámico interactivo entre **Perfil Estándar** y **Edición Sindicato**.
- **Independencia de BusinessType:** No se reutiliza `route_distribution` ni se habilita aprovisionamiento para Encomiendas; la integración de BusinessType, capacidades y planes queda reservada para la coordinación formal con Codex.
- **Límite con Codex y Billing Core:** Cero modificaciones en Billing Core, planes comerciales, cotizaciones o archivos compartidos. Se preservan intactos los cambios del PR #10 de Codex.

---

## 2. Diagnóstico y Corrección de PACHAX Studio

### 2.1. Causa Raíz Identificada

El propietario reportó que Restaurante Rápido (Hamburger) y Comercio Rápido (Retail) no funcionaban correctamente dentro de Studio. La auditoría exhaustiva reveló una triple discrepancia:

1. **Bloqueo de Seguridad en Producción Vercel (`vercel.json`):**  
   Las rutas `/demo/hamburger` y `/demo/retail` tenían configurados encabezados estrictos de seguridad:  
   `X-Frame-Options: DENY` y `Content-Security-Policy: frame-ancestors 'none'`.  
   Al intentar incrustar esas URLs en un `<iframe>` dentro de `studio.html`, el navegador bloqueaba la carga por política de seguridad.
2. **Conflicto de Routing en Desarrollo (`vite.config.ts`):**  
   El middleware de desarrollo capturaba cualquier ruta `/demo/hamburger*` o `/demo/retail*` y la reescribía incondicionalmente hacia `demo-isolated.html`, ignorando el parámetro `?embed=studio` y montando `DemoOnlyApp.tsx` (que carecía de postMessage listeners `PACHAX_STUDIO_SYNC` y branding).
3. **Incompatibilidad de Layout y Refs en Comercio Rápido:**  
   `QuickRetailDemo.tsx` y `QuickRetailDashboard.tsx` no contaban con soporte de padding responsivo para los contenedores embebidos de Studio y realizaban lecturas de refs durante la fase de render.

### 2.2. Solución Canónica Implementada

1. **Ruta Canónica de Incrustación en `StudioShell.tsx`:**  
   Se unificó la URL del iframe para las plantillas que requieren iframe:  
   `const iframeSrc = '/demo?template=' + templateId + '&embed=studio'`  
   - En **Vercel**, el path base `/demo` reescribe a `demo.html` sin activar las cabeceras `DENY` asociadas exclusivamente a endpoints directos.
   - En **Vite DEV**, el middleware permite el paso de cualquier consulta con `embed=studio` hacia `demo.html`.
2. **Sincronización Bidireccional (`DemoRuntime.tsx`):**  
   Monta en modo Studio las experiencias canónicas, escucha `PACHAX_STUDIO_SYNC` y aplica marca, roles simulados y reseteos sin recargas de página.
3. **Adaptación de `QuickRetailDemo.tsx` y `QuickRetailDashboard.tsx`:**  
   Soporte de `companyName`, `isStudioEmbed`, padding responsivo y reseteo por clave de remontaje (`key={'retail:${datasetMode}:${resetKey}'}`), eliminando lecturas de refs en render y estabilizando el cambio de roles.
4. **Cero Mutaciones de Motores:**  
   Los motores de cálculo y lógica operativa (`restaurantEngine`, `restaurantOperations`, `retailRepository`) se mantuvieron 100% intactos.

---

## 3. Apertura Segura de Encomiendas en Studio (Sin PUBLIC_TEMPLATES)

Para evitar que `StudioShell` falle con `Plantilla pública no reconocida` al retirar Encomiendas de `PUBLIC_TEMPLATES`:

1. **Resolución Segura en `StudioShell.tsx`:**
   ```tsx
   const isParcel = templateId === 'parcel'
   const templateTitle = isParcel
     ? 'PACHAX Encomiendas'
     : getPublicTemplate(templateId).title
   const templateRoles = isParcel
     ? [
         { id: 'operator', name: 'Operador de Agencia' },
         { id: 'driver', name: 'Conductor' },
         { id: 'admin', name: 'Administrador / Directiva' },
       ]
     : getTemplate(getPublicTemplate(templateId).businessType).roles
   ```
2. **Montaje Directo de `ParcelDemo` en Studio:**
   Cuando `isParcel` es verdadero, `StudioShell` renderiza directamente `ParcelDemo` en el contenedor responsive:
   ```tsx
   {isParcel ? (
     <div className="w-full h-full overflow-auto bg-slate-100">
       <ParcelDemo
         key={`parcel:${datasetMode}:${datasetResetKey}`}
         datasetMode={datasetMode}
         resetKey={datasetResetKey}
         isStudioEmbed={true}
         companyName={branding.companyName || defaultCompany}
         logoUrl={branding.logoUrl}
       />
     </div>
   ) : (
     <iframe
       ref={iframeRef}
       src={iframeSrc}
       title={`PACHAX Studio Preview - ${templateTitle}`}
       className="w-full h-full border-0 bg-white"
     />
   )}
   ```
3. **Selector Dinámico Estándar / Sindicato:**
   Al ejecutarse con `isStudioEmbed={true}`, `ParcelDemo` habilita el selector de ediciones en la cabecera (`allowEditionSwitch={true}`):
   - El operador puede alternar entre el **Perfil Estándar** (mostrador, guías, manifiestos, entregas, arqueo) y la **Edición Sindicato** (padrón de socios, cuotas, personal, egresos gremiales, balance).
   - En producción, la Edición Sindicato valida `useAdminAuth` (guardia fail-closed).
   - El almacenamiento local usa el scope privado `pachax:parcel-studio`.

---

## 4. Tarjeta Unificada en `StudioHome.tsx`

Se eliminó la duplicación en `StudioHome.tsx`. `PUBLIC_TEMPLATES` solo contiene las 5 plantillas oficiales (`restaurant`, `hamburger`, `distribution`, `retail`, `nightclub`).

Para Encomiendas existe una **única tarjeta interna**:
```tsx
const internalTemplatesList = [
  {
    id: 'parcel' as DemoTemplateId,
    title: 'PACHAX Encomiendas',
    description: 'Recepción rápida, guías con QR, manifiestos de despacho, entrega con firma y administración gremial. Incluye selector interactivo entre Perfil Estándar y Edición Sindicato.',
    isInternal: true,
    ...presentation.parcel,
    badges: ['Estándar / Sindicato', 'Guías & Manifiestos', 'Socios & Cuotas', 'Arqueo Caja'],
    internalNote: 'Validación interna para sindicatos de transporte y agencias de encomiendas.',
  },
]
```

---

## 5. Preparación Editorial para Codex (Documentada para Fase Futura)

Para cuando la dirección autorice el lanzamiento comercial y se coordine con Codex, se deja documentada la especificación editorial:

```typescript
export interface ParcelEditorialShowcaseItem {
  id: 'parcel'
  templateId: 'parcel'
  canonicalTemplateId: null
  commercialName: 'PACHAX Encomiendas'
  cardSubtitle: 'Transporte de encomiendas, guías con QR, manifiestos y entrega con firma'
  thumbnailUrl: '/brand/showcase/distribution-concept.webp'
  thumbnailAlt: 'Operación ágil de recepción y despacho de encomiendas en agencia de transporte'
  thumbnailFocalPoint: '50% 50%'
  accent: '#14B8A6'
  description: 'Recepción ágil en mostrador, cálculo automático por peso y destino, guías con QR, manifiestos de ruta, cobro en destino (COD) y constancia de entrega con firma digital.'
  detailDescription: 'Gestiona la paquetería de tus rutas y agencias: recepción en balanza, rotulado con código QR, manifiestos de despacho para conductores, cobro contra entrega y verificación de identidad con firma digital en pantalla.'
  targetAudience: 'Empresas de transporte interdepartamental, agencias de encomiendas, couriers y operadores logísticos de paquetería.'
  problemSolved: 'Elimina extravíos de paquetes, agiliza la atención en mostrador con guías impresas instantáneas y garantiza trazabilidad total desde la recepción hasta la firma de entrega.'
  bullets: [
    'Guías con QR & Ticket',
    'Manifiestos de despacho',
    'Cobro contraentrega (COD)',
    'Firma digital en entrega',
    'Arqueo de turnos',
    'Reportes operativos',
  ]
  features: [
    'Recepción ágil con tarifación automática por peso base y kilos adicionales',
    'Generación inmediata de comprobantes y guías con código QR de rastreo',
    'Confección de manifiestos de despacho agrupados por ruta, conductor y placa',
    'Gestión de cobro en origen o cobro en destino (Cash on Delivery / COD)',
    'Entrega segura con captura de firma digital y registro de documento de identidad',
    'Arqueo de caja por turno y reportes detallados de carga por fecha y agencia',
  ]
  demoRoute: '/demo/parcel?data=full'
  demoPath: '/demo/parcel'
  demoEnabled: true
  detailAnchor: '#plantilla-encomiendas'
  badge: 'Nuevo'
  status: 'published'
  order: 5
  primaryActionLabel: 'Ver demostración interactiva'
  iconType: 'truck'
}
```

---

## 6. Conexión con PACHAX Core (BusinessIdentity)

- **Normalizador `toDocumentCompanyContext`:** En `src/modules/parcel/domain/parcelDocuments.ts`, conecta cualquier objeto que implemente `BusinessIdentity` o `BusinessDocumentContext` con las guías oficiales A4, tickets térmicos de 80mm, manifiestos de despacho y comprobantes con firma digital.
- **Sin ligar a `route_distribution`:** Se mantiene el dominio desacoplado de identidades comerciales provisionales.

---

## 7. Matriz de Pruebas y Verificación

| Suite / Verificación | Pruebas | Resultado |
| :--- | :---: | :---: |
| `tests/freeDemoRoutes.test.ts` | 2 | ✅ PASS |
| `tests/adminStudioReadiness.test.ts` | 5 | ✅ PASS |
| `tests/publicTemplateCatalog.test.ts` | 3 | ✅ PASS |
| `tests/parcelDomain.test.ts` | 22 | ✅ PASS |
| `tests/parcelStudioIsolation.test.ts` | 9 | ✅ PASS |
| **Total Pruebas Automatizadas** | **41** | **✅ 100% PASS** |
| `npm run typecheck` (`tsc -b`) | — | ✅ 0 errores |
| `npx eslint` en archivos modificados | — | ✅ 0 errores |
| `npm run build` (build + demos aislados) | — | ✅ Exitoso |
