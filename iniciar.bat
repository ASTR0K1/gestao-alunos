@echo off
cd /d "%~dp0"
set PY=

rem Procura um Python verdadeiro. O atalho falso da Microsoft Store nao conta.
py -3 --version >nul 2>nul
if not errorlevel 1 set "PY=py -3"
if not defined PY (
    python --version >nul 2>nul
    if not errorlevel 1 set "PY=python"
)
if not defined PY goto semPython

echo.
echo  Gestao de alunos - o site vai abrir no browser.
echo  Deixa esta janela aberta enquanto usas o site.
echo  Para parar: fecha esta janela.
echo.
%PY% src\servidor.py
echo.
echo  O servidor parou. Se aparecer um erro acima, tira uma captura e envia-a.
pause
exit /b

:semPython
echo.
echo  Falta instalar o Python. E gratis e demora cerca de 1 minuto.
echo.
echo  Vai abrir-se a Microsoft Store. Escolhe o Python mais recente
echo  (por exemplo Python 3.13) e clica em Obter.
echo  Quando acabar, faz duplo clique em iniciar.bat outra vez.
echo.
start "" "ms-windows-store://search/?query=python"
pause
