$ErrorActionPreference = 'Stop'
$projectPath = $PSScriptRoot
$serverUrl = 'http://127.0.0.1:3001/login'
$serverRunning = $false
try {
  $response = Invoke-WebRequest -Uri $serverUrl -UseBasicParsing -TimeoutSec 4
  if ($response.StatusCode -eq 200) { $serverRunning = $true }
} catch {}
$nodePath = (Get-Command node.exe -ErrorAction Stop).Source
$serverScript = Join-Path $projectPath 'node_modules\next\dist\bin\next'
if (!(Test-Path -LiteralPath $serverScript)) { throw 'Dependências ausentes. Execute npm install nesta pasta.' }
$logPath = Join-Path $projectPath '.local-logs'
New-Item -ItemType Directory -Path $logPath -Force | Out-Null
if (!$serverRunning) {
  Start-Process -FilePath $nodePath -ArgumentList @(('"' + $serverScript + '"'), 'dev', '--hostname', '127.0.0.1', '--port', '3001') -WorkingDirectory $projectPath -WindowStyle Hidden -RedirectStandardOutput (Join-Path $logPath 'server.log') -RedirectStandardError (Join-Path $logPath 'server-error.log') | Out-Null
}
# Queue consumption starts inside Next.js via src/instrumentation.ts.
# Do not launch a second tsx process: it could die while the application stays up.
Write-Host "Gênios e processamento de conteúdo iniciados. Acesse $serverUrl"
