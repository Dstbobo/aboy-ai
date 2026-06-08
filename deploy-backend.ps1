# deploy-backend.ps1
# One-shot Railway backend deploy — run from C:\Users\dstag\legalbridge
# Usage: .\deploy-backend.ps1

$ErrorActionPreference = "Stop"
$SERVICE_ID = "9d7c9935-1da8-4eda-8d72-90ad2d19d297"

Write-Host ""
Write-Host "=== Aboy AI Backend Deploy ===" -ForegroundColor Cyan

# Check Railway CLI
if (-not (Get-Command railway -ErrorAction SilentlyContinue)) {
    Write-Host "Installing Railway CLI..." -ForegroundColor Yellow
    npm install -g @railway/cli
}

# Login
Write-Host ""
Write-Host "Step 1/2: Logging in to Railway (browser will open)..." -ForegroundColor Yellow
railway login

# Deploy
Write-Host ""
Write-Host "Step 2/2: Uploading backend to Railway..." -ForegroundColor Yellow
Set-Location "$PSScriptRoot\backend"
railway up --service $SERVICE_ID

Write-Host ""
Write-Host "=== Deploy triggered! Railway is building. ===" -ForegroundColor Green
Write-Host "Check: https://fantastic-possibility-production-f4fa.up.railway.app/health" -ForegroundColor Cyan
Write-Host "Expected response after build: {""status"":""ok"",""auth"":""httpx-v2""}" -ForegroundColor Cyan
