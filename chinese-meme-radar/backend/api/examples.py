"""User-supplied references with observed facts separated from naming hypotheses."""
import json
from pathlib import Path
from fastapi import APIRouter

router = APIRouter(prefix="/api/examples", tags=["examples"])
REFERENCE_FILE = Path(__file__).resolve().parents[1] / "reference" / "examples.json"


@router.get("")
def list_examples():
    return {"items": json.loads(REFERENCE_FILE.read_text(encoding="utf-8")),
            "note": "Reference patterns only. These are not investment recommendations or automatic launch signals."}
