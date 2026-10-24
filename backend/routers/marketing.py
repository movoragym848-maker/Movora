"""Authenticated gym-owner endpoints for creating and managing paid campaigns."""

from __future__ import annotations

import asyncio
import logging
import os
from decimal import Decimal, ROUND_HALF_UP
from typing import Any, Literal
from uuid import UUID, uuid4

import boto3
import jwt
from boto3.exceptions import S3UploadFailedError
from boto3.s3.transfer import TransferConfig
from botocore.exceptions import BotoCoreError, ClientError, NoCredentialsError
from facebook_business.exceptions import FacebookRequestError
from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select, text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from db.database import get_session
from models.marketing import GymCampaign
from schemas.marketing import (
    CampaignAnalyticsResponse,
    CampaignCreateRequest,
    CampaignExecuteRequest,
    CampaignPaymentOptionsResponse,
    CampaignStatus,
    CampaignStatusResponse,
)
from services.marketing_payments import (
    MarketingPaymentService,
    PaymentConfigurationError,
    PaymentProviderError,
    PaymentVerificationError,
)
from services.meta_marketing import MetaCampaignIds, MetaConfigurationError, MetaMarketingService

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/marketing", tags=["marketing"])
bearer_scheme = HTTPBearer(auto_error=False)
MAX_CREATIVE_BYTES = 500 * 1024 * 1024
CREATIVE_TYPES = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "video/mp4": "mp4",
    "video/quicktime": "mov",
}


def require_gym_owner(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    session: Session = Depends(get_session),
) -> str:
    """Validate the shared Movora JWT and return an active gym-owner UUID."""
    if credentials is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing access token.")
    secret = os.getenv("JWT_ACCESS_SECRET", "").strip()
    if not secret:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Gym-owner authentication is not configured.")
    try:
        claims = jwt.decode(credentials.credentials, secret, algorithms=["HS256"])
        owner_id = str(UUID(claims["sub"]))
    except (jwt.InvalidTokenError, KeyError, TypeError, ValueError) as error:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired access token.") from error
    if claims.get("role") != "gym_owner":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Gym-owner account required.")

    owner = session.execute(
        text("SELECT status, deleted_at FROM gym_owners WHERE id = :owner_id"),
        {"owner_id": owner_id},
    ).first()
    if owner is None or owner.deleted_at is not None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Gym-owner account not found.")
    if owner.status != "active":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Gym-owner account is not active.")
    return owner_id


def amount_to_charge_paise(daily_budget_inr: float, duration_days: int) -> int:
    """Compute campaign budget plus 18% GST in integer paise."""
    amount_rupees = Decimal(str(daily_budget_inr)) * duration_days * Decimal("1.18")
    return int((amount_rupees * 100).quantize(Decimal("1"), rounding=ROUND_HALF_UP))


def _normalize_ad_account_id(value: str) -> str:
    return value.strip().removeprefix("act_")


def _demo_payment_reasons() -> list[str]:
    """Explain each missing sandbox prerequisite without returning credential values."""
    reasons = []
    if os.getenv("MARKETING_DEMO_PAYMENT_ENABLED", "").strip().lower() != "true":
        reasons.append("Set MARKETING_DEMO_PAYMENT_ENABLED to true on the marketing service.")
    sandbox_account_id = os.getenv("META_SANDBOX_AD_ACCOUNT_ID", "").strip()
    configured_account_id = os.getenv("META_AD_ACCOUNT_ID", "").strip()
    if not sandbox_account_id:
        reasons.append("Set META_SANDBOX_AD_ACCOUNT_ID to the Meta test ad account ID.")
    if not configured_account_id:
        reasons.append("Set META_AD_ACCOUNT_ID to the Meta ad account ID.")
    elif sandbox_account_id and _normalize_ad_account_id(sandbox_account_id) != _normalize_ad_account_id(configured_account_id):
        reasons.append("META_AD_ACCOUNT_ID does not match META_SANDBOX_AD_ACCOUNT_ID.")

    missing_meta_variables = [
        variable
        for variable in ("META_APP_ID", "META_APP_SECRET", "META_AD_ACCOUNT_ID", "META_PAGE_ID", "META_ACCESS_TOKEN")
        if not os.getenv(variable, "").strip()
    ]
    if missing_meta_variables:
        reasons.append(f"Set the missing Meta variables on the marketing service: {', '.join(missing_meta_variables)}.")
    return reasons


def demo_payment_is_enabled() -> bool:
    """Require explicit opt-in, complete Meta configuration, and the matching sandbox account."""
    return not _demo_payment_reasons()


@router.get("/campaigns/payment-options", response_model=CampaignPaymentOptionsResponse)
def get_campaign_payment_options(
    _gym_id: str = Depends(require_gym_owner),
) -> CampaignPaymentOptionsResponse:
    """Report available payment modes without exposing payment or Meta credentials."""
    payments = MarketingPaymentService()
    razorpay_missing_variables = [
        variable
        for variable, configured in (
            ("RAZORPAY_KEY_ID", payments.key_id),
            ("RAZORPAY_KEY_SECRET", payments.key_secret),
        )
        if not configured
    ]
    demo_payment_reasons = _demo_payment_reasons()
    return CampaignPaymentOptionsResponse(
        razorpay_available=not razorpay_missing_variables,
        razorpay_missing_variables=razorpay_missing_variables,
        demo_payment_available=not demo_payment_reasons,
        demo_payment_reasons=demo_payment_reasons,
    )


@router.post("/campaigns/creative", status_code=status.HTTP_201_CREATED)
async def upload_campaign_creative(
    file: UploadFile = File(...),
    gym_id: str = Depends(require_gym_owner),
) -> dict[str, str]:
    """Stream an image or video creative to Movora's configured public R2 bucket."""
    content_type = (file.content_type or "").split(";")[0].strip().lower()
    extension = CREATIVE_TYPES.get(content_type)
    if extension is None:
        raise HTTPException(status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, detail="Upload a JPEG, PNG, WebP, MP4, or MOV file.")
    file.file.seek(0, os.SEEK_END)
    file_size = file.file.tell()
    file.file.seek(0)
    if not file_size:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="The selected media file is empty.")
    if file_size > MAX_CREATIVE_BYTES:
        raise HTTPException(status_code=status.HTTP_413_CONTENT_TOO_LARGE, detail="Images and videos must be 500 MB or smaller.")
    header = await file.read(12)
    await file.seek(0)
    valid_headers = {
        "image/jpeg": header.startswith(b"\xff\xd8\xff"),
        "image/png": header.startswith(b"\x89PNG\r\n\x1a\n"),
        "image/webp": len(header) >= 12 and header[:4] == b"RIFF" and header[8:12] == b"WEBP",
        "video/mp4": len(header) >= 8 and header[4:8] == b"ftyp",
        "video/quicktime": len(header) >= 8 and header[4:8] == b"ftyp",
    }
    if not valid_headers[content_type]:
        raise HTTPException(status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, detail="The uploaded file does not match its media type.")

    account_id = os.getenv("R2_ACCOUNT_ID", "").strip()
    access_key = os.getenv("R2_ACCESS_KEY_ID", "").strip()
    secret_key = os.getenv("R2_SECRET_ACCESS_KEY", "").strip()
    bucket = os.getenv("R2_BUCKET_NAME", "").strip()
    public_url = os.getenv("R2_PUBLIC_URL", "").strip().rstrip("/")
    if not all((account_id, access_key, secret_key, bucket, public_url)):
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Gym creative storage is not configured.")

    object_key = f"marketing/{gym_id}/{uuid4()}.{extension}"
    client = boto3.client(
        "s3",
        region_name="auto",
        endpoint_url=os.getenv("R2_ENDPOINT_URL", "").strip() or f"https://{account_id}.r2.cloudflarestorage.com",
        aws_access_key_id=access_key,
        aws_secret_access_key=secret_key,
    )
    try:
        await asyncio.to_thread(
            client.upload_fileobj,
            file.file,
            bucket,
            object_key,
            ExtraArgs={"ContentType": content_type},
            Config=TransferConfig(multipart_threshold=8 * 1024 * 1024, multipart_chunksize=8 * 1024 * 1024),
        )
    except (ClientError, BotoCoreError, NoCredentialsError, S3UploadFailedError) as error:
        logger.exception("Failed to upload a gym marketing creative")
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Could not store the selected media.") from error
    return {"image_url": f"{public_url}/{object_key}"}


@router.post("/campaigns", response_model=CampaignStatusResponse, status_code=status.HTTP_201_CREATED)
def create_campaign(
    payload: CampaignCreateRequest,
    payment_mode: Literal["razorpay", "demo"] = Query(default="razorpay"),
    gym_id: str = Depends(require_gym_owner),
    session: Session = Depends(get_session),
) -> CampaignStatusResponse:
    """Save a draft and initialize either Razorpay checkout or gated sandbox testing."""
    campaign_id = str(uuid4())
    total_amount_paise = amount_to_charge_paise(payload.daily_budget_inr, payload.duration_days)
    if payment_mode == "demo" and not demo_payment_is_enabled():
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Sandbox demo is unavailable: " + " ".join(_demo_payment_reasons()),
        )
    try:
        MetaMarketingService().validate_configuration()
    except MetaConfigurationError as error:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(error)) from error

    payments = MarketingPaymentService()
    order: dict[str, Any] | None = None
    if payment_mode == "razorpay":
        try:
            order = payments.create_order(total_amount_paise, campaign_id, gym_id)
        except PaymentConfigurationError as error:
            raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(error)) from error
        except PaymentProviderError as error:
            logger.exception("Razorpay campaign checkout initialization failed")
            raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(error)) from error

    campaign = GymCampaign(
        id=campaign_id,
        gym_id=gym_id,
        campaign_name=payload.campaign_name,
        objective=payload.objective.value,
        daily_budget_inr=payload.daily_budget_inr,
        duration_days=payload.duration_days,
        target_radius_km=payload.target_radius_km,
        latitude=payload.latitude,
        longitude=payload.longitude,
        image_url=str(payload.image_url),
        primary_text=payload.primary_text,
        status=CampaignStatus.DRAFT.value,
        payment_order_id=order["order_id"] if order else None,
        payment_status="CREATED",
        total_amount_paise=total_amount_paise,
    )
    session.add(campaign)
    try:
        session.commit()
        session.refresh(campaign)
    except SQLAlchemyError:
        session.rollback()
        logger.exception("Failed to persist a gym marketing campaign")
        raise

    response = CampaignStatusResponse.model_validate(campaign)
    return response.model_copy(update={"payment_key_id": order["key_id"] if order else None})


def _activate_meta_campaign(
    campaign: GymCampaign,
    session: Session,
    payment_status: str | None = None,
) -> CampaignStatusResponse:
    """Create and activate the stored campaign in Meta after payment has been accepted."""
    meta = MetaMarketingService()
    try:
        meta.validate_configuration()
    except MetaConfigurationError as error:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(error)) from error

    request_payload = CampaignCreateRequest(
        campaign_name=campaign.campaign_name,
        objective=campaign.objective,
        daily_budget_inr=campaign.daily_budget_inr,
        duration_days=campaign.duration_days,
        target_radius_km=campaign.target_radius_km,
        latitude=campaign.latitude,
        longitude=campaign.longitude,
        image_url=campaign.image_url,
        primary_text=campaign.primary_text,
    )
    try:
        if campaign.meta_campaign_id and campaign.meta_adset_id and campaign.meta_ad_id:
            ids = MetaCampaignIds(campaign.meta_campaign_id, campaign.meta_adset_id, campaign.meta_ad_id)
        else:
            ids = meta.create_campaign(request_payload)
            campaign.meta_campaign_id = ids.campaign_id
            campaign.meta_adset_id = ids.adset_id
            campaign.meta_ad_id = ids.ad_id
            session.commit()
        meta.activate_campaign(ids)
    except MetaConfigurationError as error:
        session.rollback()
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(error)) from error
    except FacebookRequestError as error:
        session.rollback()
        logger.exception("Meta rejected a gym-owner marketing campaign")
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Meta could not publish this campaign.") from error

    campaign.status = CampaignStatus.ACTIVE.value
    if payment_status is not None:
        campaign.payment_status = payment_status
    session.commit()
    session.refresh(campaign)
    return CampaignStatusResponse.model_validate(campaign)


@router.post("/campaigns/{campaign_id}/demo-execute", response_model=CampaignStatusResponse)
def execute_demo_campaign(
    campaign_id: UUID,
    gym_id: str = Depends(require_gym_owner),
    session: Session = Depends(get_session),
) -> CampaignStatusResponse:
    """Activate a campaign in the explicitly configured Meta sandbox without claiming real payment."""
    if not demo_payment_is_enabled():
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sandbox demo payment is not enabled.")
    campaign = session.scalar(
        select(GymCampaign).where(GymCampaign.id == str(campaign_id), GymCampaign.gym_id == gym_id)
    )
    if campaign is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Campaign not found.")
    if campaign.status == CampaignStatus.ACTIVE.value and campaign.payment_status == "TEST":
        return CampaignStatusResponse.model_validate(campaign)
    if campaign.payment_order_id is not None or campaign.payment_status != "CREATED":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="This campaign is not eligible for sandbox demo activation.")

    return _activate_meta_campaign(campaign, session, payment_status="TEST")


@router.post("/campaigns/{campaign_id}/execute", response_model=CampaignStatusResponse)
def execute_campaign(
    campaign_id: UUID,
    payment: CampaignExecuteRequest,
    gym_id: str = Depends(require_gym_owner),
    session: Session = Depends(get_session),
) -> CampaignStatusResponse:
    """Verify a captured payment, publish the campaign through Meta, and activate it."""
    campaign = session.scalar(
        select(GymCampaign).where(GymCampaign.id == str(campaign_id), GymCampaign.gym_id == gym_id)
    )
    if campaign is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Campaign not found.")
    if campaign.payment_order_id != payment.razorpay_order_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Payment order does not match this campaign.")
    if campaign.status == CampaignStatus.ACTIVE.value:
        return CampaignStatusResponse.model_validate(campaign)

    meta = MetaMarketingService()
    try:
        meta.validate_configuration()
    except MetaConfigurationError as error:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(error)) from error

    payment_service = MarketingPaymentService()
    try:
        payment_service.verify_captured_payment(
            payment.razorpay_order_id,
            payment.razorpay_payment_id,
            payment.razorpay_signature,
            campaign.total_amount_paise,
        )
    except PaymentConfigurationError as error:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(error)) from error
    except PaymentVerificationError as error:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(error)) from error
    except PaymentProviderError as error:
        logger.exception("Razorpay campaign payment verification failed")
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(error)) from error

    campaign.payment_id = payment.razorpay_payment_id
    campaign.payment_status = "PAID"
    session.commit()
    session.refresh(campaign)
    return _activate_meta_campaign(campaign, session)


@router.get("/campaigns/gym/{gym_id}", response_model=list[CampaignStatusResponse])
def list_gym_campaigns(
    gym_id: UUID,
    authenticated_gym_id: str = Depends(require_gym_owner),
    session: Session = Depends(get_session),
) -> list[CampaignStatusResponse]:
    """List campaigns for the authenticated gym owner, returning an empty list when absent."""
    if str(gym_id) != authenticated_gym_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Campaigns can only be viewed by their owning gym.")
    campaigns = session.scalars(
        select(GymCampaign).where(GymCampaign.gym_id == authenticated_gym_id).order_by(GymCampaign.created_at.desc())
    ).all()
    return [CampaignStatusResponse.model_validate(campaign) for campaign in campaigns]


@router.get("/campaigns/{campaign_id}/analytics", response_model=CampaignAnalyticsResponse)
def campaign_analytics(
    campaign_id: UUID,
    gym_id: str = Depends(require_gym_owner),
    session: Session = Depends(get_session),
) -> CampaignAnalyticsResponse:
    """Fetch spend, reach, click, and lead metrics from Meta for an owned campaign."""
    campaign = session.scalar(
        select(GymCampaign).where(GymCampaign.id == str(campaign_id), GymCampaign.gym_id == gym_id)
    )
    if campaign is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Campaign not found.")
    if not campaign.meta_campaign_id:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Campaign has not been published to Meta.")

    try:
        insights = MetaMarketingService().get_campaign_insights(campaign.meta_campaign_id)
    except MetaConfigurationError as error:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(error)) from error
    except FacebookRequestError as error:
        logger.exception("Meta campaign insights request failed")
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Meta analytics are temporarily unavailable.") from error

    actions = insights.get("actions", [])
    lead_types = {"lead", "onsite_conversion.lead_grouped", "onsite_conversion.messaging_conversation_started_7d"}
    leads = sum(int(action.get("value", 0)) for action in actions if action.get("action_type") in lead_types)
    spend = float(insights.get("spend", 0) or 0)
    return CampaignAnalyticsResponse(
        campaign_id=campaign.id,
        spend_inr=spend,
        impressions=int(insights.get("impressions", 0) or 0),
        reach=int(insights.get("reach", 0) or 0),
        clicks=int(insights.get("clicks", 0) or 0),
        leads=leads,
        cost_per_lead_inr=round(spend / leads, 2) if leads else None,
    )
