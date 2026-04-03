"""
LiveKit Agent entrypoint for English Tutor Agent.
Run with: python -m app.main dev
"""

import json

from dotenv import load_dotenv

load_dotenv(".env", verbose=True, override=True)

from loguru import logger
from livekit.agents import JobRequest, cli, WorkerOptions

from app.agents.english_tutor.entrypoint import entrypoint, prewarm
from app.core.settings import settings


async def request_fnc(req: JobRequest):
    """Filter incoming job requests."""
    if req.job.metadata:
        job_metadata = json.loads(req.job.metadata)
        agent_name = job_metadata.get("agent_name", "English Tutor")
    else:
        agent_name = "English Tutor"

    logger.info(f"Accepting job for agent: {agent_name}")
    await req.accept(name=agent_name)


def main():
    cli.run_app(
        WorkerOptions(
            entrypoint_fnc=entrypoint,
            prewarm_fnc=prewarm,
            request_fnc=request_fnc,
        ),
    )


if __name__ == "__main__":
    main()
