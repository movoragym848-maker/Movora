"""FastAPI service for Movora's social feed and gym-owner marketing."""

from __future__ import annotations

import base64
import json
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from uuid import UUID, uuid4

from fastapi import Depends, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy import DateTime, Integer, LargeBinary, String, Text, Uuid, desc, func, or_, select, tuple_
from sqlalchemy.orm import Mapped, Session, mapped_column

from db.database import Base, get_session
from models import marketing as marketing_models
from routers.marketing import router as marketing_router


class Reels(Base):
    __tablename__ = "social_reels"

    id: Mapped[str] = mapped_column(Uuid(as_uuid=False), primary_key=True, default=lambda: str(uuid4()))
    creator_id: Mapped[str] = mapped_column(Uuid(as_uuid=False), nullable=False)
    video_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    video_hls_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    thumbnail_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    caption: Mapped[str] = mapped_column(Text, nullable=False, default="")
    media_data: Mapped[bytes | None] = mapped_column(LargeBinary, nullable=True)
    media_type: Mapped[str | None] = mapped_column(String, nullable=True)
    workout_tag: Mapped[str] = mapped_column(Text, nullable=False, default="")
    location: Mapped[str] = mapped_column(Text, nullable=False, default="")
    privacy: Mapped[str] = mapped_column(String, nullable=False, default="public")
    raw_object_key: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String, nullable=False, default="ready")
    processing_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    seed_like_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    seed_comment_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc)
    )


class SocialProfiles(Base):
    __tablename__ = "social_profiles"

    user_id: Mapped[str] = mapped_column(Uuid(as_uuid=False), primary_key=True)
    username: Mapped[str] = mapped_column(String, nullable=False)
    display_name: Mapped[str] = mapped_column(Text, nullable=False)
    avatar_url: Mapped[str | None] = mapped_column(Text, nullable=True)


class SocialReelLikes(Base):
    __tablename__ = "social_reel_likes"

    reel_id: Mapped[str] = mapped_column(Uuid(as_uuid=False), primary_key=True)
    user_id: Mapped[str] = mapped_column(Uuid(as_uuid=False), primary_key=True)


class SocialReelComments(Base):
    __tablename__ = "social_reel_comments"

    id: Mapped[str] = mapped_column(Uuid(as_uuid=False), primary_key=True)
    reel_id: Mapped[str] = mapped_column(Uuid(as_uuid=False), nullable=False)


class LegacyReels(Base):
    __tablename__ = "legacy_reels"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    video_url: Mapped[str] = mapped_column(String(2048), nullable=False)
    thumbnail_url: Mapped[str | None] = mapped_column(String(2048), nullable=True)
    caption: Mapped[str] = mapped_column(Text, nullable=False, default="")
    creator_name: Mapped[str] = mapped_column(String(120), nullable=False)
    like_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    comment_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class ReelResponse(BaseModel):
    id: str
    video_url: str
    video_hls_url: str | None
    thumbnail_url: str | None
    caption: str
    creator_name: str
    user_id: str
    username: str
    display_name: str
    avatar_url: str | None
    media_type: str | None
    workout_tag: str
    location: str
    privacy: str
    status: str
    like_count: int
    comment_count: int
    liked: bool
    created_at: datetime


class FeedResponse(BaseModel):
    items: list[ReelResponse]
    next_cursor: str | None
    has_more: bool


def encode_cursor(reel: Reels) -> str:
    payload = json.dumps({"created_at": reel.created_at.isoformat(), "id": reel.id}).encode()
    return base64.urlsafe_b64encode(payload).decode().rstrip("=")


def decode_cursor(value: str) -> tuple[datetime, str]:
    try:
        payload = base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))
        decoded = json.loads(payload)
        created_at = datetime.fromisoformat(decoded["created_at"])
        reel_id = str(UUID(decoded["id"]))
        return created_at, reel_id
    except (ValueError, TypeError, KeyError, json.JSONDecodeError) as error:
        raise HTTPException(status_code=400, detail="Invalid feed cursor") from error


@asynccontextmanager
async def lifespan(_app: FastAPI):
    # The Express service's numbered migrations own the shared social schema.
    yield


app = FastAPI(title="Movora API", version="1.0.0", lifespan=lifespan)
app.include_router(marketing_router)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/reels", response_model=FeedResponse)
def list_reels(
    cursor: str | None = Query(default=None),
    limit: int = Query(default=5, ge=1, le=50),
    session: Session = Depends(get_session),
) -> FeedResponse:
    like_count = (
        Reels.seed_like_count
        + select(func.count()).select_from(SocialReelLikes).where(SocialReelLikes.reel_id == Reels.id).scalar_subquery()
    ).label("like_count")
    comment_count = (
        Reels.seed_comment_count
        + select(func.count()).select_from(SocialReelComments).where(SocialReelComments.reel_id == Reels.id).scalar_subquery()
    ).label("comment_count")
    statement = (
        select(Reels, SocialProfiles, like_count, comment_count)
        .join(SocialProfiles, SocialProfiles.user_id == Reels.creator_id)
        .where(
            Reels.privacy == "public",
            Reels.status == "ready",
            or_(Reels.video_hls_url.is_not(None), Reels.video_url.is_not(None)),
        )
    )
    if cursor:
        cursor_created_at, cursor_id = decode_cursor(cursor)
        statement = statement.where(tuple_(Reels.created_at, Reels.id) < tuple_(cursor_created_at, cursor_id))

    results = list(
        session.execute(statement.order_by(desc(Reels.created_at), desc(Reels.id)).limit(limit + 1))
    )
    has_more = len(results) > limit
    page = results[:limit]
    items = [
        ReelResponse(
            id=reel.id,
            video_url=reel.video_hls_url or reel.video_url,
            video_hls_url=reel.video_hls_url,
            thumbnail_url=reel.thumbnail_url,
            caption=reel.caption,
            creator_name=profile.display_name,
            user_id=profile.user_id,
            username=profile.username,
            display_name=profile.display_name,
            avatar_url=profile.avatar_url,
            media_type=reel.media_type,
            workout_tag=reel.workout_tag,
            location=reel.location,
            privacy=reel.privacy,
            status=reel.status,
            like_count=likes,
            comment_count=comments,
            liked=False,
            created_at=reel.created_at,
        )
        for reel, profile, likes, comments in page
    ]
    last_reel = page[-1][0] if page else None
    return FeedResponse(
        items=items,
        next_cursor=encode_cursor(last_reel) if last_reel else None,
        has_more=has_more,
    )
