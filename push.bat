@echo off
title ContourLinea - Push to GitHub
cd /d "%~dp0"

set "REPO_URL=https://github.com/HBrOcean/ContourLinea.git"

echo ============================================================
echo   ContourLinea  ^|  push source + tags to GitHub
echo ============================================================
echo.

where git >nul 2>&1
if errorlevel 1 goto :no_git

if not exist ".git" goto :no_repo

git rev-parse --is-inside-work-tree >nul 2>&1
if errorlevel 1 goto :no_repo

echo [1/3] Configuring remote "origin" ...
git remote get-url origin >nul 2>&1
if errorlevel 1 (
    git remote add origin "%REPO_URL%"
) else (
    git remote set-url origin "%REPO_URL%"
)
if errorlevel 1 goto :remote_fail
echo       origin = %REPO_URL%
echo.

echo [2/3] Local repository info ...
echo       branch:
git branch --show-current
echo       tags:
git tag
echo       recent commits:
git --no-pager log --oneline -4
echo.

echo [3/3] Pushing to GitHub ...
echo       (a login window may pop up - sign in with your GitHub account)
echo.
git push -u origin HEAD --tags
if not errorlevel 1 goto :ok

echo.
echo [WARN] Normal push failed - retrying with --force-with-lease ...
git push -u origin HEAD --tags --force-with-lease
if not errorlevel 1 goto :ok

echo.
echo ============================================================
echo   [FAILED] Push did not succeed.
echo.
echo   Please check:
echo     - network connection is OK
echo     - you are signed in to GitHub and have write access
echo     - the repo exists: %REPO_URL%
echo ============================================================
echo.
pause
exit /b 1

:ok
echo.
echo ============================================================
echo   [OK] Pushed successfully!
echo.
echo   Watch the CI build here:
echo     https://github.com/HBrOcean/ContourLinea/actions
echo.
echo   The first Rust build takes about 15-25 minutes.
echo ============================================================
echo.
pause
exit /b 0

:no_git
echo [ERROR] git was not found in PATH.
echo         Install Git for Windows first:
echo         https://git-scm.com/download/win
echo.
pause
exit /b 1

:no_repo
echo [ERROR] ".git" folder was not found in the current directory:
echo.
cd
echo.
echo         Please UNZIP the whole package first, then run this file
echo         from the extracted ContourLinea folder.
echo.
pause
exit /b 1

:remote_fail
echo [ERROR] Failed to configure remote "origin".
echo.
pause
exit /b 1
