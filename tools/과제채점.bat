@echo off
rem SYNK 과제 채점 화면 ? 더블클릭 하나로 서버가 서고 브라우저가 열린다 (2026-08-25)
rem 정본 = C:\Users\q1212\Documents\SYNK-talk\tools\과제채점.js (이 파일은 여는 문일 뿐이다)
set NODE=C:\Program Files\nodejs\node.exe
if not exist "%NODE%" set NODE=node
start "" /min powershell -NoProfile -WindowStyle Hidden -Command "Start-Sleep 2; Start-Process 'http://localhost:8439'"
echo 과제 채점 화면을 켭니다 ? 잠시 뒤 브라우저가 열립니다. 끝나면 이 창을 닫으세요.
"%NODE%" "C:\Users\q1212\Documents\SYNK-talk\tools\과제채점.js"
pause