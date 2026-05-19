@echo off
title Etheria — Deploy
color 0A

echo.
echo  ╔══════════════════════════════════════╗
echo  ║        ETHERIA  —  DEPLOY            ║
echo  ╚══════════════════════════════════════╝
echo.

cd /d "%~dp0"

echo  [1/4] Compilando con node build.js...
node build.js
if errorlevel 1 (
    echo.
    echo  ERROR: el build ha fallado. Revisa los mensajes de arriba.
    pause
    exit /b 1
)

echo.
echo  [2/4] Añadiendo archivos a git...
git add dist/ css/ js/ index.html
if errorlevel 1 (
    echo.
    echo  ERROR: git add ha fallado.
    pause
    exit /b 1
)

echo.
echo  [3/4] Creando commit...
git diff --cached --quiet
if errorlevel 1 (
    git commit -m "build: deploy"
) else (
    echo  Sin cambios nuevos que commitear, continuando...
)

echo.
echo  [4/4] Subiendo a GitHub...
git push origin feat/vn-dual-theme-system
if errorlevel 1 (
    echo.
    echo  ERROR: el push ha fallado. Comprueba tu conexion o el token de GitHub.
    pause
    exit /b 1
)

echo.
echo  ╔══════════════════════════════════════╗
echo  ║   Listo! Todo subido a GitHub. ✓    ║
echo  ╚══════════════════════════════════════╝
echo.
pause
