"""
Flap token deploy API.
Calls the flap-quick-buy Node.js backend via subprocess to deploy a new
token on Flap.sh BSC using the VaultPortal contract.

The deploy logic itself lives in the flap-quick-buy TypeScript project.
This endpoint:
1. Validates the token params
2. Calls `node --import tsx flap-deploy.ts <params>` in the parent project
3. Returns the new token address
"""
import json
import asyncio
import logging
import subprocess
import os
import re
from pathlib import Path
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/deploy", tags=["deploy"])

# Path to the flap-quick-buy project root
FLAP_ROOT = Path(__file__).resolve().parents[3]  # ../../.. from backend/api/


class DeployParams(BaseModel):
    name: str = Field(..., min_length=1, max_length=32, description="Token full name")
    ticker: str = Field(..., min_length=2, max_length=8, description="Token symbol / ticker")
    description: str = Field("", max_length=512)
    image_url: str = Field("", description="IPFS or HTTPS image URL for token logo")
    buy_amount_bnb: float = Field(0.005, ge=0.001, le=0.1, description="Initial dev buy in BNB")
    buy_tax_bps: int = Field(0, ge=0, le=1000, description="Buy tax in basis points (0-1000)")
    sell_tax_bps: int = Field(0, ge=0, le=1000, description="Sell tax in basis points (0-1000)")
    wallet_id: str = Field("w01", description="Wallet ID from the keystore to sign with")


class DeployResult(BaseModel):
    success: bool
    token_address: str = ""
    tx_hash: str = ""
    flap_url: str = ""
    error: str = ""


@router.post("", response_model=DeployResult)
async def deploy_token(params: DeployParams):
    """
    Deploy a new meme token on Flap.sh BSC.
    Requires the flap-quick-buy project to be present and configured.
    """
    if os.environ.get("ENABLE_LIVE_DEPLOY") != "true":
        raise HTTPException(status_code=503, detail="Live deploy is disabled during preparation.")
    # Validate flap-quick-buy project exists
    deploy_script = FLAP_ROOT / "src" / "flap-deploy.ts"
    if not (FLAP_ROOT / "package.json").exists():
        raise HTTPException(
            status_code=503,
            detail="flap-quick-buy project not found. Deploy unavailable.",
        )

    if not deploy_script.exists():
        raise HTTPException(
            status_code=503,
            detail="Deploy script (flap-deploy.ts) not found. Please generate it first.",
        )

    payload = {
        "name": params.name,
        "ticker": params.ticker,
        "description": params.description,
        "imageUrl": params.image_url,
        "buyAmountBnb": params.buy_amount_bnb,
        "buyTaxBps": params.buy_tax_bps,
        "sellTaxBps": params.sell_tax_bps,
        "walletId": params.wallet_id,
    }

    env = os.environ.copy()
    if not env.get("KEYSTORE_PASSWORD"):
        raise HTTPException(status_code=503, detail="Signer is not configured on the server.")
    env["DEPLOY_PAYLOAD"] = json.dumps(payload)

    try:
        proc = await asyncio.create_subprocess_exec(
            "node", "--import", "tsx", str(deploy_script),
            cwd=str(FLAP_ROOT),
            env=env,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=120)
    except asyncio.TimeoutError:
        proc.kill()
        await proc.communicate()
        raise HTTPException(status_code=504, detail="Deploy timed out after 120s")
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Deploy process error: {exc}")

    out = stdout.decode("utf-8", errors="replace")
    err = stderr.decode("utf-8", errors="replace")
    logger.info("Deploy process exited with code %s", proc.returncode)

    if proc.returncode != 0:
        return DeployResult(success=False, error="Deploy failed; check restricted server diagnostics.")

    # Parse output — expect JSON line like: {"tokenAddress":"0x...","txHash":"0x..."}
    for line in reversed(out.splitlines()):
        line = line.strip()
        if line.startswith("{"):
            try:
                result = json.loads(line)
                addr = result.get("tokenAddress", "")
                tx = result.get("txHash", "")
                if not re.fullmatch(r"0x[0-9a-fA-F]{40}", addr) or not re.fullmatch(r"0x[0-9a-fA-F]{64}", tx):
                    continue
                flap_url = f"https://flap.sh/bnb/{addr}" if addr else ""
                return DeployResult(
                    success=True,
                    token_address=addr,
                    tx_hash=tx,
                    flap_url=flap_url,
                )
            except json.JSONDecodeError:
                pass

    return DeployResult(success=False, error="Could not parse deploy output")


@router.get("/status")
def deploy_status():
    """Check if deploy is available (flap-deploy.ts exists)."""
    deploy_script = FLAP_ROOT / "src" / "flap-deploy.ts"
    flap_env = FLAP_ROOT / ".env"
    return {
        "flap_project_found": (FLAP_ROOT / "package.json").exists(),
        "deploy_script_found": deploy_script.exists(),
        "env_configured": flap_env.exists(),
        "flap_root": str(FLAP_ROOT),
    }
