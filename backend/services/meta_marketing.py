"""Meta Marketing API integration for paid gym campaigns."""

from __future__ import annotations

import logging
import os
import time
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any, Callable
from urllib.parse import urlparse

from facebook_business.adobjects.ad import Ad
from facebook_business.adobjects.adaccount import AdAccount
from facebook_business.adobjects.adcreative import AdCreative
from facebook_business.adobjects.adset import AdSet
from facebook_business.adobjects.campaign import Campaign as MetaCampaign
from facebook_business.api import FacebookAdsApi
from facebook_business.exceptions import FacebookRequestError

from schemas.marketing import CampaignCreateRequest

logger = logging.getLogger(__name__)


class MetaConfigurationError(RuntimeError):
    """Raised if one of Movora's parent Meta ad account settings is missing."""


class MetaCampaignCreationError(RuntimeError):
    """Keep the Meta creation step alongside the original API error."""

    def __init__(self, operation: str, meta_error: FacebookRequestError) -> None:
        super().__init__(f"Meta failed while creating the {operation}.")
        self.operation = operation
        self.meta_error = meta_error


@dataclass(frozen=True)
class MetaCampaignIds:
    """IDs returned by Meta after creating the campaign objects."""

    campaign_id: str
    adset_id: str
    ad_id: str
    status: str = "PAUSED"


class MetaMarketingService:
    """Create and activate ads using Movora's parent Meta business account."""

    ad_set_retry_delays_seconds = (1, 2, 4)

    def __init__(self) -> None:
        """Read Meta credentials from the environment without storing secrets."""
        self.app_id = os.getenv("META_APP_ID", "").strip()
        self.app_secret = os.getenv("META_APP_SECRET", "").strip()
        self.ad_account_id = os.getenv("META_AD_ACCOUNT_ID", "").strip()
        self.page_id = os.getenv("META_PAGE_ID", "").strip()
        self.access_token = os.getenv("META_ACCESS_TOKEN", "").strip()

    def create_campaign(self, payload: CampaignCreateRequest) -> MetaCampaignIds:
        """Create a paused Meta campaign, ad set, creative, and ad for a gym."""
        self._require_configuration()
        FacebookAdsApi.init(self.app_id, self.app_secret, self.access_token)
        account_id = self.ad_account_id if self.ad_account_id.startswith("act_") else f"act_{self.ad_account_id}"
        account = AdAccount(account_id)

        campaign = self._run_creation_step(
            "campaign",
            lambda: account.create_campaign(
                params={
                    "name": payload.campaign_name,
                    "objective": "OUTCOME_TRAFFIC",
                    "status": MetaCampaign.Status.paused,
                    "special_ad_categories": [],
                    "is_adset_budget_sharing_enabled": False,
                }
            ),
        )
        campaign_id = str(campaign["id"])

        adset_params = {
            "name": f"{payload.campaign_name} - Movora",
            "campaign_id": campaign_id,
            "daily_budget": str(round(payload.daily_budget_inr * 100)),
            "billing_event": AdSet.BillingEvent.impressions,
            "optimization_goal": AdSet.OptimizationGoal.link_clicks,
            "bid_strategy": AdSet.BidStrategy.lowest_cost_without_cap,
            "destination_type": AdSet.DestinationType.website,
            "end_time": (datetime.now(timezone.utc) + timedelta(days=payload.duration_days)).isoformat(),
            "targeting": {
                "geo_locations": {
                    "custom_locations": [
                        {
                            "latitude": payload.latitude,
                            "longitude": payload.longitude,
                            "radius": payload.target_radius_km,
                            "distance_unit": "kilometer",
                            "country_code": "IN",
                        }
                    ]
                }
            },
            "promoted_object": {"page_id": self.page_id},
            "status": AdSet.Status.paused,
        }
        adset = self._create_ad_set_with_retry(account, campaign_id, adset_params)
        adset_id = str(adset["id"])

        media_url = str(payload.image_url)
        if urlparse(media_url).path.lower().endswith((".mp4", ".mov")):
            video = self._run_creation_step(
                "video upload",
                lambda: account.create_ad_video(params={"file_url": media_url}),
            )
            story_media = {
                "video_data": {
                    "video_id": str(video["id"]),
                    "message": payload.primary_text,
                    "call_to_action": {
                        "type": "LEARN_MORE",
                        "value": {"link": f"https://www.facebook.com/{self.page_id}"},
                    },
                }
            }
        else:
            story_media = {
                "link_data": {
                    "link": f"https://www.facebook.com/{self.page_id}",
                    "image_url": media_url,
                    "message": payload.primary_text,
                    "call_to_action": {
                        "type": "LEARN_MORE",
                        "value": {"link": f"https://www.facebook.com/{self.page_id}"},
                    },
                }
            }
        creative = self._run_creation_step(
            "ad creative",
            lambda: account.create_ad_creative(
                params={
                    "name": f"{payload.campaign_name} creative",
                    "object_story_spec": {"page_id": self.page_id, **story_media},
                }
            ),
        )

        ad = self._run_creation_step(
            "ad",
            lambda: account.create_ad(
                params={
                    "name": f"{payload.campaign_name} ad",
                    "adset_id": adset_id,
                    "creative": {"creative_id": str(creative["id"])},
                    "status": Ad.Status.paused,
                }
            ),
        )
        return MetaCampaignIds(campaign_id=campaign_id, adset_id=adset_id, ad_id=str(ad["id"]))

    @staticmethod
    def _run_creation_step(operation: str, action: Callable[[], Any]) -> Any:
        try:
            return action()
        except FacebookRequestError as error:
            raise MetaCampaignCreationError(operation, error) from error

    def _create_ad_set_with_retry(
        self,
        account: AdAccount,
        campaign_id: str,
        params: dict[str, Any],
    ) -> Any:
        for retry_index in range(len(self.ad_set_retry_delays_seconds) + 1):
            try:
                return account.create_ad_set(params=params)
            except FacebookRequestError as error:
                http_status = error.http_status()
                is_retryable = http_status is not None and http_status >= 500 and error.api_error_code() == 1
                if not is_retryable or retry_index == len(self.ad_set_retry_delays_seconds):
                    raise MetaCampaignCreationError("ad set", error) from error

                delay_seconds = self.ad_set_retry_delays_seconds[retry_index]
                logger.warning(
                    "Meta ad set creation returned HTTP %s, code 1; checking for a created ad set "
                    "before retry %s of %s after %s seconds",
                    http_status,
                    retry_index + 1,
                    len(self.ad_set_retry_delays_seconds),
                    delay_seconds,
                )
                time.sleep(delay_seconds)
                try:
                    existing_adsets = list(MetaCampaign(campaign_id).get_ad_sets(fields=["id"]))
                except FacebookRequestError as lookup_error:
                    logger.warning(
                        "Could not reconcile Meta ad sets after HTTP %s, code 1 "
                        "(lookup HTTP %s, code %s); not retrying to avoid duplicate ad sets",
                        http_status,
                        lookup_error.http_status(),
                        lookup_error.api_error_code(),
                    )
                    raise MetaCampaignCreationError("ad set", error) from lookup_error
                if existing_adsets:
                    logger.info(
                        "Found an ad set for the campaign after an ambiguous Meta error; "
                        "continuing without creating a duplicate"
                    )
                    return existing_adsets[0]

        raise RuntimeError("Ad set retry loop exited without a result.")

    def activate_campaign(self, ids: MetaCampaignIds) -> None:
        """Activate the paid campaign, ad set, and ad after payment verification."""
        self._require_configuration()
        FacebookAdsApi.init(self.app_id, self.app_secret, self.access_token)
        MetaCampaign(ids.campaign_id).api_update(params={"status": MetaCampaign.Status.active})
        AdSet(ids.adset_id).api_update(params={"status": AdSet.Status.active})
        Ad(ids.ad_id).api_update(params={"status": Ad.Status.active})

    def get_campaign_insights(self, campaign_id: str) -> dict[str, Any]:
        """Fetch delivery metrics from Meta for one campaign."""
        self._require_configuration()
        FacebookAdsApi.init(self.app_id, self.app_secret, self.access_token)
        rows = MetaCampaign(campaign_id).get_insights(
            fields=["spend", "impressions", "reach", "clicks", "actions"],
            params={"date_preset": "maximum"},
        )
        return dict(rows[0]) if rows else {}

    def _require_configuration(self) -> None:
        """Fail rather than publishing against an incomplete or absent Meta account."""
        if not all((self.app_id, self.app_secret, self.ad_account_id, self.page_id, self.access_token)):
            raise MetaConfigurationError(
                "META_APP_ID, META_APP_SECRET, META_AD_ACCOUNT_ID, META_PAGE_ID, and META_ACCESS_TOKEN must be configured."
            )

    def validate_configuration(self) -> None:
        """Validate Meta credentials before a paid campaign is processed."""
        self._require_configuration()
