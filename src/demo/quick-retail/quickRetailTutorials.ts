export type QuickRetailTutorialId = 'orientation' | 'unit-sale' | 'weight-sale' | 'payment' | 'receipt'

export type QuickRetailTutorialEvent =
  | 'catalog-focus'
  | 'search-focus'
  | 'search-used'
  | 'product-added'
  | 'quantity-changed'
  | 'cart-focus'
  | 'total-focus'
  | 'weight-opened'
  | 'weight-changed'
  | 'weight-calc-reviewed'
  | 'weight-added'
  | 'checkout-opened'
  | 'payment-method-selected'
  | 'sale-completed'
  | 'receipt-reviewed'
  | 'new-sale-started'

export type QuickRetailTutorialStep = {
  id: string
  title: string
  instruction: string
  target: string
  expectedEvent: QuickRetailTutorialEvent
}

export type QuickRetailTutorial = {
  id: QuickRetailTutorialId
  title: string
  description: string
  steps: readonly QuickRetailTutorialStep[]
  requiresProducts: boolean
}

export const QUICK_RETAIL_TUTORIALS: readonly QuickRetailTutorial[] = [
  {
    id: 'orientation',
    title: 'Conocer el punto de venta',
    description: 'Ubica el catálogo, la búsqueda, el carrito y el total antes de vender.',
    requiresProducts: false,
    steps: [
      { id: 'catalog', title: 'Catálogo', instruction: 'Enfoca el área del catálogo para ubicar dónde aparecen los productos disponibles.', target: 'catalog', expectedEvent: 'catalog-focus' },
      { id: 'search', title: 'Búsqueda', instruction: 'Enfoca la búsqueda. Puedes filtrar productos escribiendo su nombre o rubro.', target: 'search', expectedEvent: 'search-focus' },
      { id: 'product', title: 'Productos', instruction: 'Enfoca el catálogo para reconocer dónde aparecen los artículos. Puedes continuar sin agregar uno a la venta.', target: 'catalog', expectedEvent: 'catalog-focus' },
      { id: 'cart', title: 'Carrito', instruction: 'Enfoca la venta actual. Aquí aparecen las líneas agregadas, su cantidad y subtotal.', target: 'cart', expectedEvent: 'cart-focus' },
      { id: 'total', title: 'Total', instruction: 'Enfoca el total para identificar el importe que se revisa antes de cobrar.', target: 'total', expectedEvent: 'total-focus' },
    ],
  },
  {
    id: 'unit-sale', title: 'Venta por unidad', description: 'Agrega un artículo real de la demo y ajusta su cantidad.', requiresProducts: true,
    steps: [
      { id: 'find', title: 'Busca un artículo', instruction: 'Escribe el nombre de un producto de unidad, por ejemplo Café Latte, o escribe parte de su nombre para filtrar el catálogo.', target: 'search', expectedEvent: 'search-used' },
      { id: 'add', title: 'Agrégalo al carrito', instruction: 'Selecciona un producto marcado “Por Unidad”. La demo lo agregará al carrito.', target: 'product', expectedEvent: 'product-added' },
      { id: 'quantity', title: 'Ajusta la cantidad', instruction: 'Usa + o − en la línea del producto para cambiar unidades; el subtotal se recalcula.', target: 'quantity', expectedEvent: 'quantity-changed' },
      { id: 'total', title: 'Revisa el total', instruction: 'Confirma que el total refleja la cantidad y el precio del producto seleccionado.', target: 'total', expectedEvent: 'total-focus' },
    ],
  },
  {
    id: 'weight-sale', title: 'Venta por peso', description: 'Ingresa gramos manualmente y observa la conversión y el importe.', requiresProducts: true,
    steps: [
      { id: 'select-weight', title: 'Elige un producto por peso', instruction: 'Selecciona un producto marcado “Por Peso”, por ejemplo Helado artesanal.', target: 'product', expectedEvent: 'weight-opened' },
      { id: 'enter-grams', title: 'Ingresa gramos', instruction: 'Cambia el valor en gramos. Es una entrada manual de práctica; no hay una balanza física conectada.', target: 'weight-input', expectedEvent: 'weight-changed' },
      { id: 'review-calc', title: 'Revisa el cálculo', instruction: 'Enfoca el subtotal para comprobar el cálculo con el precio por kilogramo y los gramos ingresados.', target: 'weight-subtotal', expectedEvent: 'weight-calc-reviewed' as QuickRetailTutorialEvent },
      { id: 'add-weight', title: 'Agrega al carrito', instruction: 'Confirma “Agregar al Carrito” para ver los gramos y su subtotal en la venta.', target: 'weight-add', expectedEvent: 'weight-added' },
      { id: 'weight-total', title: 'Comprueba el total', instruction: 'Revisa el importe final de esta práctica en el carrito.', target: 'total', expectedEvent: 'total-focus' },
    ],
  },
  {
    id: 'payment', title: 'Cobro demostrativo', description: 'Practica un cobro local con métodos ficticios, sin transacciones bancarias.', requiresProducts: true,
    steps: [
      { id: 'review-cart', title: 'Revisa el carrito', instruction: 'Enfoca el carrito y revisa los productos y cantidades antes de cobrar.', target: 'cart', expectedEvent: 'cart-focus' },
      { id: 'open-checkout', title: 'Abre el cobro', instruction: 'Pulsa “Cobrar Venta” para abrir el formulario de pago de demostración.', target: 'checkout', expectedEvent: 'checkout-opened' },
      { id: 'select-method', title: 'Identifica los métodos', instruction: 'Selecciona Efectivo, QR o Mixto. La selección solo afecta esta práctica local.', target: 'payment-method', expectedEvent: 'payment-method-selected' },
      { id: 'confirm-payment', title: 'Confirma el cobro ficticio', instruction: 'Confirma para registrar el resultado solamente en el estado local de la demo.', target: 'confirm-payment', expectedEvent: 'sale-completed' },
    ],
  },
  {
    id: 'receipt', title: 'Comprobante y nueva venta', description: 'Revisa el folio y resumen local generado por la demo y prepara otra venta.', requiresProducts: true,
    steps: [
      { id: 'add-product', title: 'Prepara la venta', instruction: 'Agrega un producto marcado “Por Unidad” del catálogo al carrito.', target: 'product', expectedEvent: 'product-added' },
      { id: 'open-payment', title: 'Abre el cobro', instruction: 'Pulsa “Cobrar Venta” para revisar el flujo de pago ficticio.', target: 'checkout', expectedEvent: 'checkout-opened' },
      { id: 'choose-method', title: 'Elige un método de práctica', instruction: 'Selecciona Efectivo, QR o Mixto. Esto no contacta un banco.', target: 'payment-method', expectedEvent: 'payment-method-selected' },
      { id: 'complete-sale', title: 'Genera un comprobante de práctica', instruction: 'Confirma el cobro para generar un folio y resumen local.', target: 'confirm-payment', expectedEvent: 'sale-completed' },
      { id: 'review-receipt', title: 'Revisa el resultado', instruction: 'Consulta el folio, los artículos y el total de la venta de demostración.', target: 'receipt', expectedEvent: 'receipt-reviewed' },
      { id: 'start-again', title: 'Prepara otra venta', instruction: 'Pulsa “Nueva venta”. El carrito de la venta cobrada ya está vacío y el resultado se conserva en Ventas durante esta sesión.', target: 'new-sale', expectedEvent: 'new-sale-started' },
    ],
  },
]
