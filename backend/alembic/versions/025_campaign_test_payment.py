"""Allow campaigns activated through the explicitly gated Meta sandbox."""

from alembic import op

revision = "025_campaign_test_payment"
down_revision = "024_create_gym_campaigns"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Record sandbox activations separately from captured Razorpay payments."""
    op.execute("ALTER TABLE gym_campaigns DROP CONSTRAINT IF EXISTS ck_gym_campaign_payment_status")
    op.execute(
        "ALTER TABLE gym_campaigns ADD CONSTRAINT ck_gym_campaign_payment_status "
        "CHECK (payment_status IN ('CREATED', 'PAID', 'TEST'))"
    )


def downgrade() -> None:
    """Return sandbox records to unpaid drafts before removing their status."""
    op.execute("UPDATE gym_campaigns SET payment_status = 'CREATED' WHERE payment_status = 'TEST'")
    op.execute("ALTER TABLE gym_campaigns DROP CONSTRAINT IF EXISTS ck_gym_campaign_payment_status")
    op.execute(
        "ALTER TABLE gym_campaigns ADD CONSTRAINT ck_gym_campaign_payment_status "
        "CHECK (payment_status IN ('CREATED', 'PAID'))"
    )
