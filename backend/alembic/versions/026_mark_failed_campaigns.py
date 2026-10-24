"""Record failed Meta campaign launches distinctly from pending campaigns."""

from alembic import op

revision = "026_mark_failed_campaigns"
down_revision = "025_campaign_test_payment"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Add failed launch history and correctly classify old unpaid demo attempts."""
    op.execute("ALTER TABLE gym_campaigns ADD COLUMN IF NOT EXISTS failure_reason varchar(2000)")
    op.execute("ALTER TABLE gym_campaigns DROP CONSTRAINT IF EXISTS ck_gym_campaign_status")
    op.execute("ALTER TABLE gym_campaigns DROP CONSTRAINT IF EXISTS gym_campaigns_status_check")
    op.execute(
        "ALTER TABLE gym_campaigns ADD CONSTRAINT ck_gym_campaign_status "
        "CHECK (status IN ('DRAFT', 'PENDING_PAYMENT', 'ACTIVE', 'PAUSED', 'COMPLETED', 'FAILED'))"
    )
    op.execute(
        """
        UPDATE gym_campaigns
        SET status = 'FAILED',
            failure_reason = 'This earlier unpaid campaign never completed a successful launch.'
        WHERE status = 'DRAFT'
          AND payment_order_id IS NULL
          AND payment_status = 'CREATED'
        """
    )


def downgrade() -> None:
    """Restore migrated failed demo drafts before removing the failed status."""
    op.execute(
        """
        UPDATE gym_campaigns
        SET status = 'DRAFT', failure_reason = NULL
        WHERE status = 'FAILED'
          AND failure_reason = 'This earlier unpaid campaign never completed a successful launch.'
        """
    )
    op.execute("ALTER TABLE gym_campaigns DROP CONSTRAINT IF EXISTS ck_gym_campaign_status")
    op.execute("ALTER TABLE gym_campaigns DROP CONSTRAINT IF EXISTS gym_campaigns_status_check")
    op.execute(
        "ALTER TABLE gym_campaigns ADD CONSTRAINT ck_gym_campaign_status "
        "CHECK (status IN ('DRAFT', 'PENDING_PAYMENT', 'ACTIVE', 'PAUSED', 'COMPLETED'))"
    )
    op.execute("ALTER TABLE gym_campaigns DROP COLUMN IF EXISTS failure_reason")
