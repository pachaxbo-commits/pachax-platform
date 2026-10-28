# Arquitectura Técnica: PACHAX Encomiendas Desktop Offline

## 1. Visión y Objetivos

El sector de transporte interdepartamental y agencias de encomiendas en Bolivia opera frecuentemente en condiciones de infraestructura adversa:
- Cortes intempestivos de suministro eléctrico en terminales terrestres.
- Conectividad a Internet inestable, intermitente o nula durante bloqueos o fallas de fibra óptica interdepartamental.
- Operación continua de mostrador donde la lentitud o caída del software detiene el despacho de flotas y genera aglomeraciones en ventanilla.
- Necesidad de imprimir tickets térmicos (58mm/80mm) y manifiestos de forma inmediata sin diálogos emergentes del sistema operativo ni latencias de red.

Este documento establece la arquitectura técnica para compilar la experiencia canónica de **PACHAX Encomiendas (Estándar y Sindicato)** como aplicación de escritorio nativa para Windows con almacenamiento 100% offline-first.

---

## 2. Evaluación Técnica: Tauri (Rust + WebView2) vs. Electron

| Criterio | Tauri v2 (Rust + WebView2) | Electron (Chromium + Node.js) | Recomendación PACHAX |
| :--- | :--- | :--- | :--- |
| **Consumo de Memoria RAM** | **~35 MB – 70 MB** en reposo. Ligero en PCs antiguas (Celeron/Core i3 con 4GB RAM). | **~180 MB – 350 MB** por ventana. Pesado en terminales de bajo presupuesto. | **Tauri v2** |
| **Tamaño del Instalador** | **~12 MB – 18 MB** (reutiliza Evergreen WebView2 preinstalado en Windows 10/11). | **~85 MB – 130 MB** (empaqueta Chromium completo). | **Tauri v2** |
| **Arranque en Frío** | **< 600 ms**. Clave tras reinicios rápidos por cortes de luz. | **2.5 s – 5.0 s**. | **Tauri v2** |
| **Acceso a Hardware (ESC/POS, USB, COM)** | Vía crates nativos de Rust (`serialport`, `winapi-spooler`, `rusqlite`). Cero overhead y ejecución en hilo dedicado. | Vía módulos Node.js N-API (`node-escpos`, `usb`). Requiere reconstrucción (`node-gyp`) para Windows x64. | **Tauri v2** |
| **Seguridad de Binarios y Licenciamiento** | Código de control compilado en binario nativo Rust difícil de desensamblar; frontend cifrado o embebido en el binario. | Código JavaScript empaquetado en archivo `.asar` fácilmente extraíble. | **Tauri v2** |
| **Mantenibilidad del Frontend** | Consume exactamente los mismos componentes React + Vite + TypeScript (`src/modules/parcel/**`). | Consume los mismos componentes React + Vite. | Empate |

### Veredicto Arquitectónico:
Se selecciona **Tauri v2**. Garantiza que terminales de buses con hardware obsoleto (Windows 10 x64, 4 GB de RAM, discos HDD) ejecuten la aplicación con fluidez instantánea, inicio rápido tras cortes de energía y acceso directo al Spooler de Windows sin dependencias pesadas de Node.js en producción.

---

## 3. Esquema Relacional de Base de Datos Local (SQLite)

La base de datos local SQLite se ubica en `%LOCALAPPDATA%\PACHAX\Encomiendas\database.sqlite3` en modo WAL (`PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL;`). Este modo previene bloqueos de lectura mientras se registran encomiendas y garantiza durabilidad ante cortes repentinos de energía.

```sql
-- 1. Sucursales / Agencias
CREATE TABLE IF NOT EXISTS branches (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  city TEXT NOT NULL,
  address TEXT NOT NULL,
  phone TEXT,
  code TEXT NOT NULL UNIQUE
);

-- 2. Clientes (Remitentes y Destinatarios)
CREATE TABLE IF NOT EXISTS customers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  doc_type TEXT NOT NULL DEFAULT 'CI',
  doc_number TEXT,
  phone TEXT NOT NULL,
  address TEXT,
  city TEXT,
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_customers_search ON customers(name, phone, doc_number);

-- 3. Encomiendas / Envíos
CREATE TABLE IF NOT EXISTS shipments (
  id TEXT PRIMARY KEY,
  tracking_code TEXT NOT NULL UNIQUE,
  created_at DATETIME NOT NULL,
  origin_branch_id TEXT NOT NULL REFERENCES branches(id),
  origin_city TEXT NOT NULL,
  destination_branch_id TEXT NOT NULL REFERENCES branches(id),
  destination_city TEXT NOT NULL,
  delivery_type TEXT NOT NULL CHECK(delivery_type IN ('agency', 'home')),
  delivery_address TEXT,
  
  -- Remitente
  sender_name TEXT NOT NULL,
  sender_doc_type TEXT,
  sender_doc_number TEXT,
  sender_phone TEXT NOT NULL,
  sender_address TEXT,
  
  -- Destinatario
  recipient_name TEXT NOT NULL,
  recipient_doc_type TEXT,
  recipient_doc_number TEXT,
  recipient_phone TEXT NOT NULL,
  
  -- Carga y Contenido Declarado
  declared_summary TEXT NOT NULL,
  package_count INTEGER NOT NULL DEFAULT 1,
  total_weight_kg REAL NOT NULL DEFAULT 0.0,
  has_fragile_items INTEGER NOT NULL DEFAULT 0,
  has_perishable_items INTEGER NOT NULL DEFAULT 0,
  handling_notes TEXT,
  
  -- Tarifas y Cobro
  shipping_fee REAL NOT NULL,
  discount REAL NOT NULL DEFAULT 0.0,
  final_amount REAL NOT NULL,
  payment_timing TEXT NOT NULL CHECK(payment_timing IN ('origin_paid', 'destination_cod')),
  payment_status TEXT NOT NULL CHECK(payment_status IN ('paid', 'pending')),
  payment_method TEXT CHECK(payment_method IN ('cash', 'qr', 'transfer')),
  paid_at DATETIME,
  paid_by TEXT CHECK(paid_by IN ('sender', 'recipient')),
  
  -- Estado y Manifiesto
  status TEXT NOT NULL DEFAULT 'received' CHECK(status IN (
    'received', 'pending_dispatch', 'dispatched', 'in_transit',
    'received_at_dest', 'ready_for_delivery', 'delivered', 'incident', 'returned'
  )),
  manifest_id TEXT,
  notes TEXT,
  
  -- Sincronización
  sync_version INTEGER NOT NULL DEFAULT 1,
  synced_at DATETIME
);
CREATE INDEX IF NOT EXISTS idx_shipments_tracking ON shipments(tracking_code);
CREATE INDEX IF NOT EXISTS idx_shipments_status ON shipments(status, destination_branch_id);

-- 4. Ítems declarados por encomienda
CREATE TABLE IF NOT EXISTS shipment_items (
  id TEXT PRIMARY KEY,
  shipment_id TEXT NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  category TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  packaging TEXT NOT NULL,
  weight_kg REAL NOT NULL DEFAULT 0.0,
  declared_value REAL NOT NULL DEFAULT 0.0,
  is_fragile INTEGER NOT NULL DEFAULT 0,
  is_perishable INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_items_shipment ON shipment_items(shipment_id);

-- 5. Historial de estados (Trazabilidad estricta)
CREATE TABLE IF NOT EXISTS shipment_status_logs (
  id TEXT PRIMARY KEY,
  shipment_id TEXT NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
  previous_status TEXT NOT NULL,
  new_status TEXT NOT NULL,
  timestamp DATETIME NOT NULL,
  operator_name TEXT NOT NULL,
  location TEXT NOT NULL,
  notes TEXT
);

-- 6. Manifiestos de Despacho
CREATE TABLE IF NOT EXISTS dispatch_manifests (
  id TEXT PRIMARY KEY,
  manifest_number TEXT NOT NULL UNIQUE,
  created_at DATETIME NOT NULL,
  origin_branch_id TEXT NOT NULL REFERENCES branches(id),
  destination_branch_id TEXT NOT NULL REFERENCES branches(id),
  destination_city TEXT NOT NULL,
  driver_or_responsible TEXT NOT NULL,
  vehicle_plate TEXT,
  total_packages INTEGER NOT NULL DEFAULT 0,
  total_weight_kg REAL NOT NULL DEFAULT 0.0,
  operator_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'created' CHECK(status IN ('created', 'in_transit', 'received_with_observations', 'completed')),
  received_at DATETIME,
  received_by TEXT,
  observations TEXT
);

-- 7. Registro de Entregas (Receptor y Conformidad)
CREATE TABLE IF NOT EXISTS shipment_deliveries (
  id TEXT PRIMARY KEY,
  shipment_id TEXT NOT NULL UNIQUE REFERENCES shipments(id),
  delivered_at DATETIME NOT NULL,
  receiver_name TEXT NOT NULL,
  receiver_doc_type TEXT NOT NULL,
  receiver_doc_number TEXT NOT NULL,
  receiver_relationship TEXT NOT NULL,
  authorization_notes TEXT,
  operator_name TEXT NOT NULL,
  signature_captured INTEGER NOT NULL DEFAULT 0,
  amount_collected REAL NOT NULL DEFAULT 0.0,
  payment_method TEXT,
  delivery_notes TEXT
);

-- 8. Turnos de Caja (Arqueos)
CREATE TABLE IF NOT EXISTS cash_shifts (
  id TEXT PRIMARY KEY,
  branch_id TEXT NOT NULL REFERENCES branches(id),
  operator_uid TEXT NOT NULL,
  operator_name TEXT NOT NULL,
  opened_at DATETIME NOT NULL,
  closed_at DATETIME,
  initial_cash REAL NOT NULL DEFAULT 0.0,
  actual_cash REAL,
  expected_cash REAL NOT NULL DEFAULT 0.0,
  difference REAL,
  total_cash_in REAL NOT NULL DEFAULT 0.0,
  total_cash_out REAL NOT NULL DEFAULT 0.0,
  total_qr_in REAL NOT NULL DEFAULT 0.0,
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open', 'closed')),
  notes TEXT
);

-- 9. Movimientos de Caja
CREATE TABLE IF NOT EXISTS cash_movements (
  id TEXT PRIMARY KEY,
  shift_id TEXT NOT NULL REFERENCES cash_shifts(id),
  timestamp DATETIME NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('income', 'expense')),
  category TEXT NOT NULL,
  amount REAL NOT NULL,
  payment_method TEXT NOT NULL CHECK(payment_method IN ('cash', 'qr', 'transfer')),
  concept TEXT NOT NULL,
  reference_id TEXT,
  operator_uid TEXT NOT NULL,
  operator_name TEXT NOT NULL
);

-- 10. Módulo Sindicato: Socios Afiliados
CREATE TABLE IF NOT EXISTS union_members (
  id TEXT PRIMARY KEY,
  member_number TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  ci TEXT NOT NULL,
  phone TEXT NOT NULL,
  vehicle_plate TEXT,
  vehicle_model TEXT,
  status TEXT NOT NULL CHECK(status IN ('active', 'suspended', 'leave', 'retired')),
  joined_date DATE NOT NULL,
  monthly_fee_assigned REAL NOT NULL DEFAULT 150.0,
  notes TEXT
);

-- 11. Módulo Sindicato: Cuotas Mensuales
CREATE TABLE IF NOT EXISTS union_monthly_dues (
  id TEXT PRIMARY KEY,
  member_id TEXT NOT NULL REFERENCES union_members(id),
  period TEXT NOT NULL,               -- '2026-10'
  period_label TEXT NOT NULL,         -- 'Octubre 2026'
  due_amount REAL NOT NULL,
  paid_amount REAL NOT NULL DEFAULT 0.0,
  balance REAL NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('pending', 'partial', 'paid', 'overdue')),
  due_date DATE NOT NULL,
  UNIQUE(member_id, period)           -- Garantía de no duplicación
);

-- 12. Módulo Sindicato: Pagos de Cuotas
CREATE TABLE IF NOT EXISTS union_due_payments (
  id TEXT PRIMARY KEY,
  due_id TEXT NOT NULL REFERENCES union_monthly_dues(id),
  receipt_number TEXT NOT NULL UNIQUE,
  timestamp DATETIME NOT NULL,
  amount REAL NOT NULL,
  payment_method TEXT NOT NULL,
  operator_name TEXT NOT NULL,
  notes TEXT
);

-- 13. Módulo Sindicato: Personal y Trabajadores
CREATE TABLE IF NOT EXISTS union_workers (
  id TEXT PRIMARY KEY,
  full_name TEXT NOT NULL,
  ci TEXT NOT NULL,
  phone TEXT NOT NULL,
  role TEXT NOT NULL,
  payment_modality TEXT NOT NULL CHECK(payment_modality IN ('monthly', 'biweekly', 'daily', 'per_trip')),
  base_rate REAL NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('active', 'inactive'))
);

-- 14. Módulo Sindicato: Pagos a Trabajadores
CREATE TABLE IF NOT EXISTS union_worker_payments (
  id TEXT PRIMARY KEY,
  worker_id TEXT NOT NULL REFERENCES union_workers(id),
  payment_number TEXT NOT NULL UNIQUE,
  timestamp DATETIME NOT NULL,
  period_or_concept TEXT NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('salary', 'advance', 'bonus', 'travel_allowance')),
  amount REAL NOT NULL,
  payment_method TEXT NOT NULL,
  operator_name TEXT NOT NULL,
  notes TEXT
);

-- 15. Módulo Sindicato: Egresos Operativos Sindicales
CREATE TABLE IF NOT EXISTS union_expenses (
  id TEXT PRIMARY KEY,
  expense_number TEXT NOT NULL UNIQUE,
  timestamp DATETIME NOT NULL,
  category TEXT NOT NULL CHECK(category IN ('rent', 'utilities', 'fuel', 'office_supplies', 'repairs', 'legal', 'other')),
  description TEXT NOT NULL,
  amount REAL NOT NULL,
  payment_method TEXT NOT NULL,
  invoice_or_voucher_number TEXT,
  operator_name TEXT NOT NULL,
  notes TEXT
);
```

---

## 4. Soporte de Impresoras Térmicas en Windows

En agencias con alto flujo no es admisible el diálogo de confirmación `window.print()` ni la rasterización lenta. La arquitectura de impresión contempla dos modalidades integradas:

```
[ Frontend React (Tauri UI) ]
            │  Invoke IPC command: "print_thermal_ticket"
            ▼
[ Tauri Core (Rust Backend) ]
      ┌─────┴─────────────────────────┐
      ▼                               ▼
[ Ruta A: ESC/POS Raw ]     [ Ruta B: Win32 Spooler ]
  Directo a puerto COM /      Vía driver térmico Windows
  USB Virtual COM             (StartDocPrinter / WritePrinter)
      │                               │
      └───────────────┬───────────────┘
                      ▼
          [ Impresora Térmica 80mm ]
```

### 4.1. Conexión Directa USB / Virtual COM (ESC/POS Nativo)
- Se utiliza el crate `serialport` de Rust.
- Emisión directa de secuencias de bytes binarios ESC/POS:
  - Inicialización: `[0x1B, 0x40]`
  - Centrado: `[0x1B, 0x61, 0x01]`
  - Negrita on/off: `[0x1B, 0x45, 0x01]` / `[0x1B, 0x45, 0x00]`
  - Código QR: Comando de código de barras 2D nativo ESC/POS (`GS ( k`)
  - Corte de papel guillotine: `[0x1D, 0x56, 0x41, 0x10]`
- **Ventaja**: Tiempo de respuesta < 50 milisegundos.

### 4.2. Spooler de Impresión de Windows (`winspool.drv`)
- Para impresoras con drivers genéricos USB de Windows (POS-80, Xprinter, Epson TM-T20).
- Tauri invoca la API Win32 `OpenPrinterW`, `StartDocPrinterW`, `WritePrinter` enviando el flujo de bytes RAW sin procesar como documento gráfico.
- Permite configurar impresora por defecto por terminal (ej. Tickets en POS-80 en mostrador, Manifiestos A4 en HP LaserJet de gerencia).

---

## 5. Operación LAN Multi-Terminal en la Misma Agencia

Cuando una agencia de terminal de buses cuenta con 2 o 3 ventanillas de recepción simultáneas y 1 almacenero con tablet o PC de despacho, no se requiere conexión a Internet para operar sincronizados:

### 5.1. Arquitectura Servidor Local Embebido (Agencia Host)
- **Ventanilla 1 (PC Principal / Caja Maestra)**: Ejecuta Tauri con base SQLite y un micro-servidor HTTP/WebSocket ligero en Rust (usando `axum` en el puerto `http://192.168.1.X:8910`).
- **Ventanilla 2 y Almacén (PCs Secundarias)**: Ejecutan la misma aplicación Tauri configurada en modo nodo satélite, apuntando a la IP local de la Ventanilla 1 mediante mDNS (`pachax-agencia.local`).

### 5.2. Prevención de Conflictos y Concurrencia
- **Generación de Códigos**: Los prefijos de guía incorporan el ID de ventanilla o terminal:
  - Ventanilla 1: `ENC-2026-CBB1-00001`
  - Ventanilla 2: `ENC-2026-CBB2-00001`
- Esto evita colisiones de claves primarias sin necesidad de bloqueos distribuidos.
- Las transiciones de estado hacia `dispatched` y `delivered` exigen comprobación optimista con versión de registro (`sync_version = sync_version + 1`).

---

## 6. Sincronización Nube Interdepartamental (Cuando hay Internet)

Cuando se restablece la conexión a Internet:
1. **Outbox Pattern**: Las operaciones locales se apilan en una tabla `sync_outbox` con timestamp y firma hash.
2. **Worker en Segundo Plano**: Cada 60 segundos intenta enviar paquetes de cambios pendientes al Cloud Gateway de PACHAX.
3. **Recepción en Destino**: La agencia de La Paz descarga las guías despachadas desde Cochabamba (`status: dispatched`) y las marca disponibles para entrega inmediata.
4. **Resiliencia ante Caídas de Red**: Si la red cae a mitad del día, la sucursal sigue recibiendo encomiendas y cobrando cuotas sindicales localmente sin ninguna interrupción.

---

## 7. Plan de Contingencia, Recuperación de Energía y Actualizaciones

1. **Cortes Eléctricos Imprevistos**:
   - SQLite configurado en modo `WAL` (`Write-Ahead Logging`). Las transacciones pendientes en memoria se completan o retroceden limpiamente sin corromper el archivo `.sqlite3`.
   - Recuperación automática en el siguiente arranque con `PRAGMA integrity_check`.
2. **Copias de Seguridad Automatizadas**:
   - Cierre de turno de caja genera un volcado local `VACUUM INTO 'backups/backup-YYYY-MM-DD-HHmm.sqlite3'`.
   - Si se inserta una memoria USB autorizada, se copia automáticamente una réplica encriptada AES-256.
3. **Actualizaciones de la Aplicación**:
   - Tauri v2 Auto-updater con verificación de firma digital ED25519.
   - Las actualizaciones descargan binarios delta en segundo plano y aplican migraciones SQL reversibles (`PRAGMA user_version`) de forma silenciosa al reiniciar.
