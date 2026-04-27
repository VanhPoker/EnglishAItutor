"""add_subscriptions_and_payments

Revision ID: 9d4e5f6a7b8c
Revises: 7a2d8f3c1b9e
Create Date: 2026-04-27 15:30:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "9d4e5f6a7b8c"
down_revision: Union[str, Sequence[str], None] = "7a2d8f3c1b9e"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("subscription_plan", sa.String(length=32), nullable=False, server_default="free"),
    )
    op.create_table(
        "payment_requests",
        sa.Column("id", sa.UUID(as_uuid=False), nullable=False),
        sa.Column("user_id", sa.UUID(as_uuid=False), nullable=False),
        sa.Column("plan", sa.String(length=32), nullable=False),
        sa.Column("amount_vnd", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="pending"),
        sa.Column("qr_payload", sa.Text(), nullable=False),
        sa.Column("admin_note", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_payment_requests_user_id"), "payment_requests", ["user_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_payment_requests_user_id"), table_name="payment_requests")
    op.drop_table("payment_requests")
    op.drop_column("users", "subscription_plan")
