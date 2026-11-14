# Instrucciones del primer pago y avisos de renovación

## Vista previa de instrucciones de pago inicial

Desde **PACHAX Admin → Solicitudes comerciales**, el operador con permiso comercial abre un contrato `pending_payment` y puede consultar **Vista previa de instrucciones del primer pago**. Esta vista se genera desde el contrato y su cargo inicial vigentes; no crea ni modifica ninguno de los dos. Solo se ofrece mientras el contrato todavía no tenga tenant y el cargo inicial conserve saldo exigible.

La vista muestra empresa y contacto, plantilla, plan o acuerdo, conceptos, moneda, importe original, importes pagados y en revisión, saldo disponible y fecha límite. Los métodos y el QR aparecen únicamente cuando existe una configuración oficial disponible con al menos un método aprobado. Si no hay método, la pantalla informa que no se puede emitir una instrucción pagable todavía.

Es una vista de consulta administrativa para preparar una comunicación segura. No genera enlace público, no expone contratos ajenos, no recibe referencias, no confirma pagos y no activa empresas. La presentación de una referencia o captura no sustituye la conciliación verificada por PACHAX. La activación asistida existente sigue siendo el único flujo posterior a la conciliación.

## Aviso de renovación

En **PACHAX Admin → Facturación de PACHAX**, un Platform Owner puede elegir el momento del aviso entre 3, 7, 15 o 30 días antes del vencimiento. La política se almacena en el backend, usa revisión de concurrencia, idempotencia y auditoría; la lectura administrativa es de solo lectura para los demás roles autorizados.

El ajuste únicamente controla cuándo se muestra el aviso en el portal del propietario. El valor inicial y de recuperación es 7 días. No cambia vencimientos, días de gracia, restricciones, importes, ciclos, elegibilidad de cargos, creación de renovaciones ni acceso. No se genera un cargo al abrir el aviso. El portal solo muestra medios de pago/QR si hay un cargo pendiente elegible; de lo contrario explica que no existe una instrucción de pago activa.

Una renovación sigue requiriendo el cargo ordinario generado por el flujo administrativo existente y la conciliación autorizada. No hay envío automático de correo, WhatsApp o push.

## Datos de prueba y publicación

La validación de esta fase usa Auth, Firestore y Functions Emulator con `demo-pachax-platform`; el nombre de empresa, contrato, importes y referencia son ficticios y se eliminan al terminar el recorrido. No se cargaron códigos QR ni datos bancarios reales. El PR no cambia métodos habilitados, planes, tarifas, accesos productivos, credenciales ni configuración de Production.

Antes de desplegar esta ampliación deben revisarse los checks del PR y la autorización específica de publicación. Ninguna variable de Production se modificó para realizar las pruebas.
