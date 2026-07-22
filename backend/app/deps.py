from fastapi import Header, HTTPException, Depends
from sqlalchemy.orm import Session

from .db import get_db
from .models import Account


def get_account_id(
    x_account_id: str = Header(..., alias="X-Account-Id"),
    db: Session = Depends(get_db),
) -> str:
    if not x_account_id or not x_account_id.strip():
        raise HTTPException(status_code=400, detail="X-Account-Id header is required")

    account = db.get(Account, x_account_id)
    if account is None:
        account = Account(account_id=x_account_id)
        db.add(account)
        db.commit()

    return x_account_id
