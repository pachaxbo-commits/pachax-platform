# PACHAX

Base independiente para una plataforma de negocios. Categoría inicial: **Producción y distribución**.

**Antes de continuar, leer [CONTEXTO.md](CONTEXTO.md), [AGENTS.md](AGENTS.md) y [docs/CONFIGURACION.md](docs/CONFIGURACION.md).**

Estado: conexión de producción pendiente. `npm run build` compila una app que indica que falta configurar Firebase. No hay proyecto remoto ni usuarios reales creados.

## Desarrollo local

1. `npm ci` y `npm ci --prefix functions`.
2. Node 22 para las funciones, Java 21 y Firebase CLI disponibles.
3. `npm run emulators` en una terminal.
4. `npm run seed:demo` en otra terminal. Solo datos ficticios en emuladores.
5. `npm run dev:emulator` y abrir http://localhost:5190.

Usuarios de demostración: `admin@example.test`, `almacen@example.test`, `distribuidor.a@example.test`, `distribuidor.b@example.test`, `soporte@example.test`. Clave local: `demo1234`. Nunca utilizar estas cuentas ni esta clave en producción.

Pruebas: `npm run test:distribution`, `npm run test:reports`, `npm run test:rules` (requiere los emuladores activos), `npm run build`.

Android: `npx cap sync android`, luego desde `android`, `gradlew.bat assembleDebug`. Identificador: `com.pachax.app`; firma de producción pendiente.
