"""Seed the CEFR listening/speaking quiz bank into Postgres.

Run inside the API container:
    python -m app.utils.seed_skill_bank
"""

from __future__ import annotations

import asyncio

from sqlalchemy import delete, select

from app.database.connection import get_session_factory
from app.database.models import Quiz, QuizAttempt, QuizSet, User
from app.utils.curated_skill_bank import CURATED_SKILL_BANK_SETS


async def seed_skill_bank() -> dict[str, int]:
    presets = [item["source_preset"] for item in CURATED_SKILL_BANK_SETS]
    factory = get_session_factory()

    async with factory() as db:
        owner = (
            await db.execute(
                select(User).where(User.role == "admin").order_by(User.created_at).limit(1)
            )
        ).scalar_one_or_none()
        if not owner:
            owner = (await db.execute(select(User).order_by(User.created_at).limit(1))).scalar_one_or_none()
        if not owner:
            raise RuntimeError("Cannot seed quiz bank because there is no user in the database.")

        existing_sets = (
            await db.execute(select(QuizSet.id).where(QuizSet.source_preset.in_(presets)))
        ).scalars().all()
        existing_quizzes = []
        if existing_sets:
            existing_quizzes = (
                await db.execute(select(Quiz.id).where(Quiz.quiz_set_id.in_(existing_sets)))
            ).scalars().all()
            if existing_quizzes:
                await db.execute(delete(QuizAttempt).where(QuizAttempt.quiz_id.in_(existing_quizzes)))
                await db.execute(delete(Quiz).where(Quiz.id.in_(existing_quizzes)))
            await db.execute(delete(QuizSet).where(QuizSet.id.in_(existing_sets)))

        created_sets = 0
        created_quizzes = 0
        created_questions = 0
        for seed in CURATED_SKILL_BANK_SETS:
            quiz_set = QuizSet(
                created_by=owner.id,
                title=seed["title"],
                description=seed.get("description"),
                source="open_source",
                source_preset=seed.get("source_preset"),
                source_title=seed.get("source_title"),
                source_url=seed.get("source_url"),
                license=seed.get("license"),
                attribution=seed.get("attribution"),
                topic=seed.get("topic") or "communication_skills",
                level=seed.get("level") or "B1",
            )
            db.add(quiz_set)
            created_sets += 1

            source_note = f"Nguồn: {seed['attribution']}. License: {seed['license']}"
            for item in seed.get("quizzes", []):
                questions = item.get("questions") or []
                if not questions:
                    continue
                description = (item.get("description") or "").strip()
                if source_note not in description:
                    description = f"{description}\n{source_note}".strip()
                db.add(
                    Quiz(
                        user_id=owner.id,
                        quiz_set=quiz_set,
                        title=item.get("title") or f"{seed['title']} #{created_quizzes + 1}",
                        topic=item.get("topic") or seed.get("topic") or "communication_skills",
                        level=item.get("level") or seed.get("level") or "B1",
                        source="open_source",
                        description=description,
                        questions_json=questions,
                    )
                )
                created_quizzes += 1
                created_questions += len(questions)

        await db.commit()

    return {
        "deleted_sets": len(existing_sets),
        "deleted_quizzes": len(existing_quizzes),
        "created_sets": created_sets,
        "created_quizzes": created_quizzes,
        "created_questions": created_questions,
    }


def main() -> None:
    result = asyncio.run(seed_skill_bank())
    print(result)


if __name__ == "__main__":
    main()
