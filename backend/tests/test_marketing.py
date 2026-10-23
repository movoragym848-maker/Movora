"""Focused validation tests for gym marketing campaign inputs and pricing."""

from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from io import BytesIO
import os
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import UUID

import jwt
from fastapi import HTTPException
from fastapi.security import HTTPAuthorizationCredentials
from pydantic import ValidationError
from starlette.datastructures import Headers
from starlette.datastructures import UploadFile

from main import app, debug_routes, root
from models.marketing import GymCampaign
from routers.marketing import (
    MAX_CREATIVE_BYTES,
    _activate_meta_campaign,
    amount_to_charge_paise,
    demo_payment_is_enabled,
    execute_demo_campaign,
    get_campaign_payment_options,
    list_gym_campaigns,
    require_gym_owner,
    upload_campaign_creative,
)
from schemas.marketing import CampaignCreateRequest, CampaignObjective
from services.meta_marketing import MetaCampaignIds, MetaMarketingService


class CampaignSchemaTests(unittest.TestCase):
    """Verify the public campaign contract rejects unsupported inputs."""

    def setUp(self) -> None:
        self.payload = {
            "campaign_name": "Neighborhood trial",
            "objective": "GET_MEMBERS",
            "daily_budget_inr": 500,
            "duration_days": 7,
            "target_radius_km": 5,
            "latitude": 19.076,
            "longitude": 72.8777,
            "image_url": "https://assets.example.test/campaign.jpg",
            "primary_text": "Train with the team at your local gym.",
        }

    def test_accepts_supported_campaign_objective(self) -> None:
        campaign = CampaignCreateRequest.model_validate(self.payload)
        self.assertEqual(campaign.objective, CampaignObjective.GET_MEMBERS)

    def test_rejects_radius_outside_supported_range(self) -> None:
        with self.assertRaises(ValidationError):
            CampaignCreateRequest.model_validate({**self.payload, "target_radius_km": 2})

    def test_rejects_unsupported_objective(self) -> None:
        with self.assertRaises(ValidationError):
            CampaignCreateRequest.model_validate({**self.payload, "objective": "TRAFFIC"})


class CampaignPriceTests(unittest.TestCase):
    """Verify checkout totals are calculated in integer paise."""

    def test_includes_eighteen_percent_tax(self) -> None:
        self.assertEqual(amount_to_charge_paise(500, 7), 413_000)

    def test_rounds_fractional_paise_half_up(self) -> None:
        self.assertEqual(amount_to_charge_paise(0.01, 3), 4)


class CampaignRouteTests(unittest.TestCase):
    """Ensure frontend marketing URLs are registered by the FastAPI application."""

    def test_root_and_debug_routes_report_application_status_and_paths(self) -> None:
        self.assertEqual(root(), {"status": "Movora Backend is running"})
        routes = debug_routes()
        route_paths = {route["path"] for route in routes}
        self.assertIn("/debug/routes", route_paths)
        self.assertIn("/api/v1/marketing/campaigns/creative", route_paths)

    def test_registers_campaign_creation_upload_and_execution_routes(self) -> None:
        post_routes = {
            route.path
            for route in app.routes
            if "POST" in getattr(route, "methods", set())
        }
        self.assertTrue(
            {
                "/api/v1/marketing/campaigns",
                "/api/v1/marketing/campaigns/creative",
                "/api/v1/marketing/campaigns/{campaign_id}/execute",
                "/api/v1/marketing/campaigns/{campaign_id}/demo-execute",
            }.issubset(post_routes)
        )
        self.assertIn(
            "/api/v1/marketing/campaigns/payment-options",
            {route.path for route in app.routes},
        )


class CampaignDemoPaymentTests(unittest.TestCase):
    """Ensure the no-charge path is explicitly limited to a configured Meta test account."""

    def test_requires_opt_in_and_matching_sandbox_account(self) -> None:
        environment = {
            "MARKETING_DEMO_PAYMENT_ENABLED": "true",
            "META_SANDBOX_AD_ACCOUNT_ID": "act_12345",
            "META_AD_ACCOUNT_ID": "12345",
            "META_APP_ID": "app",
            "META_APP_SECRET": "secret",
            "META_PAGE_ID": "page",
            "META_ACCESS_TOKEN": "token",
        }
        with patch.dict(os.environ, environment, clear=True):
            self.assertTrue(demo_payment_is_enabled())
            os.environ["META_AD_ACCOUNT_ID"] = "98765"
            self.assertFalse(demo_payment_is_enabled())
            os.environ["META_AD_ACCOUNT_ID"] = "12345"
            os.environ["MARKETING_DEMO_PAYMENT_ENABLED"] = "false"
            self.assertFalse(demo_payment_is_enabled())

    def test_disabled_demo_execution_is_rejected(self) -> None:
        with patch.dict(os.environ, {}, clear=True):
            with self.assertRaises(HTTPException) as raised:
                execute_demo_campaign(UUID("9f4fd813-c4e4-4781-a06f-8b39c9d76d72"), "gym-id", MagicMock())

        self.assertEqual(raised.exception.status_code, 403)

    def test_demo_mode_requires_the_configured_meta_account_to_match_test_account(self) -> None:
        environment = {
            "MARKETING_DEMO_PAYMENT_ENABLED": "true",
            "META_SANDBOX_AD_ACCOUNT_ID": "test-account",
            "META_AD_ACCOUNT_ID": "live-account",
            "META_APP_ID": "app",
            "META_APP_SECRET": "secret",
            "META_PAGE_ID": "page",
            "META_ACCESS_TOKEN": "token",
        }
        with patch.dict(os.environ, environment, clear=True):
            with self.assertRaises(HTTPException) as raised:
                execute_demo_campaign(UUID("9f4fd813-c4e4-4781-a06f-8b39c9d76d72"), "gym-id", MagicMock())

        self.assertEqual(raised.exception.status_code, 403)

    def test_payment_options_do_not_expose_credentials(self) -> None:
        with patch.dict(os.environ, {}, clear=True):
            options = get_campaign_payment_options("gym-id")

        self.assertEqual(options.model_dump(), {"razorpay_available": False, "demo_payment_available": False})

    def test_demo_activation_is_recorded_as_test_not_paid(self) -> None:
        campaign = GymCampaign(
            id="9f4fd813-c4e4-4781-a06f-8b39c9d76d72",
            gym_id="ee9c9e7a-f915-4a64-8de4-7b4fb5319d08",
            campaign_name="Sandbox test",
            objective="GET_MEMBERS",
            daily_budget_inr=500,
            duration_days=7,
            target_radius_km=5,
            latitude=19.076,
            longitude=72.8777,
            image_url="https://assets.example.test/campaign.jpg",
            primary_text="Test campaign",
            status="DRAFT",
            payment_order_id=None,
            payment_status="CREATED",
            total_amount_paise=413000,
            created_at=datetime.now(timezone.utc),
        )
        meta = MagicMock()
        meta.create_campaign.return_value = MetaCampaignIds("meta-campaign", "meta-adset", "meta-ad")
        with patch("routers.marketing.MetaMarketingService", return_value=meta):
            response = _activate_meta_campaign(campaign, MagicMock(), payment_status="TEST")

        self.assertEqual(response.payment_status, "TEST")
        self.assertEqual(campaign.payment_status, "TEST")
        self.assertEqual(response.status, "ACTIVE")


class CampaignCreativeUploadTests(unittest.TestCase):
    """Verify campaign creative uploads accept video and enforce the size limit."""

    def test_uploads_mp4_creative_using_multipart_storage(self) -> None:
        file = UploadFile(
            filename="campaign.mp4",
            file=BytesIO(b"\x00\x00\x00\x18ftypisomvideo"),
            headers=Headers({"content-type": "video/mp4"}),
        )
        storage = MagicMock()
        environment = {
            "R2_ACCOUNT_ID": "account",
            "R2_ACCESS_KEY_ID": "access",
            "R2_SECRET_ACCESS_KEY": "secret",
            "R2_BUCKET_NAME": "bucket",
            "R2_PUBLIC_URL": "https://assets.example.test",
        }
        with patch.dict(os.environ, environment), patch("routers.marketing.boto3.client", return_value=storage):
            result = asyncio.run(upload_campaign_creative(file, gym_id="gym-id"))

        self.assertTrue(result["image_url"].endswith(".mp4"))
        storage.upload_fileobj.assert_called_once()
        self.assertEqual(storage.upload_fileobj.call_args.kwargs["ExtraArgs"], {"ContentType": "video/mp4"})

    def test_rejects_creative_larger_than_500_mib(self) -> None:
        file = SimpleNamespace(
            content_type="video/mp4",
            file=SimpleNamespace(seek=MagicMock(), tell=MagicMock(return_value=MAX_CREATIVE_BYTES + 1)),
            read=AsyncMock(return_value=b"\x00\x00\x00\x18ftyp"),
            seek=AsyncMock(),
        )
        with self.assertRaises(HTTPException) as raised:
            asyncio.run(upload_campaign_creative(file, gym_id="gym-id"))

        self.assertEqual(raised.exception.status_code, 413)


class MetaVideoCreativeTests(unittest.TestCase):
    """Verify uploaded video URLs are converted to Meta video ad creatives."""

    def test_creates_meta_video_creative_for_mp4_url(self) -> None:
        payload = CampaignCreateRequest.model_validate({
            "campaign_name": "Neighborhood trial",
            "objective": "GET_MEMBERS",
            "daily_budget_inr": 500,
            "duration_days": 7,
            "target_radius_km": 5,
            "latitude": 19.076,
            "longitude": 72.8777,
            "image_url": "https://assets.example.test/campaign.mp4",
            "primary_text": "Train with the team at your local gym.",
        })
        account = MagicMock()
        account.create_campaign.return_value = {"id": "campaign-id"}
        account.create_ad_set.return_value = {"id": "adset-id"}
        account.create_ad_video.return_value = {"id": "video-id"}
        account.create_ad_creative.return_value = {"id": "creative-id"}
        account.create_ad.return_value = {"id": "ad-id"}
        environment = {
            "META_APP_ID": "app",
            "META_APP_SECRET": "secret",
            "META_AD_ACCOUNT_ID": "account",
            "META_PAGE_ID": "page",
            "META_ACCESS_TOKEN": "token",
        }
        with patch.dict(os.environ, environment), \
                patch("services.meta_marketing.FacebookAdsApi.init"), \
                patch("services.meta_marketing.AdAccount", return_value=account):
            MetaMarketingService().create_campaign(payload)

        account.create_ad_video.assert_called_once_with(
            params={"file_url": "https://assets.example.test/campaign.mp4"}
        )
        story_spec = account.create_ad_creative.call_args.kwargs["params"]["object_story_spec"]
        self.assertEqual(story_spec["video_data"]["video_id"], "video-id")


class CampaignListTests(unittest.TestCase):
    """Verify campaign list behavior is scoped to its gym owner."""

    def test_returns_an_empty_list_when_no_campaigns_exist(self) -> None:
        gym_id = "9f4fd813-c4e4-4781-a06f-8b39c9d76d72"
        session = MagicMock()
        session.scalars.return_value.all.return_value = []
        self.assertEqual(list_gym_campaigns(UUID(gym_id), gym_id, session), [])

    def test_rejects_a_different_gym_owner(self) -> None:
        gym_id = "9f4fd813-c4e4-4781-a06f-8b39c9d76d72"
        session = MagicMock()
        with self.assertRaises(HTTPException) as raised:
            list_gym_campaigns(UUID(gym_id), "ee9c9e7a-f915-4a64-8de4-7b4fb5319d08", session)
        self.assertEqual(raised.exception.status_code, 403)


class GymOwnerAuthenticationTests(unittest.TestCase):
    """Ensure member tokens cannot access gym-owner campaign operations."""

    def setUp(self) -> None:
        self.previous_secret = os.environ.get("JWT_ACCESS_SECRET")
        os.environ["JWT_ACCESS_SECRET"] = "marketing-test-signing-secret-key"

    def tearDown(self) -> None:
        if self.previous_secret is None:
            os.environ.pop("JWT_ACCESS_SECRET", None)
        else:
            os.environ["JWT_ACCESS_SECRET"] = self.previous_secret

    def test_rejects_member_tokens(self) -> None:
        token = jwt.encode(
            {"sub": "9f4fd813-c4e4-4781-a06f-8b39c9d76d72", "role": "member"},
            os.environ["JWT_ACCESS_SECRET"],
            algorithm="HS256",
        )
        credentials = HTTPAuthorizationCredentials(scheme="Bearer", credentials=token)
        with self.assertRaises(HTTPException) as raised:
            require_gym_owner(credentials, MagicMock())
        self.assertEqual(raised.exception.status_code, 403)

    def test_accepts_an_active_gym_owner_token(self) -> None:
        gym_id = "9f4fd813-c4e4-4781-a06f-8b39c9d76d72"
        token = jwt.encode(
            {"sub": gym_id, "role": "gym_owner"},
            os.environ["JWT_ACCESS_SECRET"],
            algorithm="HS256",
        )
        credentials = HTTPAuthorizationCredentials(scheme="Bearer", credentials=token)
        session = MagicMock()
        session.execute.return_value.first.return_value = SimpleNamespace(status="active", deleted_at=None)
        self.assertEqual(require_gym_owner(credentials, session), gym_id)


if __name__ == "__main__":
    unittest.main()
