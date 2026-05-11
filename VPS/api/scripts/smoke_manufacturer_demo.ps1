param(
  [string]$BaseUrl = "https://smartlocker.iotsoft.in",
  [string]$Identifier = "mfr.demo.smarthub@iotsoft.in",
  [string]$Password = "MfrDemo#2026",
  [string]$OwnerEmail = "",
  [string]$OwnerPassword = "Owner#12345",
  [string]$CabinetId = "",
  [string]$CabinetName = "Demo Cabinet",
  [string]$CabinetLocation = "Demo Site",
  [string]$CabinetMode = "DEMO",
  [string]$FcmToken = ""
)

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$apiRoot = Resolve-Path (Join-Path $scriptDir "..")

$env:BASE_URL = $BaseUrl
$env:MFR_IDENTIFIER = $Identifier
$env:MFR_PASSWORD = $Password
if ($OwnerEmail) { $env:OWNER_EMAIL = $OwnerEmail }
if ($OwnerPassword) { $env:OWNER_PASSWORD = $OwnerPassword }
if ($CabinetId) { $env:CABINET_ID = $CabinetId }
if ($CabinetName) { $env:CABINET_NAME = $CabinetName }
if ($CabinetLocation) { $env:CABINET_LOCATION = $CabinetLocation }
if ($CabinetMode) { $env:CABINET_MODE = $CabinetMode }
if ($FcmToken) { $env:FCM_TOKEN = $FcmToken }

Push-Location $apiRoot
try {
  if (Get-Command pnpm -ErrorAction SilentlyContinue) {
    pnpm run smoke:manufacturer
  } else {
    npm run smoke:manufacturer
  }
} finally {
  Pop-Location
}
