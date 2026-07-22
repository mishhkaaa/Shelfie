import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..db import get_db
from ..deps import get_account_id
from ..models import Persona
from ..schemas import GlobalExclusions, GlobalExclusionsResponse, PersonaCreate

router = APIRouter(tags=["personas"])


@router.get("/personas")
def list_personas(account_id: str = Depends(get_account_id), db: Session = Depends(get_db)):
    personas = (
        db.query(Persona)
        .filter(Persona.account_id == account_id)
        .order_by(Persona.created_at)
        .all()
    )
    return {"personas": [{"id": p.persona_id, "name": p.name} for p in personas]}


@router.post("/personas")
def create_persona(
    body: PersonaCreate,
    account_id: str = Depends(get_account_id),
    db: Session = Depends(get_db),
):
    persona = Persona(persona_id=f"persona_{uuid.uuid4().hex}", account_id=account_id, name=body.name)
    db.add(persona)
    db.commit()
    return {"id": persona.persona_id, "name": persona.name}


def _get_owned_persona(db: Session, persona_id: str, account_id: str) -> Persona:
    persona = db.get(Persona, persona_id)
    if persona is None or persona.account_id != account_id:
        raise HTTPException(status_code=404, detail="Persona not found")
    return persona


@router.get("/personas/{persona_id}/exclusions", response_model=GlobalExclusionsResponse)
def get_exclusions(
    persona_id: str,
    account_id: str = Depends(get_account_id),
    db: Session = Depends(get_db),
):
    persona = _get_owned_persona(db, persona_id, account_id)
    data = persona.global_exclusions or {}
    return GlobalExclusionsResponse(globalExclusions=GlobalExclusions(**data))


@router.patch("/personas/{persona_id}/exclusions", response_model=GlobalExclusionsResponse)
def set_exclusions(
    persona_id: str,
    body: GlobalExclusions,
    account_id: str = Depends(get_account_id),
    db: Session = Depends(get_db),
):
    persona = _get_owned_persona(db, persona_id, account_id)
    persona.global_exclusions = body.model_dump()
    db.commit()
    return GlobalExclusionsResponse(globalExclusions=body)
