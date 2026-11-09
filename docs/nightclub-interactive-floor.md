# Nightclub & Lounge: mapa interactivo de zonas y mesas

## Auditoría y alcance

`NightclubExperience` es la experiencia canónica de Production, PACHAX Studio y la demo; `NightclubZones` conserva los callbacks actuales de cuentas, rondas, reservas, asignación de clientes, entrega y finalización. `NightclubFloor` y los comandos de dominio para configurar zonas/mesas permanecen sin cambios. El mapa consume exclusivamente las zonas, mesas, reservas y cuentas existentes.

El dominio `NightclubTable` no contiene coordenadas ni forma de mobiliario. Por ello el mapa calcula posiciones estables por nombre e identificador y representa redondo/cuadrado/rectangular/lounge como una convención visual basada en capacidad y nombre. No se presenta como un atributo persistido del negocio. Los estados y los datos de cuenta sí proceden del modelo canónico.

## Componentes

- `NightclubFloorCanvas`: SVG accesible por zona, mesas y asientos vectoriales, selección por puntero/teclado y arrastre acotado al modo de edición.
- `NightclubZones`: filtros, recuentos, leyenda, plano/lista, controles de zoom, detalle contextual y controles de organización; continúa llamando a las operaciones existentes.
- `nightclubFloorLayout.ts`: distribución compacta adaptable al número de mesas, normalización, colisiones agrupadas por sector y almacenamiento local estable por entorno e identidad.
- `nightclubTutorials.ts`: guía específica del mapa para administración, con pasos de solo lectura en tenant y acciones explícitas únicamente en Demo/Studio.

## Persistencia y límites

El modelo/contrato de Nightclub no ofrece una operación autorizada para persistir coordenadas. No se añadió un contrato paralelo ni se escriben posiciones en backend. El editor solo aparece en Demo o Studio cuando los permisos aplicables incluyen `floor.edit`; sus posiciones se guardan en `localStorage` bajo una clave v2 estable, namespaced por entorno, tenant y sucursal, sin depender del conjunto de IDs. Cancelar descarta el borrador. Production muestra posiciones automáticas y no lee ni escribe esas claves.

La geometría automática es estable para datos antiguos y no modifica documentos existentes. Con una o dos mesas centra el grupo; entre tres y seis distribuye una cuadrícula balanceada; para más mesas incrementa filas/columnas y la altura del sector. Cada tablero se adapta al ancho disponible y permite scroll interno cuando la densidad lo requiere. La detección de colisiones revisa todas las zonas editadas y compara solo mesas del mismo sector, porque sus coordenadas son locales.

Al cargar, la clave v2 conserva posiciones existentes, incorpora nuevas mesas con su ubicación automática y descarta IDs eliminados al normalizar. Se intenta importar la clave v1 anterior cuando el conjunto actual coincide exactamente con aquel usado para generarla; la clave v1 no contiene metadatos reversibles, así que no se puede recuperar un conjunto previo distinto sin adivinar. La edición persistente entre dispositivos requerirá un contrato de servidor con autorización, concurrencia y validación; no se simula aquí.

## Accesibilidad y uso

Las mesas son grupos SVG enfocables con etiquetas que incluyen nombre, zona, estado, capacidad y cuenta activa. Enter/Espacio selecciona; en el editor, las cuatro flechas mueven la mesa enfocada, Escape descarta edición o cierra el detalle y los botones táctiles siguen disponibles. El editor no captura flechas fuera del modo edición ni dentro de campos. «Ajustar» mide los límites SVG de las mesas por zona, calcula la escala ajustada y centra el contenido; el zoom mantiene desplazamiento interior. El panel contextual se presenta como drawer lateral en escritorio y hoja inferior en móvil.

La guía enseña selección sin alterar estado, cuenta de práctica, preparación de producto y envío de ronda sin iniciar cobro. Los pasos de escritura solo avanzan por la confirmación observada del adaptador; en tenant se mantienen informativos. Ningún paso realiza una operación automáticamente.

## Verificación

Las pruebas unitarias cubren escenarios de 2, 6, 10 y 30 mesas, altura adaptable, normalización, detección entre sectores, zoom ajustado, migración de clave, conservación con conjunto modificado, aislamiento de almacenamiento y condiciones de permisos del tutorial. `npm run test:nightclub-floor-browser` usa Chrome/CDP con la demo completa, activa clicks de mouse y touch, arrastre, las cuatro flechas, Enter/Espacio, Escape, colisión oculta al filtrar otra zona, fit view, apertura de cuenta y envío de ronda local (sin cobro); comprueba la guía, el almacenamiento al recargar, que la página no desborde y que no se soliciten servicios Firebase/Cloud de Production.

El workflow `.github/workflows/nightclub-floor-qa.yml` ejecuta Node 22, TypeScript, ESLint focal, dominio/tutorial/permisos, build emulado, guards de demo/aislamiento, QA de navegador y carga las capturas como artefacto.

Las capturas reales se guardan en `docs/nightclub-floor-evidence/`: mapa de escritorio 1440 y 1920, tema claro, detalle, editor y posiciones Demo restauradas, tablet horizontal, móvil 390 y 320, y guía activa. La captura de 320/390 corresponde al viewport de Chrome emulado y muestra el plano desplazable dentro de su contenedor.
