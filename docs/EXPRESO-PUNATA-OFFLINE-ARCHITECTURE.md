# S.M.T. EXPRESO PUNATA — ESPECIFICACIÓN TÉCNICA DE ARQUITECTURA OFFLINE-FIRST

**Fecha de documento:** Octubre 2026  
**Cliente:** Sindicato Mixto de Transportistas "Expreso Punata" (S.M.T.)  
**Localidad:** Punata, Valle Alto de Cochabamba, Bolivia  
**Plataforma Base:** PACHAX Platform — Módulo Encomiendas & Edición Sindicato  
**Estado:** Especificación Técnica de Ingeniería para Despliegue en Estación Local  

---

## 1. Resumen Ejecutivo y Entorno Operativo

### 1.1 Contexto Real de Operación
El **Sindicato Mixto de Transportistas Expreso Punata** opera servicios continuos las 24 horas del día conectando el Valle Alto cochabambino (Parada Central Punata, Av. Aroma esq. Sucre / Av. Gualberto Villarroel) con la ciudad de Cochabamba (Av. República esq. 6 de Agosto), Cliza, y despachos interdepartamentales hacia Santa Cruz (Terminal Bimodal) y La Paz (Terminal Central).

La realidad de infraestructura de telecomunicaciones en las agencias de provincia presenta:
1. **Intermitencia y microcortes de Internet**: Frecuentes pérdidas de conectividad por cortes de fibra óptica, saturación de red celular o inclemencias climáticas en el Valle Alto.
2. **Cero tolerancia al retraso en ventanilla**: Un vehículo o surubí no puede demorar su salida; las guías y manifiestos de encomiendas deben imprimirse en menos de 2 segundos.
3. **Múltiples ventanillas en simultáneo**: En horas pico (feria de Punata los martes y jueves, madrugadas y fines de semana), hasta 3 operadores atienden cobros de encomiendas, registro de sobres y recepción de aportes de socios sobre la misma red local (LAN).

### 1.2 Principio Rector: Offline-First Indestructible
El sistema de escritorio no puede ser una simple página web empaquetada que dependa de un servidor en la nube para funcionar. La venta, cobro, asignación de manifiestos, control de caja y recibos sindicales **deben funcionar al 100% sin conexión a Internet**. Cuando la conexión a Internet está disponible, el sistema sincroniza asíncronamente con la nube central de PACHAX para consolidación gerencial y seguimiento de tracking web por parte de remitentes y destinatarios.

---

## 2. Stack Tecnológico de Escritorio

```
+--------------------------------------------------------------------------+
|                     PACHAX Desktop (Tauri v2)                           |
+--------------------------------------------------------------------------+
|  Capa Visual: React 19 + TypeScript + Tailwind CSS (Vite Bundler)        |
|  Motor Local: ParcelDomain Engine + Sindicato Logic (TypeScript/Rust)    |
+--------------------------------------------------------------------------+
|  IPC Bridge (Tauri IPC de Alta Velocidad, Cero Fugas de Memoria)        |
+--------------------------------------------------------------------------+
|  Core de Escritorio (Rust nativo):                                       |
|   - Driver ESC/POS Directo (Raw USB / TCP Socket Port 9100)              |
|   - Driver Gaveta de Dinero (RJ11 Kick Pulse Pin 2 / Pin 5)              |
|   - SQLite con Write-Ahead Logging (WAL) + Cifrado AES-256 (SQLCipher)    |
|   - Servidor Local mDNS / HTTP REST LAN para Terminales Secundarias      |
|   - Cola Transaccional de Sincronización en Segundo Plano                |
+--------------------------------------------------------------------------+
```

### 2.1 Por qué Tauri v2 y no Electron
1. **Consumo mínimo de memoria RAM**: ~40 MB frente a los 400-800 MB de Electron. Esto permite ejecutar la aplicación en computadoras de punto de venta (POS) existentes en agencia con procesadores Core i3 / Celeron y 4 GB de RAM bajo Windows 10/11.
2. **Arranque instantáneo (< 1.2 segundos)**: El operador enciende la máquina y el sistema está listo de inmediato para recibir envíos.
3. **Binario compilado nativo**: El backend en Rust interactúa directamente con los puertos COM, USB e impresoras de red sin capas intermedias ni emuladores.

---

## 3. Topología de Red y Persistencia de Datos

### 3.1 Modalidades de Despliegue en Agencia

#### Opción A: Estación Monopuesto (Agencias Menores / Parada Intermedia)
* **Hardware:** 1 PC o Laptop con Windows 10/11.
* **Almacenamiento:** Base de datos SQLite embebida local (`punata_agency.db`), con `PRAGMA journal_mode = WAL;` y `PRAGMA synchronous = NORMAL;`.
* **Periféricos:** Impresora térmica USB de 80mm + Lector de código de barras USB.

#### Opción B: Red Local Multi-Puesto (Parada Central Punata / Terminal Cochabamba)
* **Arquitectura:** Topología Líder-Seguidor Local (Local Master-Worker).
* **Equipo Servidor Local (Líder):** La PC de la Ventanilla Principal o el equipo de Administración actúa como Host Local.
  - Ejecuta el motor embebido SQLite WAL / Embedded PostgreSQL escuchando en el puerto LAN seguro (ej. `192.168.1.100:8443`).
  - Anuncia su presencia mediante mDNS (`expreso-punata-central.local`).
* **Equipos Secundarios (Ventanilla 2, Ventanilla 3, Balanza):**
  - La aplicación Tauri detecta automáticamente al Líder en la LAN.
  - Todas las operaciones de encomiendas y caja se ejecutan mediante transacciones ACID sobre el host local a través de la LAN con latencia < 3 ms.
  - Si se corta el cable de red o el router Wi-Fi cae, cada equipo secundario pasa a modo "Cola Local de Contingencia" y reconcilia automáticamente con el Líder al restablecerse la conexión de red local.

---

## 4. Hardware y Periféricos Soportados

### 4.1 Impresión Térmica Directa ESC/POS (80mm y 58mm)
El sistema prescinde del diálogo de impresión lento de Windows (`window.print()`). El motor de Rust envía comandos raw ESC/POS directos al spooler de Windows (`winspool.drv`) o directamente vía socket TCP (puerto 9100) para impresoras de red:
1. **Comprobante de Recepción de Encomienda (80mm)**:
   - Encabezado con logotipo del sindicato renderizado en mapa de bits monocromo optimizado (comando `ESC * 33` o `GS v 0`).
   - Código de barras Code128 / QR nativo de alta velocidad para escaneo rápido en destino.
   - Detalle de origen, destino, remitente, consignatario, contenido y estado de pago (Pagado / Por Cobrar).
   - Doble copia automática (Copia Remitente / Copia Pegada al Paquete) con comando de corte de papel (`GS V 66 0`).
2. **Apertura Automática de Gaveta de Dinero (Cash Drawer Kick)**:
   - Pulso eléctrico estándar (`ESC p 0 25 250`) activado en cobros en efectivo y aperturas de caja autorizadas.
3. **Manifiesto de Carga y Despacho (A4 o 80mm)**:
   - Lista compacta de bultos con firma del chofer/socio asignado, placa de vehículo y número de interno.
4. **Recibo Sindical de Aportes y Cuotas (80mm)**:
   - Emisión de comprobante de aporte mensual, fondo pro-sede y multas con numeración correlativa inalterable.

### 4.2 Lectores de Código de Barras y QR
- Modo emulación de teclado USB (HID Keyboard) o Virtual COM.
- Prefijo de captura rápida que identifica el código de seguimiento (ej. `PUN-2026-XXXXX`) en cualquier pantalla activa sin requerir que el cursor esté posicionado en un campo específico.

---

## 5. Resiliencia, Sincronización y Cero Pérdida de Datos

### 5.1 Motor de Sincronización Asíncrona (Sync Queue)
```
[Operación Local en Ventanilla]
              │
              ▼
   [Transacción Local SQLite] ──► (Guía Creada / Imprimió Ticket en 0.5s)
              │
              ▼
    [Outbox Queue Local] ───────► (Registro en cola: sync_status = 'pending')
              │
              ├─── (¿Hay Internet hacia PACHAX Cloud?)
              │         │
             SÍ         NO ──► Espera con backoff exponencial
              ▼
   [Envío por Lotes HTTPS]
   [API Gateway PACHAX Platform]
              │
              ▼
  [Aceptación del Servidor Cloud]
              │
              ▼
   [Marcar: sync_status = 'synced', remote_id, synced_at]
```

### 5.2 Resolución de Conflictos (Deterministic Resolution)
1. **Encomiendas:** Las guías generadas en local tienen un UUID inmutable y un correlativo asignado por serie de agencia (ej. `PUN-26-001042`). No existe posibilidad de colisión de numeración entre diferentes agencias (Punata genera `PUN-`, Cochabamba genera `CBB-`, Cliza genera `CLI-`).
2. **Entregas en Destino:** Si una encomienda se entrega mientras la agencia destino está offline, el registro de entrega (con CI y firma de quien retira) se sella localmente con timestamp criptográfico y se sincroniza al reconectar.

---

## 6. Actualizaciones de Software Seguras (Zero Data Loss)

### 6.1 Separación Estricta entre Datos y Binarios
- Los ejecutables se alojan en `C:\Program Files\PACHAX Expreso Punata\`.
- La base de datos, logs, plantillas de impresión y claves se alojan en `C:\ProgramData\PACHAX\ExpresoPunata\data\`.
- La actualización de una versión (ej. de v1.0.2 a v1.0.3) reemplaza únicamente los binarios estáticos; **nunca toca ni sobreescribe el directorio de datos**.

### 6.2 Migraciones de Esquema Versionadas con Rollback
1. Cada versión incluye un catálogo de migraciones incrementales (`001_initial.sql`, `002_add_carrier_fields.sql`).
2. Al iniciar, el motor Rust verifica la versión de base de datos en `PRAGMA user_version`.
3. Si la versión es inferior, ejecuta:
   - `BACKUP DATABASE TO 'punata_agency_pre_migration_backup.db'` (Copia espejo completa).
   - Ejecuta las migraciones dentro de una transacción `BEGIN TRANSACTION; ... COMMIT;`.
   - Si alguna sentencia falla, ejecuta `ROLLBACK;`, restaura la copia espejo y genera una alerta visual para el operador sin bloquear la lectura de datos históricos.

### 6.3 Copias de Seguridad Automáticas (Disaster Recovery)
1. **Respaldo Automático al Cierre de Turno**: Cada vez que el cajero cierra turno (`closeCashShift`), el sistema genera un archivo de respaldo comprimido y cifrado:  
   `expreso_punata_backup_YYYY-MM-DD_HHMM_caja_1.pachaxbackup`.
2. **Doble Destino de Respaldo**:
   - Disco local: `C:\PACHAX_Backups\`.
   - Dispositivo extraíble (Flash Drive / Pendrive): El sistema detecta automáticamente si hay una memoria USB conectada y guarda una copia redundante sin requerir interacción compleja.
3. **Rotación Inteligente**: Conserva los últimos 30 cierres diarios, los últimos 12 respaldos mensuales y descarta archivos antiguos automáticamente para prevenir la saturación del disco duro.

---

## 7. Modelo de Seguridad y Permisos en Estación de Trabajo

### 7.1 Identificación por PIN Rápido del Operador
Para agilizar el cambio de turno en ventanilla sin teclear contraseñas largas ni depender de Firebase Auth en frío:
- Cada operador tiene un PIN numérico de 4 a 6 dígitos con hash Argon2id almacenado localmente.
- Bloqueo automático por inactividad tras 5 minutos de reposo.

### 7.2 Perfiles Operativos en Agencia
| Rol | Operaciones Permitidas | Restricciones |
| :--- | :--- | :--- |
| **Ventanilla / Encomiendas** | Registrar envío, imprimir guía, cobrar flete, registrar entregas, cobrar aportes ordinarios de socios. | No puede anular envíos despachados ni modificar tarifas base sin autorización. |
| **Control de Despachos** | Generar manifiestos de salida, asignar vehículo y chofer, registrar arribos de encomiendas. | No maneja dinero de caja de ventanilla. |
| **Tesorero / Administrador** | Abrir/cerrar caja de agencia, autorizar devoluciones/anulaciones, registrar gastos sindicales, liquidar pagos a choferes, consultar reportes financieros. | Acceso completo local. |
| **Directorio Sindical** | Auditoría de aportes, padrón de socios, reportes consolidados por ruta y periodo. | Perfil de solo lectura y supervisión. |

---

## 8. Arquitectura de Módulos: Core Compartido vs. Perfil de Cliente

Siguiendo las directrices del proyecto PACHAX:
1. **Core Plataforma (`src/modules/parcel/domain/`)**:
   - `parcelEngine.ts`: Lógica matemática de cobro de flete, peso extra, validación de entregas a terceros, liquidación de choferes y conciliación de caja.
   - `parcelDocuments.ts`: Generación canónica de documentos y reportes estándar.
2. **Perfil Expreso Punata (`src/modules/parcel/domain/expresoPunataConfig.ts`, `ExpresoPunataExperience.tsx`)**:
   - Identidad visual corporativa (Verde Selva `#064e3b`, Amarillo Intenso `#facc15`, Escudo S.M.T., Slogan "Somos los Pioneros").
   - Rutas predeterminadas del Valle Alto cochabambino y terminales interdepartamentales.
   - Padrón específico de socios y vehículos.
   - Adaptador a los reportes de plataforma (`expresoPunataReportAdapter.ts`) compatible con el contrato `BusinessReportV1` de Codex.
   - La parametrización comercial (nombre, NIT, teléfonos, dirección, tarifas base) se almacena en el estado local de configuración y es editable en tiempo de ejecución por el administrador de la agencia.
