"""FastAPI entry point, security boundary, and local frontend serving."""
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.responses import FileResponse
from starlette.exceptions import HTTPException
from starlette.staticfiles import StaticFiles

from . import customers, consultations, db, health, jobs, media, pairing
from .errors import error_response, install_handlers

FRONTEND_DIST = Path(__file__).resolve().parents[2] / "frontend/dist"
SECURITY_HEADERS = {
    "Content-Security-Policy": "default-src 'self'; img-src 'self' blob: data:; media-src 'self' blob:",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "X-Frame-Options": "DENY",
}


@asynccontextmanager
async def lifespan(app):
    db.initialize()
    db.recover_running_jobs()
    yield


app = FastAPI(lifespan=lifespan, docs_url=None, redoc_url=None, openapi_url=None)
install_handlers(app)


@app.middleware("http")
async def security(request: Request, call_next):
    if request.method in {"POST", "DELETE", "PUT", "PATCH"} and (
        request.headers.get("origin") != str(request.base_url).rstrip("/")
    ):
        response = error_response("forbidden", "Matching Origin required.")
    else:
        response = await call_next(request)
    response.headers.update(SECURITY_HEADERS)
    return response


for module in (health, customers, consultations, pairing, media, jobs):
    app.include_router(module.router)


class FrontendFiles(StaticFiles):
    async def get_response(self, path, scope):
        path = path.replace("\\", "/")
        # Never substitute the SPA for missing API, pairing, or private media routes.
        if path == "api" or path.startswith("api/") or path == "pair":
            raise HTTPException(404)
        if scope["method"] not in {"GET", "HEAD"}:
            raise HTTPException(405)
        if not FRONTEND_DIST.is_dir():
            raise HTTPException(404)
        if path in {".", "phone"} or path.startswith("phone/"):
            index = FRONTEND_DIST / "index.html"
            if index.is_file():
                return FileResponse(index, media_type="text/html")
            raise HTTPException(404)
        return await StaticFiles(directory=FRONTEND_DIST).get_response(path, scope)


# check_dir=False keeps the API available before the lead builds the frontend.
app.mount("/", FrontendFiles(check_dir=False), name="frontend")
