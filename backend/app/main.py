import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import CORS_ORIGINS
from .db import Base, engine
from .migrations import run_migrations
from .routers import ai, behaviour, catalog, discover, personas, profiles

logging.basicConfig(level=logging.INFO)

# New tables (stars, recent_searches) are created here; new columns on
# pre-existing tables (profiles.visibility, accounts.behaviour_tracking_enabled,
# etc.) are added by run_migrations — create_all() never alters existing
# tables, only creates missing ones.
Base.metadata.create_all(bind=engine)
run_migrations(engine)

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
#
# The in-page Discover panel (content script injected into myntra.com) is a
# different case: fetch() calls made from a content script carry the PAGE's
# origin (https://www.myntra.com), not chrome-extension://..., because
# content scripts execute in the page's own security context for this
# purpose even though they're extension code — the regex above never
# matches it. Without this, every request from the in-page panel fails CORS
# silently (the browser blocks the response before JS ever sees it), which
# surfaced as the Discover list hanging on "Loading..." forever.
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"chrome-extension://.*",
    allow_origins=_explicit_origins or ["http://localhost:5173", "https://www.myntra.com"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(personas.router)
app.include_router(profiles.router)
app.include_router(ai.router)
app.include_router(discover.router)
app.include_router(behaviour.router)
app.include_router(catalog.router)


@app.get("/health")
def health():
    return {"status": "ok"}
