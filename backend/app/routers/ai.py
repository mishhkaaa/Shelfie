from fastapi import APIRouter, Depends

from ..ai.compile_intent import compile_intent
from ..ai.suggest_name import suggest_name
from ..deps import get_account_id
from ..schemas import (
    CompileIntentRequest,
    CompileIntentResponse,
    SuggestNameRequest,
    SuggestNameResponse,
)

router = APIRouter(tags=["ai"])


@router.post("/ai/suggest-name", response_model=SuggestNameResponse)
def suggest_name_endpoint(
    body: SuggestNameRequest,
    account_id: str = Depends(get_account_id),
):
    name, description = suggest_name(body.constraints)
    return SuggestNameResponse(suggestedName=name, suggestedDescription=description)


@router.post("/ai/compile-intent", response_model=CompileIntentResponse)
def compile_intent_endpoint(
    body: CompileIntentRequest,
    account_id: str = Depends(get_account_id),
):
    constraints_patch, provenance = compile_intent(body.sentence)
    return CompileIntentResponse(constraints=constraints_patch, provenance=provenance)
