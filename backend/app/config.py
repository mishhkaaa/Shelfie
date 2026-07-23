import os

from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./shelfie.db")

GROQ_API_KEYS = [
    key
    for key in (
        os.getenv("GROQ_API_KEY_1"),
        os.getenv("GROQ_API_KEY_2"),
        os.getenv("GROQ_API_KEY_3"),
        os.getenv("GROQ_API_KEY_4"),
    )
    if key
]

GROQ_MODEL = os.getenv("GROQ_MODEL", "openai/gpt-oss-20b")

# Groq models known to support strict-mode (schema-locked) structured outputs.
# Everything else falls back to best-effort json_object mode.
GROQ_STRICT_SUPPORTED_MODELS = {"openai/gpt-oss-20b", "openai/gpt-oss-120b"}

PORT = int(os.getenv("PORT", "8000"))

CORS_ORIGINS = os.getenv("CORS_ORIGINS", "chrome-extension://*")

# WhatsApp sharing via Twilio. All optional — sharing degrades to a clear
# "not configured" response rather than erroring if any of these are unset.
TWILIO_ACCOUNT_SID = os.getenv("TWILIO_ACCOUNT_SID", "")
TWILIO_AUTH_TOKEN = os.getenv("TWILIO_AUTH_TOKEN", "")
TWILIO_FROM_NUMBER = os.getenv("TWILIO_FROM_NUMBER", "")
# Default recipient when the caller doesn't supply one — convenient for a
# one-click demo share, not required for real use.
TWILIO_TO_NUMBER = os.getenv("TWILIO_TO_NUMBER", "")
