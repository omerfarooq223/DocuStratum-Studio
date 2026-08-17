import uuid
import time
import json
from datetime import datetime, timezone
from fastapi import FastAPI, Request, HTTPException, status
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
)
from service.embeddings import EmbeddingEngine
from service.retrieval import run_retrieval
from service.question_generator import generate_draft_questions_from_blocks
from service.llm import get_llm_provider


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

# Day 5 Embeddings & Vector Search Endpoints
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

# Day 6 Retrieval Debugger & Question Generator Endpoints
@app.post("/retrieval/query", response_model=RetrievalQueryResponse)
async def retrieve_chunks(req: RetrievalQueryRequest):
    results, duration_ms = run_retrieval(
        query=req.query,
        chunks=req.chunks,
        strategy=req.strategy,
        top_k=req.topK
    )
    return RetrievalQueryResponse(
        results=results,
        executionTimeMs=duration_ms
    )

@app.post("/evaluation/draft-questions", response_model=DraftQuestionsResponse)
async def draft_questions(req: DraftQuestionsRequest):
    drafts = generate_draft_questions_from_blocks(req.blocks)
    return DraftQuestionsResponse(questions=drafts)

# Day 7 Grounded LLM Answers Endpoints
@app.get("/llm/status", response_model=LLMProviderStatusResponse)
async def get_llm_status():
    provider = get_llm_provider()
    return await provider.get_status()

@app.post("/llm/answer", response_model=GroundedAnswerResponse)
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
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Answer generation failed: {str(e)}")

@app.post("/llm/answer/stream")
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
        except Exception as e:
            err_event_json = f'{{"type":"error","error":{json.dumps(str(e))}}}'
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

