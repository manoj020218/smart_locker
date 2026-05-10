param(
  [Parameter(Mandatory = $true)]
  [string]$DeviceBaseUrl,
  [int]$DurationSec = 180,
  [int]$IntervalSec = 5,
  [string]$OutCsv = ".\EDGE\firmware\sync_evidence.csv"
)

$ErrorActionPreference = "Stop"

function Read-Json([string]$Url) {
  try {
    $r = Invoke-WebRequest -UseBasicParsing -Uri $Url -TimeoutSec 10
    if ($r.StatusCode -ge 200 -and $r.StatusCode -lt 300) {
      return ($r.Content | ConvertFrom-Json)
    }
    return $null
  } catch {
    return $null
  }
}

$base = $DeviceBaseUrl.TrimEnd("/")
$syncUrl = "$base/api/sync/status"
$healthUrl = "$base/api/health"

$rows = New-Object System.Collections.Generic.List[Object]
$deadline = (Get-Date).AddSeconds($DurationSec)

Write-Host "[sync-evidence] polling $syncUrl for $DurationSec sec (interval $IntervalSec sec)"

while ((Get-Date) -lt $deadline) {
  $now = Get-Date
  $sync = Read-Json $syncUrl
  $health = Read-Json $healthUrl

  $rows.Add([PSCustomObject]@{
    ts_local              = $now.ToString("yyyy-MM-dd HH:mm:ss")
    sync_ok               = [bool]($sync -and $sync.ok)
    sync_enabled          = if ($sync) { $sync.enabled } else { $null }
    sync_error            = if ($sync) { $sync.last_error } else { "fetch_failed" }
    last_remote_cfg       = if ($sync) { $sync.last_remote_config_version } else { $null }
    local_cfg             = if ($sync) { $sync.local_config_version } else { $null }
    last_ack_seq          = if ($sync) { $sync.last_ack_seq } else { $null }
    drift_skipped         = if ($sync) { $sync.drift_skipped } else { $null }
    last_push_accepted    = if ($sync) { $sync.last_push_accepted } else { $null }
    last_push_duplicates  = if ($sync) { $sync.last_push_duplicates } else { $null }
    health_ok             = [bool]($health -and $health.ok)
    wifi_connected        = if ($health) { $health.wifi_connected } else { $null }
    ip                    = if ($health) { $health.ip } else { "" }
    tx_count              = if ($health) { $health.tx_count } else { $null }
  })

  Start-Sleep -Seconds $IntervalSec
}

$dir = Split-Path -Parent $OutCsv
if (-not [string]::IsNullOrWhiteSpace($dir)) {
  New-Item -ItemType Directory -Force -Path $dir | Out-Null
}

$rows | Export-Csv -Path $OutCsv -NoTypeInformation -Encoding UTF8
Write-Host "[sync-evidence] wrote $($rows.Count) rows -> $OutCsv"

