from datetime import date, datetime, timezone

from fastapi import APIRouter, Cookie, Depends, HTTPException, Response, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_db
from app.core.security import (
    create_access_token,
    generate_refresh_token,
    hash_password,
    hash_refresh_token,
    verify_password,
)
from app.models.nutrition import NutritionTarget
from app.models.progress import BodyMetric
from app.models.user import RefreshToken, User
from app.schemas.auth import LoginRequest, RegisterRequest, TokenResponse, UserOut
from app.services.adaptive import macros_from_calories, mifflin_st_jeor, target_calories_for

router = APIRouter(prefix="/auth", tags=["auth"])

REFRESH_COOKIE_NAME = "refresh_token"


def _issue_tokens(response: Response, db: Session, user: User) -> TokenResponse:
    raw_refresh, token_hash, expires_at = generate_refresh_token()
    db.add(
        RefreshToken(
            user_id=user.id,
            token_hash=token_hash,
            expires_at=expires_at,
        )
    )
    db.commit()

    response.set_cookie(
        key=REFRESH_COOKIE_NAME,
        value=raw_refresh,
        httponly=True,
        secure=True,
        samesite="lax",
        max_age=int((expires_at - datetime.now(timezone.utc)).total_seconds()),
    )

    return TokenResponse(
        access_token=create_access_token(user.id),
        user=UserOut.model_validate(user),
    )


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
def register(payload: RegisterRequest, response: Response, db: Session = Depends(get_db)):
    if db.query(User).filter(User.email == payload.email).first() is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already registered")

    user = User(
        email=payload.email,
        password_hash=hash_password(payload.password),
        full_name=payload.full_name,
        goal=payload.goal,
        goal_rate_kg_week=payload.goal_rate_kg_week,
        height_cm=payload.height_cm,
    )
    db.add(user)
    db.flush()  # assigns user.id for the rows below

    today = date.today()
    db.add(
        BodyMetric(
            user_id=user.id,
            log_date=today,
            weight_kg=payload.weight_kg,
        )
    )

    baseline_tdee = mifflin_st_jeor(
        weight_kg=payload.weight_kg,
        height_cm=payload.height_cm,
        age=payload.age,
        sex=payload.sex,
        activity_level=payload.activity_level,
    )
    target_calories = target_calories_for(baseline_tdee, payload.goal_rate_kg_week)
    macros = macros_from_calories(target_calories, payload.weight_kg, payload.goal)
    db.add(
        NutritionTarget(
            user_id=user.id,
            effective_date=today,
            calories=macros["calories"],
            protein_g=macros["protein_g"],
            carbs_g=macros["carbs_g"],
            fat_g=macros["fat_g"],
            source="adaptive",
        )
    )

    db.commit()
    db.refresh(user)

    return _issue_tokens(response, db, user)


@router.post("/login", response_model=TokenResponse)
def login(payload: LoginRequest, response: Response, db: Session = Depends(get_db)):
    invalid_credentials = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password"
    )

    user = db.query(User).filter(User.email == payload.email).first()
    if user is None or not verify_password(payload.password, user.password_hash):
        raise invalid_credentials

    return _issue_tokens(response, db, user)


@router.post("/refresh", response_model=TokenResponse)
def refresh(
    response: Response,
    db: Session = Depends(get_db),
    refresh_token: str | None = Cookie(default=None, alias=REFRESH_COOKIE_NAME),
):
    invalid_token = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired refresh token"
    )
    if refresh_token is None:
        raise invalid_token

    token_hash = hash_refresh_token(refresh_token)
    stored = db.query(RefreshToken).filter(RefreshToken.token_hash == token_hash).first()

    now = datetime.now(timezone.utc)
    if (
        stored is None
        or stored.revoked
        or stored.expires_at.replace(tzinfo=timezone.utc) < now
    ):
        raise invalid_token

    stored.revoked = True

    user = db.get(User, stored.user_id)
    if user is None:
        raise invalid_token

    return _issue_tokens(response, db, user)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(
    response: Response,
    db: Session = Depends(get_db),
    refresh_token: str | None = Cookie(default=None, alias=REFRESH_COOKIE_NAME),
):
    if refresh_token is not None:
        token_hash = hash_refresh_token(refresh_token)
        stored = db.query(RefreshToken).filter(RefreshToken.token_hash == token_hash).first()
        if stored is not None:
            stored.revoked = True
            db.commit()

    response.delete_cookie(REFRESH_COOKIE_NAME)


@router.get("/me", response_model=UserOut)
def me(current_user: User = Depends(get_current_user)):
    return current_user
