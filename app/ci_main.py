# app/ci_main.py â€” serveur minimal pour la CI
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import RedirectResponse

app = FastAPI()

@app.get("/health")
def health():
    return {"status": "ok"}

# Monter le dossier static (si tu as app/static/compare.html)
app.mount("/static", StaticFiles(directory="app/static"), name="static")

# Route conviviale pour accÃ©der Ã  la page de comparaison
@app.get("/compare", include_in_schema=False)
def compare_route():
    return RedirectResponse(url="/static/compare.html", status_code=307)

# â¬‡ï¸ Import RELATIF pour Ã©viter ModuleNotFoundError
try:
    from .leaderboard_api import router as leaderboard_router  # optional
    app.include_router(leaderboard_router)
except Exception:
    # leaderboard feature not available in CI context
    pass

