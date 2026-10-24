"""Validated request and response contracts for gym marketing."""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, HttpUrl, field_validator


class CampaignObjective(str, Enum):
    """Supported outcomes exposed in the gym-owner campaign builder."""

    GET_MEMBERS = "GET_MEMBERS"
    DIRECT_MESSAGES = "DIRECT_MESSAGES"


class CampaignStatus(str, Enum):
    """Persisted delivery lifecycle for a gym campaign."""

    DRAFT = "DRAFT"
    PENDING_PAYMENT = "PENDING_PAYMENT"
    ACTIVE = "ACTIVE"
    PAUSED = "PAUSED"
    COMPLETED = "COMPLETED"


class CampaignCreateRequest(BaseModel):
    """Validated campaign configuration submitted by an authenticated gym owner."""

    campaign_name: str = Field(min_length=2, max_length=120)
    objective: CampaignObjective
    daily_budget_inr: float = Field(gt=0, le=100_000, allow_inf_nan=False)
    duration_days: int = Field(ge=3, le=14)
    target_radius_km: int = Field(ge=3, le=15)
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    image_url: HttpUrl
    primary_text: str = Field(min_length=1, max_length=2000)

    @field_validator("campaign_name", "primary_text")
    @classmethod
    def strip_required_text(cls, value: str) -> str:
        """Reject blank text and remove accidental surrounding whitespace."""
        value = value.strip()
        if not value:
            raise ValueError("This field cannot be blank.")
        return value

    @field_validator("duration_days")
    @classmethod
    def validate_duration_choice(cls, value: int) -> int:
        """Limit campaign duration to the options shown in the builder."""
        if value not in {3, 7, 14}:
            raise ValueError("Choose a duration of 3, 7, or 14 days.")
        return value


class CampaignExecuteRequest(BaseModel):
    """Razorpay confirmation supplied after the hosted checkout succeeds."""

    razorpay_order_id: str = Field(min_length=1, max_length=100)
    razorpay_payment_id: str = Field(min_length=1, max_length=100)
    razorpay_signature: str = Field(min_length=1, max_length=256)


class CampaignPaymentOptionsResponse(BaseModel):
    """Payment methods currently available to the authenticated gym owner."""

    razorpay_available: bool
    razorpay_missing_variables: list[str]
    demo_payment_available: bool
    demo_payment_reasons: list[str]


class CampaignStatusResponse(BaseModel):
    """Campaign record returned to its owning gym account."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    gym_id: UUID
    meta_campaign_id: str | None
    meta_adset_id: str | None
    meta_ad_id: str | None
    campaign_name: str
    objective: CampaignObjective
    daily_budget_inr: float
    duration_days: int
    target_radius_km: int
    latitude: float
    longitude: float
    image_url: str
    primary_text: str
    status: CampaignStatus
    payment_order_id: str | None
    payment_key_id: str | None = None
    payment_status: str
    total_amount_paise: int
    created_at: datetime


class CampaignAnalyticsResponse(BaseModel):
    """Delivery metrics fetched from Meta for a campaign."""

    campaign_id: UUID
    spend_inr: float
    impressions: int
    reach: int
    clicks: int
    leads: int
    cost_per_lead_inr: float | None
