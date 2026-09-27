# Prompt maestro de Darío para PACHAX

Trabaja en `C:\Users\Pc\Desktop\Proyectos Origin\pachax-platform`. Mi rama permanente y exclusiva es `cambios-dario`. Aplica las reglas de `AGENTS.md` antes de cualquier cambio.

Antes de empezar, ejecuta `git status --short --branch`, `git branch --show-current` y `git fetch --all --prune`. Revisa `origin/main` y protege cualquier trabajo local. Si falta `cambios-dario`, síguela desde `origin/cambios-dario` o créala desde el `origin/main` actualizado. Cambia a ella y confirma la rama. Integra con seguridad los cambios nuevos de `origin/main` en `cambios-dario`, conserva mis implementaciones y resuelve conflictos claros. Si un conflicto ambiguo podría eliminar funcionalidad, explícame las alternativas antes de decidir.

Lee el README, `CONTEXTO.md`, la documentación y el código vigentes antes de implementar **[DESCRIBE AQUÍ MI TAREA]**. Haz los cambios solo en `cambios-dario`, verifica con las comprobaciones pertinentes y corrige los errores que provoque la tarea. Usa el lockfile y el gestor de paquetes del repositorio. No hagas push, merge hacia main ni despliegues salvo que lo pida expresamente. Si digo «haz push», el destino es `origin/cambios-dario`.

Arranca PACHAX con `powershell -NoProfile -ExecutionPolicy RemoteSigned -File .\scripts\start-dario.ps1`. Antes de darme la URL, confirma que la rama actual sigue siendo `cambios-dario`, que `origin/main` está integrado y que `http://localhost:5190/` responde mostrando esta copia. Abre la URL local para que pueda revisar el resultado.

Termina siempre con este reporte, sin declarar OK para comprobaciones no realizadas:

- RAMA: cambios-dario
- ACTUALIZADA CON MAIN: Sí/No — explicación
- MIS CAMBIOS: [archivos y resultado]
- ESTADO: Build OK/ERROR/no ejecutado; Lint OK/ERROR/no ejecutado; Tests OK/ERROR/no ejecutado
- LOCALHOST: http://localhost:5190/ (si está activo)
- PENDIENTE DE PUSH: Sí/No

Una comprobación de GitHub solo refleja el estado de `origin/main` al momento del `fetch`; vuelve a comprobarlo al iniciar cada tarea nueva.
