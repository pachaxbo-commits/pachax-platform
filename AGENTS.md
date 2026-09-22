# Instrucciones para continuar PACHAX

## Inicio y cierre de cada tarea

- Leer `CONTEXTO.md`, `docs/CONFIGURACION.md` y la documentación técnica relacionada antes de modificar el proyecto.
- Ejecutar al inicio `git status`, `git branch --show-current` y `git fetch origin`. Comparar la rama actual con `origin/main` y revisar los cambios recientes relevantes.
- Si el árbol está limpio y los cambios de `main` son necesarios para la tarea, integrar `git merge origin/main` dentro de la rama de trabajo. No ejecutar `git pull` a ciegas con cambios locales.
- Cada tarea se desarrolla en una rama propia. No trabajar directamente en `main` ni hacer merge a `main` salvo petición explícita del responsable.
- Nunca usar force push, sobrescribir trabajo ajeno ni resolver conflictos con `ours` o `theirs` de forma global. Resolver archivo por archivo y preservar el trabajo válido de ambas ramas.
- Antes de entregar, repetir `git status` y `git fetch origin`, comparar con `origin/main`, integrar lo relevante cuando corresponda, ejecutar las pruebas apropiadas y subir la rama.

## Límites del repositorio

- Este repositorio es PACHAX. La instalación original del cliente está en `G:/pachax-comandero` y no se debe modificar desde este proyecto.
- No copiar credenciales, datos, APK, firmas, informes ni recursos gráficos del proyecto de origen.
- Todas las pruebas de escritura deben ejecutarse en `demo-pachax-platform` y sus emuladores.
- No desplegar hasta configurar y verificar explícitamente el nuevo proyecto remoto. No usar un proyecto Firebase ambiguo.

## Single Canonical Template Experience

- Cada plantilla tiene una única interfaz visual canónica, reutilizada en producción, PACHAX Studio y demo pública. Solo cambian los adaptadores de datos, sesión, permisos, tenant, mocks y efectos externos.
- Mapeo vigente: `route_distribution` -> `DistributionExperience`; `restaurant_pos` -> `RestaurantExperience`; `gelateria_weight_cafe` -> `QuickRetailExperience` pendiente.
- No crear interfaces paralelas para Studio o demo. Si cambia una pantalla real de una plantilla, Studio y demo deben consumir el mismo componente canónico.
- Producción/Distribución y Restaurante ya tienen experiencias canónicas conectadas en `main`. No afirmar que Comercio/Venta rápida, toda la plataforma multiempresa ni cada módulo estén terminados sin verificar la cadena funcional y de seguridad completa.
- Conservar los componentes compartidos hasta analizar dependencias y probar sus sustitutos.

## Criterio obligatorio de funcionalidad completa

- Una pantalla visual no convierte una función en terminada. Toda operación debe completar esta cadena:

  `UI -> contrato de dominio -> repositorio/gateway -> permisos -> Rules/Function -> aislamiento tenant -> auditoría cuando corresponda -> pruebas positivas y negativas`.

- Solo marcar una función como terminada cuando UI, datos reales, autorización, aislamiento tenant, seguridad y pruebas estén comprobados.
- Mantener coordinados los contratos de frontend, Functions, Rules y pruebas. No cambiar paths, roles o campos en una sola capa.
- Al retomar un módulo, hacer primero `git fetch origin`, revisar los commits recientes de `main` y mapear lecturas, escrituras, roles, Rules, Functions, auditoría y pruebas antes de implementar.
- No copiar Rules de Distribución de forma literal a otra plantilla. Modelar los permisos y límites propios del dominio.
- No confiar en `tenantId`, rol, owner, totales, precios, descuentos, estados ni permisos enviados por el cliente cuando el servidor pueda derivarlos o validarlos.
- Auditar especialmente productos, usuarios, inventario, clientes, caja, turnos, mesas, pedidos, cocina y configuración; las operaciones sensibles requieren validación server-side y pruebas negativas.
- La lista operativa y el formato de auditoría están en `docs/SECURE-FEATURE-CHECKLIST.md`.

## Estado y documentación

- El onboarding seguro conserva el flujo Auth Client -> `completeOnboarding` -> perfil/tenant/owner/link/roles/branch principal/auditoría. Su contrato está en `docs/REGISTER-ONBOARDING-CONTRACT.md`; no conectar `/register` sin una tarea explícita.
- Un `platformOperator` activo no puede usar `completeOnboarding`. Antes del bootstrap real se debe decidir entre identidades separadas para Platform y tenant owner, o un flujo administrativo explícito. No debilitar esta restricción.
- Diseñar para celulares y tablets; usar textos legibles, palabras completas, formularios compactos y selección visual.
- Actualizar `CONTEXTO.md` con avances, pruebas, decisiones y pendientes para el siguiente chat. Conservar el historial y distinguir claramente el checkpoint vigente de los estados anteriores.
