<#
.SYNOPSIS
  Empaqueta la carpeta module\ como un zip de modulo Magisk en dist\.

.DESCRIPTION
  Lee id y version de module\module.prop y genera dist\<id>-<version>.zip.
  Usa System.IO.Compression con rutas "/" (Magisk no acepta "\" dentro del zip)
  y normaliza los finales de linea de los scripts a LF.

.EXAMPLE
  .\build.ps1
#>
[CmdletBinding()]
param(
    [string]$ModuleDir,
    [string]$OutDir
)

$ErrorActionPreference = 'Stop'
# En Windows PowerShell 5.1, $PSScriptRoot no esta disponible en el bloque param.
$here = if ($PSScriptRoot) { $PSScriptRoot } else { Split-Path -Parent $MyInvocation.MyCommand.Path }
if (-not $ModuleDir) { $ModuleDir = Join-Path $here 'module' }
if (-not $OutDir)    { $OutDir    = Join-Path $here 'dist' }
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

$propFile = Join-Path $ModuleDir 'module.prop'
if (-not (Test-Path $propFile)) { throw "No se encontro $propFile" }

$props = @{}
foreach ($line in Get-Content $propFile) {
    if ($line -match '^\s*([^#=]+?)\s*=\s*(.*)$') { $props[$Matches[1]] = $Matches[2] }
}
foreach ($k in 'id', 'version', 'versionCode') {
    if (-not $props[$k]) { throw "module.prop no tiene '$k'" }
}

New-Item -ItemType Directory -Force $OutDir | Out-Null
$zipPath = Join-Path $OutDir ("{0}-{1}.zip" -f $props.id, $props.version)
if (Test-Path $zipPath) { Remove-Item $zipPath -Force }

# Archivos de texto que Android/Magisk leen: forzar LF y UTF-8 sin BOM.
# Todo lo demas (p. ej. binarios sin extension) se copia byte a byte.
$textExt   = @('.prop', '.idc', '.sh', '.kl', '.kcm', '.conf', '.txt')
$textNames = @('update-binary', 'updater-script')
$utf8 = New-Object System.Text.UTF8Encoding($false)

$root = (Resolve-Path $ModuleDir).Path.TrimEnd('\')
$zip = [System.IO.Compression.ZipFile]::Open($zipPath, [System.IO.Compression.ZipArchiveMode]::Create)
try {
    Get-ChildItem $root -Recurse -File | ForEach-Object {
        $rel = $_.FullName.Substring($root.Length + 1).Replace('\', '/')
        $entry = $zip.CreateEntry($rel, [System.IO.Compression.CompressionLevel]::Optimal)
        $stream = $entry.Open()
        try {
            if (($textExt -contains $_.Extension.ToLower()) -or ($textNames -contains $_.Name)) {
                $text = [System.IO.File]::ReadAllText($_.FullName) -replace "`r`n", "`n"
                $bytes = $utf8.GetBytes($text)
            } else {
                $bytes = [System.IO.File]::ReadAllBytes($_.FullName)
            }
            $stream.Write($bytes, 0, $bytes.Length)
        } finally { $stream.Dispose() }
        Write-Host "  + $rel"
    }
} finally { $zip.Dispose() }

Write-Host ""
Write-Host "Modulo generado: $zipPath" -ForegroundColor Green
Write-Host ("  {0} {1} (versionCode {2})" -f $props.name, $props.version, $props.versionCode)
