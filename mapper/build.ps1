<#
.SYNOPSIS
  Compila gpmapper (ARM64, estatico) y empaqueta el modulo Magisk "Gamepad Mapper".
.DESCRIPTION
  1. Compila src\gpmapper.c con Zig -> module\gpmapper
  2. Empaqueta module\ con ..\build.ps1 -> ..\dist\gamepad_mapper-<version>.zip
.EXAMPLE
  .\build.ps1
  .\build.ps1 -Zig C:\zig\zig.exe
#>
[CmdletBinding()]
param([string]$Zig)

$ErrorActionPreference = 'Stop'
$here = if ($PSScriptRoot) { $PSScriptRoot } else { Split-Path -Parent $MyInvocation.MyCommand.Path }
$root = Split-Path -Parent $here

if (-not $Zig) {
    $local = Join-Path $root 'tools\zig\zig.exe'
    $cmd = Get-Command zig -ErrorAction SilentlyContinue
    if (Test-Path $local) { $Zig = $local } elseif ($cmd) { $Zig = $cmd.Source }
    else { throw "No se encontro Zig. Ponlo en tools\zig\ o usa -Zig <ruta> (https://ziglang.org/download/)." }
}

$src = Join-Path $here 'src\gpmapper.c'
$bin = Join-Path $here 'module\gpmapper'
Write-Host "Compilando gpmapper..."
if (Test-Path $bin) { Remove-Item $bin -Force }
# Zig escribe avisos en stderr; en PowerShell 5.1 eso no debe cortar el script.
$prevEap = $ErrorActionPreference
$ErrorActionPreference = 'Continue'
$out = & $Zig cc -target aarch64-linux-musl -static -O2 -Wall -Wextra -o $bin $src -lm 2>&1
$ErrorActionPreference = $prevEap
# Filtrar el aviso conocido de musl (crt/dlstart.c), que no es de nuestro codigo.
$out | Where-Object { "$_" -match 'gpmapper\.c' } | ForEach-Object { Write-Host $_ -ForegroundColor Yellow }
if ($LASTEXITCODE -ne 0 -or -not (Test-Path $bin)) { throw "Fallo la compilacion" }

& (Join-Path $root 'build.ps1') -ModuleDir (Join-Path $here 'module') -OutDir (Join-Path $root 'dist')
