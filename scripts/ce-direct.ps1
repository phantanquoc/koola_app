<#
.SYNOPSIS
  Goi thang Context Engine (codebase-retrieval) qua HTTP, khong qua harness MCP.
.DESCRIPTION
  Thuc hien MCP handshake (initialize -> notifications/initialized -> tools/call)
  voi server o http://127.0.0.1:6699 va in ra cac snippet lien quan.
  Neu server chua chay: bat Context Engine (tray icon -> lang nghe 127.0.0.1:6699).
  Toi uu: cache ket qua theo hash query, tai dung session, fail-fast handshake.
.EXAMPLE
  .\ce-direct.ps1 "Where is user authentication handled?"
  .\ce-direct.ps1 "How does AuthContext restore session and connect socket?" -TimeoutSec 120
  .\ce-direct.ps1 "query" -NoCache   # bo qua cache, goi thang engine
#>
param(
  [Parameter(Mandatory = $true, Position = 0)]
  [string]$Query,
  [string]$Base = "http://127.0.0.1:6699/mcp-repo/d__desktop_app_koola",
  [int]$TimeoutSec = 300,
  [int]$HandshakeTimeoutSec = 15,
  [string]$Scope,
  [int]$CacheTtlSec = 3600,
  [switch]$NoCache
)
# NOTE: TimeoutSec mac dinh 300s vi Context Engine goi LLM upstream (log cho thay
# moi completion mat 30-120s, cong retry khi 524/503). Handshake chi ton vai chuc ms
# tren localhost nen fail-fast rieng 15s de biet ngay engine chet.

Add-Type -AssemblyName System.Net.Http

$CacheDir = Join-Path ([System.IO.Path]::GetTempPath()) "ce-direct-cache"

function Get-StringHash {
  param([string]$Text)
  $sha = [System.Security.Cryptography.SHA256]::Create()
  try {
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($Text)
    return ([System.BitConverter]::ToString($sha.ComputeHash($bytes)) -replace '-', '').ToLower()
  } finally { $sha.Dispose() }
}

function Invoke-McpPost {  param(
    [System.Net.Http.HttpClient]$Client,
    [string]$Base,
    [string]$SessionId,
    [string]$Body
  )
  $req = New-Object System.Net.Http.HttpRequestMessage(
    [System.Net.Http.HttpMethod]::Post, $Base)
  $req.Content = New-Object System.Net.Http.StringContent(
    $Body, [System.Text.Encoding]::UTF8, "application/json")
  $req.Headers.Accept.Clear()
  $req.Headers.Accept.ParseAdd("application/json, text/event-stream")
  if ($SessionId) { $req.Headers.Add("Mcp-Session-Id", $SessionId) }
  try {
    return $Client.SendAsync($req).Result
  } finally { $req.Dispose() }
}

function Get-ResultText {
  param([string]$Raw)
  $jsonLine = ($Raw -split "`r?`n" | Where-Object { $_ -match '^\s*data:\s*\{.*result' } | Select-Object -First 1)
  if ($jsonLine) {
    $payload = ($jsonLine -replace '^\s*data:\s*', '') | ConvertFrom-Json
  } elseif ($Raw -match '^\s*\{') {
    # Server tra JSON thuong thay vi SSE — parse truc tiep
    $payload = $Raw | ConvertFrom-Json
  } else {
    throw "Khong thay result trong response (khong phai SSE data: cung khong phai JSON)."
  }
  if (-not $payload.result) { throw "Response khong co result." }
  if ($payload.result.isError) {
    throw ("Engine bao loi: " + ($payload.result.content | ConvertTo-Json -Depth 6 -Compress))
  }
  return $payload.result.content[0].text
}

function Build-CallBody {
  param([string]$Query, [string]$Scope)
  $arguments = @{ information_request = $Query }
  if ($Scope) { $arguments["scope"] = $Scope }
  return (@{
    jsonrpc = "2.0"; id = 3; method = "tools/call"
    params  = @{ name = "codebase-retrieval"; arguments = $arguments }
  } | ConvertTo-Json -Depth 6 -Compress)
}

# 0. Cache hit? (bo qua khi -NoCache)
$queryHash = Get-StringHash -Text "$Base`n$Scope`n$Query"
$cacheFile = Join-Path $CacheDir "$queryHash.txt"
if (-not $NoCache -and (Test-Path $cacheFile)) {
  $age = ((Get-Date) - (Get-Item $cacheFile).LastWriteTime).TotalSeconds
  if ($age -lt $CacheTtlSec) { Get-Content $cacheFile -Raw; exit 0 }
}
# Session rieng theo Base (nhieu repo = nhieu Base khac nhau)
$sidFile = Join-Path $CacheDir ("session-" + (Get-StringHash -Text $Base).Substring(0, 16) + ".txt")

$handshakeClient = New-Object System.Net.Http.HttpClient
$handshakeClient.Timeout = [System.TimeSpan]::FromSeconds($HandshakeTimeoutSec)
$callClient = New-Object System.Net.Http.HttpClient
$callClient.Timeout = [System.TimeSpan]::FromSeconds($TimeoutSec)

try {
  $callBody = Build-CallBody -Query $Query -Scope $Scope

  # 1. Thu session cu truoc (chi 1 roundtrip neu con han)
  if (Test-Path $sidFile) {
    $savedSid = (Get-Content $sidFile -Raw).Trim()
    if ($savedSid) {
      try {
        $retry = Invoke-McpPost -Client $callClient -Base $Base -SessionId $savedSid -Body $callBody
        if ($retry -and $retry.IsSuccessStatusCode -and $retry.Content) {
          $text = Get-ResultText -Raw $retry.Content.ReadAsStringAsync().Result
          if (-not (Test-Path $CacheDir)) { New-Item -ItemType Directory -Force $CacheDir | Out-Null }
          Set-Content $cacheFile $text -Encoding utf8 -NoNewline
          Write-Output $text
          exit 0
        }
      } catch { <# session het han hoac loi — roi xuong handshake lai #> }
    }
  }

  # 2. Handshake moi (fail-fast)
  $initBody = '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"ce-direct","version":"1.1"}}}'
  try {
    $initResp = Invoke-McpPost -Client $handshakeClient -Base $Base -Body $initBody
  } catch {
    Write-Error "Khong ket noi duoc Context Engine o $Base (fail-fast sau $($HandshakeTimeoutSec)s). Hay start/restart Context Engine (tray icon -> 127.0.0.1:6699 dang nghe). Chi tiet: $($_.Exception.Message)"
    exit 1
  }
  $sid = $null
  foreach ($h in $initResp.Headers) {
    if ($h.Key -eq "Mcp-Session-Id") { $sid = ($h.Value -join "") }
  }
  [void]$initResp.Content.ReadAsStringAsync().Result
  if (-not $sid) { Write-Error "Handshake that bai: khong co Mcp-Session-Id."; exit 1 }

  [void](Invoke-McpPost -Client $handshakeClient -Base $Base -SessionId $sid `
    -Body '{"jsonrpc":"2.0","method":"notifications/initialized"}')
  if (-not (Test-Path $CacheDir)) { New-Item -ItemType Directory -Force $CacheDir | Out-Null }
  Set-Content $sidFile $sid -Encoding utf8 -NoNewline

  # 3. tools/call (timeout dai cho LLM upstream)
  try {
    $callResp = Invoke-McpPost -Client $callClient -Base $Base -SessionId $sid -Body $callBody
  } catch {
    Write-Error "tools/call request that bai (timeout hoac mat ket noi sau $($TimeoutSec)s). Chi tiet: $($_.Exception.Message)"
    exit 1
  }
  if (-not $callResp) { Write-Error "tools/call tra ve response rong (null). Server co the da dong session; thu chay lai."; exit 1 }
  if (-not $callResp.IsSuccessStatusCode) {
    $errBody = ""
    try { $errBody = $callResp.Content.ReadAsStringAsync().Result } catch {}
    Write-Error "tools/call HTTP $($callResp.StatusCode): $errBody"
    exit 1
  }
  if (-not $callResp.Content) { Write-Error "tools/call response khong co Content (HTTP $($callResp.StatusCode))."; exit 1 }

  try {
    $text = Get-ResultText -Raw $callResp.Content.ReadAsStringAsync().Result
  } catch {
    Write-Error $_.Exception.Message
    exit 1
  }
  Set-Content $cacheFile $text -Encoding utf8 -NoNewline
  Write-Output $text
} finally {
  if ($handshakeClient) { $handshakeClient.Dispose() }
  if ($callClient) { $callClient.Dispose() }
}
