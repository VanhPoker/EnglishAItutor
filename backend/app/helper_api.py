"""
FastAPI helper server — provides token endpoint and utility APIs.
Run with: uvicorn app.helper_api:app --port 8080 --reload
"""

import logging

from dotenv import load_dotenv
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

load_dotenv()

from app.core.settings import settings
from app.router.auth import router as auth_router
from app.router.sessions import router as sessions_router
from app.router.token import router as token_router

app = FastAPI(title="English Agent API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(level=logging.INFO)

app.include_router(auth_router, prefix="/api/auth")
app.include_router(sessions_router, prefix="/api")
app.include_router(token_router, prefix="/api")


@app.get("/")
async def root():
    return {"message": "English Agent API is running"}


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    first = exc.errors()[0] if exc.errors() else {}
    message = first.get("msg") or "Invalid request"
    return JSONResponse(status_code=422, content={"detail": message})


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("app.helper_api:app", host="0.0.0.0", port=8080, reload=True, workers=1)
