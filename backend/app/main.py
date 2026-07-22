import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import CORS_ORIGINS
from .db import Base, engine
from .routers import ai, personas, profiles

logging.basicConfig(level=logging.INFO)

Base.metadata.create_all(bind=engine)

app = FastAPI(title="Shelfie Backend")

_explicit_origins = [
    origin.strip()
    for origin in CORS_ORIGINS.split(",")
    if origin.strip() and origin.strip() != "chrome-extension://*"
]

# Dev-only: Chrome extension side-panel requests come from a
# chrome-extension://<extension-id> origin, which is different per install
# and per machine — allow_origin_regex covers any of them so local dev never
# silently CORS-fails. This is NOT appropriate for the eventual AWS
# deployment, which should pin CORS_ORIGINS to the real extension ID(s).
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"chrome-extension://.*",
    allow_origins=_explicit_origins or ["http://localhost:5173"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(personas.router)
app.include_router(profiles.router)
app.include_router(ai.router)


@app.get("/health")
def health():
    return {"status": "ok"}
