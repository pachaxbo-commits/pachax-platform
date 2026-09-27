# Arranque local protegido para la rama personal de Dario.
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
Set-Location -LiteralPath $projectRoot
$branch = (& git branch --show-current).Trim()
if ($LASTEXITCODE -ne 0 -or $branch -ne 'cambios-dario') { throw "Rama actual: $branch. Se requiere cambios-dario antes de abrir localhost." }
& git fetch --all --prune
if ($LASTEXITCODE -ne 0) { throw 'No se pudo comprobar origin/main. Se detuvo el arranque para evitar una vista desactualizada.' }
& git rev-parse --verify origin/main *> $null
if ($LASTEXITCODE -ne 0) { throw 'No se encontro origin/main.' }
& git merge-base --is-ancestor origin/main HEAD
if ($LASTEXITCODE -ne 0) {
  $changes = & git status --porcelain
  & git merge-base --is-ancestor HEAD origin/main
  if ($LASTEXITCODE -eq 0 -and !$changes) {
    & git merge --ff-only origin/main
    if ($LASTEXITCODE -ne 0) { throw 'No se pudo actualizar cambios-dario por avance directo.' }
  } else {
    throw 'cambios-dario necesita integrar origin/main. Hay cambios propios o trabajo sin guardar; resuelve la integracion segura antes de abrir localhost.'
  }
}
$branch = (& git branch --show-current).Trim()
& git merge-base --is-ancestor origin/main HEAD
if ($branch -ne 'cambios-dario' -or $LASTEXITCODE -ne 0) { throw 'No se confirmo la rama personal sincronizada.' }
& "$projectRoot\scripts\start-local.ps1"
if ($LASTEXITCODE -ne 0) { throw 'No se pudo iniciar PACHAX.' }
try {
  $response = Invoke-WebRequest 'http://localhost:5190/' -UseBasicParsing -TimeoutSec 8
  if ($response.StatusCode -ne 200) { throw 'Respuesta inesperada.' }
} catch { throw "El servidor local no responde: $($_.Exception.Message)" }
Write-Host 'Rama: cambios-dario | Sincronizada: SI | Servidor: ACTIVO | URL: http://localhost:5190/'
Start-Process 'http://localhost:5190/'
