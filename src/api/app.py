"""FastAPI application factory."""

import os
from typing import List

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from src.api.routes import router

_DEFAULT_ORIGINS = ["http://localhost:5173", "http://127.0.0.1:5173"]


def _get_allowed_origins() -> List[str]:
    env = os.environ.get("CORS_ALLOWED_ORIGINS")
    if env:
        return [o.strip() for o in env.split(",") if o.strip()]
    return list(_DEFAULT_ORIGINS)


def create_app() -> FastAPI:
    application = FastAPI(title="dj-tools API", version="0.1.0")

    application.add_middleware(
        CORSMiddleware,
        allow_origins=_get_allowed_origins(),
        allow_methods=["GET", "POST", "PUT", "DELETE"],
        allow_headers=["*"],
    )

    application.include_router(router)
    return application


app = create_app()
