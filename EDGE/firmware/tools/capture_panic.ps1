param(
    [string]$Port = "COM12",
    [int]$Baud = 115200,
    [int]$DurationSec = 25,
    [string]$ElfPath = ".pio/build/esp32-c3-devkitm-1/firmware.elf"
)

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$fwDir = Split-Path -Parent $root
$elfAbs = Join-Path $fwDir $ElfPath
$logDir = Join-Path $fwDir "logs"
if (-not (Test-Path $logDir)) {
    New-Item -ItemType Directory -Path $logDir | Out-Null
}
$stamp = Get-Date -Format "yyyyMMdd_HHmmss"
$logPath = Join-Path $logDir "panic_capture_$stamp.log"

Write-Host "[CAPTURE] Port=$Port Baud=$Baud Duration=${DurationSec}s"
Write-Host "[CAPTURE] Log=$logPath"

$serial = New-Object System.IO.Ports.SerialPort $Port, $Baud, "None", 8, "one"
$serial.ReadTimeout = 250
$serial.Open()

$panicSeen = $false
$panicAt = Get-Date
$end = (Get-Date).AddSeconds($DurationSec)
$lines = New-Object System.Collections.Generic.List[string]

try {
    while ((Get-Date) -lt $end) {
        try {
            $line = $serial.ReadLine().TrimEnd("`r", "`n")
            if ([string]::IsNullOrWhiteSpace($line)) {
                continue
            }
            $lines.Add($line)
            Write-Host $line

            if ($line -match "Guru Meditation Error|panic'ed|assert failed|Load access fault|Store access fault|IllegalInstruction|abort\(\) was called|register dump") {
                if (-not $panicSeen) {
                    $panicSeen = $true
                    $panicAt = Get-Date
                    $end = $panicAt.AddSeconds(8)
                    Write-Host "[CAPTURE] Panic signature detected, extending capture by 8s..."
                }
            }
        } catch {
        }
    }
}
finally {
    $serial.Close()
}

Set-Content -Path $logPath -Encoding UTF8 -Value ($lines.ToArray())
Write-Host "[CAPTURE] Saved log: $logPath"

if (-not $panicSeen) {
    Write-Host "[CAPTURE] No panic signature detected in capture window."
    exit 0
}

if (-not (Test-Path $elfAbs)) {
    Write-Host "[DECODE] ELF not found: $elfAbs"
    exit 0
}

$addrTool = Join-Path $env:USERPROFILE ".platformio\packages\toolchain-riscv32-esp\bin\riscv32-esp-elf-addr2line.exe"
if (-not (Test-Path $addrTool)) {
    Write-Host "[DECODE] addr2line not found: $addrTool"
    exit 0
}

$addrPattern = [regex]"0x[0-9a-fA-F]{8}"
$addrs = New-Object System.Collections.Generic.HashSet[string]
foreach ($line in $lines) {
    foreach ($m in $addrPattern.Matches($line)) {
        [void]$addrs.Add($m.Value.ToLower())
    }
}

if ($addrs.Count -eq 0) {
    Write-Host "[DECODE] No addresses found in panic log."
    exit 0
}

$addrList = $addrs.ToArray() | Sort-Object
Write-Host "[DECODE] Resolving $($addrList.Count) addresses..."

$decodeArgs = @("-pfiaC", "-e", $elfAbs) + $addrList
& $addrTool @decodeArgs
