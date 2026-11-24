# =============================================================================
# 抓「3折专区」商品（源站单品链接 → raw/deals/<id>.json + raw/deals/reviews-<id>.json）
#
# 用法：
#   1) 把源站商品链接一行一个写进 deals.txt（评论用 # 开头）
#      支持任意形式：https://www.lottemart.vn/vi-nsg/product/<url_key>-p8602  或  8602
#   2) powershell -ExecutionPolicy Bypass -File scripts/fetch-deals.ps1
#   3) node scripts/import-deals.mjs        # 生成 data/deals.json 并合并进 data/p、data/search.json
#   4) npm run build                        # 重新构建
#
# 为什么用 PowerShell：源站 CloudFront WAF 按 TLS 指纹拦 OpenSSL 客户端（Node/curl 403），
# 只有 Windows SChannel（.NET HttpClient）能过。
# =============================================================================
param(
  [string]$List = 'deals.txt',
  [switch]$Force,
  [switch]$SkipCatalog
)

$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
Add-Type -AssemblyName System.Net.Http

$Root   = Split-Path -Parent $PSScriptRoot
$Origin = 'https://www.lottemart.vn'
$ApiBase = "$Origin/v1/p/mart/es"
$Api    = "$ApiBase/vi_nsg"
$UA     = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
$Dir    = Join-Path $Root 'raw\deals'
$ListPath = if ([System.IO.Path]::IsPathRooted($List)) { $List } else { Join-Path $Root $List }

New-Item -ItemType Directory -Force -Path $Dir | Out-Null

$handler = New-Object System.Net.Http.HttpClientHandler
$handler.AutomaticDecompression = [System.Net.DecompressionMethods]::GZip -bor [System.Net.DecompressionMethods]::Deflate
$client = New-Object System.Net.Http.HttpClient($handler)
$client.Timeout = [TimeSpan]::FromSeconds(180)
$client.DefaultRequestHeaders.Add('User-Agent', $UA)
$client.DefaultRequestHeaders.Add('Accept', 'application/json, text/plain, */*')
$client.DefaultRequestHeaders.Add('Accept-Language', 'vi-VN,vi;q=0.9,en;q=0.8')
$client.DefaultRequestHeaders.Add('Origin', $Origin)
$client.DefaultRequestHeaders.Add('Referer', "$Origin/")

function Get-Json([string]$Url) {
  for ($i = 0; $i -lt 5; $i++) {
    try {
      $resp = $client.GetAsync($Url).Result
      if ([int]$resp.StatusCode -eq 200) { return $resp.Content.ReadAsStringAsync().Result }
      Write-Host ("  ! HTTP {0} {1}" -f [int]$resp.StatusCode, $Url)
    } catch {
      Write-Host ("  ! {0} {1}" -f $_.Exception.Message, $Url)
    }
    Start-Sleep -Milliseconds ([Math]::Min(20000, 700 * [Math]::Pow(2, $i)))
  }
  return $null
}

# ---- 取 id：链接尾巴 -p<id>，或纯数字 ----
if (-not (Test-Path $ListPath)) {
  Write-Host "[deals] 找不到清单文件：$ListPath"
  Write-Host "        新建一个 deals.txt，把源站商品链接一行一个贴进去即可。"
  exit 1
}

$ids = New-Object System.Collections.Generic.List[string]
$storeOf = @{}
foreach ($line in Get-Content -Encoding UTF8 $ListPath) {
  $t = $line.Trim()
  if (-not $t -or $t.StartsWith('#')) { continue }
  # 店铺取自链接里的语言/店铺段：/en-bdh/ → en_bdh，/vi-nsg/ → vi_nsg
  $store = 'vi_nsg'
  if ($t -match 'lottemart\.vn/([a-z0-9-]+)/product/') { $store = ($Matches[1] -replace '-', '_') }
  if ($t -match '-p(\d+)') { $id = $Matches[1] }
  elseif ($t -match '(\d{3,})') { $id = $Matches[1] }
  else { Write-Host "[deals] 看不懂这行，跳过：$t"; continue }
  if (-not $ids.Contains($id)) { $ids.Add($id); $storeOf[$id] = $store }
}

Write-Host "[deals] 清单 $($ids.Count) 个商品"

# -SkipCatalog：已经在 data/search.json 里的商品不重抓（直接复用现有 catalog 数据）
$catalog = New-Object 'System.Collections.Generic.HashSet[string]'
if ($SkipCatalog) {
  $searchFile = Join-Path $Root 'data\search.json'
  if (Test-Path $searchFile) {
    $arr = Get-Content -Raw -Encoding UTF8 $searchFile | ConvertFrom-Json
    foreach ($x in $arr) { [void]$catalog.Add([string]$x.i) }
    Write-Host "[deals] catalog 内 $($catalog.Count) 个商品可跳过"
  }
}

$ok = 0
foreach ($id in $ids) {
  if ($SkipCatalog -and $catalog.Contains($id)) { Write-Host "[have] $id（已在 catalog，跳过抓取）"; $ok++; continue }
  $out = Join-Path $Dir "$id.json"
  if (-not $Force -and (Test-Path $out) -and (Get-Item $out).Length -gt 2000) {
    Write-Host "[skip] $id（已存在，-Force 可重抓）"
    $ok++
    continue
  }
  $json = Get-Json "$ApiBase/$($storeOf[$id])/products/$id"
  if (-not $json) { Write-Host "[fail] $id（$($storeOf[$id]) 店铺 拿不到）"; continue }
  [System.IO.File]::WriteAllText($out, $json, [System.Text.UTF8Encoding]::new($false))

  # 评价（拿不到不影响主流程）
  $revOut = Join-Path $Dir "reviews-$id.json"
  if ($Force -or -not (Test-Path $revOut)) {
    $rev = Get-Json "$ApiBase/$($storeOf[$id])/products/$id/reviews?pageNumber=1&pageSize=50&sort[created_at]=desc"
    if ($rev) { [System.IO.File]::WriteAllText($revOut, $rev, [System.Text.UTF8Encoding]::new($false)) }
  }

  $name = ''
  try { $name = ($json | ConvertFrom-Json).data.name } catch {}
  Write-Host ("[ok]   {0}  {1:N0} B  {2}" -f $id, (Get-Item $out).Length, $name)
  $ok++
  Start-Sleep -Milliseconds 250
}

Write-Host "`n[deals] 完成 $ok / $($ids.Count) → raw/deals/"
Write-Host "        下一步：node scripts/import-deals.mjs && npm run build"
