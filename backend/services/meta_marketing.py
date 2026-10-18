"""Meta Marketing API integration for paid gym campaigns."""

from __future__ import annotations

import os
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any
from urllib.parse import urlparse

from facebook_business.adobjects.ad import Ad
from facebook_business.adobjects.adaccount import AdAccount
from facebook_business.adobjects.adcreative import AdCreative
from facebook_business.adobjects.adset import AdSet
from facebook_business.adobjects.campaign import Campaign as MetaCampaign
from facebook_business.api import FacebookAdsApi

from schemas.marketing import CampaignCreateRequest


class MetaConfigurationError(RuntimeError):
    """Raised if one of Movora's parent Meta ad account settings is missing."""


@dataclass(frozen=True)
class MetaCampaignIds:
    """IDs returned by Meta after creating the campaign objects."""

    campaign_id: str
    adset_id: str
    ad_id: str
    status: str = "PAUSED"


class MetaMarketingService:
    """Create and activate ads using Movora's parent Meta business account."""

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

        campaign = account.create_campaign(
            params={
                "name": payload.campaign_name,
                "objective": "OUTCOME_TRAFFIC",
                "status": MetaCampaign.Status.paused,
                "special_ad_categories": [],
            }
        )
        campaign_id = str(campaign["id"])

        adset = account.create_ad_set(
            params={
                "name": f"{payload.campaign_name} - Movora",
                "campaign_id": campaign_id,
                "daily_budget": str(round(payload.daily_budget_inr * 100)),
                "billing_event": AdSet.BillingEvent.impressions,
                "optimization_goal": AdSet.OptimizationGoal.link_clicks,
                "bid_strategy": AdSet.BidStrategy.lowest_cost_without_cap,
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
        )
        adset_id = str(adset["id"])

        media_url = str(payload.image_url)
        if urlparse(media_url).path.lower().endswith((".mp4", ".mov")):
            video = account.create_ad_video(params={"file_url": media_url})
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
                    "call_to_action": {"type": "LEARN_MORE"},
                }
            }
        creative = account.create_ad_creative(
            params={
                "name": f"{payload.campaign_name} creative",
                "object_story_spec": {"page_id": self.page_id, **story_media},
            }
        )

        ad = account.create_ad(
            params={
                "name": f"{payload.campaign_name} ad",
                "adset_id": adset_id,
                "creative": {"creative_id": str(creative["id"])},
                "status": Ad.Status.paused,
            }
        )
        return MetaCampaignIds(campaign_id=campaign_id, adset_id=adset_id, ad_id=str(ad["id"]))

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
