from fastapi import APIRouter, Depends

from ..ai.suggest_name import suggest_name
from ..deps import get_account_id
from ..schemas import SuggestNameRequest, SuggestNameResponse

router = APIRouter(tags=["ai"])


@router.post("/ai/suggest-name", response_model=SuggestNameResponse)
def suggest_name_endpoint(
    body: SuggestNameRequest,
    account_id: str = Depends(get_account_id),
):
    name, description = suggest_name(body.constraints)
    return SuggestNameResponse(suggestedName=name, suggestedDescription=description)
