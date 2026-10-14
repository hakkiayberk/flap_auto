"""Bounded, read-only snapshots from explicitly configured X account timelines."""
import logging
import re
import time
from datetime import datetime, timezone
from typing import Optional
import httpx
from config.settings import settings

logger = logging.getLogger(__name__)
API_BASE = "https://api.x.com/2"
_STATE = {"status": "not_checked", "last_success_at": None, "accounts": [], "next_attempt_after": 0.0}


def watch_accounts(value: str) -> list[str]:
    result = []
    for item in value.split(','):
        handle = item.strip().lstrip('@').lower()
        if not handle:
            continue
        if not re.fullmatch(r'[a-z0-9_]{1,15}', handle):
            raise ValueError('Invalid X watch account handle.')
        if handle not in result:
            result.append(handle)
    if len(result) > 20:
        raise ValueError('At most 20 X watch accounts are supported.')
    return result


def discovery_status() -> dict:
    accounts = watch_accounts(settings.x_watch_accounts)
    configured = bool(settings.x_read_bearer_token and settings.x_read_bearer_token.get_secret_value())
    return {"configured": configured,
            "status": _STATE['status'] if configured else 'missing_credentials',
            "watch_accounts": accounts, "last_success_at": _STATE['last_success_at'],
            "account_results": list(_STATE['accounts']),
            "include_replies": settings.x_include_replies,
            "max_posts_per_account": settings.x_page_size * settings.x_max_pages,
            "coverage": "Bounded recent timeline snapshots; not a complete stream.",
            "detail": ({"ok": "Last X poll succeeded for all watched accounts.",
                        "partial": "X collection is partial or reached the configured snapshot limit.",
                        "access_denied": "X API denied access. Check read credentials and API permissions.",
                        "rate_limited": "X API rate limit reached. Collection is waiting before the next poll."}.get(_STATE['status'], "Read API configured; live access still needs a successful poll.")) if configured else "X_READ_BEARER_TOKEN is not configured. No live X collection is running."}


def normalise_posts(payload: dict, handle: str, user_id: str) -> list[dict]:
    media = {m.get('media_key'): m for m in payload.get('includes', {}).get('media', [])}
    result = []
    for post in payload.get('data', []):
        post_id = post.get('id', '')
        if not re.fullmatch(r'\d{1,19}', str(post_id)):
            continue
        if post.get('author_id') != user_id:
            continue
        references = post.get('referenced_tweets', post.get('referenced_posts', []))
        if any(r.get('type') in ('retweeted', 'reposted') for r in references):
            continue
        # Accept current and legacy long-post response names; preserve original text.
        text = (post.get('note_post') or post.get('note_tweet') or {}).get('text') or post.get('text', '')
        if not isinstance(text, str) or not text.strip():
            continue
        published = post.get('created_at')
        try:
            published_at = datetime.fromisoformat(published.replace('Z', '+00:00')) if published else None
        except (ValueError, AttributeError):
            published_at = None
        metrics = post.get('public_metrics') or {}
        def count(key):
            value = metrics.get(key, 0)
            return value if isinstance(value, int) and not isinstance(value, bool) and value >= 0 else 0
        likes, comments = count('like_count'), count('reply_count')
        shares = count('repost_count' if 'repost_count' in metrics else 'retweet_count') + count('quote_count')
        thumbnail = None
        for key in (post.get('attachments') or {}).get('media_keys', []):
            item = media.get(key, {})
            thumbnail = item.get('url') if item.get('type') == 'photo' else item.get('preview_image_url')
            if isinstance(thumbnail, str) and thumbnail.startswith('https://'):
                break
            thumbnail = None
        result.append({"title": text, "original_url": f"https://x.com/{handle}/status/{post_id}",
                       "source_platform": "x", "published_at": published_at, "category": handle,
                       "likes": likes, "comments": comments, "shares": shares,
                       "thumbnail_url": thumbnail, "trend_score": float(likes + 2 * shares + 0.5 * comments),
                       "growth_indicator": 0.0})
    return result


async def fetch_x_trends(client: Optional[httpx.AsyncClient] = None) -> list[dict]:
    token = settings.x_read_bearer_token
    if not token or not token.get_secret_value():
        _STATE['status'] = 'missing_credentials'
        return []
    if time.time() < _STATE['next_attempt_after']:
        return []
    accounts = watch_accounts(settings.x_watch_accounts)
    if client is None:
        async with httpx.AsyncClient(timeout=15, follow_redirects=False) as owned:
            return await fetch_x_trends(owned)
    headers = {'Authorization': f'Bearer {token.get_secret_value()}'}
    result, outcomes = [], []
    stopped = False
    for handle in accounts:
        try:
            response = await client.get(f'{API_BASE}/users/by/username/{handle}', headers=headers)
            response.raise_for_status()
            data = response.json().get('data', {})
            user_id = str(data.get('id', ''))
            if data.get('username', '').lower() != handle or not re.fullmatch(r'\d{1,19}', user_id):
                raise ValueError('Account lookup mismatch.')
            params = {'max_results': settings.x_page_size,
                      'post.fields': 'created_at,public_metrics,attachments,note_post',
                      'expansions': 'attachments.media_keys,author_id,referenced_posts',
                      'media.fields': 'type,url,preview_image_url',
                      'exclude': 'retweets' if settings.x_include_replies else 'retweets,replies'}
            seen_tokens, seen_ids = set(), set()
            complete = False
            account_posts = []
            for _ in range(settings.x_max_pages):
                response = await client.get(f'{API_BASE}/users/{user_id}/tweets', params=params, headers=headers)
                response.raise_for_status()
                payload = response.json()
                if payload.get('errors'):
                    raise ValueError('Partial X response requires review.')
                for item in normalise_posts(payload, handle, user_id):
                    if item['original_url'] not in seen_ids:
                        account_posts.append(item)
                        seen_ids.add(item['original_url'])
                next_token = payload.get('meta', {}).get('next_token')
                if not next_token:
                    complete = True
                    break
                if not isinstance(next_token, str) or next_token in seen_tokens:
                    raise ValueError('Repeated X pagination token.')
                seen_tokens.add(next_token)
                params['pagination_token'] = next_token
            result.extend(account_posts)
            outcomes.append({'handle': handle, 'status': 'ok' if complete else 'bounded', 'posts': len(account_posts)})
        except httpx.HTTPStatusError as exc:
            code = exc.response.status_code
            outcomes.append({'handle': handle, 'status': f'http_{code}', 'posts': 0})
            # Do not print response bodies or credentials, or immediately retry shared auth/rate failures.
            if code in (401, 403, 429):
                _STATE['status'] = 'rate_limited' if code == 429 else 'access_denied'
                cooldown = 300
                if code == 429:
                    try:
                        cooldown = max(60, float(exc.response.headers.get('x-rate-limit-reset', '0')) - time.time())
                    except ValueError:
                        pass
                _STATE['next_attempt_after'] = time.time() + cooldown
                stopped = True
                break
        except (httpx.HTTPError, ValueError, TypeError, AttributeError):
            outcomes.append({'handle': handle, 'status': 'fetch_failed', 'posts': 0})
            logger.warning('X discovery failed for @%s; response details suppressed.', handle)
    _STATE['accounts'] = outcomes
    if not stopped:
        _STATE['status'] = 'ok' if outcomes and all(o['status'] == 'ok' for o in outcomes) else 'partial'
    if any(o['status'] in ('ok', 'bounded') for o in outcomes):
        _STATE['last_success_at'] = datetime.now(timezone.utc).isoformat()
    return result
