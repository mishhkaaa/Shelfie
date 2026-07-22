import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..db import get_db
from ..deps import get_account_id
from ..models import Persona
from ..schemas import PersonaCreate

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
