"""Local launch drafts, asset storage and explicit metadata pinning. No signing."""
import asyncio
import base64
import json
import re
import uuid
from pathlib import Path
from typing import Optional, Literal
import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from analyzers.token_namer import suggest_token

router = APIRouter(prefix='/api/studio', tags=['studio'])
ROOT = Path(__file__).resolve().parents[3]
ASSETS = ROOT / 'data' / 'launch-assets'
ASSETS.mkdir(parents=True, exist_ok=True)
MAX_IMAGE_BYTES = 3 * 1024 * 1024


class LaunchDraft(BaseModel):
    source_title: str = Field('', max_length=10000)
    source_url: str = Field('', max_length=1000)
    name: str = Field('', max_length=32)
    ticker: str = Field('', max_length=8)
    description: str = Field('', max_length=512)
    tweet_text: str = Field('', max_length=2000)
    first_post_url: str = Field('', max_length=300)
    logo_asset: str = Field('', max_length=100)
    creator_address: str = Field('', max_length=42)
    buy_tax_bps: int = Field(200, ge=0, le=1000)
    sell_tax_bps: int = Field(200, ge=0, le=1000)
    distribution: Optional[Literal['recipient', 'dividend']] = None
    beneficiary: str = Field('', max_length=42)
    tax_days: Optional[int] = Field(None, ge=365, le=36500)
    anti_farmer_days: Optional[int] = Field(None, ge=0, le=365)
    minimum_dividend_tokens: str = Field('0', max_length=50)
    initial_buy_bnb: str = Field('0', max_length=50)
    wallet_buy_bnb: str = Field('', max_length=50)
    metadata_cid: str = Field('', max_length=120)


def image_brief(title: str, name: str) -> str:
    suggestion = suggest_token(title)
    subject = {'萌兰': 'a distinctive playful giant panda', '黑柴': 'an expressive black-and-tan Shiba Inu',
               '泡菜': 'a cheerful kimchi mascot inspired by Korean food culture'}.get(name)
    if not subject:
        subject = f'a visual metaphor for the confirmed subject {name or "[choose a subject]"}'
    return (f'Create a square token avatar featuring {subject}. Source context: {title[:600]}. '
            'Use one clear silhouette, an expressive face and strong contrast readable at 48px. '
            'No company logos, no invented affiliation, no price claims and no lettering. '
            'Do not copy an existing token logo. Confirm the actual subject and source image before production.')


def draft_preview(params: LaunchDraft):
    missing = []
    for value, label in [(params.name.strip(), 'Token name'), (params.ticker.strip(), 'Token symbol'),
                         (params.distribution, 'Tax distribution'), (params.creator_address, 'Launch wallet'),
                         (params.first_post_url, 'Confirmed first-post URL'), (params.logo_asset, 'Selected logo'),
                         (params.metadata_cid, 'Verified Flap metadata'), (params.tax_days, 'Tax duration'),
                         (params.anti_farmer_days is not None, 'Anti-farmer duration')]:
        if not value:
            missing.append(label)
    if params.distribution == 'recipient' and not params.beneficiary:
        missing.append('Tax recipient address')
    return {'mode': 'draft', 'quote_asset': 'BNB', 'buy_tax_percent': params.buy_tax_bps / 100,
            'sell_tax_percent': params.sell_tax_bps / 100, 'missing': missing,
            'image_brief': image_brief(params.source_title, params.name),
            'flap_launch_url': 'https://flap.sh/launch', 'live_enabled': False,
            'buy_wallet_count': 10, 'buy_budget_configured': bool(params.wallet_buy_bnb),
            'stages': ['Select subject', 'Prepare logo and first post', 'Confirm posted URL',
                       'Pin and verify metadata', 'Prepare unsigned Flap transaction', 'Simulate', 'Sign deployment', 'Confirm', 'Prepare 10-wallet buy']}


async def node_adapter(mode: str, payload=None, timeout=45):
    proc = await asyncio.create_subprocess_exec('node', '--import', 'tsx', 'src/flap-deploy.ts', mode,
                cwd=str(ROOT), stdin=asyncio.subprocess.PIPE, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE)
    try:
        out, _ = await asyncio.wait_for(proc.communicate(json.dumps(payload or {}).encode()), timeout=timeout)
    except asyncio.TimeoutError:
        proc.kill()
        await proc.communicate()
        raise HTTPException(504, 'Preparation timed out. No transaction was sent.')
    try:
        result = json.loads(out.decode())
    except (ValueError, UnicodeDecodeError):
        raise HTTPException(503, 'Preparation adapter is unavailable. No transaction was sent.')
    if proc.returncode != 0 or result.get('error'):
        raise HTTPException(422, result.get('error', 'Preparation failed.'))
    return result


@router.post('/draft')
def preview(params: LaunchDraft):
    return draft_preview(params)


@router.get('/connection')
async def connection():
    return await node_adapter('status', timeout=15)


class PostPreview(BaseModel):
    text: str = Field(..., max_length=2000)


@router.post('/post-preview')
async def post_preview(params: PostPreview):
    return await node_adapter('post-preview', {'text': params.text}, timeout=10)


class LogoUpload(BaseModel):
    data_url: str = Field(..., max_length=4 * 1024 * 1024 + 100)


@router.post('/logo')
def upload_logo(params: LogoUpload):
    if not params.data_url.startswith('data:image/png;base64,'):
        raise HTTPException(422, 'Use a PNG image smaller than 3 MB.')
    try:
        image = base64.b64decode(params.data_url.split(',', 1)[1], validate=True)
    except (ValueError, TypeError):
        raise HTTPException(422, 'Invalid PNG data.')
    if len(image) > MAX_IMAGE_BYTES or not image.startswith(b'\x89PNG\r\n\x1a\n'):
        raise HTTPException(422, 'Use a valid PNG image smaller than 3 MB.')
    asset_id = uuid.uuid4().hex + '.png'
    path = ASSETS / asset_id
    path.write_bytes(image)
    path.chmod(0o600)
    return {'logo_asset': asset_id, 'url': f'/api/launch-assets/{asset_id}', 'bytes': len(image)}


def asset_path(asset_id):
    if asset_id == 'concept:black-shiba':
        return ROOT / 'chinese-meme-radar/frontend/public/concepts/black-shiba-concept.png'
    if not re.fullmatch(r'[a-f0-9]{32}\.png', asset_id):
        raise HTTPException(422, 'Choose or upload a logo first.')
    path = ASSETS / asset_id
    if not path.exists():
        raise HTTPException(422, 'Logo is not available locally.')
    return path


def valid_post_url(url):
    return bool(re.fullmatch(r'https://(?:x\.com|twitter\.com)/(?:[A-Za-z0-9_]{1,15}|i)/status/\d{1,19}', url))


def valid_address(address):
    return bool(re.fullmatch(r'0x[0-9a-fA-F]{40}', address)) and address.lower() != '0x' + '0' * 40


@router.post('/metadata')
async def pin_metadata(params: LaunchDraft):
    if not valid_post_url(params.first_post_url) or not valid_address(params.creator_address):
        raise HTTPException(422, 'Provide the confirmed first-post URL and launch wallet address before pinning.')
    path = asset_path(params.logo_asset)
    operations = {'query': 'mutation Create($file: Upload!, $meta: MetadataInput!) { create(file: $file, meta: $meta) }',
                  'variables': {'file': None, 'meta': {'description': params.description, 'twitter': params.first_post_url,
                  'telegram': None, 'website': None, 'creator': params.creator_address}}}
    async with httpx.AsyncClient(timeout=30, follow_redirects=False) as client:
        try:
            response = await client.post('https://funcs.flap.sh/api/upload',
                data={'operations': json.dumps(operations), 'map': json.dumps({'0': ['variables.file']})},
                files={'0': ('logo.png', path.read_bytes(), 'image/png')})
            response.raise_for_status()
            payload = response.json()
            cid = payload.get('data', {}).get('create')
            if payload.get('errors') or not isinstance(cid, str) or not re.fullmatch(r'(?:Qm[1-9A-HJ-NP-Za-km-z]{44}|baf[a-z2-7]{20,100})', cid):
                raise ValueError()
        except (httpx.HTTPError, ValueError, TypeError, AttributeError):
            raise HTTPException(503, 'Flap metadata upload did not return a valid result. Do not assume it was published.')
        verified = False
        try:
            metadata_response = await client.get(f'https://ipfs.io/ipfs/{cid}')
            metadata_response.raise_for_status()
            metadata = metadata_response.json()
            verified = metadata.get('twitter') == params.first_post_url and bool(metadata.get('image')) and metadata.get('description', '') == params.description
        except (httpx.HTTPError, ValueError, AttributeError):
            pass
    record = {'metadata_cid': cid, 'verified': verified, 'first_post_url': params.first_post_url,
              'creator_address': params.creator_address, 'logo_asset': params.logo_asset, 'description': params.description}
    receipt = ASSETS / f'{cid}.json'
    receipt.write_text(json.dumps(record))
    receipt.chmod(0o600)
    return {**record, 'detail': 'Metadata and first-post URL verified.' if verified else 'Uploaded CID saved; metadata propagation or post-link verification is still pending. No deployment can proceed.'}


async def prepare_flap(params: LaunchDraft):
    missing = draft_preview(params)['missing']
    if missing:
        raise HTTPException(422, {'message': 'Complete the launch draft first.', 'missing': missing})
    if not valid_post_url(params.first_post_url) or not valid_address(params.creator_address):
        raise HTTPException(422, 'First-post URL or launch wallet is invalid.')
    if not re.fullmatch(r'(?:Qm[1-9A-HJ-NP-Za-km-z]{44}|baf[a-z2-7]{20,100})', params.metadata_cid):
        raise HTTPException(422, 'Invalid metadata CID.')
    receipt = ASSETS / f'{params.metadata_cid}.json'
    try:
        record = json.loads(receipt.read_text())
    except (OSError, ValueError):
        raise HTTPException(422, 'Pin and verify this launch metadata first.')
    if not record.get('verified') or any(record.get(k) != getattr(params, k) for k in ('first_post_url','creator_address','logo_asset','description')):
        raise HTTPException(422, 'Metadata verification is missing or belongs to another draft.')
    return await node_adapter('prepare', {'name': params.name, 'symbol': params.ticker,
        'metadataCid': params.metadata_cid, 'buyTaxBps': params.buy_tax_bps, 'sellTaxBps': params.sell_tax_bps,
        'distribution': params.distribution, 'beneficiary': params.beneficiary if params.distribution == 'recipient' else params.creator_address,
        'taxDays': params.tax_days, 'antiFarmerDays': params.anti_farmer_days,
        'minimumDividendTokens': params.minimum_dividend_tokens, 'initialBuyBnb': params.initial_buy_bnb})


@router.post('/metadata/verify')
async def verify_metadata(params: LaunchDraft):
    if not re.fullmatch(r'(?:Qm[1-9A-HJ-NP-Za-km-z]{44}|baf[a-z2-7]{20,100})', params.metadata_cid):
        raise HTTPException(422, 'Pin metadata first.')
    path = ASSETS / f'{params.metadata_cid}.json'
    try:
        record = json.loads(path.read_text())
    except (OSError, ValueError):
        raise HTTPException(422, 'No local pinning receipt is available.')
    if any(record.get(k) != getattr(params, k) for k in ('first_post_url','creator_address','logo_asset','description')):
        raise HTTPException(422, 'Pinned metadata belongs to a different draft.')
    try:
        async with httpx.AsyncClient(timeout=20, follow_redirects=False) as client:
            response = await client.get(f'https://ipfs.io/ipfs/{params.metadata_cid}')
            response.raise_for_status()
            meta = response.json()
            record['verified'] = meta.get('twitter') == params.first_post_url and bool(meta.get('image')) and meta.get('description', '') == params.description
    except (httpx.HTTPError, ValueError, AttributeError):
        record['verified'] = False
    path.write_text(json.dumps(record))
    return {**record, 'detail': 'Metadata and exact first-post URL verified.' if record['verified'] else 'Metadata verification is pending or mismatched. No deployment can proceed.'}
