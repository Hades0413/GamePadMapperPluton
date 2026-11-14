<#
.SYNOPSIS
  Copia el modulo compilado al celular por ADB y, si Magisk permite root a "Shell",
  lo instala directamente.

.DESCRIPTION
  1. Busca el zip mas reciente en dist\ (o usa -Zip).
  2. Lo copia a /sdcard/Download/ del celular.
  3. Intenta "su -c magisk --install-module". Si Magisk niega el root a Shell,
     indica como instalarlo desde la app (Magisk > Modulos > "+").
  Tras instalar hay que reiniciar el celular.

.EXAMPLE
  .\install.ps1
  .\install.ps1 -Adb C:\platform-tools\adb.exe -Reboot
#>
[CmdletBinding()]
param(
    [string]$Zip,
    [string]$Adb,
    [switch]$Reboot
)

$ErrorActionPreference = 'Stop'
$here = if ($PSScriptRoot) { $PSScriptRoot } else { Split-Path -Parent $MyInvocation.MyCommand.Path }

if (-not $Adb) {
    $local = Join-Path $here 'tools\platform-tools\adb.exe'
    $cmd = Get-Command adb -ErrorAction SilentlyContinue
    if (Test-Path $local) { $Adb = $local }
    elseif ($cmd) { $Adb = $cmd.Source }
    elseif (Test-Path 'C:\platform-tools\adb.exe') { $Adb = 'C:\platform-tools\adb.exe' }
    else { throw "No se encontro adb. Pon Platform-Tools en tools\platform-tools o usa -Adb <ruta>." }
}

if (-not $Zip) {
    $Zip = Get-ChildItem (Join-Path $here 'dist') -Filter *.zip -ErrorAction SilentlyContinue |
        Sort-Object LastWriteTime -Descending | Select-Object -First 1 -ExpandProperty FullName
    if (-not $Zip) { throw "No hay zips en dist\. Ejecuta primero .\build.ps1" }
}

$devices = & $Adb devices | Select-String "`tdevice$"
if (-not $devices) { throw "No hay ningun celular autorizado conectado por ADB." }

$name = Split-Path $Zip -Leaf
$remote = "/sdcard/Download/$name"
Write-Host "Copiando $name al celular..."
& $Adb push $Zip $remote | Out-Null

Write-Host "Intentando instalar con root (acepta el aviso de Magisk si aparece)..."
& $Adb shell "su -c 'magisk --install-module $remote'"
if ($LASTEXITCODE -eq 0) {
    Write-Host "Modulo instalado." -ForegroundColor Green
    if ($Reboot) { & $Adb reboot; Write-Host "Reiniciando..." }
    else { Write-Host "Reinicia el celular para aplicarlo (o usa -Reboot)." }
} else {
    Write-Host ""
    Write-Host "Magisk no dio root a 'Shell'. Instalalo desde el celular:" -ForegroundColor Yellow
    Write-Host "  Magisk > Modulos > '+' > Descargas > $name > Reiniciar"
    Write-Host "  (o activa 'Shell' en Magisk > Superusuario y vuelve a ejecutar este script)"
}
