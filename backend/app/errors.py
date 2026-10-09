"""Errors shared by the API routers."""
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException

STATUS_CODES = {
    "not_found": 404, "forbidden": 403, "revision_conflict": 409,
    "invalid_input": 422, "unsupported_media": 415, "too_large": 413,
    "model_unavailable": 503, "conflict_unresolved": 409, "pair_expired": 410,
}


class APIError(Exception):
    def __init__(self, code, message, *, retryable=False, revision=None):
        self.code = code
        self.message = message
        self.retryable = retryable
        self.revision = revision


def error_response(code, message, *, retryable=False, revision=None, status_code=None):
    body = {"code": code, "message": message, "retryable": retryable}
    if revision is not None:
        body["revision"] = revision
    return JSONResponse(body, status_code=status_code or STATUS_CODES[code])


def install_handlers(app: FastAPI):
    @app.exception_handler(APIError)
    async def api_error(request: Request, exc: APIError):
        return error_response(exc.code, exc.message, retryable=exc.retryable,
                              revision=exc.revision)

    @app.exception_handler(RequestValidationError)
    async def validation_error(request: Request, exc: RequestValidationError):
        return error_response("invalid_input", "Check the request fields.")

    @app.exception_handler(HTTPException)
    async def http_error(request: Request, exc: HTTPException):
        code = next((key for key, status in STATUS_CODES.items()
                     if status == exc.status_code), "http_error")
        return error_response(code, "Request could not be completed.",
                              status_code=exc.status_code)
