@echo off
chcp 65001 >nul
title Covo AI パッチ適用マネージャー

:MENU
cls
echo ============================================================
echo   ⚡ Covo AI パッチ適用マネージャー
echo ============================================================
echo.
echo   [1] クリップボードの修正コードを自動適用 (Enterを押すだけ)
echo   [2] 直前の変更を取り消して元に戻す (Undo)
echo   [3] 変更内容を確認する (git diff)
echo   [4] 終了
echo.
echo ============================================================
set "choice=1"
set /p "choice=番号を入力してください (1-4) [初期値: 1]: "

if "%choice%"=="1" goto APPLY
if "%choice%"=="2" goto UNDO
if "%choice%"=="3" goto DIFF
if "%choice%"=="4" goto EXIT
goto MENU

:APPLY
echo.
node patch.js --apply
echo.
goto END

:UNDO
echo.
node patch.js --undo
echo.
goto END

:DIFF
echo.
git diff
echo.
goto END

:END
echo ------------------------------------------------------------
pause
goto MENU

:EXIT
exit