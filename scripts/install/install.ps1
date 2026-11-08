param([string]$Version = $env:VSTUDY_VERSION)
$ErrorActionPreference = 'Stop'
if ($env:OS -ne 'Windows_NT' -or [System.Runtime.InteropServices.RuntimeInformation]::OSArchitecture -ne 'X64') {
    throw 'This installer requires Windows x64.'
}
if ($Version -and $Version -notmatch '^v?\d+\.\d+\.\d+([.-][a-zA-Z0-9.-]+)?$') { throw 'Invalid version' }
if (-not $Version) { $Version = (Invoke-RestMethod 'https://api.github.com/repos/ava-apple/vstudy-pro/releases/latest').tag_name }
$base = "https://github.com/ava-apple/vstudy-pro/releases/download/v$($Version.TrimStart('v'))"
$temp = Join-Path ([IO.Path]::GetTempPath()) ([guid]::NewGuid().ToString())
New-Item -ItemType Directory -Path $temp | Out-Null
try {
    Write-Host "Downloading $Version and checksums"
    $asset = 'VStudy-Pro-win-x64.exe'
    $exe = Join-Path $temp $asset
    Invoke-WebRequest "$base/$asset" -OutFile $exe
    $sums = (Invoke-WebRequest "$base/SHA256SUMS.txt").Content
    $entries = @($sums -split '\r?\n' | Where-Object { $_ -match ('^[a-fA-F0-9]{64}\s+\*?' + [regex]::Escape($asset) + '$') })
    if ($entries.Count -ne 1) { throw 'Missing or duplicate SHA-256 entry' }
    $expected = ($entries[0] -split '\s+')[0]
    $actual = (Get-FileHash -Algorithm SHA256 $exe).Hash
    if ($actual -ne $expected) { throw 'SHA-256 mismatch. Installer will not run.' }
    Write-Host "SHA-256 verified: $actual"
    Write-Host 'Starting unsigned per-user installer. No administrator access is required. SmartScreen may warn.'
    $process = Start-Process -FilePath $exe -ArgumentList '/currentuser' -Wait -PassThru
    if ($process.ExitCode -ne 0) { throw "Installer exited with $($process.ExitCode)" }
    Write-Host 'Installed. Open VStudy Pro from the Start menu.'
} finally {
    Remove-Item -Recurse -Force $temp
}
