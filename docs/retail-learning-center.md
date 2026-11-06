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
- Cuando un recorrido está activo, el Centro permanece en el flujo del documento y no se adhiere sobre el catálogo. Así el desplazamiento de enfoque no cubre los controles de venta; los cuadros de peso y cobro conservan prioridad visual y su entrada sigue accesible.
- Al cambiar o reiniciar un recorrido se limpian búsqueda y categoría, pero se conserva el carrito. Con dataset vacío solo está disponible el recorrido de orientación; su paso de selección de producto se puede omitir y los pasos restantes se completan. Si el rol simulado no puede usar el POS, el centro lo explica y permite cambiar el rol desde el control existente.
- Cobro demostrativo inicia con un paso real para agregar un producto de unidad antes de revisar el carrito. No inserta artículos automáticamente; al completar el paso, el POS habilita “Cobrar Venta”. Quien ya tenga un artículo puede omitir la preparación.
- `GuidedTutorialsSection.tsx` abre el centro mediante el botón de la misma demo en el iframe same-origin. La demo independiente presenta el mismo botón. Las otras plantillas mantienen sus activadores y centros.

## Validación

El script `scripts/test-demo-app-integration-browser.mjs` valida las demos aisladas en 320, 360, 375, 390, 430, 768, 1024, 1440 y 1920 px; comprueba catálogo completo/vacío, cambio de rol, reinicio, headers/CSP, límites de red y el flujo de Commerce desde landing y ruta independiente. En 390 y 1440 px recarga el runtime antes de cada uno de los cinco recorridos; ejecuta acciones reales hasta terminar orientación, unidad, peso, cobro desde carrito vacío y comprobante/nueva venta. También prueba omisión, reinicio, cambio de recorrido, cierre/reapertura conservando progreso y orientación con catálogo vacío. Las capturas de estado se guardan en `docs/retail-learning-center-evidence/`.

## Resultado final de QA

- `npm run typecheck`, `npm run build:demos-only`, `npm run build:emulator`, `npm run test:demos-only:guard`, `npm run test:free-demo-routes`, `npm run test:preview-firebase-isolation`, `node scripts/test-demo-app-integration.mjs`, `node scripts/test-demo-app-integration-browser.mjs`, `npm run test:landing-browser`, ESLint focal y `git diff --check` pasaron.
- El navegador comprobó ambas rutas de demo (completa y vacía) en 9 anchos: 320, 360, 375, 390, 430, 768, 1024, 1440 y 1920 px; sin overflow horizontal.
- Los cinco recorridos se iniciaron desde un runtime recién recargado y se completaron independientemente a 390 y 1440 px. Cobro comenzó con carrito vacío, exigió agregar Café Latte manualmente, comprobó que el botón de cobro se habilita después y cerró el pago QR ficticio. Orientación vacía completó sus pasos restantes omitiendo el paso de producto.
- También se probaron añadir/incrementar unidad, ingresar gramos manualmente, cálculo y agregado por peso, comprobante, reinicio del tutorial, cambio de recorrido, omisión, cierre/reapertura con progreso conservado, dataset vacío y rol sin acceso al POS.
- El recorrido por peso se valida además con clics CDP de puntero sobre el producto y comprobación de que el campo de gramos está visible y recibe el puntero a 390 px; los `.click()` DOM sintéticos no detectaban una obstrucción visual real.
- El runtime aislado no realizó solicitudes externas ni errores de navegador; el guard reportó 0 referencias prohibidas y 0 sourcemaps. Solicitudes a Firebase Production: 0. CSP continúa con `connect-src 'none'`.
- El test de landing se ejecutó en las 9 resoluciones, incluyendo abrir el Centro dentro del iframe para Comercio. El CTA espera a que el control se habilite cuando la demo termina de montar.
- Las tres conexiones rechazadas en la consola de la landing corresponden a endpoints locales de emulador apagados; no hubo solicitudes a Production.

Las capturas de PC, celular, recorridos, entrada de peso, cobro, comprobante y apertura desde la landing están en `docs/retail-learning-center-evidence/`. No se desplegó Vercel Preview porque la validación se completó con build y ejecución local aislada, y no se verificó el acceso SSO y su política de red antes de servir el runtime en Preview. No se modificó Production.
