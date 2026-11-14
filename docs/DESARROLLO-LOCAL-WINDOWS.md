# Guía de Desarrollo Local — Windows 10 (`C:\PROYECTOS PACHAX\PACHAX`)

Guía breve verificada tras la reinstalación de Windows 10 sobre SSD para compilar, probar y operar **PACHAX Platform** localmente de forma segura sin afectar a Production.

---

## 1. Ruta y Repositorio

- **Workspace principal**: `C:\PROYECTOS PACHAX\PACHAX`
- **Repositorio GitHub**: `pachaxbo-commits/pachax-platform`
- **Rama base de referencia**: `origin/main` (integrar únicamente mediante rama propia + Pull Request; nunca hacer push directo ni desplegar desde ramas de trabajo sin autorización).
- **Configuración Git recomendada**:
  - Verificar rama antes de editar: `git branch --show-current`
  - Revisar estado: `git status --short`

> [!IMPORTANT]
> No modificar la instalación heredada en `G:/pachax-comandero` ni tocar worktrees ajenos dentro de `C:\PROYECTOS PACHAX\_worktrees`.

---

## 2. Herramientas Verificadas

| Herramienta | Estado en esta máquina | Uso principal |
| :--- | :--- | :--- |
| **Node.js** | `v26.13.0` (`functions/package.json` declara `engines.node: "22"`) | Runtime web/tests locales; Cloud Functions apunta a Node 22 |
| **npm** | `11.20.0` | Gestión de dependencias (`npm ci`) |
| **Java (Temurin)** | `21.0.13 LTS` (`OpenJDK 21.0.13+9`) | Firebase Emulator Suite (Firestore, Auth, Storage) |
| **Firebase CLI** | `15.35.0` | Emuladores locales (`demo-pachax-platform`) |
| **Vercel CLI** | `65.14.0` | Previews / inspección (no desplegar sin autorización) |
| **Git & GitHub CLI (`gh`)** | `Git 2.56.1` + `gh` autenticado (`pachaxbo-commits`) | Flujo de ramas y Draft PRs |
| **VS Code** | `1.145.3` | Editor principal |
| **Playwright** | `1.65.1` | Pruebas E2E de navegador cuando apliquen |
| **Python / WSL 2 / Docker** | `Python 3.14.10`, `WSL 2` (`docker-desktop`), `Docker 29.9.3` | Disponibles en Windows (no requeridos para build web ni emuladores base) |

### Variables locales (`.env.local`)

El archivo `.env.local` en la raíz debe conservar las 8 claves públicas `VITE_FIREBASE_*` del proyecto de desarrollo/demo y no debe subirse al repositorio. Nunca imprimir ni copiar secretos en commits o documentación.

---

## 3. Instalación Reproducible de Dependencias

Desde la raíz `C:\PROYECTOS PACHAX\PACHAX`:

```powershell
# Dependencias del frontend / plataforma (cuando cambie package-lock.json)
npm ci

# Dependencias de Cloud Functions (Node 22)
npm ci --prefix functions
```

---

## 4. Comandos Diarios de Verificación (PowerShell)

> En PowerShell 5.1 usar `; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }` en lugar de `&&`.

### Typecheck, Lint y Builds sin tocar Production

```powershell
npm run typecheck
npm run build:functions-core
npm run build:rules
npm run build:emulator
```

### Tests de Plataforma y Emuladores (`demo-pachax-platform`)

```powershell
# Contratos comerciales del catálogo
npm run test:commercial-catalog-contract

# Suite de seguridad y lógica Platform
npm run test:platform

# Prueba de QR oficial en Firebase Auth/Firestore/Storage Emulators
npm run test:commercial-qr-storage

# Prueba de tipo de cambio referencial BOB/USD en Firestore Emulator
firebase emulators:exec --only firestore --project demo-pachax-platform "node functions/tests/exchangeRateConfig.test.cjs"
```

### Limpieza tras ejecutar emuladores o `build:emulator`

- Eliminar logs locales generados por el emulador (`firestore-debug.log`, `firebase-debug.log`, `ui-debug.log`) si aparecen en `git status`.
- Si `npm run build:emulator` o `build:rules` modifica archivos de manifiesto o saltos de línea sin cambios funcionales reales, revisarlos con `git diff` antes de hacer commit.

---

## 5. Reglas de Oro de Seguridad Local

1. **Toda prueba con escrituras** debe ejecutarse contra el proyecto ficticio `demo-pachax-platform` en emuladores locales.
2. **Prohibido** ejecutar seeds o tests de escritura contra `pachax-platform` (Production).
3. **No ejecutar** `firebase deploy` ni `vercel --prod` desde el entorno local sin instrucción explícita y validación previa de proyecto activo.
