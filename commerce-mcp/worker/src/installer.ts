import { BRIDGE_FILES } from "./bridge-files";

// One-line installers for the Chrome bridge. The URL carries the bridge token,
// so it is only served to someone who already has it.

export function bridgeFile(name: string): Response {
  const body = BRIDGE_FILES[name];
  if (body === undefined) return new Response("Not found", { status: 404 });
  return new Response(body, { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });
}

export function windowsInstaller(base: string, token: string): Response {
  const names = Object.keys(BRIDGE_FILES).filter((n) => !n.endsWith(".sh"));
  const ps = `
$ErrorActionPreference = 'Stop'
$base = '${base}'
$tok = '${token}'
$dir = Join-Path $env:USERPROFILE 'commerce-bridge'
Write-Host ''
Write-Host '=== Installing the Chrome bridge into' $dir -ForegroundColor Cyan
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { Write-Host 'Node.js is not installed. Install the LTS version from nodejs.org, then run this again.' -ForegroundColor Red; return }
$chrome = @("$env:ProgramFiles\\Google\\Chrome\\Application\\chrome.exe", "\${env:ProgramFiles(x86)}\\Google\\Chrome\\Application\\chrome.exe", "$env:LocalAppData\\Google\\Chrome\\Application\\chrome.exe") | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $chrome) { Write-Host 'Google Chrome was not found. Install Chrome, then run this again.' -ForegroundColor Red; return }
New-Item -ItemType Directory -Force -Path (Join-Path $dir 'src') | Out-Null
foreach ($f in @(${names.map((n) => `'${n}'`).join(", ")})) {
  Invoke-WebRequest -UseBasicParsing -Uri "$base/bridge/file?token=$tok&name=$f" -OutFile (Join-Path $dir $f)
}
$cfgPath = Join-Path $dir 'config.json'
if (-not (Test-Path $cfgPath)) {
  $cfg = [ordered]@{ serverUrl = $base; bridgeToken = $tok; name = $env:COMPUTERNAME; cdpUrl = 'http://127.0.0.1:9222'; headless = $false; width = 1920; height = 1080 }
  [IO.File]::WriteAllText($cfgPath, ($cfg | ConvertTo-Json))
}
Write-Host '=== Installing components (about a minute)...' -ForegroundColor Cyan
Push-Location $dir
& npm.cmd install --no-audit --no-fund --loglevel=error
Pop-Location
Write-Host '=== Creating shortcuts...' -ForegroundColor Cyan
$sh = New-Object -ComObject WScript.Shell
$desk = [Environment]::GetFolderPath('Desktop')
$startup = [Environment]::GetFolderPath('Startup')
$s = $sh.CreateShortcut((Join-Path $desk 'Claude Chrome.lnk')); $s.TargetPath = (Join-Path $dir 'open-chrome.cmd'); $s.WorkingDirectory = $dir; $s.IconLocation = "$chrome,0"; $s.WindowStyle = 7; $s.Save()
$s = $sh.CreateShortcut((Join-Path $startup 'Claude Chrome.lnk')); $s.TargetPath = (Join-Path $dir 'open-chrome.cmd'); $s.WorkingDirectory = $dir; $s.WindowStyle = 7; $s.Save()
$s = $sh.CreateShortcut((Join-Path $startup 'Claude Chrome Bridge.lnk')); $s.TargetPath = (Join-Path $dir 'start-bridge.cmd'); $s.WorkingDirectory = $dir; $s.WindowStyle = 7; $s.Save()
Write-Host '=== Starting Chrome and the bridge...' -ForegroundColor Cyan
Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" | Where-Object { $_.CommandLine -like '*agent.mjs*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
Start-Process -FilePath (Join-Path $dir 'open-chrome.cmd') -WorkingDirectory $dir -WindowStyle Minimized
Start-Sleep -Seconds 3
Start-Process -FilePath (Join-Path $dir 'start-bridge.cmd') -WorkingDirectory $dir -WindowStyle Minimized
Write-Host ''
Write-Host 'DONE! A Chrome window opened - that is the one Claude controls. Log into your sites there.' -ForegroundColor Green
Write-Host 'Next time, open it with the "Claude Chrome" icon on your desktop. Both start automatically when you log in.' -ForegroundColor Green
`;
  return new Response(ps, { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });
}

export function macInstaller(base: string, token: string): Response {
  const names = Object.keys(BRIDGE_FILES).filter((n) => !n.endsWith(".cmd"));
  const sh = `#!/bin/bash
set -e
BASE='${base}'; TOK='${token}'; DIR="$HOME/commerce-bridge"
command -v node >/dev/null || { echo "Install Node.js (LTS) from nodejs.org first."; exit 1; }
mkdir -p "$DIR/src"
for f in ${names.join(" ")}; do curl -fsSL "$BASE/bridge/file?token=$TOK&name=$f" -o "$DIR/$f"; done
chmod +x "$DIR"/*.sh
[ -f "$DIR/config.json" ] || printf '{"serverUrl":"%s","bridgeToken":"%s","name":"%s","cdpUrl":"http://127.0.0.1:9222"}' "$BASE" "$TOK" "$(hostname -s)" > "$DIR/config.json"
(cd "$DIR" && npm install --no-audit --no-fund --loglevel=error)
"$DIR/open-chrome.sh"; sleep 3
pkill -f agent.mjs || true
nohup "$DIR/start-bridge.sh" > "$DIR/bridge.log" 2>&1 &
echo "DONE! The Chrome window that opened is the one Claude controls."
`;
  return new Response(sh, { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });
}
