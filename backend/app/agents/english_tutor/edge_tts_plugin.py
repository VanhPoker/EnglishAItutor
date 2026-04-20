"""Custom TTS using edge-tts (free Microsoft TTS, no API key needed)."""

import edge_tts
from livekit.agents import tts, utils
from livekit.agents.types import APIConnectOptions, DEFAULT_API_CONNECT_OPTIONS


class EdgeTTS(tts.TTS):
    def __init__(self, voice: str = "en-US-JennyNeural"):
        super().__init__(
            capabilities=tts.TTSCapabilities(streaming=False),
            sample_rate=24000,
            num_channels=1,
        )
        self._voice = voice

    def synthesize(
        self,
        text: str,
        *,
        conn_options: APIConnectOptions = DEFAULT_API_CONNECT_OPTIONS,
    ) -> "EdgeTTSStream":
        return EdgeTTSStream(self, text, self._voice, conn_options=conn_options)


class EdgeTTSStream(tts.ChunkedStream):
    def __init__(
        self,
        tts_instance: EdgeTTS,
        text: str,
        voice: str,
        *,
        conn_options: APIConnectOptions,
    ):
        super().__init__(tts=tts_instance, input_text=text, conn_options=conn_options)
        self._voice = voice

    async def _run(self, output_emitter: tts.AudioEmitter) -> None:
        output_emitter.initialize(
            request_id=utils.shortuuid(),
            sample_rate=24000,
            num_channels=1,
            mime_type="audio/mpeg",
        )

        communicate = edge_tts.Communicate(self._input_text, self._voice)
        async for chunk in communicate.stream():
            if chunk["type"] == "audio":
                output_emitter.push(chunk["data"])
