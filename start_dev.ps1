# SplitWise Pro dev startup script
# Run this script once before starting development:
#   powershell -ExecutionPolicy Bypass -File .\start_dev.ps1

$adb = "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe"
$backendPort = 5000
$backendUrl = "http://localhost:$backendPort/health"

Write-Host "`nChecking connected devices..." -ForegroundColor Cyan
& $adb devices

Write-Host "`nSetting up USB tunnel (adb reverse)..." -ForegroundColor Cyan
& $adb reverse tcp:$backendPort tcp:$backendPort
& $adb reverse --list
Write-Host "Tunnel active: device localhost:$backendPort -> PC localhost:$backendPort" -ForegroundColor Green

Write-Host "`nStarting backend..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PSScriptRoot\backend'; node server.js" -WindowStyle Normal

Write-Host "Waiting for backend health check..." -ForegroundColor Yellow
$backendReady = $false
for ($i = 1; $i -le 30; $i++) {
    try {
        $response = Invoke-WebRequest -UseBasicParsing -Uri $backendUrl -TimeoutSec 2
        if ($response.StatusCode -eq 200) {
            $backendReady = $true
            break
        }
    } catch {
        Start-Sleep -Seconds 1
    }
}

if (-not $backendReady) {
    Write-Host "Backend did not become ready at $backendUrl. Check the backend terminal for errors." -ForegroundColor Red
    exit 1
}

Write-Host "Backend ready at $backendUrl" -ForegroundColor Green

Write-Host "`nLaunching Flutter app..." -ForegroundColor Cyan
Set-Location "$PSScriptRoot\split"
flutter run --device-id RZCY71L5F0K
