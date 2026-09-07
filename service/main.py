from __future__ import annotations

import asyncio
import uuid
import time
import json
import logging
import os
import re
from typing import Optional
from datetime import datetime, timezone
from fastapi import FastAPI, Request, HTTPException, status, Response, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException as StarletteHTTPException

from service.models import (
    HealthResponse,
    VersionResponse,
    ErrorResponse,
    ErrorDetail,
    ModelStatusResponse,
    EmbedRequest,
    EmbedResponse,
    SearchRequest,
    SearchResponse,
    RetrievalQueryRequest,
    RetrievalQueryResponse,
    DraftQuestionsRequest,
    DraftQuestionsResponse,
    LLMProviderStatusResponse,
    GroundedAnswerRequest,
    GroundedAnswerResponse,
    ExportPackageRequest,
    PackageValidationReport,
)
from service.embeddings import EmbeddingEngine
from service.retrieval import run_retrieval
from service.question_generator import generate_draft_questions_from_blocks
from service.llm import get_llm_provider
from service.packager import PackageExporter, validate_package_zip
from service.limits import MAX_REQUEST_BYTES
from service.auth import verify_bearer_token, get_allowed_extension_ids


logger = logging.getLogger("webrag.service")
if not logger.handlers:
    handler = logging.StreamHandler()
    handler.setFormatter(logging.Formatter("%(message)s"))
    logger.addHandler(handler)
logger.setLevel(os.getenv("WEBRAG_LOG_LEVEL", "INFO").upper())

_REQUEST_ID_PATTERN = re.compile(r"^[A-Za-z0-9._:-]{1,128}$")


def _safe_request_id(candidate: str | None) -> str:
    if candidate and _REQUEST_ID_PATTERN.fullmatch(candidate):
        return candidate
    return str(uuid.uuid4())


def _event_log(**fields: object) -> None:
    logger.info(json.dumps(fields, separators=(",", ":"), sort_keys=True))


app = FastAPI(
    title="WebRAG Studio Local Service",
    description="Local service for DOM chunking, embedding, vector search, RAG evaluation, and package export.",
    version="0.1.0"
)

# Concurrency limiter to serialize/cap heavy synchronous model inference
_inference_semaphore = asyncio.Semaphore(1)


class RequestSizeLimitExceeded(Exception):
    """Raised when an incoming request stream exceeds MAX_REQUEST_BYTES."""
    pass


def _is_request_size_exceeded(exc: BaseException) -> bool:
    if isinstance(exc, RequestSizeLimitExceeded):
        return True
    if hasattr(exc, "exceptions"):
        return any(_is_request_size_exceeded(sub) for sub in getattr(exc, "exceptions", []))
    return False


# Local development origins are explicit. Chrome extension origins can be restricted
# via WEBRAG_ALLOWED_EXTENSION_IDS or match the standard MV3 extension-ID shape.
_allowed_ids = get_allowed_extension_ids()
if _allowed_ids:
    _ids_pattern = "|".join([re.escape(eid) for eid in _allowed_ids])
    _origin_regex = rf"(?:chrome-extension://(?:{_ids_pattern})|http://(?:127\.0\.0\.1|localhost):\d{{1,5}})"
else:
    _origin_regex = r"(?:chrome-extension://[a-p]{32}|http://(?:127\.0\.0\.1|localhost):\d{1,5})"

app.add_middleware(
    CORSMiddleware,
    allow_origins=[],
    allow_origin_regex=_origin_regex,
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type", "X-Request-ID", "Authorization", "X-WebRAG-Token"],
)

@app.middleware("http")
async def add_request_metadata(request: Request, call_next):
    request_id = _safe_request_id(request.headers.get("X-Request-ID"))
    request.state.request_id = request_id
    started = time.perf_counter()

    # Fast-path header check if Content-Length is present
    content_length = request.headers.get("content-length")
    if content_length:
        try:
            if int(content_length) > MAX_REQUEST_BYTES:
                response = JSONResponse(
                    status_code=status.HTTP_413_CONTENT_TOO_LARGE,
                    content=ErrorResponse(
                        error=ErrorDetail(
                            code="REQUEST_TOO_LARGE",
                            message=f"Request exceeds the {MAX_REQUEST_BYTES // (1024 * 1024)} MB local-service limit. Reduce the captured page or chunk set and retry.",
                            requestId=request_id,
                            timestamp=datetime.now(timezone.utc).isoformat(),
                        )
                    ).model_dump(),
                )
                response.headers["X-Request-ID"] = request_id
                response.headers["X-Content-Type-Options"] = "nosniff"
                response.headers.setdefault("Cache-Control", "no-store")
                return response
        except ValueError:
            pass

    # Enforce request size limit on actual received streaming bytes
    bytes_received = 0
    original_receive = request._receive

    async def limited_receive():
        nonlocal bytes_received
        message = await original_receive()
        if message.get("type") == "http.request":
            body = message.get("body", b"")
            bytes_received += len(body)
            if bytes_received > MAX_REQUEST_BYTES:
                raise RequestSizeLimitExceeded()
        return message

    request._receive = limited_receive

    try:
        response = await call_next(request)
    except Exception as exc:
        if _is_request_size_exceeded(exc):
            response = JSONResponse(
                status_code=status.HTTP_413_CONTENT_TOO_LARGE,
                content=ErrorResponse(
                    error=ErrorDetail(
                        code="REQUEST_TOO_LARGE",
                        message=f"Request exceeds the {MAX_REQUEST_BYTES // (1024 * 1024)} MB local-service limit. Reduce the captured page or chunk set and retry.",
                        requestId=request_id,
                        timestamp=datetime.now(timezone.utc).isoformat(),
                    )
                ).model_dump(),
            )
        else:
            raise

    duration_ms = round((time.perf_counter() - started) * 1000, 2)
    response.headers["X-Request-ID"] = request_id
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers.setdefault("Cache-Control", "no-store")
    log_fields = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "event": "http_request_complete",
        "request_id": request_id,
        "method": request.method,
        "path": request.url.path,
        "status": response.status_code,
        "duration_ms": duration_ms,
    }
    if response.status_code >= 400:
        log_fields["error_code"] = "REQUEST_TOO_LARGE" if response.status_code == 413 else f"HTTP_{response.status_code}"
    _event_log(
        **log_fields,
    )
    return response

@app.exception_handler(RequestSizeLimitExceeded)
async def request_size_exceeded_handler(request: Request, exc: RequestSizeLimitExceeded):
    request_id = getattr(request.state, "request_id", str(uuid.uuid4()))
    now_iso = datetime.now(timezone.utc).isoformat()
    return JSONResponse(
        status_code=status.HTTP_413_CONTENT_TOO_LARGE,
        content=ErrorResponse(
            error=ErrorDetail(
                code="REQUEST_TOO_LARGE",
                message=f"Request exceeds the {MAX_REQUEST_BYTES // (1024 * 1024)} MB local-service limit. Reduce the captured page or chunk set and retry.",
                requestId=request_id,
                timestamp=now_iso,
            )
        ).model_dump(),
        headers={"X-Request-ID": request_id, "X-Content-Type-Options": "nosniff", "Cache-Control": "no-store"}
    )

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
    headers = {"X-Request-ID": request_id}
    if getattr(exc, "headers", None):
        headers.update(exc.headers)
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
        headers=headers
    )

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    request_id = getattr(request.state, "request_id", str(uuid.uuid4()))
    now_iso = datetime.now(timezone.utc).isoformat()
    if _is_request_size_exceeded(exc):
        return JSONResponse(
            status_code=status.HTTP_413_CONTENT_TOO_LARGE,
            content=ErrorResponse(
                error=ErrorDetail(
                    code="REQUEST_TOO_LARGE",
                    message=f"Request exceeds the {MAX_REQUEST_BYTES // (1024 * 1024)} MB local-service limit. Reduce the captured page or chunk set and retry.",
                    requestId=request_id,
                    timestamp=now_iso,
                )
            ).model_dump(),
            headers={"X-Request-ID": request_id, "X-Content-Type-Options": "nosniff", "Cache-Control": "no-store"}
        )
    _event_log(
        timestamp=now_iso,
        event="unhandled_exception",
        request_id=request_id,
        path=request.url.path,
        error_code="INTERNAL_SERVER_ERROR",
        exception_type=type(exc).__name__,
    )
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content=ErrorResponse(
            error=ErrorDetail(
                code="INTERNAL_SERVER_ERROR",
                message="An unexpected server error occurred. Retry the action and use the request ID when troubleshooting.",
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

# Embeddings & Vector Search Endpoints
@app.get("/model/status", response_model=ModelStatusResponse, dependencies=[Depends(verify_bearer_token)])
async def get_model_status():
    engine = EmbeddingEngine.get_instance()
    return engine.get_status()

@app.post("/embed", response_model=EmbedResponse, dependencies=[Depends(verify_bearer_token)])
async def embed_content(payload: EmbedRequest):
    start = time.perf_counter()
    engine = EmbeddingEngine.get_instance()
    
    if payload.chunks:
        async with _inference_semaphore:
            matrix, cached_count, computed_count = await asyncio.to_thread(
                engine.embed_chunks, payload.chunks
            )
    elif payload.texts:
        async with _inference_semaphore:
            matrix, cached_count, computed_count = await asyncio.to_thread(
                engine.embed_texts, payload.texts
            )
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

@app.post("/search", response_model=SearchResponse, dependencies=[Depends(verify_bearer_token)])
async def search_chunks(payload: SearchRequest):
    if not payload.query or not payload.query.strip():
        raise HTTPException(status_code=400, detail="Query cannot be empty.")
    
    if not payload.chunks:
        raise HTTPException(status_code=400, detail="Chunks list cannot be empty.")

    engine = EmbeddingEngine.get_instance()
    try:
        async with _inference_semaphore:
            response = await asyncio.to_thread(
                engine.search,
                query=payload.query,
                chunks=payload.chunks,
                top_k=payload.topK,
                strategy=payload.strategy,
                search_mode=payload.searchMode or "hybrid",
                min_score=payload.minScore
            )
        return response
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except RuntimeError as re:
        raise HTTPException(status_code=503, detail=str(re))
    except Exception:
        raise HTTPException(status_code=500, detail="Search failed unexpectedly. Retry using a smaller chunk set.")

# Retrieval Debugger & Question Generator Endpoints
@app.post("/retrieval/query", response_model=RetrievalQueryResponse, dependencies=[Depends(verify_bearer_token)])
async def retrieve_chunks(req: RetrievalQueryRequest):
    try:
        async with _inference_semaphore:
            results, duration_ms, degraded, fallback_reason = await asyncio.to_thread(
                run_retrieval,
                query=req.query,
                chunks=req.chunks,
                strategy=req.strategy,
                top_k=req.topK,
                search_mode=req.searchMode or "hybrid",
                min_score=req.minScore
            )
        return RetrievalQueryResponse(
            results=results,
            executionTimeMs=duration_ms,
            searchMode="bm25" if degraded else (req.searchMode or "hybrid"),
            degraded=degraded,
            fallbackReason=fallback_reason
        )
    except RuntimeError as re:
        raise HTTPException(status_code=503, detail=str(re))

@app.post("/evaluation/draft-questions", response_model=DraftQuestionsResponse, dependencies=[Depends(verify_bearer_token)])
async def draft_questions(req: DraftQuestionsRequest):
    drafts = generate_draft_questions_from_blocks(req.blocks)
    return DraftQuestionsResponse(questions=drafts)

# Grounded LLM Answers Endpoints
@app.get("/llm/status", response_model=LLMProviderStatusResponse, dependencies=[Depends(verify_bearer_token)])
async def get_llm_status():
    provider = get_llm_provider()
    return await provider.get_status()

@app.post("/llm/answer", response_model=GroundedAnswerResponse, dependencies=[Depends(verify_bearer_token)])
async def generate_grounded_answer(req: GroundedAnswerRequest):
    if not req.query or not req.query.strip():
        raise HTTPException(status_code=400, detail="Question/query cannot be empty.")
    if not req.chunks:
        raise HTTPException(status_code=400, detail="Candidate chunks list cannot be empty.")

    provider = get_llm_provider()
    try:
        response = await provider.generate_answer(
            query=req.query,
            chunks=req.chunks,
            model=req.model,
            temperature=req.temperature,
        )
        return response
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except RuntimeError as re:
        raise HTTPException(status_code=502, detail=str(re))
    except Exception:
        raise HTTPException(status_code=500, detail="Answer generation failed unexpectedly. Retrieved evidence is still available.")

@app.post("/llm/answer/stream", dependencies=[Depends(verify_bearer_token)])
async def stream_grounded_answer(req: GroundedAnswerRequest):
    if not req.query or not req.query.strip():
        raise HTTPException(status_code=400, detail="Question/query cannot be empty.")
    if not req.chunks:
        raise HTTPException(status_code=400, detail="Candidate chunks list cannot be empty.")

    provider = get_llm_provider()

    async def event_generator():
        try:
            async for event in provider.stream_answer(
                query=req.query,
                chunks=req.chunks,
                model=req.model,
                temperature=req.temperature,
            ):
                yield f"data: {event.model_dump_json()}\n\n"
        except Exception:
            err_event_json = json.dumps({
                "type": "error",
                "error": "The provider stream ended unexpectedly. Retrieved evidence is still available; retry when the provider is ready.",
            })
            yield f"data: {err_event_json}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        }
    )

# Portable RAG Package Endpoints
@app.post("/export/package", dependencies=[Depends(verify_bearer_token)])
async def export_rag_package(req: ExportPackageRequest):
    if not req.captureResult or not req.captureResult.blocks:
        raise HTTPException(status_code=400, detail="Cannot export package with empty capture blocks.")
    if not req.chunks:
        raise HTTPException(status_code=400, detail="Cannot export package with zero chunks.")

    try:
        zip_bytes, manifest = PackageExporter.build_package_zip(
            capture_result=req.captureResult,
            chunks=req.chunks,
            questions=req.questions,
            retrieval_results=req.retrievalResults,
            answers=req.answers,
            generation_metadata=req.generationMetadata,
        )

        url_slug = req.captureResult.capture.title.lower().replace(" ", "-")[:30]
        timestamp_slug = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
        filename = f"webrag-package-{url_slug}-{timestamp_slug}.zip"

        return Response(
            content=zip_bytes,
            media_type="application/zip",
            headers={
                "Content-Disposition": f'attachment; filename="{filename}"',
                "X-Manifest-Format-Version": manifest.formatVersion,
                "X-Total-Blocks": str(len(req.captureResult.blocks)),
                "X-Total-Chunks": str(len(req.chunks)),
            }
        )
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception:
        raise HTTPException(status_code=500, detail="Package export failed unexpectedly. Your capture remains available; retry with fewer records.")


@app.post("/package/validate", response_model=PackageValidationReport, dependencies=[Depends(verify_bearer_token)])
async def validate_rag_package(request: Request):
    content = await request.body()
    if not content:
        raise HTTPException(status_code=400, detail="Uploaded package ZIP file is empty.")
    try:
        report = validate_package_zip(content)
        return report
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=f"Failed to validate package ZIP: {str(exc)}")
    except Exception:
        raise HTTPException(status_code=400, detail="Failed to validate package ZIP. Confirm the file is a valid WebRAG package.")
