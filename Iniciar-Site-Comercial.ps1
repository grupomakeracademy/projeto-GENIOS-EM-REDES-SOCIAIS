$commercialRoot = Join-Path $PSScriptRoot 'apps\commercial'
$commercialLogDir = Join-Path $PSScriptRoot '.local-logs'
New-Item -ItemType Directory -Path $commercialLogDir -Force | Out-Null
try {
  $commercialResponse = Invoke-WebRequest -Uri 'http://127.0.0.1:3000' -TimeoutSec 3
  if ($commercialResponse.StatusCode -eq 200) { Write-Host 'Site disponível: http://127.0.0.1:3000'; exit 0 }
} catch {}
$commercialNode = (Get-Command node.exe).Source
$commercialNext = Join-Path $PSScriptRoot 'node_modules\next\dist\bin\next'
$commercialNextQuoted = '"' + $commercialNext + '"'
$commercialMode = if (Test-Path (Join-Path $commercialRoot '.next\BUILD_ID')) { 'start' } else { 'dev' }
Start-Process -FilePath $commercialNode -ArgumentList @($commercialNextQuoted, $commercialMode, '--hostname', '127.0.0.1', '--port', '3000') -WorkingDirectory $commercialRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $commercialLogDir 'commercial.out.log') -RedirectStandardError (Join-Path $commercialLogDir 'commercial.err.log') | Out-Null
Write-Host 'Iniciando site comercial em http://127.0.0.1:3000'
