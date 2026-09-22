# Configuración del equipo PACHAX

## Preparar una tarea

```bash
git clone https://github.com/pachaxbo-commits/pachax-platform.git
cd pachax-platform
npm install
git checkout main
git pull --ff-only
```

### Entorno visual de desarrollo (PACHAX Studio)

Para trabajar en la interfaz de usuario, plantillas y experiencia visual:

```bash
npm run studio
```

Esto abrirá **PACHAX Studio** en `/studio`.

> [!NOTE]
> Los desarrolladores y diseñadores que trabajen **únicamente en UI, plantillas y componentes visuales NO necesitan** `.env.local`, emuladores de Firebase, Cloud Functions ni cuentas de usuario reales. PACHAX Studio y las rutas de demostración (`/demo/...`) operan con datos mock y de demostración completamente aislados.

### Trabajo con backend / Emuladores (desarrolladores de núcleo)

Si vas a trabajar en reglas, Cloud Functions o persistencia multiempresa:
```bash
npm install --prefix functions
```
Solicita al responsable de PACHAX el archivo `.env.local` del entorno autorizado. No lo publiques ni lo agregues a Git. Para trabajar con emuladores usa `npm run dev:emulator`; para el entorno compartido usa `npm run dev` con las variables locales entregadas.

### Crear rama de trabajo

```bash
git checkout -b feat/nombre-tarea
```

Antes de subir cambios ejecuta las pruebas del proyecto: `npm run typecheck`, `npm run test:platform`, `npm run test:distribution` y `npm run build`.

## Despliegues en Vercel (Preview Deployments)

PACHAX Studio incluye protección para no quedar expuesto inadvertidamente en Production:
- **Local / Dev**: Studio está disponible automáticamente.
- **Vercel Preview Deployments**: Habilitar en el dashboard de Vercel la variable de entorno:
  `VITE_ENABLE_TEAM_STUDIO=true`
  (asignándola exclusivamente al Environment: *Preview*).
- **Vercel Production**: Sin la variable o con valor `false`, Studio se encuentra bloqueado. Las rutas públicas de `/demo/...` siempre permanecen accesibles para potenciales clientes.

## Entregar cambios

```bash
git status
git add <archivos>
git commit -m "tipo: descripción clara"
git push -u origin feat/nombre-tarea
```

Abre un Pull Request hacia la rama indicada por el responsable. **No trabajes ni hagas push directamente sobre `main` sin validación.** Actualiza tu rama antes de comenzar una tarea nueva y evita mezclar cambios ajenos al objetivo.

No modifiques Authentication, Firestore Rules, Storage Rules ni Cloud Functions salvo que la tarea lo pida expresamente. Nunca agregues service accounts, claves privadas, tokens, contraseñas, keystores, APK, backups, datos comerciales ni archivos `.env.local`.
