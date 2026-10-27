# PACHAX PLATFORM — INFORME DE CERTIFICACIÓN G5.2
## Corrección de Integración Real de IndexedDB, Aislamiento de Pestañas y Certificación de PR #1

**Fecha de ejecución:** 27 de octubre de 2026  
**Repositorio:** `pachaxbo-commits/pachax-platform`  
**Rama:** `integration/gemini-selective-post-dario`  
**Pull Request:** [GitHub PR #1](https://github.com/pachaxbo-commits/pachax-platform/pull/1)  
**Base:** `origin/main` en `775867bb633f98420dd70fb74ce4d57f77eb9e8d`

---

## 1. SHA Inicial y Final

| Estado | Hash SHA | Mensaje / Descripción |
| :--- | :--- | :--- |
| **SHA Inicial (G5.1)** | `bff353d998237d7269e506ec47e8a12a5a01e158` | `docs: add G5.1 final integration certification and QA deliverable` |
| **Commit G5.2 (1/4)** | `3f17021` | `fix(media): implement duplicate-tab detection, per-key write queues and IDB transaction confirmation` |
| **Commit G5.2 (2/4)** | `a671ef5` | `feat(restaurant): unify imageScopeKey across demo lifecycle, sanitize sessionStorage and await IDB persistence` |
| **Commit G5.2 (3/4)** | `e580a95` | `test(restaurant): add unit tests for Base64 sanitization, tab duplication and IDB write queues` |
| **Commit G5.2 (4/4)** | *(HEAD Final)* | `docs: add G5.2 final IndexedDB real integration and image isolation certification` |

---

## 2. Unificación Coherente del Ámbito (Scope Key)

Se eliminó por completo el uso inconsistente de claves planas (`storageKey`). Todas las operaciones del ciclo de vida de la fotografía en `RestaurantDemo.tsx` y `demoProductImageStorage.ts` emplean exactamente el mismo formato canónico de 4 niveles:

$$\text{Clave Compuesta} = \text{plantilla} : \text{datasetMode} : \text{sessionId} : \text{productId}$$

Ejemplo real registrado en la prueba E2E:
`hamburger:full:tab_do5l8sp_mvq6h4dl:prod-test-1793074860329`

### Matriz de Operaciones Unificadas en `RestaurantDemo.tsx`
- **Carga y Rehidratación (`load`):** `loadDemoProductImages(imageScopeKey)` en `useEffect([imageScopeKey])`. Si cambia el modo (Full $\leftrightarrow$ Empty) o la plantilla, se limpian las referencias en memoria y se cargan exclusivamente las imágenes del nuevo ámbito.
- **Guardado (`save`):** `saveDemoProductImage(imageScopeKey, prod.id, prod.image)` en `handleSaveProducts(nextCatalog)`. Awaita la transacción antes de confirmar el guardado.
- **Eliminación (`delete`):** `deleteDemoProductImage(imageScopeKey, prod.id)` al remover una foto de un producto o al eliminar/retirar un producto del catálogo (prevención de huérfanos).
- **Purga de Reinicio (`clear`):** `clearDemoProductImages(imageScopeKey)` en `onResetDemo` y en `DemoOnlyApp.resetDemo`. Espera a que finalicen escrituras en curso (`waitForPendingImageWrites`) y confirma el borrado en disco antes de recargar.

---

## 3. Persistencia Real de Fotografías tras Refresh (F5)

Se comprobó la persistencia mediante pruebas en navegador real (Google Chrome Headless via CDP sobre WebSocket):
1. **Creación inicial:** Se registró un producto con fotografía en modo Full.
2. **Confirmación en IndexedDB:** Registro localizado bajo `hamburger:full:tab_do5l8sp_mvq6h4dl:prod-test-1793074860329` con `dataUrl` íntegro.
3. **Recarga F5:** La página se recargó completamente (`Page.reload`). El hook de restauración consultó IndexedDB y rehidrató el estado reactivo (`hasRestoredImage: true`, `imageMatches: true`).
4. **Edición:** Se sustituyó la fotografía por un nuevo payload Base64; tras una segunda recarga F5 se verificó que la nueva foto se renderizó correctamente (`imageMatchesUpdated: true`).
5. **Eliminación:** Se eliminó la fotografía; tras una tercera recarga F5 se confirmó que la foto eliminada no reapareció (`hasDeletedPhoto: false`).

---

## 4. Evidencia de Cero Duplicación de Base64 en `sessionStorage`

Para evitar la saturación de cuota de `sessionStorage` (límite estándar de 5 MB por origen), se diseñó la función pura `sanitizeProductsForStorage()`:

```typescript
export function sanitizeProductsForStorage<T extends { image?: string }>(products: T[]): T[] {
  return products.map((product) => {
    if (product.image && product.image.startsWith('data:')) {
      return { ...product, image: '' }
    }
    return product
  })
}
```

### Aplicación en todos los caminos de persistencia:
- `loadInitialState`: Sanatiza el catálogo antes de escribir `products` e `inventory-store:v1`.
- `updateProducts`: Sanatiza `next` antes de escribir en `products` e `inventory-store:v1`.
- `saveInventory`: Sanatiza `nextProducts` antes de escribir en `products` e `inventory-store:v1`.

### Evidencia de Inspección en Caliente (Chrome CDP):
```json
{
  "productsHasBase64": false,
  "inventoryHasBase64": false,
  "totalLength": 10930
}
```
Las cadenas Base64 residen **única y exclusivamente en IndexedDB**. En memoria React, el componente mantiene el `dataUrl` activo para renderizado inmediato.

---

## 5. Aislamiento Full/Empty, Pestañas Independientes y Pestañas Duplicadas

### A. Aislamiento Full vs. Empty
- Ámbito Full: `hamburger:full:tab_do5l8sp_mvq6h4dl`
- Ámbito Empty: `hamburger:empty:tab_do5l8sp_mvq6h4dl`
- Una fotografía guardada en Full devuelve `null` al consultarse desde Empty y viceversa (`scopesDifferent: true`, `inEmptyIsNull: true`).

### B. Aislamiento de Pestañas Duplicadas (Duplicate Tab)
Los navegadores modernos clonan el contenido de `sessionStorage` al duplicar una pestaña ("Duplicate Tab"), lo cual podía provocar que dos pestañas compartieran accidentalmente el mismo `sessionId`.

Para resolver esto sin recurrir a hacks frágiles, se diseñó la sincronización `window.name` + `sessionStorage` en `getDemoSessionId()`:
1. En recarga F5 dentro de la misma pestaña: `window.name` (`pachax_tab_<sid>`) persiste y coincide exactamente con `sessionStorage.getItem('pachax:demo:tab_session_id')`. Se conserva el mismo `sessionId`.
2. En pestaña duplicada: El navegador copia `sessionStorage`, pero inicializa `window.name` vacío (`""`).
3. Al detectar que `window.name !== 'pachax_tab_' + storedSid`, el sistema reconoce inmediatamente que se trata de una pestaña clonada o duplicada.
4. Genera de forma instantánea un nuevo `sessionId` (`tab_ujfvh8f_mvq6h80a` vs `tab_do5l8sp_mvq6h4dl`), actualizando `window.name` y su `sessionStorage` local.

**Resultado:** Aislamiento 100% garantizado en pestañas duplicadas (`isDifferent: true`, `newWinNameCoincides: true`).

---

## 6. Cola de Concurrencia Transaccional y Manejo de Errores

### A. Cola de Escrituras por Clave (`enqueueKeyOperation`)
Se reemplazó el registro pasivo de promesas en un `Map` por una cola serializada real por `recordKey`:

```typescript
const keyQueues = new Map<string, Promise<void>>()

function enqueueKeyOperation(recordKey: string, op: () => Promise<void>): Promise<void> {
  const previous = keyQueues.get(recordKey) || Promise.resolve()
  const next = previous.catch(() => {}).then(op)
  keyQueues.set(recordKey, next)
  next.finally(() => {
    if (keyQueues.get(recordKey) === next) keyQueues.delete(recordKey)
  })
  return next
}
```
Operaciones consecutivas sobre el mismo producto esperan el commit de la anterior, garantizando orden determinista y evitando carreras con `clearDemoProductImages`.

### B. Confirmación Transaccional (`tx.oncomplete`)
Las transacciones de IndexedDB se consideran terminadas exclusivamente cuando dispara el evento `tx.oncomplete`, no al responder `getAll()` o `put()`.

### C. Detección de Driver y Fallback de Memoria
- Si el navegador se encuentra en modo incógnito estricto o IndexedDB no está disponible, `getDemoImageStorageDriver()` reporta `'memory'`.
- El adaptador `createDemoProductImageAdapter()` inyecta el aviso al usuario:
  `"Almacenamiento en memoria temporal (IndexedDB no disponible en este entorno: no persistirá tras recargar)."`

---

## 7. Pruebas de Regresión y Puertas de Calidad

| Prueba / Verificación | Comando Ejecutado | Resultado | Detalle |
| :--- | :--- | :---: | :--- |
| **TypeScript estricto** | `npm run typecheck` (`tsc -b`) | **PASS** | 0 errores. Tipado estricto sin suppressions globales. |
| **Pruebas Restaurante** | `npm run test:restaurant` | **PASS** | **117/117** pruebas aprobadas (100% verde). |
| **Pruebas Distribución** | `node --test tests/distributionTutorials.test.ts` | **PASS** | **18/18** pruebas aprobadas (9 perfiles industriales). |
| **Guardia Demo Aislada** | `npm run test:demos-only:guard` | **PASS** | Cero dependencias a `firebase/firestore`. |
| **Rutas Demo Gratuitas** | `npm run test:free-demo-routes` | **PASS** | Acceso sin aprovisionamiento comercial. |
| **Build Demo Aislada** | `npm run build:demos-only` | **PASS** | 92 artefactos limpios generados en `dist-demo-isolated`. |
| **Build General PACHAX**| `npm run build` | **PASS** | Compilación de 2.316 módulos sin fallos. |
| **Linter ESLint** | `npx eslint ...` | **PASS** | 0 errores, 0 advertencias en código modificado. |
| **Chequeo Git Diff** | `git diff --check` | **PASS** | 0 espacios residuales o marcadores de conflicto. |
| **E2E Browser Chrome** | `node scratch/verifyG52Browser.mjs` | **PASS** | 12 pasos completados; 0 overflow horizontal. |
| **Auditoría de Red** | Interceptor CDP en 586 llamadas | **PASS** | **0 llamadas externas hacia Firebase Producción**. |

---

## 8. Estado de la Pull Request #1 y Commits

- **PR #1 en GitHub:** `https://github.com/pachaxbo-commits/pachax-platform/pull/1`
- **Rama:** `integration/gemini-selective-post-dario`
- **Modo de publicación:** Git push estándar (sin `--force`, sin rebase destructivo).

```
* e580a95 - test(restaurant): add unit tests for Base64 sanitization, tab duplication and IDB write queues
* a671ef5 - feat(restaurant): unify imageScopeKey across demo lifecycle, sanitize sessionStorage and await IDB persistence
* 3f17021 - fix(media): implement duplicate-tab detection, per-key write queues and IDB transaction confirmation
* bff353d - docs: add G5.1 final integration certification and QA deliverable
* ae35ac4 - docs: add G5.1 browser E2E verification metrics and multi-scenario screenshots
* 7c1e086 - feat(media): implement scoped demo image isolation, async write confirmation and real tenant decoupling
* eebe143 - fix(types): replace ts-nocheck with targeted expect-error on node runner imports and normalize path
* a7839d8 - docs: add comprehensive G5 selective integration audit report and evidence
* 00d6f0e - test(restaurant): add eslint-disable comments for test runner types
* 20417dc - chore: update demo-isolated artifact manifest after build verification
* 0190816 - feat(landing): improve keyboard navigation and distribution tour deep-link; fix(restaurant): clean settings syntax
* e34db46 - feat(distribution): port G2.4 universal tours, multi-sector fixtures and resolve ESLint errors
* 282c644 - feat(restaurant): complement learning center with missing salon journeys and stable tour selectors
* 8379634 - feat(fastfood): port local product images and navigation improvements
```

---

## 9. Estado de Vercel y CI

- La PR #1 está abierta contra la rama `main` en `pachaxbo-commits/pachax-platform`.
- El despliegue de Vercel Preview para PRs protegidas utiliza el flujo estándar de miembros.
- No se introdujeron archivos comerciales de Codex (`commercialConfigStore.ts`, pasarelas de pago, billing).

---

## 10. Dictamen Técnico (GO / NO-GO)

> [!IMPORTANT]
> ### DICTAMEN TÉCNICO: GO COMPLETO
> La arquitectura de almacenamiento local en IndexedDB está 100% conectada en todas las operaciones (`load`, `save`, `delete`, `clear`). La persistencia reactiva tras F5 fue probada y comprobada en Google Chrome real. Se eliminó la duplicación de Base64 en `sessionStorage` y se garantizó aislamiento absoluto contra colisiones por duplicación de pestañas.
> 
> ### POLÍTICA DE FUSIÓN: NO-GO AUTOMÁTICO
> De acuerdo con las instrucciones de la plataforma, el agente **NO** ejecutará merge a `main` ni despliegue a producción. La PR #1 queda lista en GitHub para la inspección y aprobación final manual por parte de Darío.
