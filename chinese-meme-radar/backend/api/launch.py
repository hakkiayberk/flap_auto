"""Read-only launch readiness. Never decrypts wallets or initiates transactions."""
import os
import json
from pathlib import Path
from fastapi import APIRouter
from collectors.x import discovery_status

router = APIRouter(prefix="/api/launch", tags=["launch"])
FLAP_ROOT = Path(__file__).resolve().parents[3]


def readiness():
    checks = []
    discovery = discovery_status()
    checks.append({"name": "X discovery", "ready": discovery["status"] == "ok",
                   "detail": discovery["detail"]})
    checks.append({"name": "X integration", "ready": False,
                   "detail": "Account verification and write access still need to be connected and tested."})
    deploy_found = (FLAP_ROOT / "src" / "flap-deploy.ts").exists()
    checks.append({"name": "Flap preparation", "ready": deploy_found,
                   "detail": "Unsigned Flap preparation is available. Use Launch Studio to check RPC and prepare; live signing is disabled." if deploy_found else "Deploy adapter is missing."})
    count = 0
    try:
        wallets = json.loads((FLAP_ROOT / "watch-wallets.json").read_text())
        if isinstance(wallets, list):
            count = len({str(w.get("address", "")).lower() for w in wallets if isinstance(w, dict) and w.get("address")})
    except (OSError, ValueError):
        pass
    checks.append({"name": "10 buy wallets", "ready": count == 10,
                   "detail": f"{count} unique watch addresses found. Signing access and balances are not verified."})
    checks.append({"name": "Quote asset", "ready": True,
                   "detail": "BNB selected for the first release. ERC-20 quote pools remain unsupported."})
    checks.append({"name": "Tax configuration", "ready": False,
                   "detail": "Buy 2% / sell 2%. Dividend or recipient allocation, durations and budget are still pending."})
    checks.append({"name": "Execution", "ready": False,
                   "detail": "Live launch is disabled. No automatic post, deploy or buy is running."})
    return {"mode": "preparation", "live_ready": False, "checks": checks, "x_discovery": discovery}


@router.get("/status")
def launch_status():
    return readiness()
