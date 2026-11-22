# 抓取 LOTTE Mart 越南站全量数据
#
# 为什么用 .NET HttpClient 而不是 Node/curl：
#   该站 CloudFront WAF 按 TLS 指纹拦 OpenSSL 客户端（Node undici / curl 全部 403），
#   Windows SChannel（.NET）能过。所以抓取走 PowerShell 5.1 + System.Net.Http。
#
#   powershell -NoProfile -File scripts/fetch-catalog.ps1                 # 全部（已存在跳过）
#   powershell -NoProfile -File scripts/fetch-catalog.ps1 -Only pages
#   powershell -NoProfile -File scripts/fetch-catalog.ps1 -Force
param(
  [ValidateSet('all', 'pages', 'cats', 'home', 'reviews', 'catprod')]
  [string]$Only = 'all',
  [switch]$Force,
  [int]$Throttle = 5,
  [int]$PageSize = 500
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
Add-Type -AssemblyName System.Net.Http

$Root   = Split-Path -Parent $PSScriptRoot
$Raw    = Join-Path $Root 'raw'
$Origin = 'https://www.lottemart.vn'
$Api    = "$Origin/v1/p/mart/es/vi_nsg"
$UA     = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
$Utf8   = [System.Text.UTF8Encoding]::new($false)

$script:Client = $null
function Get-Client {
  if ($script:Client) { return $script:Client }
  $handler = New-Object System.Net.Http.HttpClientHandler
  $handler.AutomaticDecompression = [System.Net.DecompressionMethods]::GZip -bor [System.Net.DecompressionMethods]::Deflate
  $c = New-Object System.Net.Http.HttpClient($handler)
  $c.Timeout = [TimeSpan]::FromSeconds(240)
  $c.DefaultRequestHeaders.Add('User-Agent', $UA)
  $c.DefaultRequestHeaders.Add('Accept', 'application/json, text/plain, */*')
  $c.DefaultRequestHeaders.Add('Accept-Language', 'vi-VN,vi;q=0.9,en;q=0.8')
  $c.DefaultRequestHeaders.Add('Origin', $Origin)
  $c.DefaultRequestHeaders.Add('Referer', "$Origin/")
  $script:Client = $c
  return $c
}

function New-Request([string]$Url, [string]$Body) {
  if ($Body) {
    $req = New-Object System.Net.Http.HttpRequestMessage([System.Net.Http.HttpMethod]::Post, $Url)
    $req.Content = New-Object System.Net.Http.StringContent($Body, [System.Text.Encoding]::UTF8, 'application/json')
    return $req
  }
  return New-Object System.Net.Http.HttpRequestMessage([System.Net.Http.HttpMethod]::Get, $Url)
}

function Invoke-Api([string]$Url, [string]$Body) {
  $client = Get-Client
  for ($i = 0; $i -lt 6; $i++) {
    try {
      $resp = $client.SendAsync((New-Request $Url $Body)).Result
      if ([int]$resp.StatusCode -eq 200) { return $resp.Content.ReadAsStringAsync().Result }
      Write-Host ("  ! HTTP {0} {1}" -f [int]$resp.StatusCode, $Url)
    } catch {
      Write-Host ("  ! {0} {1}" -f $_.Exception.Message, $Url)
    }
    Start-Sleep -Milliseconds ([Math]::Min(30000, 800 * [Math]::Pow(2, $i)))
  }
  throw "fetch failed: $Url"
}

# 并发批量抓取：$Jobs = @( @{Url=..;Body=..;Out=..} )
function Invoke-Batch($Jobs, [string]$Label) {
  if ($Jobs.Count -eq 0) { Write-Host "[$Label] 无需抓取"; return }
  $client = Get-Client
  $total = $Jobs.Count
  $idx = 0
  $batchSize = [Math]::Max(1, $Throttle)
  while ($idx -lt $total) {
    $batch = $Jobs[$idx..([Math]::Min($idx + $batchSize - 1, $total - 1))]
    $tasks = @()
    foreach ($j in $batch) { $tasks += $client.SendAsync((New-Request $j.Url $j.Body)) }
    try { [System.Threading.Tasks.Task]::WaitAll($tasks) } catch {}
    for ($k = 0; $k -lt $batch.Count; $k++) {
      $j = $batch[$k]
      try {
        $resp = $tasks[$k].Result
        if ([int]$resp.StatusCode -ne 200) { throw "HTTP $([int]$resp.StatusCode)" }
        $txt = $resp.Content.ReadAsStringAsync().Result
        [IO.File]::WriteAllText($j.Out, $txt, $Utf8)
      } catch {
        Write-Host ("  ! {0} {1}" -f $j.Out, $_.Exception.Message)
      }
    }
    $idx += $batch.Count
    Write-Host ("  {0}: {1}/{2}" -f $Label, [Math]::Min($idx, $total), $total)
  }
}

# ---------------------------------------------------------------- 全量商品（按类目并集）
# 搜索接口只认 offset ≤ 100，无法翻页拿全量；类目接口一次返回该类目全部商品，
# 所以遍历 399 个类目节点取并集（去重在 parse 阶段做）。
function Fetch-CatProducts {
  $dir = Join-Path $Raw 'catprod'
  New-Item -ItemType Directory -Force -Path $dir | Out-Null
  $tree = Get-Content -Raw -Encoding UTF8 (Join-Path $Raw 'cats\tree.json') | ConvertFrom-Json

  $ids = New-Object System.Collections.Generic.List[string]
  $walk = $null
  $walk = {
    param($node)
    $ids.Add([string]$node.id)
    foreach ($c in $node.child) { & $walk $c }
  }
  foreach ($r in $tree.data) { & $walk $r }
  Write-Host "[catprod] 类目节点 $($ids.Count)"

  $jobs = @()
  foreach ($id in $ids) {
    $out = Join-Path $dir "$id.json"
    if (-not $Force -and (Test-Path $out) -and (Get-Item $out).Length -gt 20) { continue }
    $jobs += @{ Url = "$Api/categories/$id/products"; Body = '{"type":"product"}'; Out = $out }
  }
  Invoke-Batch $jobs 'catprod'
}

# ---------------------------------------------------------------- pages (offset ≤ 100 兜底)
function Fetch-Pages {
  $dir = Join-Path $Raw 'pages'
  New-Item -ItemType Directory -Force -Path $dir | Out-Null
  $probe = (Invoke-Api "$Api/products/search" '{"page":1,"limit":1}') | ConvertFrom-Json
  $total = [int]$probe.data.total_items
  $pageCount = [Math]::Ceiling($total / $PageSize)
  Write-Host "[pages] total_items=$total -> $pageCount 页 x $PageSize"

  $jobs = @()
  for ($n = 1; $n -le $pageCount; $n++) {
    $out = Join-Path $dir ("page-{0:d3}.json" -f $n)
    if (-not $Force -and (Test-Path $out) -and (Get-Item $out).Length -gt 1024) { continue }
    # 该接口不认 page，只认 limit + offset（实测）
    $offset = ($n - 1) * $PageSize
    $jobs += @{ Url = "$Api/products/search"; Body = ('{"page":1,"limit":' + $PageSize + ',"offset":' + $offset + '}'); Out = $out }
  }
  Invoke-Batch $jobs 'pages'
}

# ---------------------------------------------------------------- cats
function Fetch-Cats {
  $dir = Join-Path $Raw 'cats'
  New-Item -ItemType Directory -Force -Path $dir | Out-Null
  $out = Join-Path $dir 'tree.json'
  if (-not $Force -and (Test-Path $out) -and (Get-Item $out).Length -gt 1024) { Write-Host '[cats] cached'; return }
  $txt = Invoke-Api "$Api/categories/tree/filter?level=3" $null
  [IO.File]::WriteAllText($out, $txt, $Utf8)
  Write-Host ("[cats] {0:N0} KB" -f ($txt.Length / 1KB))
}

# ---------------------------------------------------------------- home
function Fetch-Home {
  $dir = Join-Path $Raw 'home'
  New-Item -ItemType Directory -Force -Path $dir | Out-Null
  $targets = [ordered]@{
    'banner.json'    = "$Api/homepage/banner-with-type?banner_type=main"
    'popup.json'     = "$Api/homepage/v2/popup?type=web"
    'promotion.json' = "$Api/homepage/promotion"
    'submenu.json'   = "$Api/categories/url-key/sub-menu"
    'zones.json'     = "$Api/homepage?zone_config[today_check][page_size]=30&zone_config[recommend_zone][page_size]=30&zone_config[Home_Just_arrived][page_size]=30&zone_config[md_picks][page_size]=30&zone_config[Home_Weekly_Best][page_size]=30"
  }
  $jobs = @()
  foreach ($k in $targets.Keys) {
    $out = Join-Path $dir $k
    if (-not $Force -and (Test-Path $out) -and (Get-Item $out).Length -gt 512) { Write-Host "[home] $k cached"; continue }
    $jobs += @{ Url = $targets[$k]; Body = $null; Out = $out }
  }
  Invoke-Batch $jobs 'home'
}

# ---------------------------------------------------------------- reviews
function Fetch-Reviews {
  $dir = Join-Path $Raw 'reviews'
  New-Item -ItemType Directory -Force -Path $dir | Out-Null
  $catDir = Join-Path $Raw 'catprod'
  if (-not (Test-Path $catDir)) { throw '先跑 -Only catprod' }

  $seen = New-Object 'System.Collections.Generic.HashSet[string]'
  $ids = New-Object System.Collections.Generic.List[string]
  foreach ($f in Get-ChildItem $catDir -Filter '*.json') {
    try { $j = Get-Content -Raw -Encoding UTF8 $f.FullName | ConvertFrom-Json } catch { continue }
    foreach ($it in $j.data.items) {
      if ([int]$it.ext_overall_review -gt 0 -and $seen.Add([string]$it.id)) { $ids.Add([string]$it.id) }
    }
  }
  Write-Host "[reviews] $($ids.Count) 个商品有真实评论"

  $jobs = @()
  foreach ($id in $ids) {
    $out = Join-Path $dir "$id.json"
    if (-not $Force -and (Test-Path $out) -and (Get-Item $out).Length -gt 3) { continue }
    $jobs += @{ Url = "$Api/products/$id/reviews?pageNumber=1&pageSize=50&sort[created_at]=desc"; Body = $null; Out = $out }
  }
  Invoke-Batch $jobs 'reviews'
}

# ---------------------------------------------------------------- main
$t0 = Get-Date
switch ($Only) {
  'all'     { Fetch-Cats; Fetch-CatProducts; Fetch-Home; Fetch-Reviews }
  'catprod' { Fetch-CatProducts }
  'pages'   { Fetch-Pages }
  'cats'    { Fetch-Cats }
  'home'    { Fetch-Home }
  'reviews' { Fetch-Reviews }
}
Write-Host ("`n[done] {0:N1}s -> {1}" -f ((Get-Date) - $t0).TotalSeconds, $Raw)


