@echo off
rem Demarre l'app sur ce PC et l'ouvre dans le navigateur. Fermer cette fenetre arrete l'app.
cd /d "%~dp0"
set "PATH=%LOCALAPPDATA%\Programs\nodejs;%PATH%"
start "" http://localhost:5180
node serve.mjs
