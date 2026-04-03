from functools import cache
from typing import TypeAlias

from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_groq import ChatGroq
from langchain_openai import ChatOpenAI

from app.core.settings import settings
from app.schema.models import (
    AllModelEnum,
    AnthropicModelName,
    GoogleModelName,
    GroqModelName,
    OpenAIModelName,
)

_MODEL_TABLE = {
    # Google (primary - free tier)
    GoogleModelName.GEMINI_20_FLASH: "gemini-2.0-flash",
    GoogleModelName.GEMINI_25_FLASH: "gemini-2.5-flash",
    GoogleModelName.GEMINI_25_PRO: "gemini-2.5-pro-preview-05-06",
    # Groq (backup - free tier)
    GroqModelName.LLAMA_31_8B: "llama-3.1-8b-instant",
    GroqModelName.LLAMA_33_70B: "llama-3.3-70b-versatile",
    # OpenAI (optional)
    OpenAIModelName.GPT_4O_MINI: "gpt-4o-mini",
    OpenAIModelName.GPT_4O: "gpt-4o",
    # Anthropic (optional)
    AnthropicModelName.HAIKU_35: "claude-3-5-haiku-latest",
    AnthropicModelName.SONNET_35: "claude-3-5-sonnet-latest",
}

ModelT: TypeAlias = ChatOpenAI | ChatGoogleGenerativeAI | ChatGroq


@cache
def get_model(model_name: AllModelEnum, temperature: float = 0.5) -> ModelT:
    api_model_name = _MODEL_TABLE.get(model_name)
    if not api_model_name:
        raise ValueError(f"Unsupported model: {model_name}")

    if model_name in GoogleModelName:
        return ChatGoogleGenerativeAI(
            model=api_model_name,
            temperature=temperature,
        )

    if model_name in GroqModelName:
        return ChatGroq(
            model=api_model_name,
            temperature=temperature,
            streaming=True,
            api_key=settings.GROQ_API_KEY,
        )

    if model_name in OpenAIModelName:
        return ChatOpenAI(
            model=api_model_name,
            temperature=temperature,
            streaming=True,
            api_key=settings.OPENAI_API_KEY.get_secret_value() if settings.OPENAI_API_KEY else None,
        )

    if model_name in AnthropicModelName:
        from langchain_anthropic import ChatAnthropic

        return ChatAnthropic(
            model=api_model_name,
            temperature=temperature,
            streaming=True,
        )

    raise ValueError(f"No provider found for model: {model_name}")
