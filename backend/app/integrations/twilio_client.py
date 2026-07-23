"""Minimal Twilio WhatsApp sender — plain httpx + HTTP Basic Auth against
Twilio's REST API directly, matching this codebase's existing convention
(ai/groq_client.py also talks to its provider via raw httpx rather than
pulling in an SDK) rather than adding the `twilio` package for one endpoint.

Never raises to the caller: every failure mode (not configured, Twilio
rejects the request, network error) returns (False, <reason>) so a share
attempt degrades to a visible "couldn't send" message, the same
never-silently-break discipline used for every other external call in this
app (Groq included).
"""

import logging
from typing import Optional

import httpx

from ..config import TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER

logger = logging.getLogger("shelfie.whatsapp")

TWILIO_MESSAGES_URL = "https://api.twilio.com/2010-04-01/Accounts/{sid}/Messages.json"


def _as_whatsapp_address(number: str) -> str:
    number = number.strip()
    return number if number.startswith("whatsapp:") else f"whatsapp:{number}"


def send_whatsapp_message(to_number: str, body: str) -> tuple[bool, Optional[str]]:
    if not (TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN and TWILIO_FROM_NUMBER):
        return False, "WhatsApp sharing isn't configured on the backend."
    if not to_number or not to_number.strip():
        return False, "No phone number to send to."

    url = TWILIO_MESSAGES_URL.format(sid=TWILIO_ACCOUNT_SID)
    payload = {
        "From": _as_whatsapp_address(TWILIO_FROM_NUMBER),
        "To": _as_whatsapp_address(to_number),
        "Body": body,
    }

    try:
        resp = httpx.post(url, data=payload, auth=(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN), timeout=10.0)
    except httpx.HTTPError as exc:
        logger.warning("whatsapp: request to Twilio failed: %s", exc)
        return False, "Couldn't reach Twilio — try again."

    if resp.status_code >= 400:
        # Twilio's error body is JSON with a human-readable "message" field —
        # surface it (e.g. "not a valid WhatsApp-enabled number", or the
        # sandbox's "recipient hasn't joined" message) rather than a bare
        # status code, since that's usually exactly what the user needs to
        # know to fix it (sandbox numbers must first send the join code).
        try:
            detail = resp.json().get("message", resp.text)
        except ValueError:
            detail = resp.text
        logger.warning("whatsapp: Twilio rejected send (%s): %s", resp.status_code, detail)
        return False, detail

    logger.info("whatsapp: sent to %s", to_number)
    return True, None
