<#
.SYNOPSIS
  Compila gpbridge.c como binario estatico ARM64 para Android usando Zig.
.EXAMPLE
  .\build.ps1 -Zig C:\tools\zig\zig.exe
#>
[CmdletBinding()]
param(
    [string]$Zig = 'zig'
)
$ErrorActionPreference = 'Stop'
$here = if ($PSScriptRoot) { $PSScriptRoot } else { Split-Path -Parent $MyInvocation.MyCommand.Path }
$src = Join-Path $here 'gpbridge.c'
$out = Join-Path $here 'gpbridge'
& $Zig cc -target aarch64-linux-musl -static -O2 -Wall -o $out $src
if ($LASTEXITCODE -ne 0) { throw "Fallo la compilacion" }
Write-Host "Generado: $out" -ForegroundColor Green
