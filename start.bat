@echo off
chcp 65001 >nul
title 3D 방 스캐너 서버

echo ================================================================
echo 🏠 3D 방 스캐너 로컬 서버 시작
echo ================================================================
echo.

REM 현재 디렉토리 확인
if not exist "index.html" (
    echo ❌ index.html 파일이 없습니다.
    echo    3d-room-scanner 폴더에서 실행해주세요.
    pause
    exit /b 1
)

echo 사용 가능한 실행 방법을 확인합니다...
echo.

REM Python 확인
python --version >nul 2>&1
if %errorlevel%==0 (
    echo ✅ Python 사용 가능
    set PYTHON_AVAILABLE=1
) else (
    echo ❌ Python 없음
    set PYTHON_AVAILABLE=0
)

REM Node.js 확인
node --version >nul 2>&1
if %errorlevel%==0 (
    echo ✅ Node.js 사용 가능
    set NODE_AVAILABLE=1
) else (
    echo ❌ Node.js 없음
    set NODE_AVAILABLE=0
)

echo.
echo 실행 방법을 선택하세요:
echo.

if %PYTHON_AVAILABLE%==1 (
    echo [1] Python HTTPS 서버 (권장 - 카메라 기능 사용 가능)
    echo [2] Python HTTP 서버 (개발용)
)

if %NODE_AVAILABLE%==1 (
    echo [3] Node.js 서버 (npx serve)
    echo [4] Node.js Live Server (개발용)
)

echo [5] 수동으로 브라우저에서 파일 열기
echo [0] 종료
echo.

set /p choice="선택 (1-5, 0): "

if "%choice%"=="1" (
    if %PYTHON_AVAILABLE%==1 (
        echo.
        echo 🔒 Python HTTPS 서버를 시작합니다...
        python server.py
    ) else (
        echo ❌ Python이 설치되지 않았습니다.
        goto :menu
    )
) else if "%choice%"=="2" (
    if %PYTHON_AVAILABLE%==1 (
        echo.
        echo 🔓 Python HTTP 서버를 시작합니다...
        python server.py --http
    ) else (
        echo ❌ Python이 설치되지 않았습니다.
        goto :menu
    )
) else if "%choice%"=="3" (
    if %NODE_AVAILABLE%==1 (
        echo.
        echo 🚀 Node.js 서버를 시작합니다...
        npx serve . -s
    ) else (
        echo ❌ Node.js가 설치되지 않았습니다.
        goto :menu
    )
) else if "%choice%"=="4" (
    if %NODE_AVAILABLE%==1 (
        echo.
        echo 🔄 Live Server를 시작합니다...
        npx live-server --port=8000 --open=/
    ) else (
        echo ❌ Node.js가 설치되지 않았습니다.
        goto :menu
    )
) else if "%choice%"=="5" (
    echo.
    echo 📂 파일 탐색기에서 index.html을 열어주세요.
    echo ⚠️  카메라 기능은 HTTPS 환경에서만 작동합니다.
    start .
    pause
) else if "%choice%"=="0" (
    echo 👋 종료합니다.
    exit /b 0
) else (
    echo ❌ 잘못된 선택입니다.
    echo.
    goto :menu
)

:menu
echo.
pause
goto :eof

:error
echo ❌ 오류가 발생했습니다.
pause
exit /b 1
