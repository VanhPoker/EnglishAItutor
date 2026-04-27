"""add_quiz_sets_and_password_reset

Revision ID: c8f1a2b3d4e5
Revises: 9d4e5f6a7b8c
Create Date: 2026-04-27 16:20:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "c8f1a2b3d4e5"
down_revision: Union[str, Sequence[str], None] = "9d4e5f6a7b8c"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "quiz_sets",
        sa.Column("id", sa.UUID(as_uuid=False), nullable=False),
        sa.Column("created_by", sa.UUID(as_uuid=False), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("source", sa.String(length=32), server_default="manual", nullable=False),
        sa.Column("source_preset", sa.String(length=64), nullable=True),
        sa.Column("source_title", sa.String(length=255), nullable=True),
        sa.Column("source_url", sa.Text(), nullable=True),
        sa.Column("license", sa.Text(), nullable=True),
        sa.Column("attribution", sa.Text(), nullable=True),
        sa.Column("topic", sa.String(length=255), nullable=False),
        sa.Column("level", sa.String(length=2), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_quiz_sets_created_by"), "quiz_sets", ["created_by"], unique=False)

    op.add_column("quizzes", sa.Column("quiz_set_id", sa.UUID(as_uuid=False), nullable=True))
    op.create_index(op.f("ix_quizzes_quiz_set_id"), "quizzes", ["quiz_set_id"], unique=False)
    op.create_foreign_key("fk_quizzes_quiz_set_id", "quizzes", "quiz_sets", ["quiz_set_id"], ["id"])

    op.create_table(
        "password_reset_codes",
        sa.Column("id", sa.UUID(as_uuid=False), nullable=False),
        sa.Column("user_id", sa.UUID(as_uuid=False), nullable=False),
        sa.Column("email", sa.String(length=255), nullable=False),
        sa.Column("code_hash", sa.String(length=128), nullable=False),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.Column("used_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_password_reset_codes_email"), "password_reset_codes", ["email"], unique=False)
    op.create_index(op.f("ix_password_reset_codes_user_id"), "password_reset_codes", ["user_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_password_reset_codes_user_id"), table_name="password_reset_codes")
    op.drop_index(op.f("ix_password_reset_codes_email"), table_name="password_reset_codes")
    op.drop_table("password_reset_codes")
    op.drop_constraint("fk_quizzes_quiz_set_id", "quizzes", type_="foreignkey")
    op.drop_index(op.f("ix_quizzes_quiz_set_id"), table_name="quizzes")
    op.drop_column("quizzes", "quiz_set_id")
    op.drop_index(op.f("ix_quiz_sets_created_by"), table_name="quiz_sets")
    op.drop_table("quiz_sets")
