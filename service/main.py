import uuid
from datetime import datetime, timezone
from fastapi import FastAPI, Request, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import time
from service.models import (
    HealthResponse,
    VersionResponse,
    ErrorResponse,
    ErrorDetail,
    ModelStatusResponse,
    EmbedRequest,
    EmbedResponse,
    SearchRequest,
    SearchResponse
)
from service.embeddings import EmbeddingEngine

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

from fastapi.exceptions import RequestValidationError

@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    request_id = getattr(request.state, "request_id", str(uuid.uuid4()))
    now_iso = datetime.now(timezone.utc).isoformat()
    errors_str = "; ".join([f"{'.'.join(str(loc) for loc in err['loc'])}: {err['msg']}" for err in exc.errors()])
    return JSONResponse(
        status_code=status.HTTP_400_BAD_REQUEST,
        content=ErrorResponse(
            error=ErrorDetail(
                code="VALIDATION_ERROR",
                message=f"Validation failed: {errors_str}",
                requestId=request_id,
                timestamp=now_iso
            )
        ).model_dump(),
        headers={"X-Request-ID": request_id}
    )

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
                message=f"An unexpected server error occurred: {str(exc)}",
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

@app.get("/model/status", response_model=ModelStatusResponse)
async def get_model_status():
    engine = EmbeddingEngine.get_instance()
    return engine.get_status()

@app.post("/embed", response_model=EmbedResponse)
async def embed_content(payload: EmbedRequest):
    start = time.perf_counter()
    engine = EmbeddingEngine.get_instance()
    
    if payload.chunks:
        matrix, cached_count, computed_count = engine.embed_chunks(payload.chunks)
    elif payload.texts:
        matrix, cached_count, computed_count = engine.embed_texts(payload.texts)
    else:
        raise HTTPException(status_code=400, detail="Either 'texts' or 'chunks' must be provided in request body.")

    latency_ms = round((time.perf_counter() - start) * 1000, 2)
    return EmbedResponse(
        embeddings=matrix.tolist(),
        model=engine.model_name,
        dimension=engine.dimension,
        latencyMs=latency_ms,
        cachedCount=cached_count,
        computedCount=computed_count
    )

@app.post("/search", response_model=SearchResponse)
async def search_chunks(payload: SearchRequest):
    if not payload.query or not payload.query.strip():
        raise HTTPException(status_code=400, detail="Query cannot be empty.")
    
    if not payload.chunks:
        raise HTTPException(status_code=400, detail="Chunks list cannot be empty.")

    engine = EmbeddingEngine.get_instance()
    try:
        response = engine.search(
            query=payload.query,
            chunks=payload.chunks,
            top_k=payload.topK,
            strategy=payload.strategy
        )
        return response
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Search failed: {str(e)}")

