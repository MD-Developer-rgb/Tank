@echo off
REM Creates THE_LAST_FIVE_NIGHTS.zip next to this folder (Windows 10+)
cd /d "%~dp0.."
if exist THE_LAST_FIVE_NIGHTS.zip del THE_LAST_FIVE_NIGHTS.zip
tar -a -c -f THE_LAST_FIVE_NIGHTS.zip THE_LAST_FIVE_NIGHTS
echo Created %cd%\THE_LAST_FIVE_NIGHTS.zip
pause
