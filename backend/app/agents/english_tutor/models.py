"""Pydantic + TypedDict models for English Tutor agent state."""

from typing import Annotated

from langchain_core.messages import BaseMessage
from langgraph.graph import add_messages
from pydantic import BaseModel, Field
from typing_extensions import TypedDict


# ── LangGraph State ──────────────────────────────────────────────

class EnglishTutorState(TypedDict):
    """State flowing through the LangGraph conversation graph."""

    messages: Annotated[list[BaseMessage], add_messages]

    # User context
    user_id: str
    user_level: str  # Signup / profile CEFR: A1, A2, B1, B2, C1, C2
    working_level: str  # Adaptive per-session level used for response difficulty
    current_topic: str
    mem0_user_id: str
    memory_prompt: str
    session_context: str

    # Analysis results (set by assess node)
    errors_detected: list[dict]  # [{"type": "grammar", "text": "...", "correction": "..."}]
    should_correct: bool  # routing flag
    route: str  # "respond" | "correct" | "topic_change"
    overall_quality: str
    suggested_level: str

    # Session tracking
    session_stats: dict  # {"turns": 0, "errors": 0, "corrections": 0, ...}
    is_started: bool


# ── Pydantic models for structured LLM output ───────────────────

class ErrorItem(BaseModel):
    """A single language error detected in user speech."""

    error_type: str = Field(description="Type: grammar, vocabulary, pronunciation, or word_choice")
    original: str = Field(description="The incorrect text from the user")
    correction: str = Field(description="The corrected version")
    explanation: str = Field(description="Brief, friendly explanation of why it's wrong")


class ErrorAnalysis(BaseModel):
    """Structured output from the error analysis step."""

    errors: list[ErrorItem] = Field(default_factory=list, description="List of errors found")
    overall_quality: str = Field(description="One of: excellent, good, fair, needs_work")
    suggested_level: str = Field(description="Suggested CEFR level based on this message: A1-C2")


class RouteDecision(BaseModel):
    """Routing decision from the router node."""

    route: str = Field(description="One of: respond, correct, topic_change")
    reasoning: str = Field(description="Brief reason for this routing decision")


class TopicSuggestion(BaseModel):
    """Suggested conversation topic."""

    topic: str = Field(description="The new topic name")
    opening_question: str = Field(description="An engaging question to start the topic")
    difficulty: str = Field(description="CEFR level this topic is suited for")
