# Configuración del equipo PACHAX

## Preparar una tarea

```bash
git clone https://github.com/pachaxbo-commits/pachax-platform.git
cd pachax-platform
npm install
npm install --prefix functions
git checkout codex/pachax-platform
git pull --ff-only
git checkout -b feat/nombre-tarea
```

Solicita al responsable de PACHAX el archivo `.env.local` del entorno autorizado. No lo publiques ni lo agregues a Git. Para trabajar únicamente con emuladores usa `npm run dev:emulator`; para el entorno compartido usa `npm run dev` con las variables locales entregadas.

Antes de subir cambios ejecuta las pruebas indicadas por la tarea, como mínimo `npm run typecheck` y `npm run build:emulator`.

## Entregar cambios

```bash
git status
git add <archivos>
git commit -m "tipo: descripción clara"
git push -u origin feat/nombre-tarea
```

Abre un Pull Request hacia la rama indicada por el responsable. No trabajes ni hagas push directamente sobre `main`. Actualiza tu rama antes de comenzar una tarea nueva y evita mezclar cambios ajenos al objetivo.

No modifiques Authentication, Firestore Rules, Storage Rules ni Cloud Functions salvo que la tarea lo pida expresamente. Nunca agregues service accounts, claves privadas, tokens, contraseñas, keystores, APK, backups, datos comerciales ni archivos `.env.local`.
