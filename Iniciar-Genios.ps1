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
$workerScript = Join-Path $projectPath 'scripts\worker.ts'
$workerPidFile = Join-Path $logPath 'worker.pid'
$workerRunning = $false
if (Test-Path -LiteralPath $workerPidFile) {
  $workerProcessId = 0
  if ([int]::TryParse((Get-Content -LiteralPath $workerPidFile -Raw).Trim(), [ref]$workerProcessId)) {
    $workerProcess = Get-CimInstance Win32_Process -Filter "ProcessId = $workerProcessId" -ErrorAction SilentlyContinue
    $workerRunning = $workerProcess -and $workerProcess.Name -eq 'node.exe' -and $workerProcess.CommandLine.Contains($workerScript)
  }
}
if (!$workerRunning) {
  $worker = Start-Process -FilePath $nodePath -ArgumentList @('--env-file=.env.local','--import','tsx',('"' + $workerScript + '"')) -WorkingDirectory $projectPath -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $logPath 'worker.log') -RedirectStandardError (Join-Path $logPath 'worker-error.log')
  Set-Content -LiteralPath $workerPidFile -Value $worker.Id
}
Write-Host "Gênios e processamento de conteúdo iniciados. Acesse $serverUrl"
