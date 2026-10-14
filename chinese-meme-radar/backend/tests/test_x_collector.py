import copy
import unittest
from unittest.mock import patch, AsyncMock
import httpx
from pydantic import SecretStr
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from config.settings import settings
from collectors import x
from services import ingest
from database.models import Trend
from database.session import Base
from api.trends import _trend_to_dict


class XCollectorTest(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.old_state = copy.deepcopy(x._STATE)
        x._STATE.update(status='not_checked', last_success_at=None, accounts=[], next_attempt_after=0)
        self.config = settings.model_copy(update={'x_read_bearer_token': SecretStr('offline-test-token'),
                                                  'x_watch_accounts': 'binance,cz_binance',
                                                  'x_page_size': 5, 'x_max_pages': 2, 'x_include_replies': True})
        self.setting_patch = patch.object(x, 'settings', self.config)
        self.setting_patch.start()

    def tearDown(self):
        self.setting_patch.stop()
        x._STATE.clear()
        x._STATE.update(self.old_state)

    async def test_no_read_credentials_means_no_network_requests(self):
        self.config.x_read_bearer_token = None
        async with httpx.AsyncClient(transport=httpx.MockTransport(lambda r: self.fail('Network must not be called'))) as client:
            self.assertEqual(await x.fetch_x_trends(client), [])
        self.assertEqual(x.discovery_status()['status'], 'missing_credentials')

    async def test_pagination_keeps_original_author_reply_media_and_full_post_text(self):
        def handler(request):
            if '/by/username/' in request.url.path:
                handle = request.url.path.rsplit('/', 1)[1]
                return httpx.Response(200, json={'data': {'id': '123' if handle == 'binance' else '456', 'username': handle}})
            user_id = request.url.path.split('/')[-2]
            self.assertEqual(request.url.params['exclude'], 'retweets')
            self.assertIn('note_post', request.url.params['post.fields'])
            if request.url.params.get('pagination_token') == 'page2':
                return httpx.Response(200, json={'data': [{'id': '8', 'author_id': user_id, 'text': 'A reply', 'referenced_posts': [{'type': 'replied_to', 'id': '7'}]}]})
            return httpx.Response(200, json={
                'data': [{'id': '7', 'author_id': user_id, 'text': 'short', 'note_post': {'text': '完整原文 binancians'},
                          'created_at': '2026-10-14T10:00:00Z', 'attachments': {'media_keys': ['photo']},
                          'public_metrics': {'like_count': 10, 'reply_count': 2, 'repost_count': 3, 'quote_count': 1}},
                         {'id': '9', 'author_id': '999', 'text': 'Different author'},
                         {'id': '10', 'author_id': user_id, 'text': 'Repost', 'referenced_posts': [{'type': 'retweeted'}]}],
                'includes': {'media': [{'media_key': 'photo', 'type': 'photo', 'url': 'https://pbs.twimg.com/test.jpg'}]},
                'meta': {'next_token': 'page2'}})
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            result = await x.fetch_x_trends(client)
        self.assertEqual(len(result), 4)
        self.assertEqual(result[0]['title'], '完整原文 binancians')
        self.assertEqual(result[0]['original_url'], 'https://x.com/binance/status/7')
        self.assertEqual(result[0]['shares'], 4)
        self.assertEqual(result[0]['thumbnail_url'], 'https://pbs.twimg.com/test.jpg')
        self.assertEqual(result[0]['published_at'].utcoffset().total_seconds(), 0)
        self.assertEqual(result[1]['title'], 'A reply')
        self.assertEqual(x.discovery_status()['status'], 'ok')
        self.assertNotIn('offline-test-token', str(x.discovery_status()))

    async def test_rate_limit_stops_other_accounts_and_does_not_immediately_retry(self):
        calls = []
        def handler(request):
            calls.append(str(request.url))
            return httpx.Response(429, json={'detail': 'Do not expose response bodies'})
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            self.assertEqual(await x.fetch_x_trends(client), [])
            self.assertEqual(await x.fetch_x_trends(client), [])
        self.assertEqual(len(calls), 1)
        self.assertEqual(x.discovery_status()['status'], 'rate_limited')

    async def test_wrong_handle_and_snapshot_limit_are_not_reported_as_full_success(self):
        self.config.x_max_pages = 1
        def handler(request):
            if '/by/username/binance' in request.url.path:
                return httpx.Response(200, json={'data': {'id': '123', 'username': 'spoof'}})
            if '/by/username/' in request.url.path:
                return httpx.Response(200, json={'data': {'id': '456', 'username': 'cz_binance'}})
            return httpx.Response(200, json={'data': [{'id': '7', 'author_id': '456', 'text': '4'}], 'meta': {'next_token': 'more'}})
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            result = await x.fetch_x_trends(client)
        self.assertEqual(len(result), 1)
        self.assertEqual(x.discovery_status()['status'], 'partial')
        self.assertEqual([r['status'] for r in x.discovery_status()['account_results']], ['fetch_failed', 'bounded'])

    async def test_ingest_preserves_account_and_refreshes_metrics_without_duplicate_posts(self):
        engine = create_engine('sqlite:///:memory:')
        Base.metadata.create_all(engine)
        db = sessionmaker(bind=engine)()
        item = x.normalise_posts({'data': [{'id': '7', 'author_id': '123', 'text': 'binancians', 'public_metrics': {'like_count': 10}}]}, 'binance', '123')[0]
        try:
            with patch.object(ingest, 'fetch_weibo_trends', AsyncMock(return_value=[])), patch.object(ingest, 'fetch_bilibili_trends', AsyncMock(return_value=[])), patch.object(ingest, 'fetch_x_trends', AsyncMock(return_value=[item])):
                self.assertEqual(await ingest.ingest_all(db), 1)
                item['likes'] = 30
                self.assertEqual(await ingest.ingest_all(db), 0)
                stored = db.query(Trend).one()
                self.assertEqual(stored.likes, 30)
                self.assertEqual(_trend_to_dict(stored)['source_account'], 'binance')
                self.assertFalse(_trend_to_dict(stored)['suggestion']['launch_eligible'])
        finally:
            db.close()
            engine.dispose()

    def test_watchlist_validation(self):
        self.assertEqual(x.watch_accounts('@Binance,binance, cz_binance'), ['binance', 'cz_binance'])
        with self.assertRaises(ValueError):
            x.watch_accounts('binance/../../users')
