# QR privado de métodos de cobro manual

## Contrato

La configuración de métodos de cobro sigue viviendo en `platformBillingConfig/manualMethods`. La imagen subida se guarda como un objeto raster privado bajo `platformBilling/manualMethods/qr/`; la configuración solo persiste su ruta, nunca bytes, URL pública ni token de descarga.

- Solo `platform_owner` puede reemplazar o retirar la imagen mediante `platformGateway.saveManualPaymentMethods`.
- Se aceptan PNG, JPG y WebP de hasta 512 KB. La Function verifica firma básica y MIME; SVG y otros formatos activos se rechazan.
- La escritura es versionada mediante `expectedVersion`, forma parte de la operación idempotente y deja auditoría sin incluir contenido de la imagen.
- El objeto se guarda sin token de descarga y con `private, no-store`. Al confirmar la nueva configuración, se borra el objeto reemplazado. Si falla el guardado, se intenta retirar el objeto no referenciado.
- `platform_owner` y `platform_finance` reciben una vista previa autenticada a través de `getManualPaymentMethods`. El portal de pago solo obtiene los bytes mediante `getMyBillingOverview`, después de que `tenantBillingActor` valide al propietario activo de la empresa. No se devuelve la ruta privada al portal.
- `firebase/storage.rules` conserva el cierre por defecto: ninguna identidad cliente puede leer o escribir la ruta privada. El backend usa Admin SDK; no se amplían reglas ni se publica el bucket.
- Las URLs HTTPS ya guardadas siguen siendo compatibles. Las nuevas imágenes se cargan privadas; no hay una URL externa predeterminada.

## Pruebas locales

`npm run test:commercial-qr-storage` ejecuta la callable en el contexto de `demo-pachax-platform` con Auth, Firestore y Storage Emulators. Usa solo una imagen PNG sintética, sin datos bancarios. Comprueba permisos, formato/tamaño, auditoría indirecta, reemplazo, borrado, revisión concurrente, entrega de bytes a roles permitidos y rechazo de acceso directo por Storage Rules.

No importar fixtures ni exportar documentos del emulador a Firebase Production. El flujo no se habilita por el mero hecho de cargar una imagen: el propietario debe aprobar explícitamente la disponibilidad y completar los métodos bancarios.

## Requisito pendiente para un despliegue

El runtime de `platformGateway` necesita acceso de objeto al bucket Firebase para guardar, leer y eliminar archivos en ese prefijo. Antes de publicar, identificar la cuenta de servicio efectiva del gateway y conceder únicamente los permisos de objeto necesarios, idealmente limitados por condición IAM al prefijo `platformBilling/manualMethods/qr/`. No se verificó ni modificó IAM de Production en esta entrega. Si ese acceso acotado no está concedido y probado, no desplegar la versión que habilita la carga privada.

El nombre real del bucket, permisos IAM, imagen QR, titular, banco, cuenta, moneda, instrucciones y activación de pagos requieren confirmación del propietario. No se cargaron valores reales ni se publicaron ofertas.
