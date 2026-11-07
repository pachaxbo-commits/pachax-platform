# Publicación del plano de Restaurante

## Contrato y alcance

`tenantGateway` despacha `restaurantCommand` a `functions/restaurant.cjs`. El cliente envía `floorAction` con `layout.save`. La operación requiere `settings.manage` y el alcance de tenant y sucursal del actor. Acepta de 1 a 200 mesas distintas, un sector activo de la misma sucursal y coordenadas enteras entre 0 y 2400. La revisión esperada es 0 para una mesa sin posición previa.

La transacción lee las mesas del tenant, valida las revisiones y compara las posiciones finales de cada mesa modificada con las de su sector en la sucursal. Las áreas lógicas son de 180 × 160. El contacto de borde está permitido. Las mesas desactivadas que conservan posición siguen reservando espacio y las archivadas quedan fuera. Una distribución anterior sin coordenadas usa posiciones automáticas en el cliente. Los traslados invalidan la posición guardada e incrementan su revisión para que un traslado de ida y vuelta no reactive coordenadas antiguas. Guardar posiciones solo modifica `layout` y `updatedAt`.

Las revisiones detectan una edición anterior de la misma mesa. La lectura transaccional detecta cambios de otras mesas y la validación espacial rechaza un nuevo solapamiento. El comando permite intercambiar dos posiciones en un lote. La idempotencia existente protege reintentos con el mismo identificador de operación. El coste de la lectura transaccional depende del tamaño del salón y de los cambios concurrentes del tenant.

## Etapa 1. Backend

1. Obtener autorización y comprobar el diff, los checks y el SHA aprobado. El PR backend parte de `main` y solo introduce el contrato y sus pruebas. Fusionarlo antes de integrar la interfaz. Mantener el PR #31 en borrador.
2. Registrar el deployment activo de Vercel, la revisión activa de Cloud Run, el SHA del código fuente anterior y su artefacto o ruta reproducible. La consulta de solo lectura confirmó `tenantGateway` activa en `pachax-platform`, Gen 2, `southamerica-west1`, Node 22, con revisión `tenantgateway-00017-kev` y revisión anterior `tenantgateway-00016-veh` en estado listo. Volver a comprobar estos datos justo antes del cambio. El gateway usa la cuenta de cómputo existente y no declara enlaces a Secret Manager. Comparar la configuración e identidad efectivas y confirmar permisos del operador para desplegar y usar la cuenta existente, sin añadir roles ni imprimir secretos.
3. Usar un checkout limpio del SHA aprobado y Node 22. Instalar con los lockfiles y ejecutar `npm run build:functions-core`. Desplegar únicamente con `firebase deploy --only functions:tenantGateway --project pachax-platform`. Detenerse si el CLI no resuelve el destino exacto. El gateway incluye otros comandos, así que su revisión implica también una prueba de regresión de sus consumidores.
4. Confirmar la nueva revisión activa, región, identidad y ausencia de cambios de configuración. Revisar errores, latencia y salud del gateway. Validar operaciones existentes en emuladores o en un tenant de prueba expresamente autorizado. Para comprobar el guardado en Production, usar únicamente un tenant de prueba autorizado y verificar un guardado, un rechazo de colisión y un reintento. Si ese tenant no existe, mantener bloqueada la etapa 2 hasta obtener evidencia autorizada.

## Etapa 2. Interfaz

Con la revisión backend verificada y autorización separada, volver a apuntar el PR #31 a `main` y actualizar su base mediante un merge normal si hace falta. Revisar que su diff excluya el backend, incluso si se eligió squash para el PR backend. Volver a ejecutar los tres workflows. Integrar la interfaz solo tras confirmar el backend. Verificar el deployment de Vercel y el mapa canónico en PC y celular.

## Reversión

1. Si falla la interfaz, revertir el alias de Production con Instant Rollback al deployment anterior verificado. Confirmar el SHA servido y los flujos anteriores de Restaurante y Restaurante Rápido. El backend aditivo admite el frontend anterior y las posiciones guardadas permanecen disponibles para una futura publicación.
2. Si falla el gateway, volver primero al frontend anterior si ya se publicó el editor. Restaurar tráfico a la revisión anterior del servicio Cloud Run únicamente si sigue disponible y corresponde a la configuración validada. Para restablecer también el estado gestionado por Firebase, reconstruir el SHA anterior conocido con Node 22 y desplegar únicamente `tenantGateway`. Confirmar revisión, tráfico, identidad y salud tras la reversión. Coordinar el cambio como una sola intervención porque el gateway es compartido.
3. Comprobar las rutas y la autorización con lecturas o cuentas de prueba autorizadas. Las distribuciones, las cuentas, los pedidos y el historial permanecen en Firestore durante ambas reversiones.

[Firebase Functions](https://firebase.google.com/docs/functions/manage-functions) · [Vercel Instant Rollback](https://vercel.com/docs/instant-rollback)
