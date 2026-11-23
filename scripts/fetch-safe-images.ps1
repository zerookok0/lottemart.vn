# =============================================================================
# 安全页商品图下载（无品牌：只取通用品类商品图，本地化存储，不引用主站域名）
# 用法： powershell -ExecutionPolicy Bypass -File scripts/fetch-safe-images.ps1
# 输出： site/assets/safe/<id>.webp
# =============================================================================
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$outDir = Join-Path $root 'site\assets\safe'
New-Item -ItemType Directory -Force $outDir | Out-Null

# 商品 ID 列表（通用品类：蛋/米/果蔬/奶/肉/调味/茶）
$ids = @(
  '232613', # Trứng gà
  '15164',  # Gạo lức
  '229644', # Táo
  '40521',  # Chuối sấy
  '21348',  # Sữa tươi
  '237053', # Bánh mì
  '236008', # Thịt heo xay
  '228710', # Cà rốt
  '237792', # Dưa hấu
  '234267', # Nước mắm
  '59775',  # Trà xanh
  '14239',  # Phô mai hoa quả
  '228596', # Xà lách
  '232321', # Hành tây
  '47331',  # Nho vàng
  '35556'   # Khoai tây chiên
)

$catalog = Get-Content (Join-Path $root 'data\search.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$map = @{}
foreach ($p in $catalog) { $map[$p.i] = $p.im }

$sizes = @('600x600', '300x300')
Add-Type -AssemblyName System.Net.Http
$handler = New-Object System.Net.Http.HttpClientHandler
$handler.AutomaticDecompression = [System.Net.DecompressionMethods]::GZip -bor [System.Net.DecompressionMethods]::Deflate
$client = New-Object System.Net.Http.HttpClient($handler)
$client.Timeout = [TimeSpan]::FromSeconds(45)
$client.DefaultRequestHeaders.Add('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36')

$ok = 0
foreach ($id in $ids) {
  $im = $map[$id]
  if (-not $im) { Write-Host "[miss] $id (no image in catalog)"; continue }
  $dest = Join-Path $outDir "$id.webp"
  if ((Test-Path $dest) -and (Get-Item $dest).Length -gt 3000) { Write-Host "[skip] $id"; $ok++; continue }
  $done = $false
  foreach ($sz in $sizes) {
    $url = "https://www.lottemart.vn/media/catalog/product/cache/$sz/$im"
    try {
      $bytes = $client.GetByteArrayAsync($url).GetAwaiter().GetResult()
      if ($bytes.Length -gt 3000) {
        [System.IO.File]::WriteAllBytes($dest, $bytes)
        Write-Host ("[ok]   {0}  {1,7:N0} B  {2}" -f $id, $bytes.Length, $sz)
        $ok++; $done = $true; break
      }
    } catch {
      Write-Host "[warn] $id $sz -> $($_.Exception.Message)"
    }
  }
  if (-not $done) { Write-Host "[fail] $id" }
}

Write-Host "`n完成：$ok / $($ids.Count)"
