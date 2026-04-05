from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import account, analytics, auth, bugs, evaluate, test_suites
from app.config import settings
from app.db.database import create_tables


@asynccontextmanager
async def lifespan(app: FastAPI):
    create_tables()
    yield


app = FastAPI(
    title=settings.app_title,
    version=settings.app_version,
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api")
app.include_router(account.router, prefix="/api")
app.include_router(bugs.router, prefix="/api")
app.include_router(evaluate.router, prefix="/api")
app.include_router(analytics.router, prefix="/api")
app.include_router(test_suites.router, prefix="/api")


@app.get("/health")
def health():
    return {"status": "ok"}
