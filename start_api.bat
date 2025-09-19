@echo off
cd /d C:\honoua_api
C:\honoua_api\.venv\Scripts\python.exe -m uvicorn main:app --host 127.0.0.1 --port 8000
