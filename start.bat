@echo off
REM ============================================================
REM Shelfie - one-shot dev bring-up
REM   1. Starts Postgres via Docker Compose (backend\docker-compose.yml)
REM   2. Creates/uses a Python venv in backend\, installs requirements
REM   3. Seeds the synthetic product catalog (idempotent)
REM   4. Launches the FastAPI backend (uvicorn --reload) in its OWN
REM      visible terminal window so you can watch the logs live
REM   5. Installs extension deps and runs `npm run build`
REM
REM After this finishes: chrome://extensions -> Developer mode ->
REM Load unpacked -> select extension\dist
REM ============================================================

setlocal
set ROOT=%~dp0
set BACKEND=%ROOT%backend
set EXTENSION=%ROOT%extension

echo.
echo ==================================================
echo  [1/5] Starting Postgres (Docker Compose)
echo ==================================================
cd /d "%BACKEND%"
docker compose up -d
if errorlevel 1 (
    echo.
    echo Docker Compose failed to start. Is Docker Desktop running?
    pause
    exit /b 1
)

echo.
echo ==================================================
echo  [2/5] Setting up Python virtual environment
echo ==================================================
if not exist "%BACKEND%\.venv\Scripts\python.exe" (
    echo Creating venv...
    python -m venv "%BACKEND%\.venv"
)
call "%BACKEND%\.venv\Scripts\activate.bat"

echo Installing/updating backend dependencies...
python -m pip install --upgrade pip >nul
pip install -r "%BACKEND%\requirements.txt"
if errorlevel 1 (
    echo.
    echo Failed to install backend dependencies.
    pause
    exit /b 1
)

echo.
echo ==================================================
echo  [3/5] Waiting for Postgres to be healthy...
echo ==================================================
set /a _tries=0
:waitdb
docker inspect --format="{{.State.Health.Status}}" shelfie-db 2>nul | findstr /i "healthy" >nul
if not errorlevel 1 goto dbready
set /a _tries+=1
if %_tries% GEQ 30 (
    echo Postgres did not become healthy in time - continuing anyway.
    goto dbready
)
timeout /t 2 /nobreak >nul
goto waitdb
:dbready
echo Postgres is up.

echo.
echo ==================================================
echo  [4/5] Seeding synthetic product catalog
echo ==================================================
cd /d "%BACKEND%"
python -m scripts.seed_catalog
if errorlevel 1 (
    echo Seeding failed - continuing anyway, backend may still run.
)

echo.
echo ==================================================
echo  [5/5] Launching backend (visible terminal, live logs)
echo ==================================================
start "Shelfie Backend (uvicorn)" cmd /k "cd /d "%BACKEND%" && call .venv\Scripts\activate.bat && uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload"

echo.
echo ==================================================
echo  Building the Chrome extension
echo ==================================================
cd /d "%EXTENSION%"
if not exist "node_modules" (
    echo Installing extension dependencies...
    call npm install
    if errorlevel 1 (
        echo npm install failed.
        pause
        exit /b 1
    )
)

call npm run build
if errorlevel 1 (
    echo.
    echo Extension build failed.
    pause
    exit /b 1
)

echo.
echo ==================================================
echo  All done!
echo ==================================================
echo  Backend:   http://localhost:8000/health   (logs in the new "Shelfie Backend" window)
echo  Postgres:  localhost:5433  (container: shelfie-db)
echo  Extension: built to %EXTENSION%\dist
echo.
echo  To load it in Chrome:
echo    1. Open chrome://extensions
echo    2. Enable "Developer mode" (top right)
echo    3. Click "Load unpacked"
echo    4. Select: %EXTENSION%\dist
echo.
echo  After future code changes: run this script again (or just
echo  `npm run build` in extension\), then click the reload icon
echo  on the Shelfie card in chrome://extensions.
echo ==================================================
pause
endlocal
