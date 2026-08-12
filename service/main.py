import uuid
from datetime import datetime, timezone
from fastapi import FastAPI, Request, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from service.models import HealthResponse, VersionResponse, ErrorResponse, ErrorDetail

from starlette.exceptions import HTTPException as StarletteHTTPException

app = FastAPI(
    title="WebRAG Studio Local Service",
    description="Local service for DOM chunking, embedding, vector search, RAG evaluation, and package export.",
    version="0.1.0"
)

# CORS middleware configured for Chrome extension and local development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Restricted in production MV3 messaging / chrome-extension:// origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.middleware("http")
async def add_request_metadata(request: Request, call_next):
    request_id = request.headers.get("X-Request-ID") or str(uuid.uuid4())
    request.state.request_id = request_id
    response = await call_next(request)
    response.headers["X-Request-ID"] = request_id
    return response

@app.exception_handler(StarletteHTTPException)
async def starlette_http_exception_handler(request: Request, exc: StarletteHTTPException):
    request_id = getattr(request.state, "request_id", str(uuid.uuid4()))
    now_iso = datetime.now(timezone.utc).isoformat()
    return JSONResponse(
        status_code=exc.status_code,
        content=ErrorResponse(
            error=ErrorDetail(
                code=f"HTTP_{exc.status_code}",
                message=str(exc.detail),
                requestId=request_id,
                timestamp=now_iso
            )
        ).model_dump(),
        headers={"X-Request-ID": request_id}
    )


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    request_id = getattr(request.state, "request_id", str(uuid.uuid4()))
    now_iso = datetime.now(timezone.utc).isoformat()
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content=ErrorResponse(
            error=ErrorDetail(
                code="INTERNAL_SERVER_ERROR",
                message="An unexpected server error occurred.",
                requestId=request_id,
                timestamp=now_iso
            )
        ).model_dump(),
        headers={"X-Request-ID": request_id}
    )

@app.get("/health", response_model=HealthResponse)
async def get_health(request: Request):
    request_id = getattr(request.state, "request_id", str(uuid.uuid4()))
    now_iso = datetime.now(timezone.utc).isoformat()
    return HealthResponse(
        status="healthy",
        version="0.1.0",
        schemaVersion="1.0.0",
        timestamp=now_iso,
        requestId=request_id
    )

@app.get("/version", response_model=VersionResponse)
async def get_version():
    return VersionResponse()
