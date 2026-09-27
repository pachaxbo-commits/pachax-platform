param([ValidateSet('Start', 'Emulators', 'Web', 'Seed')][string]$Mode = 'Start')
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
Set-Location -LiteralPath $projectRoot
$env:Path = "$projectRoot\tmp\local-tools\node_modules\node\bin;$projectRoot\tmp\local-tools\node_modules\.bin;$env:Path"
$env:FIREBASE_EMULATORS_PATH = "$projectRoot\tmp\firebase-emulators"
$env:FUNCTIONS_DISCOVERY_TIMEOUT = '60'
$env:FIREBASE_CLI_DISABLE_UPDATE_CHECK = 'true'
$env:GCLOUD_PROJECT = 'demo-pachax-platform'
function Port-Ready([int]$Port) {
  $client = [System.Net.Sockets.TcpClient]::new()
  try { $client.Connect('127.0.0.1', $Port); return $true } catch { return $false } finally { $client.Dispose() }
}
switch ($Mode) {
  'Emulators' { & npm.cmd run emulators; exit $LASTEXITCODE }
  'Web' { & npm.cmd run dev:emulator -- --host 127.0.0.1 --strictPort; exit $LASTEXITCODE }
  'Seed' { & node scripts/prepare-demo.mjs; exit $LASTEXITCODE }
}
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
foreach ($service in @(@{ Mode = 'Emulators'; Port = 4410 }, @{ Mode = 'Web'; Port = 5190 })) {
  if (!(Port-Ready $service.Port)) {
    $launchArgs = '-NoProfile -ExecutionPolicy RemoteSigned -File "' + $PSCommandPath + '" -Mode ' + $service.Mode
    $process = Start-Process powershell.exe -ArgumentList $launchArgs -WorkingDirectory $projectRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput "$projectRoot/tmp/$($service.Mode)-$stamp.log" -RedirectStandardError "$projectRoot/tmp/$($service.Mode)-$stamp.err.log"
    Write-Host "$($service.Mode): PID $($process.Id)"
  }
}
$deadline = (Get-Date).AddSeconds(120)
while (!(Port-Ready 8185) -or !(Port-Ready 9195) -or !(Port-Ready 5101) -or !(Port-Ready 5190)) {
  if ((Get-Date) -gt $deadline) { throw 'Inicio incompleto. Revisa los logs en tmp.' }
  Start-Sleep -Seconds 1
}
# Function discovery may finish after its HTTP port opens.
for ($attempt = 0; $attempt -lt 30; $attempt++) {
  $ErrorActionPreference = 'Continue'
  & node scripts/prepare-demo.mjs 2> "$projectRoot/tmp/setup-latest.err.log"
  $setupExitCode = $LASTEXITCODE
  $ErrorActionPreference = 'Stop'
  if ($setupExitCode -eq 0) { break }
  if ($attempt -eq 29) { throw 'La configuración demo no terminó. Revisa tmp/setup-latest.err.log.' }
  Start-Sleep -Seconds 2
}
Write-Host 'Aplicación: http://127.0.0.1:5190/ | Studio: http://127.0.0.1:5190/studio'
Write-Host 'Firebase local: http://127.0.0.1:4100/ | Los datos del emulador son temporales.'
