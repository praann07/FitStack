from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.auth import router as auth_router
from app.api.dashboard import router as dashboard_router
from app.api.exercises import router as exercises_router
from app.api.nutrition import router as nutrition_router
from app.api.progress import router as progress_router
from app.api.routines import router as routines_router
from app.api.workouts import router as workouts_router
from app.api.workouts import volume_router
from app.core.config import get_settings

settings = get_settings()

app = FastAPI(title="FitStack API", version="0.1.0")

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


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
