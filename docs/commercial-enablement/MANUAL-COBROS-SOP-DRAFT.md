# Procedimiento interno de cobranza manual — borrador

**BORRADOR INTERNO.** Solo personal expresamente autorizado. No es una autorización de cobrar ni una guía para marcar pagos como recibidos sin conciliación.

## Roles y controles existentes

- Platform Owner: crea/gestiona oferta, guarda métodos oficiales, autoriza descuentos, decide activación/alta asistida y acciones excepcionales.
- Platform Finance: puede consultar configuración de cobros y ejecutar tareas de conciliación permitidas por su rol; no sustituye una aprobación del propietario cuando el backend la exige.
- Platform Admin: gestiona la cotización/comercial según permisos, pero no confirma pagos si no tiene rol autorizado.
- Ningún propietario/empleado del tenant confirma sus propios pagos en Admin.

Los permisos de cada acción deben comprobarse en la versión desplegada del backend antes de aplicar el SOP. No compartir cuentas, claves ni sesiones.

## Flujo obligatorio

1. **Solicitud inicial.** Atender por WhatsApp comercial aprobado u otro canal humano confirmado. No abrir formulario público. Registrar solo datos necesarios y no pedir credenciales bancarias completas, contraseñas ni códigos de autenticación.
2. **Selección de plantilla y alcance.** Confirmar empresa, plantilla técnicamente disponible, cantidad de sucursales y capacidades implementadas. No prometer capacidades futuras, no publicar Free y no usar un precio editorial como tarifa.
3. **Cotización en Admin.** Seleccionar ciclo, moneda y períodos admitidos; detallar implementación, mensualidad/anualidad, extras, límites, vencimiento de oferta y descuento con motivo/permiso. Para una cotización mensual, la anualidad puede quedar vacía. No cotizar ciclo anual desde planes hasta resolver la discrepancia de unidad `annualPriceUSD` documentada en la matriz.
4. **Aceptación y contrato.** Recibir aceptación documentada de la versión exacta de cotización; generar contrato/cargo desde la misma versión. Verificar importes, moneda, nombre legal, plantilla, capacidades, fecha y autorización. No crear empresa aún.
5. **Instrucciones de pago.** Enviar únicamente datos oficiales guardados por Owner y marcados disponibles. Verificar que el cliente ve banco/titular/cuenta o QR correctos, moneda, importe y concepto. El texto bancario debe coincidir con cuenta receptora real de PACHAX.
6. **Referencia reportada.** Guardar método, referencia, cargo e importe reclamado. La aplicación deja el reporte en `pending_review`; referencia, comprobante adjunto o captura no confirma pago ni activa servicio.
7. **Conciliación bancaria.** El operador autorizado contrasta el movimiento en el canal bancario oficial (no solo la imagen): titular receptor, importe abonado, moneda, fecha, referencia, cuenta origen cuando el extracto lo permita, cargo correcto, pagos previos y duplicidad. Restringir acceso a extractos y eliminar copias innecesarias.
8. **Resolución.** Confirmar solo la suma que aparece abonada y que coincide. Si falta saldo, registrar pago parcial manteniendo saldo/cargo pendiente; si no puede identificarse, dejar pendiente o rechazar con razón precisa; no editar registros financieros confirmados ni borrar auditoría.
9. **Activación.** Solo tras la condición de pago verificado, activar el contrato/tenant mediante el flujo asistido autorizado. Confirmar plantilla, capacidades, propietario, sucursal y fecha. La activación no concede Free, pago automático ni capacidades no contratadas.
10. **Acceso y seguimiento.** Entregar acceso mediante el mecanismo seguro existente de establecimiento de contraseña/enlace temporal. Nunca enviar contraseña por WhatsApp. Verificar login del propietario con el cliente y registrar fecha de inicio, ciclo y próxima renovación.
11. **Renovación y vencimiento.** Emitir cargo e instrucciones manuales. Avisos 7/3/0 son visibles en el portal, no notificaciones externas garantizadas. Mantener gracia de 7 días según Billing. Después de gracia puede aplicarse restricción operativa donde `billingEnforcement` esté activo. Datos no se eliminan por vencimiento.
12. **Cierre y archivo.** Conservar contrato, aceptación, cargo, conciliación y auditoría según la política aprobada. Restringir documentos bancarios a los roles necesarios.

## Casos de excepción

- **Pago parcial:** conciliar solo importe efectivamente abonado; conservar el pendiente; no activar si el cargo/contrato exige pago total para esa acción.
- **Referencia incorrecta o duplicada:** no asociar automáticamente; buscar el movimiento real, mantener pendiente o rechazar con motivo. Nunca confirmar dos veces el mismo abono ni reutilizar una referencia en otros cargos.
- **Pago adelantado:** generar el prepago con cantidad permitida y comprobar fechas de inicio/fin calculadas. Un prepago no crea pago hasta que el banco confirme el abono.
- **Pago pendiente de conciliación:** permanecer `pending_review`; no conceder tiempo, reactivar, crear tenant ni emitir constancia de pago.
- **Cliente vencido/en gracia:** indicar fecha de vencimiento y de fin de gracia; ofrecer regularización. No borrar ni migrar su información.
- **Suspensión administrativa:** pago no elimina la suspensión. Escalar al Owner; reactivación requiere cargo renovado conciliado, autorización, razón y auditoría.
- **Importe equivocado:** si no hubo pago/referencia pendiente, solo usar la corrección auditada permitida y autorización; si ya hay pago parcial/confirmado, no editar ni eliminar: escalar para ajuste/compensación documentada.
- **Reembolso solicitado:** registrar solicitud fuera de la contabilidad del producto hasta que haya política aprobada; evaluar contrato, extracto, obligaciones legales y aprobación. No marcar como reembolsado sin salida bancaria confirmada.
- **Soporte técnico:** abrir caso interno separado de conciliación; no enviar contraseña, códigos, tokens ni extractos en canales generales.
- **Factura fiscal:** el recibo interno de Billing no es factura. Derivar al responsable contable para determinar el documento fiscal y su oportunidad conforme al estado tributario real.

## Registro mínimo de auditoría

Actor y rol; cliente/contrato/cargo; versión de cotización; método y moneda; importe reclamado/conciliado; identificador de referencia redactado o hash según el sistema; fecha/hora; resultado; motivo de rechazo/corrección; autorización; evidencias consultadas y ubicación restringida. Evitar números de cuenta completos del cliente y credenciales.

## Lista de control del operador antes de “Confirmar”

- [ ] Soy operador autorizado y estoy en el proyecto/cuenta correctos.
- [ ] Veo el abono liquidado en la fuente bancaria oficial, no solo una referencia.
- [ ] Coinciden titular receptor, cargo, importe, moneda, fecha y referencia.
- [ ] Verifiqué que el abono no está aplicado a otro pago/cargo.
- [ ] Si parcial, ingresé únicamente el valor efectivamente recibido.
- [ ] No hay ajuste manual que eluda la transacción auditada.
- [ ] La confirmación no se presenta como factura fiscal.
