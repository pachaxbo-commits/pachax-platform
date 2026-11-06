# Centro de tutoriales de Comercio

## Límites del runtime y auditoría funcional

- La demo pública de Comercio se sirve desde `demo-isolated.html`. Su entrypoint `src/demo-isolated/DemoOnlyApp.tsx` monta `src/demo/quick-retail/QuickRetailDemo.tsx` en rutas `/demo/retail`; el HTML aislado conserva `connect-src 'none'`, `frame-ancestors 'self'` y `X-Frame-Options: SAMEORIGIN`.
- El POS de demostración usa `QuickRetailPOS.tsx`, datos locales de `src/demo/mocks/retailMock.ts` y `src/demo/datasets/retail/retailDatasets.ts`, y las funciones puras de cálculo/validación en `src/core/sales.ts`. No importa Firebase, repositorios tenant ni gateways.
- El dataset completo contiene artículos por unidad y por peso (incluye Café Latte y Helado artesanal), más ventas iniciales. El dataset vacío expone catálogo y ventas vacíos. El selector de datos reinicia el montaje de la demo; el reinicio aislado elimina el registro local de operaciones y remonta la aplicación.
- Venta por unidad agrega una línea e incrementa cantidades. La fase añade controles explícitos de aumentar/disminuir cantidad; los subtotales se recalculan con el motor de ventas existente.
- Venta por peso abre una entrada numérica de gramos, usa el precio publicado por kilogramo del artículo de demostración y calcula el subtotal en el cliente. No se conecta ni se anuncia una balanza física.
- El cobro admite efectivo, QR y mixto, valida que los importes coincidan y crea una venta en memoria de la demo. No crea transacciones bancarias, ventas productivas, movimientos de caja ni cambios de inventario.
- La demo mostraba antes solo una confirmación temporal con folio. Ahora presenta un resumen local del comprobante con folio, líneas, total y medio de pago. No implementa impresión ni exportación; el resumen desaparece al iniciar otra venta y la venta simulada permanece en la lista local de Ventas hasta reiniciar el runtime.

## Reutilización y aislamiento

- `RestaurantLearningCenter` y `restaurantLearningCenter` aportan referencias de catálogo de recorridos, estados de progreso y acciones. No se importan porque dependen de dominio y permisos de Restaurante.
- Distribución y Nightclub muestran patrones útiles de tutorial contextual, resaltado, pasos y objetivos semánticos; sus centros conservan estado y dependencias de sus propias plantillas. No se reutilizan directamente en el bundle Retail.
- `QuickRetailTutorialCenter` y `quickRetailTutorials` son propios de la demo aislada. El progreso responde a eventos tipados emitidos por controles reales. Los controles usan `data-tutorial-target` semánticos; avanzar por texto o mostrar una instrucción no completa un paso. Los pasos pueden quedar completados, omitidos o pendientes.
- Al cambiar de recorrido se limpian búsqueda y categoría, pero se conserva el carrito. Con dataset vacío solo está disponible el recorrido de orientación. Si el rol simulado no puede usar el POS, el centro lo explica y permite cambiar el rol desde el control existente.
- `GuidedTutorialsSection.tsx` abre el centro mediante el botón de la misma demo en el iframe same-origin. La demo independiente presenta el mismo botón. Las otras plantillas mantienen sus activadores y centros.

## Validación

El script `scripts/test-demo-app-integration-browser.mjs` valida las demos aisladas en 320, 360, 375, 390, 430, 768, 1024, 1440 y 1920 px; comprueba catálogo completo/vacío, cambio de rol, reinicio, venta por unidad, gramos manuales, cálculo por peso, cobro local, folio, retorno al POS, acceso desde la landing, headers/CSP y solicitudes de red. Las capturas de estado se guardan en `docs/retail-learning-center-evidence/`.

## Resultado final de QA

- `npm run typecheck`, `npm run build:demos-only`, `npm run build:emulator`, `npm run test:demos-only:guard`, `npm run test:free-demo-routes`, `npm run test:preview-firebase-isolation`, `node scripts/test-demo-app-integration.mjs`, `node scripts/test-demo-app-integration-browser.mjs`, `npm run test:landing-browser`, ESLint focal y `git diff --check` pasaron.
- El navegador comprobó ambas rutas de demo (completa y vacía) en 9 anchos: 320, 360, 375, 390, 430, 768, 1024, 1440 y 1920 px; sin overflow horizontal.
- Los recorridos ejecutados incluyeron añadir/incrementar artículo por unidad, introducir gramos manualmente, calcular y añadir venta por peso, cobrar localmente con QR, revisar comprobante y comenzar otra venta. Se probaron también estados vacío y rol sin acceso a POS.
- El runtime aislado no realizó solicitudes externas ni errores de navegador; el guard reportó 0 referencias prohibidas y 0 sourcemaps. Solicitudes a Firebase Production: 0. CSP continúa con `connect-src 'none'`.
- El test de landing se ejecutó en las 9 resoluciones, incluyendo abrir el Centro dentro del iframe para Comercio. El CTA espera a que el control se habilite cuando la demo termina de montar.
- Las tres conexiones rechazadas en la consola de la landing corresponden a endpoints locales de emulador apagados; no hubo solicitudes a Production.

Las capturas de PC, celular, recorridos, entrada de peso, cobro, comprobante y apertura desde la landing están en `docs/retail-learning-center-evidence/`. No se desplegó Vercel Preview porque la validación se completó con build y ejecución local aislada, y no se verificó el acceso SSO y su política de red antes de servir el runtime en Preview. No se modificó Production.