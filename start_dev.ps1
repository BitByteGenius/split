# ─── SplitWise Pro – Dev Startup Script ──────────────────────────────────────
# Run this script once before starting development:
#   powershell -ExecutionPolicy Bypass -File .\start_dev.ps1

$adb = "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe"

Write-Host "`n🔍  Checking connected devices..." -ForegroundColor Cyan
& $adb devices

Write-Host "`n🔗  Setting up USB tunnel (adb reverse)..." -ForegroundColor Cyan
& $adb reverse tcp:5001 tcp:5001
& $adb reverse tcp:5000 tcp:5000
& $adb reverse --list
Write-Host "✅  Tunnel active: device localhost:5001 → PC localhost:5001" -ForegroundColor Green

Write-Host "`n🚀  Starting backend..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PSScriptRoot\backend'; node server.js" -WindowStyle Normal

Write-Host "⏳  Waiting 3 seconds for backend to initialise..." -ForegroundColor Yellow
Start-Sleep -Seconds 3

Write-Host "`n📱  Launching Flutter app..." -ForegroundColor Cyan
Set-Location "$PSScriptRoot\split"
flutter run --device-id RZCY71L5F0K
