# Cài chương trình lấy D-Office cho "Bộ não thứ hai" trên máy Windows.
# Chạy trong PowerShell (không cần quyền quản trị):
#   irm https://f77728881-lgtm.github.io/bo-nao-thu-hai/may-tinh/cai-dat-windows.ps1 | iex
# Gỡ: Unregister-ScheduledTask -TaskName 'BNTH D-Office' -Confirm:$false; Remove-Item "$env:APPDATA\bnth" -Recurse
$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$Base = 'https://f77728881-lgtm.github.io/bo-nao-thu-hai/may-tinh/'
$AppUrl = 'https://script.google.com/macros/s/AKfycbwGTrW91uZfjhbS7PlpxZTtXGjMPoLIue3kgfhDltYtnSxuSIOWn-t3Fwtz0Hgg9Czjiw/exec'
$Dir = Join-Path $env:APPDATA 'bnth'
New-Item -ItemType Directory -Force -Path $Dir | Out-Null

Write-Host ''
Write-Host 'Cai dat lay D-Office cho Bo nao thu hai' -ForegroundColor Cyan
Write-Host 'Mo app -> Cai dat -> D-Office -> "Khoa cho may Windows" -> Sao chep, roi dan vao day.'
$sec = Read-Host -AsSecureString 'Khoa may tinh'
$plain = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec))
if ($plain.Trim() -notmatch '^[0-9a-f]{64}$') { throw 'Khoa khong dung dinh dang (64 ky tu 0-9a-f). Chay lai va dan dung khoa.' }
$enc = ConvertTo-SecureString $plain.Trim() -AsPlainText -Force | ConvertFrom-SecureString   # mã hóa DPAPI theo tài khoản Windows này
@{ url = $AppUrl; key_enc = $enc } | ConvertTo-Json | Set-Content (Join-Path $Dir 'config.json') -Encoding UTF8

# Tải chương trình, lưu UTF-8 có BOM để PowerShell 5 đọc đúng tiếng Việt.
$bytes = (Invoke-WebRequest -UseBasicParsing ($Base + 'doffice_agent.ps1')).Content
if ($bytes -is [string]) { $text = $bytes } else { $text = [Text.Encoding]::UTF8.GetString($bytes) }
[IO.File]::WriteAllText((Join-Path $Dir 'doffice_agent.ps1'), $text, (New-Object Text.UTF8Encoding $true))

# Chạy ẩn (không hiện cửa sổ) qua wscript.
$agent = Join-Path $Dir 'doffice_agent.ps1'
$vbs = 'CreateObject("Wscript.Shell").Run "powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File ""' + $agent + '""", 0, False'
Set-Content -Path (Join-Path $Dir 'chay_an.vbs') -Value $vbs -Encoding ASCII

$action = New-ScheduledTaskAction -Execute 'wscript.exe' -Argument ('"' + (Join-Path $Dir 'chay_an.vbs') + '"')
$daily = New-ScheduledTaskTrigger -Daily -At 6:00AM
$daily.Repetition = (New-ScheduledTaskTrigger -Once -At 6:00AM -RepetitionInterval (New-TimeSpan -Minutes 15) -RepetitionDuration (New-TimeSpan -Hours 16)).Repetition
$logon = New-ScheduledTaskTrigger -AtLogOn -User ("$env:USERDOMAIN\$env:USERNAME")
$set = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Minutes 10) -MultipleInstances IgnoreNew
Register-ScheduledTask -TaskName 'BNTH D-Office' -Action $action -Trigger @($daily, $logon) -Settings $set -Description 'Bo nao thu hai: lay van ban va lich tuan tu D-Office (8:00, 14:00 thu 2-6, lay bu khi may bat)' -Force | Out-Null

Write-Host 'Da cai. Chay thu mot lan...' -ForegroundColor Green
powershell.exe -NoProfile -ExecutionPolicy Bypass -File $agent
Get-Content (Join-Path $Dir 'doffice.log') -Tail 3 -Encoding UTF8
Write-Host ''
Write-Host 'Xong. May nay se tu hoi may chu moi 15 phut (6:00-22:00).' -ForegroundColor Green
