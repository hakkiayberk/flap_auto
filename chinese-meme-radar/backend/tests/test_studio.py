import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch, AsyncMock
import httpx
from fastapi import HTTPException
from api import studio

CID = 'Qm' + 'a' * 44
POST = 'https://x.com/example/status/12345'
PNG = b'\x89PNG\r\n\x1a\n' + b'fixture'


class StudioTest(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.patch_assets = patch.object(studio, 'ASSETS', Path(self.temp.name))
        self.patch_assets.start()
        self.asset = 'a' * 32 + '.png'
        (studio.ASSETS / self.asset).write_bytes(PNG)
        self.draft = studio.LaunchDraft(source_title='Black Shiba',name='黑柴',ticker='黑柴',
            logo_asset=self.asset,creator_address='0x'+'1'*40,first_post_url=POST,
            distribution='recipient',beneficiary='0x'+'2'*40,tax_days=365,anti_farmer_days=0)

    def tearDown(self):
        self.patch_assets.stop()
        self.temp.cleanup()

    def test_source_specific_logo_brief_and_missing_settings(self):
        self.assertIn('black-and-tan Shiba Inu', studio.image_brief('Black Shiba','黑柴'))
        self.assertIn('giant panda', studio.image_brief('萌兰','萌兰'))
        preview=studio.draft_preview(studio.LaunchDraft())
        self.assertFalse(preview['live_enabled'])
        self.assertIn('Tax distribution',preview['missing'])
        self.assertIn('Verified Flap metadata',preview['missing'])

    async def test_unverified_metadata_cannot_prepare_a_transaction(self):
        self.draft.metadata_cid = CID
        with self.assertRaises(HTTPException) as error:
            await studio.prepare_flap(self.draft)
        self.assertEqual(error.exception.status_code,422)

    async def test_metadata_contains_exact_post_link_and_a_verified_receipt_is_required(self):
        original_client = httpx.AsyncClient
        uploaded = []
        def handler(request):
            if request.method == 'POST':
                uploaded.append(request.content)
                return httpx.Response(200,json={'data':{'create':CID}})
            return httpx.Response(200,json={'twitter':POST,'description':'','image':'ipfs://example'})
        factory=lambda **kwargs:original_client(transport=httpx.MockTransport(handler))
        with patch.object(studio.httpx,'AsyncClient',factory):
            result=await studio.pin_metadata(self.draft)
        self.assertTrue(result['verified'])
        self.assertIn(POST.encode(),uploaded[0])
        self.draft.metadata_cid=CID
        with patch.object(studio,'node_adapter',AsyncMock(return_value={'signed':False,'broadcast':False})) as adapter:
            result=await studio.prepare_flap(self.draft)
            self.assertFalse(result['signed'])
            self.assertEqual(adapter.call_args.args[0],'prepare')
            self.assertEqual(adapter.call_args.args[1]['beneficiary'],self.draft.beneficiary)
        self.draft.first_post_url='https://x.com/example/status/99999'
        with self.assertRaises(HTTPException):
            await studio.prepare_flap(self.draft)

    async def test_pin_result_can_be_reverified_without_uploading_twice(self):
        receipt={'metadata_cid':CID,'verified':False,'first_post_url':POST,
                 'creator_address':self.draft.creator_address,'logo_asset':self.asset,'description':''}
        (studio.ASSETS / f'{CID}.json').write_text(json.dumps(receipt))
        self.draft.metadata_cid=CID
        original_client=httpx.AsyncClient
        def handler(request):
            self.assertEqual(request.method,'GET')
            return httpx.Response(200,json={'twitter':POST,'description':'','image':'ipfs://example'})
        with patch.object(studio.httpx,'AsyncClient',lambda **kwargs:original_client(transport=httpx.MockTransport(handler))):
            self.assertTrue((await studio.verify_metadata(self.draft))['verified'])

    async def test_mismatched_post_link_blocks_deployment_and_missing_link_blocks_upload(self):
        self.draft.first_post_url=''
        with self.assertRaises(HTTPException):
            await studio.pin_metadata(self.draft)
        self.assertFalse(studio.valid_post_url('https://x.com/evil/status/123?token=secret'))
        with self.assertRaises(HTTPException):
            studio.asset_path('../../.env')
