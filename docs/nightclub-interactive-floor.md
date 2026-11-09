# Nightclub & Lounge: mapa interactivo de zonas y mesas

## Auditoría y alcance

`NightclubExperience` es la experiencia canónica de Production, PACHAX Studio y la demo; `NightclubZones` conserva los callbacks actuales de cuentas, rondas, reservas, asignación de clientes, entrega y finalización. `NightclubFloor` y los comandos de dominio para configurar zonas/mesas permanecen sin cambios. El mapa consume exclusivamente las zonas, mesas, reservas y cuentas existentes.

El dominio `NightclubTable` no contiene coordenadas ni forma de mobiliario. Por ello el mapa calcula posiciones estables por nombre e identificador y representa redondo/cuadrado/rectangular/lounge como una convención visual basada en capacidad y nombre. No se presenta como un atributo persistido del negocio. Los estados y los datos de cuenta sí proceden del modelo canónico.

## Componentes

- `NightclubFloorCanvas`: SVG accesible por zona, mesas y asientos vectoriales, selección por puntero/teclado y arrastre acotado al modo de edición.
- `NightclubZones`: filtros, recuentos, leyenda, plano/lista, controles de zoom, detalle contextual y controles de organización; continúa llamando a las operaciones existentes.
- `nightclubFloorLayout.ts`: posiciones automáticas, normalización, detección de colisiones y clave de almacenamiento local aislada por entorno e identidad.
- `nightclubTutorials.ts`: guía específica del mapa para administración, con pasos de solo lectura en tenant y acciones explícitas únicamente en Demo/Studio.

## Persistencia y límites

El modelo/contrato de Nightclub no ofrece una operación autorizada para persistir coordenadas. No se añadió un contrato paralelo ni se escriben posiciones en backend. El editor solo aparece en Demo o Studio cuando los permisos aplicables incluyen `floor.edit`; sus posiciones se guardan en `localStorage` bajo una clave namespaced por entorno, tenant/sucursal y conjunto de IDs. Cancelar descarta el borrador. Production muestra posiciones automáticas y no lee ni escribe esas claves.

La geometría automática es estable para datos antiguos y no modifica documentos existentes. La validación de colisiones opera dentro del sector correspondiente; cambiar zonas, mesas o identidades genera la distribución automática apropiada. La edición persistente entre dispositivos requerirá un contrato de servidor con autorización, concurrencia y validación; no se simula aquí.

## Accesibilidad y uso

Las mesas son grupos SVG enfocables con etiquetas que incluyen nombre, zona, estado, capacidad y cuenta activa. Enter/Espacio selecciona; el editor ofrece controles direccionales táctiles y por teclado. El plano se puede desplazar horizontalmente en pantallas pequeñas. El panel contextual se presenta como drawer lateral en escritorio y hoja inferior en móvil.

La guía enseña selección sin alterar estado, cuenta de práctica, preparación de producto y envío de ronda sin iniciar cobro. Los pasos de escritura solo avanzan por la confirmación observada del adaptador; en tenant se mantienen informativos. Ningún paso realiza una operación automáticamente.

## Verificación

Las pruebas unitarias cubren posiciones heredadas, normalización, colisiones por sector, aislamiento de almacenamiento, 30 mesas y condiciones de permisos del tutorial. `npm run test:nightclub-floor-browser` usa Chrome/CDP con la demo completa, activa clicks de mouse y touch, drag, tecla Enter, apertura de cuenta de demostración y envío de ronda local (sin cobro); comprueba la guía, el almacenamiento al recargar, que la página no desborde y que no se soliciten servicios Firebase/Cloud de Production.

Las capturas reales se guardan en `docs/nightclub-floor-evidence/`: mapa de escritorio 1440 y 1920, tema claro, detalle, editor y posiciones Demo restauradas, tablet horizontal, móvil 390 y 320, y guía activa. La captura de 320/390 corresponde al viewport de Chrome emulado y muestra el plano desplazable dentro de su contenedor.
