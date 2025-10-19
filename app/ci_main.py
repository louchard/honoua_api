# app/ci_main.py — serveur minimal pour la CI
from fastapi import FastAPI
app = FastAPI()

@app.get("/health")
def health():
    return {"status": "ok"}


from fastapi import FastAPI
from app.leaderboard_api import router as leaderboard_router

app = FastAPI()

# … tes routes existantes …

app.include_router(leaderboard_router)


