"""
LangGraphAdapter: bridges LangGraph state machine with LiveKit agent framework.
Ported from callflow/core/langgraph_adapter.py
"""

from typing import Any, Optional

from httpx import HTTPStatusError
from langchain_core.messages import AIMessage, BaseMessageChunk, HumanMessage
from langgraph.errors import GraphInterrupt
from langgraph.pregel import Pregel
from langgraph.types import Command
from livekit.agents import llm
from livekit.agents.tts import SynthesizeStream
from livekit.agents.types import DEFAULT_API_CONNECT_OPTIONS, APIConnectOptions
from livekit.agents.utils import shortuuid
from loguru import logger


class FlushSentinel(str, SynthesizeStream._FlushSentinel):
    def __new__(cls, *args, **kwargs):
        return super().__new__(cls, *args, **kwargs)


class LangGraphStream(llm.LLMStream):
    def __init__(
        self,
        llm: llm.LLM,
        chat_ctx: llm.ChatContext,
        graph: Pregel,
        tools: list[llm.FunctionTool] = None,
        conn_options: APIConnectOptions = None,
    ):
        super().__init__(llm, chat_ctx=chat_ctx, tools=tools, conn_options=conn_options)
        self._graph = graph

    async def _run(self):
        input_human_message = next(
            (self._to_message(m) for m in reversed(self.chat_ctx.items) if m.role == "user"),
            None,
        )

        messages = [input_human_message] if input_human_message else []
        input = {"messages": messages}

        if interrupt := await self._get_interrupt():
            used_messages = [AIMessage(interrupt.value), input_human_message]
            input = Command(resume=(input_human_message.content, used_messages))

        try:
            async for mode, data in self._graph.astream(
                input, config=self._llm._config, stream_mode=["messages", "custom"]
            ):
                if mode == "messages":
                    message = data[0]
                    if hasattr(message, "__class__") and message.__class__.__name__ == "AIMessage":
                        if chunk := await self._to_livekit_chunk(message):
                            self._event_ch.send_nowait(chunk)

                if mode == "custom":
                    if isinstance(data, dict) and (event := data.get("type")):
                        if event in ("say", "flush"):
                            content = (data.get("data") or {}).get("content")
                            if chunk := await self._to_livekit_chunk(content):
                                self._event_ch.send_nowait(chunk)
                            self._event_ch.send_nowait(self._create_livekit_chunk(FlushSentinel()))
        except GraphInterrupt:
            pass
        except Exception as e:
            logger.error(f"LangGraph stream failed: {e}")
            if chunk := await self._to_livekit_chunk(
                "I'm having trouble right now, but let's try one more time."
            ):
                self._event_ch.send_nowait(chunk)

        if interrupt := await self._get_interrupt():
            if chunk := await self._to_livekit_chunk(interrupt.value):
                self._event_ch.send_nowait(chunk)

    async def _get_interrupt(self) -> Optional[str]:
        try:
            state = await self._graph.aget_state(config=self._llm._config)
            interrupts = [interrupt for task in state.tasks for interrupt in task.interrupts]
            return next(
                (i for i in reversed(interrupts) if isinstance(i.value, str)),
                None,
            )
        except HTTPStatusError:
            return None
        except Exception as e:
            logger.warning(f"Error getting interrupt: {e}")
            return None

    def _to_message(self, msg: llm.ChatMessage) -> HumanMessage | AIMessage:
        if isinstance(msg.content, str):
            content = msg.content
        elif isinstance(msg.content, list):
            content = []
            for c in msg.content:
                if isinstance(c, str):
                    content.append({"type": "text", "text": c})
                elif isinstance(c, dict):
                    content.append(c)
        else:
            content = ""

        if msg.role == "user":
            return HumanMessage(content=content, id=msg.id)

    @staticmethod
    def _create_livekit_chunk(content: str, *, id: str | None = None) -> llm.ChatChunk | None:
        return llm.ChatChunk(
            id=id or shortuuid(),
            delta=llm.ChoiceDelta(role="assistant", content=content),
        )

    @staticmethod
    async def _to_livekit_chunk(msg: BaseMessageChunk | str | None) -> llm.ChatChunk | None:
        if not msg:
            return None

        request_id = None
        content = msg

        if isinstance(msg, str):
            content = msg
        elif hasattr(msg, "content") and isinstance(msg.content, str):
            request_id = getattr(msg, "id", None)
            content = msg.content
        elif isinstance(msg, dict):
            request_id = msg.get("id")
            content = msg.get("content")

        return LangGraphStream._create_livekit_chunk(content, id=request_id)


class LangGraphAdapter(llm.LLM):
    def __init__(self, graph: Any, config: dict[str, Any] | None = None):
        super().__init__()
        self._graph = graph
        self._config = config or {}

    def chat(
        self,
        chat_ctx: llm.ChatContext,
        tools: list[llm.FunctionTool] = None,
        conn_options: APIConnectOptions = DEFAULT_API_CONNECT_OPTIONS,
        **kwargs,
    ) -> llm.LLMStream:
        return LangGraphStream(
            self,
            chat_ctx=chat_ctx,
            graph=self._graph,
            tools=tools,
            conn_options=conn_options,
        )
