"""FastAPI entrypoint. POST /enqueue triggers a background LangGraph run."""
from __future__ import annotations
import hmac
from fastapi import BackgroundTasks, FastAPI, Header, HTTPException
from pydantic import BaseModel

from . import __version__
from .config import WORKER_SHARED_SECRET
from .graph import process_run

app = FastAPI(title="Clause Worker", version=__version__)


class EnqueueBody(BaseModel):
    run_id: str
    criteria_set_id: str


@app.get("/health")
def health():
    return {"ok": True, "version": __version__}


@app.post("/enqueue", status_code=202)
def enqueue(body: EnqueueBody, bg: BackgroundTasks, x_worker_secret: str = Header(default="")):
    if not hmac.compare_digest(x_worker_secret, WORKER_SHARED_SECRET):
        raise HTTPException(status_code=401, detail="Invalid worker secret")
    bg.add_task(process_run, body.run_id)
    return {"accepted": True, "run_id": body.run_id}
