<#
.SYNOPSIS
  Compila la app Android "Gamepad Mapper" (editor visual de perfiles) sin Gradle.
.DESCRIPTION
  aapt2 (recursos) -> javac -> d8 (dex) -> zipalign -> apksigner.
  Usa tools\jdk y tools\android-sdk (platform android-35, build-tools 35.0.0).
  La primera vez crea una clave de firma en ..\keystore\ (NO la pierdas: las
  actualizaciones de la app deben firmarse con la misma clave).
  Resultado: ..\dist\GamepadMapper-<version>.apk
.EXAMPLE
  .\build.ps1
#>
[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$here = if ($PSScriptRoot) { $PSScriptRoot } else { Split-Path -Parent $MyInvocation.MyCommand.Path }
$root = Split-Path -Parent $here
$jdk = Join-Path $root 'tools\jdk'
$sdk = Join-Path $root 'tools\android-sdk'
$bt = Join-Path $sdk 'build-tools\35.0.0'
$androidJar = Join-Path $sdk 'platforms\android-35\android.jar'
foreach ($p in "$jdk\bin\javac.exe", "$bt\aapt2.exe", "$bt\d8.bat", "$bt\apksigner.bat", $androidJar) {
    if (-not (Test-Path $p)) { throw "Falta $p (ver README: herramientas en tools\)" }
}
$env:JAVA_HOME = $jdk
$env:PATH = "$jdk\bin;$env:PATH"

function Run([string]$exe, [string[]]$a) {
    # Las herramientas escriben avisos en stderr; solo cuenta el codigo de salida.
    $prev = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    $out = & $exe @a 2>&1
    $code = $LASTEXITCODE
    $ErrorActionPreference = $prev
    $out | ForEach-Object { "$_" } | Where-Object { $_ -match 'error|Error|ERROR' } | ForEach-Object { Write-Host "  $_" -ForegroundColor Yellow }
    if ($code -ne 0) { $out | ForEach-Object { Write-Host "  $_" }; throw "Fallo: $(Split-Path $exe -Leaf) (codigo $code)" }
}

$manifest = Join-Path $here 'AndroidManifest.xml'
[xml]$mx = Get-Content $manifest
$version = $mx.manifest.versionName

$build = Join-Path $here 'build'
if (Test-Path $build) { Remove-Item $build -Recurse -Force }
New-Item -ItemType Directory -Force "$build\gen", "$build\classes", "$build\dex" | Out-Null

# El modulo Magisk (modo root opcional) va dentro del APK: la app lo guarda en Descargas.
# Se genera con ..\mapper\build.ps1 (dist\gamepad_mapper-vN.zip); se usa la version mas alta.
$mod = Get-ChildItem (Join-Path $root 'dist') -Filter 'gamepad_mapper-v*.zip' -ErrorAction SilentlyContinue |
    Sort-Object { [int]($_.BaseName -replace '\D', '') } | Select-Object -Last 1
if (-not $mod) { throw "Falta dist\gamepad_mapper-v*.zip (genera el modulo con mapper\build.ps1)" }
New-Item -ItemType Directory -Force "$build\assets" | Out-Null
Copy-Item $mod.FullName "$build\assets\gamepad_mapper.zip"
Write-Host "   modulo root incluido: $($mod.Name)"
# gpmapper para el modo rapido con Shizuku (la app lo copia y lo lanza como usuario shell)
$gpm = Join-Path $root 'mapper\module\gpmapper'
if (-not (Test-Path $gpm)) { throw "Falta $gpm (compila antes con mapper\build.ps1)" }
Copy-Item $gpm "$build\assets\gpmapper"
# Catalogo de perfiles incluido (Perfiles > Descargar funciona sin internet): ..\presets
New-Item -ItemType Directory -Force "$build\assets\presets" | Out-Null
Get-ChildItem (Join-Path $root 'presets') -File | Where-Object { $_.Extension -in '.json', '.conf' } |
    ForEach-Object { Copy-Item $_.FullName "$build\assets\presets\" }
Write-Host "   catalogo incluido: $((Get-ChildItem "$build\assets\presets").Count) archivos"

Write-Host "1/6 Recursos (aapt2)..."
Run "$bt\aapt2.exe" @('compile', '--dir', (Join-Path $here 'res'), '-o', "$build\res.zip")
Run "$bt\aapt2.exe" @('link', '-I', $androidJar, '--manifest', $manifest, '--java', "$build\gen",
    '-A', "$build\assets", '-o', "$build\unsigned.apk", "$build\res.zip")

Write-Host "2/6 Java (javac)..."
$sources = @(Get-ChildItem (Join-Path $here 'src'), "$build\gen" -Recurse -Filter *.java | ForEach-Object { $_.FullName })
# java.* del JDK (--release 11) + android.* desde android.jar; d8 adapta las lambdas.
Run "$jdk\bin\javac.exe" (@('-encoding', 'UTF-8', '--release', '11', '-classpath', $androidJar,
        '-d', "$build\classes") + $sources)

Write-Host "3/6 Dex (d8)..."
$classes = @(Get-ChildItem "$build\classes" -Recurse -Filter *.class | ForEach-Object { $_.FullName })
Run "$bt\d8.bat" (@('--release', '--min-api', '26', '--lib', $androidJar, '--output', "$build\dex") + $classes)

Write-Host "4/6 Empaquetado..."
Add-Type -AssemblyName System.IO.Compression, System.IO.Compression.FileSystem
$zip = [System.IO.Compression.ZipFile]::Open("$build\unsigned.apk", [System.IO.Compression.ZipArchiveMode]::Update)
try {
    [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, "$build\dex\classes.dex", 'classes.dex') | Out-Null
} finally { $zip.Dispose() }
Run "$bt\zipalign.exe" @('-p', '-f', '4', "$build\unsigned.apk", "$build\aligned.apk")

Write-Host "5/6 Clave de firma..."
$ksDir = Join-Path $root 'keystore'
$ks = Join-Path $ksDir 'gamepad-mapper.jks'
$pwFile = Join-Path $ksDir 'password.txt'
if (-not (Test-Path $ks)) {
    New-Item -ItemType Directory -Force $ksDir | Out-Null
    $pw = -join ((48..57) + (65..90) + (97..122) | Get-Random -Count 24 | ForEach-Object { [char]$_ })
    [IO.File]::WriteAllText($pwFile, $pw)
    Run "$jdk\bin\keytool.exe" @('-genkeypair', '-keystore', $ks, '-alias', 'gamepadmapper', '-keyalg', 'RSA',
        '-keysize', '2048', '-validity', '10000', '-storepass', $pw, '-keypass', $pw,
        '-dname', 'CN=Gamepad Mapper, O=Personal')
    Write-Host "  Clave creada en $ks (guarda keystore\ fuera de git)" -ForegroundColor Cyan
}
$pw = ([IO.File]::ReadAllText($pwFile)).Trim()

Write-Host "6/6 Firma (apksigner)..."
$dist = Join-Path $root 'dist'
New-Item -ItemType Directory -Force $dist | Out-Null
$apk = Join-Path $dist "GamepadMapper-$version.apk"
Run "$bt\apksigner.bat" @('sign', '--ks', $ks, '--ks-key-alias', 'gamepadmapper', '--ks-pass', "pass:$pw",
    '--key-pass', "pass:$pw", '--out', $apk, "$build\aligned.apk")
Run "$bt\apksigner.bat" @('verify', $apk)

Write-Host ""
Write-Host "APK generado: $apk" -ForegroundColor Green
