# app/ci_main.py — serveur minimal pour la CI
from fastapi import FastAPI
app = FastAPI()

@app.get("/health")
def health():
    return {"status": "ok"}

