# Sistema de Diseño y Arquitectura Visual — Restaurante POS (PACHAX)

Este documento define la arquitectura visual, tokens, estándares de maquetación y reglas de composición de la experiencia canónica de Restaurante POS (`RestaurantExperience` / `CajaView`), garantizando coherencia operativa en producción, Studio y Demo pública.

---

## 1. Principio Fundamental: Single Canonical Template

La experiencia de Restaurante cuenta con **una única implementación visual y funcional**:
- **Producción (`/`)**: Conectado a Firestore/Auth reales.
- **PACHAX Studio (`/studio`)**: Conectado a switches de tenant y presets configurables.
- **Demo Pública (`/demo/restaurant`)**: Conectado a fixtures de demostración (`restaurantMock.ts`).

Cualquier mejora en el POS se realiza en `src/components/CajaView.tsx` y `src/modules/restaurant/views/restaurantKiosk.css`, impactando de forma idéntica a todos los entornos.

---

## 2. Estrategia de Viewport y Layout

Se erradica el diseño encajonado (`max-w-*` con `mx-auto`) en las pantallas operativas del punto de venta.

### 2.1 Contenedor y Espaciado Fluido
- **Ancho completo**: `width: 100%`, `max-width: none`.
- **Relleno perimetral fluido**:
  ```css
  padding: clamp(10px, 1.25vw, 20px);
  ```
- **Altura de trabajo**: `100vh` con scroll interno desacoplado entre el catálogo de productos y el panel de comanda/carrito.

### 2.2 Rejilla Desktop (>= 1024px)
Estructura estable de 2 columnas con panel de comanda de ancho clamp:
```css
grid-template-columns: minmax(0, 1fr) clamp(350px, 27vw, 440px);
gap: clamp(14px, 1.5vw, 22px);
```
- **Columna 1 (Catálogo)**: Ocupa todo el espacio dinámico disponible (`minmax(0, 1fr)`). Nunca se achica ni se desborda cuando el carrito se llena.
- **Columna 2 (Carrito / Comanda)**: Ancho acotado entre 350px y 440px según la densidad del monitor. Comportamiento `sticky` anclado a la parte superior.

### 2.3 Breakpoints y Adaptabilidad
- **Móvil (< 600px)**:
  - Catálogo: **2 productos por fila garantizados** (`grid-template-columns: repeat(2, minmax(0, 1fr))`).
  - Barra de categorías: scroll horizontal con `scrollbar-none`.
  - Carrito: barra flotante inferior ("Ver Pedido [total] ->") que despliega el checkout en modal bottom-sheet con `z-index: 50`.
- **Tablet (600px – 1023px)**:
  - Catálogo: `repeat(auto-fill, minmax(160px, 1fr))`.
  - Carrito adaptable según orientación (apilado inferior en portrait, columna compacta en landscape).
- **Desktop (>= 1024px)**:
  - 2 columnas fijas descritas en 2.2.
- **Widescreen / 4K (>= 1920px)**:
  - El catálogo escala horizontalmente con `repeat(auto-fill, minmax(180px, 1fr))` aprovechando el lienzo sin márgenes artificiales desaprovechados.

---

## 3. Catálogo y Tarjetas de Producto

Las tarjetas de producto siguen una jerarquía comercial clara y limpia inspirada en terminales táctiles modernos.

### 3.1 Geometría de Tarjeta
- **Relación de aspecto de imagen**: `aspect-ratio: 1.38` con `object-fit: cover` para dar protagonismo a la fotografía gastronómica.
- **Radio de esquinas**: `border-radius: 16px` (`rounded-2xl`).
- **Bordes y sombra**: `border: 1px solid var(--border)`, sombra sutil `0 1px 3px rgba(0,0,0,0.04)`.
- **Efecto hover**: elevación ligera (`transform: translateY(-2px)`), brillo sutil de sombra y resalte suave del borde.
- **Información compacta**:
  - Título a 2 líneas con `line-clamp-2`, tipografía semi-bold legible.
  - Precio destacado en tipografía negrita.
  - Botón circular de añadir (`+`): 34px de diámetro, color `var(--primary)`, texto en `var(--primary-foreground)`, con animación de pulso sutil al presionar.

---

## 4. Estándar de Categorías (Zero Emojis)

Queda estrictamente prohibido el uso de emojis unicode (`🍔`, `🥗`, `🍷`, etc.) en la navegación operativa del POS.

### 4.1 Iconografía Vectorial
- Todos los iconos de categoría deben ser componentes vectoriales SVG de `lucide-react`.
- Trazo y dimensiones uniformes: tamaño constante de `15px` (`size={15}`) con `strokeWidth={2}`.
- Mapeo semántico centralizado en `CajaView.tsx`:
  - Hamburguesas / Sandwiches $\rightarrow$ `Sandwich`
  - Ensaladas $\rightarrow$ `Salad`
  - Sopas / Caldos $\rightarrow$ `Soup`
  - Bebidas / Gaseosas $\rightarrow$ `GlassWater`
  - Café $\rightarrow$ `Coffee`
  - Postres $\rightarrow$ `CakeSlice`
  - Pizzas $\rightarrow$ `Pizza`
  - Vinos / Licores $\rightarrow$ `Wine`
  - Todo / General $\rightarrow$ `LayoutGrid`
  - Fallback por defecto $\rightarrow$ `Tag`
- Pills de navegación: redondeados (`rounded-full`), fondo neutro sutil en reposo, y contraste pleno en activo usando `var(--primary)`.

---

## 5. Arquitectura del Panel de Comanda (Carrito)

Se erradica el patrón anti-diseño de "sopa de tarjetas" (tarjetas dentro de tarjetas dentro de tarjetas).

### 5.1 Encabezado ("Tu Pedido")
- Título conciso: **"Tu Pedido"** con badge numérico circular indicando cantidad total de productos.
- Badge identificador de turno o comanda correlativa (`#101`, etc.).
- Botón discreto "Limpiar" para cancelar la comanda en curso.

### 5.2 Lista de Ítems (Clean Row-Based List)
- Cada producto en la comanda se presenta como una fila horizontal separada por divisores finos (`divide-y divide-slate-100`).
- Miniatura cuadrada de 44px con esquinas redondeadas (`rounded-lg`).
- Bloque central con nombre, extras/modificadores seleccionados en tipografía secundaria (`text-xs text-slate-500`), y precio unitario.
- Stepper numérico de control táctil rápido: botones decremento (`-`), cantidad destacada, incremento (`+`).
- Subtotal calculado a la derecha.
- Botón de remover con icono papelera (`Trash2`) discreto en reposo, rojo en hover.

### 5.3 Controles Operativos Equilibrados
Para evitar asimetrías visuales, los selectores de checkout se distribuyen en rejillas regulares:
1. **Origen del Pedido**: 2 columnas uniformes (Mostrador / Mesa o Salón).
2. **Modalidad de Entrega**: 3 columnas uniformes (Mesa, Para Llevar, Delivery).
3. **Estado de Pago**: 2 columnas simétricas (**Pagado** / **Pendiente**).
   - Conmutación libre y bidireccional permitida en todo momento: el cajero puede alternar entre `Pagado` $\leftrightarrow$ `Pendiente` sin resetear el carrito ni bloquearse si hay mesa asignada.
   - Eliminación de la opción "Regalo" para nuevas órdenes de mostrador (se mantiene compatibilidad de lectura para órdenes históricas del sistema).

### 5.4 Bloque de Totalización y Checkout
- Desglose conciso: Subtotal y Descuentos (si aplican).
- **Total protagonista**: destacado con tamaño `text-xl font-black` y color principal derivado de `var(--primary)`.
- **Botón principal "Procesar Pedido"**: ancho completo (`w-full`), altura generosa (táctil), color `bg-[var(--primary)]`, con icono flecha (`ArrowRight`) y respuesta visual inmediata.

---

## 6. Sistema de Tokens y Variables de Color

Queda prohibido el uso de colores fijos hardcodeados (como fucsias, violetas BurgerLab o hex fijos en los componentes). Todo se deriva de la paleta del tenant mediante CSS Variables inyectadas por `restaurantThemeStyle`.

| Variable Token | Uso Semántico |
|---|---|
| `--primary` | Color maestro del restaurante (botones de acción, totales, selección activa). |
| `--primary-foreground` | Color del texto de alto contraste calculado sobre `--primary` (`#ffffff` o `#0f172a`). |
| `--primary-hover` | Estado hover de botones y elementos interactivos primarios. |
| `--primary-soft` | Fondos de badges, selección suave de categorías y destacados. |
| `--border` | Borde estructural para tarjetas, divisores y contenedores. |
| `--surface` | Fondo de contenedores y paneles elevados. |

---

## 7. Pruebas y Validación Automatizada

El estándar está protegido mediante pruebas unitarias y de integración en:
- `src/modules/restaurant/domain/__tests__/restaurantKioskPOS.test.ts`:
  1. Conmutación bidireccional `Pagado` $\leftrightarrow$ `Pendiente` preservando comanda.
  2. Ausencia de "Regalo" en checkout de nuevos pedidos.
  3. Rejilla desktop clamp estable para evitar colapso de catálogo.
  4. Cero emojis y soporte de iconos vectoriales en categorías.
  5. Derivación estricta de color primario y accesibilidad de tokens.
