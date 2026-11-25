# Máy Windows lấy D-Office cho app "Bộ não thứ hai" (Task Scheduler chạy mỗi 15 phút).
# Mỗi lần: hỏi máy chủ "đến lượt chưa?" (8:00 và 14:00, thứ 2–6; lỡ giờ thì lấy bù khi máy bật).
# Đến lượt: đăng nhập D-Office, lấy văn bản Chủ trì/Phối hợp + lịch tuần công ty, gửi về app.
# Chỉ ĐỌC D-Office. Khóa máy tính lưu mã hóa (DPAPI) trong %APPDATA%\bnth\config.json.
# Chạy tay: powershell -ExecutionPolicy Bypass -File "%APPDATA%\bnth\doffice_agent.ps1" -Ngay
param([switch]$Ngay)

$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
Add-Type -AssemblyName System.Net.Http
$Dir = Join-Path $env:APPDATA 'bnth'
$Log = Join-Path $Dir 'doffice.log'
$Api = 'https://gwdoffice.npc.com.vn/'
$May = 'Windows-' + $env:COMPUTERNAME

function Write-Log($m) {
  $line = (Get-Date -Format 'yyyy-MM-dd HH:mm:ss') + ' ' + $m
  Add-Content -Path $Log -Value $line -Encoding UTF8
  if ((Get-Item $Log).Length -gt 500KB) { (Get-Content $Log -Tail 2000) | Set-Content $Log -Encoding UTF8 }
}

$cfg = Get-Content (Join-Path $Dir 'config.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$sec = ConvertTo-SecureString $cfg.key_enc
$AppKey = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec))
if (-not $cfg.device) { $cfg | Add-Member -NotePropertyName device -NotePropertyValue ([guid]::NewGuid().ToString()) -Force; $cfg | ConvertTo-Json | Set-Content (Join-Path $Dir 'config.json') -Encoding UTF8 }

$http = New-Object System.Net.Http.HttpClient
$http.Timeout = [TimeSpan]::FromSeconds(120)

function Send-Json($method, $url, $obj, $token) {
  $req = New-Object System.Net.Http.HttpRequestMessage ([System.Net.Http.HttpMethod]::new($method)), $url
  $req.Headers.Add('Accept', 'application/json')
  if ($token) { $req.Headers.Add('Authorization', 'Bearer ' + $token) }
  if ($null -ne $obj) {
    $json = $obj | ConvertTo-Json -Depth 20 -Compress
    $req.Content = New-Object System.Net.Http.ByteArrayContent (,[Text.Encoding]::UTF8.GetBytes($json))
    $req.Content.Headers.ContentType = [System.Net.Http.Headers.MediaTypeHeaderValue]::Parse('application/json; charset=utf-8')
  }
  $res = $http.SendAsync($req).GetAwaiter().GetResult()
  $text = [Text.Encoding]::UTF8.GetString($res.Content.ReadAsByteArrayAsync().GetAwaiter().GetResult())
  $data = $null
  if ($text) { try { $data = $text | ConvertFrom-Json } catch { $data = $null } }
  return @{ code = [int]$res.StatusCode; data = $data }
}

function Call-App($action, $payload) {
  $body = @{ action = $action; payload = $payload; key = $AppKey } | ConvertTo-Json -Depth 30 -Compress
  $req = New-Object System.Net.Http.HttpRequestMessage ([System.Net.Http.HttpMethod]::Post), $cfg.url
  $req.Content = New-Object System.Net.Http.ByteArrayContent (,[Text.Encoding]::UTF8.GetBytes($body))
  $req.Content.Headers.ContentType = [System.Net.Http.Headers.MediaTypeHeaderValue]::Parse('text/plain; charset=utf-8')
  $res = $http.SendAsync($req).GetAwaiter().GetResult()   # Apps Script trả 302 → HttpClient đi theo bằng GET
  $out = [Text.Encoding]::UTF8.GetString($res.Content.ReadAsByteArrayAsync().GetAwaiter().GetResult()) | ConvertFrom-Json
  if (-not $out.ok) { throw ('App báo lỗi: ' + ($out.error | ConvertTo-Json -Compress)) }
  return $out.data
}

function Get-Claims($jwt) {
  $p = $jwt.Split('.')[1].Replace('-', '+').Replace('_', '/')
  while ($p.Length % 4) { $p += '=' }
  return [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($p)) | ConvertFrom-Json
}
function DMY($ymd, $sep) { return $ymd.Substring(8, 2) + $sep + $ymd.Substring(5, 2) + $sep + $ymd.Substring(0, 4) }

$h = (Get-Date).Hour
if (-not $Ngay -and ($h -lt 6 -or $h -ge 22)) { exit 0 }
try {
  $job = Call-App 'doffice_viec' @{ may = $May; force = [bool]$Ngay }
  if (-not $job.den_luot) { Write-Log ('Chưa đến lượt: ' + $job.ly_do); exit 0 }
  Write-Log ('Đến lượt (khung ' + $job.slot + '), đăng nhập D-Office…')
  try {
    $login = Send-Json 'POST' ($Api + 'v3/auth/Auth/DAuth') @{
      username = $job.username; password = $job.password; expiration = 30
      deviceInfo = @{ deviceId = $cfg.device; deviceType = 'Windows/' + $May; appId = 'DOFFICE'; appVersion = 'v2.0.0' } } $null
  } catch {
    Call-App 'doffice_nhap' @{ may = $May; loi_mang = ('' + $_.Exception.Message) } | Out-Null
    Write-Log ('Lỗi mạng: ' + $_.Exception.Message); exit 1
  }
  $d = $login.data
  if (-not $d -or -not $d.State -or -not $d.Data -or -not $d.Data.accessToken) {
    if ($login.code -eq 200) {
      Call-App 'doffice_nhap' @{ may = $May; loi_dang_nhap = ('' + $d.Message) } | Out-Null
      Write-Log ('D-Office từ chối đăng nhập: ' + $d.Message)
    } else {
      Call-App 'doffice_nhap' @{ may = $May; loi_mang = ('HTTP ' + $login.code + ' khi đăng nhập') } | Out-Null
      Write-Log ('D-Office trả HTTP ' + $login.code)
    }
    exit 1
  }
  $tok = $d.Data.accessToken
  $c = Get-Claims $tok
  try {
    $lists = @{}
    foreach ($tt in @('CHUA_THUC_HIEN', 'DANG_THUC_HIEN')) {
      $r = Send-Json 'POST' ($Api + 'v1/congviec/ChuyenVien/GetDSCVCVien') @{
        ID_NV = [int64]$c.ID_NV; ID_DV = [int64]$c.IDDONVI; TU_NGAY = (DMY $job.tu '/'); DEN_NGAY = (DMY $job.den '/')
        MA_XULY = @('CHU_TRI', 'PHOI_HOP'); TT_XULY = $tt } $tok
      if ($r.code -ne 200 -or $null -eq $r.data -or $null -eq $r.data.Data) { throw ('Lấy danh sách ' + $tt + ' lỗi: HTTP ' + $r.code) }
      $lists[$tt] = @($r.data.Data)
    }
    $q = '?Madv=' + $c.IDDONVI + '&tu_ngay=' + (DMY $job.lich_tu '-') + '&de_ngay=' + (DMY $job.lich_den '-')
    $lt = Send-Json 'GET' ($Api + 'v1/lichtuan/LichTuan/GetLT_EOF3' + $q) $null $tok
    $lich = $null
    if ($lt.code -eq 200 -and $null -ne $lt.data -and $null -ne $lt.data.Data) { $lich = @($lt.data.Data) }
  } catch {
    Call-App 'doffice_nhap' @{ may = $May; loi_mang = ('' + $_.Exception.Message) } | Out-Null
    Write-Log ('Lỗi khi lấy dữ liệu: ' + $_.Exception.Message); exit 1
  }
  $st = Call-App 'doffice_nhap' @{ may = $May; chua = $lists['CHUA_THUC_HIEN']; dang = $lists['DANG_THUC_HIEN']; lich = $lich; lich_tu = $job.lich_tu; lich_den = $job.lich_den }
  Write-Log ('Xong: ' + $st.so_dong + ' văn bản đang giao, mới ' + @($st.moi).Count + '; lịch tuần ' + $st.lich.so_lich + ' mục.')
} catch {
  Write-Log ('Lỗi: ' + $_.Exception.Message)
  exit 1
}
