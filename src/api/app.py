"""FastAPI application factory."""

import os
from typing import List

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from src.api.routes import router


def _default_origins() -> List[str]:
    port = os.environ.get("CLIENT_PORT", "5174")
    return [f"http://localhost:{port}", f"http://127.0.0.1:{port}"]


def _get_allowed_origins() -> List[str]:
    env = os.environ.get("CORS_ALLOWED_ORIGINS")
    if env:
        return [o.strip() for o in env.split(",") if o.strip()]
    return _default_origins()


def create_app() -> FastAPI:
    application = FastAPI(title="dj-tools API", version="0.1.0")

    application.add_middleware(
        CORSMiddleware,
        allow_origins=_get_allowed_origins(),
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
        allow_headers=["*"],
    )

    application.include_router(router)
    return application


app = create_app()
