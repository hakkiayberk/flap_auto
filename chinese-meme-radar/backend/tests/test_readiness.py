"""Offline route checks; no scraping, signing, posting or live chain calls."""
import unittest
from fastapi.testclient import TestClient
from main import app
from api.launch import readiness


class ReadinessTest(unittest.TestCase):
    def setUp(self):
        # No context manager: do not start the scheduled collector lifespan.
        self.client = TestClient(app)

    def test_routes_registered(self):
        paths = {route.path for route in app.routes}
        self.assertTrue({"/api/launch/status", "/api/animals", "/api/deploy/status"}.issubset(paths))
        self.assertEqual(self.client.get("/api/launch/status").status_code, 200)

    def test_live_deploy_disabled_before_signer_or_payload(self):
        response = self.client.post("/api/deploy", json={"name": "熊猫", "ticker": "PANDA"})
        self.assertEqual(response.status_code, 503)
        self.assertIn("disabled", response.json()["detail"])

    def test_readiness_never_claims_live_connection(self):
        result = readiness()
        self.assertFalse(result["live_ready"])
        self.assertEqual(result["mode"], "preparation")
        self.assertNotIn("password", str(result).lower())


if __name__ == "__main__":
    unittest.main()
