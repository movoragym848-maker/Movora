"""SQLAlchemy persistence model for gym-owner marketing campaigns."""

from __future__ import annotations

from datetime import datetime
from uuid import uuid4

from sqlalchemy import CheckConstraint, DateTime, Float, Index, Integer, String, Uuid, func
from sqlalchemy.orm import Mapped, mapped_column

from db.database import Base


class GymCampaign(Base):
    """A gym owner's campaign configuration and Meta/payment references."""

    __tablename__ = "gym_campaigns"
    __table_args__ = (
        CheckConstraint("objective IN ('GET_MEMBERS', 'DIRECT_MESSAGES')", name="ck_gym_campaign_objective"),
        CheckConstraint(
            "status IN ('DRAFT', 'PENDING_PAYMENT', 'ACTIVE', 'PAUSED', 'COMPLETED')",
            name="ck_gym_campaign_status",
        ),
        CheckConstraint("daily_budget_inr > 0", name="ck_gym_campaign_budget"),
        CheckConstraint("duration_days IN (3, 7, 14)", name="ck_gym_campaign_duration"),
        CheckConstraint("target_radius_km BETWEEN 3 AND 15", name="ck_gym_campaign_radius"),
        CheckConstraint("latitude BETWEEN -90 AND 90", name="ck_gym_campaign_latitude"),
        CheckConstraint("longitude BETWEEN -180 AND 180", name="ck_gym_campaign_longitude"),
        CheckConstraint("total_amount_paise > 0", name="ck_gym_campaign_amount"),
        CheckConstraint("payment_status IN ('CREATED', 'PAID', 'TEST')", name="ck_gym_campaign_payment_status"),
        Index("ix_gym_campaigns_gym_id_created_at", "gym_id", "created_at"),
    )

    id: Mapped[str] = mapped_column(Uuid(as_uuid=False), primary_key=True, default=lambda: str(uuid4()))
    gym_id: Mapped[str] = mapped_column(Uuid(as_uuid=False), nullable=False)
    meta_campaign_id: Mapped[str | None] = mapped_column(String, nullable=True)
    meta_adset_id: Mapped[str | None] = mapped_column(String, nullable=True)
    meta_ad_id: Mapped[str | None] = mapped_column(String, nullable=True)
    campaign_name: Mapped[str] = mapped_column(String(120), nullable=False)
    objective: Mapped[str] = mapped_column(String(32), nullable=False)
    daily_budget_inr: Mapped[float] = mapped_column(Float, nullable=False)
    duration_days: Mapped[int] = mapped_column(Integer, nullable=False)
    target_radius_km: Mapped[int] = mapped_column(Integer, nullable=False)
    latitude: Mapped[float] = mapped_column(Float, nullable=False)
    longitude: Mapped[float] = mapped_column(Float, nullable=False)
    image_url: Mapped[str] = mapped_column(String(2048), nullable=False)
    primary_text: Mapped[str] = mapped_column(String(2000), nullable=False)
    status: Mapped[str] = mapped_column(String(24), nullable=False, default="DRAFT")
    payment_order_id: Mapped[str | None] = mapped_column(String, nullable=True)
    payment_id: Mapped[str | None] = mapped_column(String, nullable=True)
    payment_status: Mapped[str] = mapped_column(String(20), nullable=False, default="CREATED")
    total_amount_paise: Mapped[int] = mapped_column(Integer, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
