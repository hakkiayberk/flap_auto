"""Flap preparation routes. Live signing is not enabled by this web API."""
from fastapi import APIRouter, HTTPException
from api.studio import LaunchDraft, prepare_flap, connection
router = APIRouter(prefix='/api/deploy', tags=['deploy'])


@router.post('/prepare')
async def prepare(params: LaunchDraft):
    return await prepare_flap(params)


@router.get('/status')
async def deploy_status():
    return await connection()


@router.post('')
async def deploy_token():
    raise HTTPException(503, 'Live deploy is disabled. Prepare the draft and simulate before signing.')
