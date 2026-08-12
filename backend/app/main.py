import logging

from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from app.api.auth import router as auth_router
from app.api.dashboard import router as dashboard_router
from app.api.exercises import router as exercises_router
from app.api.nutrition import router as nutrition_router
from app.api.progress import router as progress_router
from app.api.routines import router as routines_router
from app.api.workouts import router as workouts_router
from app.api.workouts import volume_router
from app.core.config import get_settings
from app.core.limiter import limiter

settings = get_settings()

app = FastAPI(title="FitStack API", version="0.1.0")

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router, prefix="/api/v1")
app.include_router(exercises_router, prefix="/api/v1")
app.include_router(routines_router, prefix="/api/v1")
app.include_router(workouts_router, prefix="/api/v1")
app.include_router(volume_router, prefix="/api/v1")
app.include_router(nutrition_router, prefix="/api/v1")
app.include_router(progress_router, prefix="/api/v1")
app.include_router(dashboard_router, prefix="/api/v1")

logger = logging.getLogger("fitstack")


@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "no-referrer"
    if settings.cookie_secure:  # only meaningful once we're actually on HTTPS
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    return response


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """Anything that reaches here is a bug. Log it with the traceback for Sentry
    or the log drain, but return a generic body -- FastAPI's default surfaces
    internals (a ResponseValidationError, for instance, echoes the field that
    failed) which is noise to the user and detail to an attacker."""
    logger.exception("Unhandled error on %s %s", request.method, request.url.path)
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={"detail": "Something went wrong on our end. Please try again."},
    )


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
