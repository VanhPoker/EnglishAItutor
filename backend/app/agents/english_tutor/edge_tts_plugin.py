"""Custom TTS using edge-tts (free Microsoft TTS, no API key needed)."""

import asyncio
import io
from typing import Optional

import edge_tts
from livekit.agents import tts, utils
from loguru import logger


class EdgeTTS(tts.TTS):
    def __init__(self, voice: str = "en-US-JennyNeural"):
        super().__init__(
            capabilities=tts.TTSCapabilities(streaming=False),
            sample_rate=24000,
            num_channels=1,
        )
        self._voice = voice

    def synthesize(self, text: str, *, conn_options=None) -> "EdgeTTSStream":
        return EdgeTTSStream(self, text, self._voice)


class EdgeTTSStream(tts.ChunkedStream):
    def __init__(self, tts_instance: EdgeTTS, text: str, voice: str):
        super().__init__(tts=tts_instance, input_text=text)
        self._voice = voice

    async def _run(self):
        try:
            communicate = edge_tts.Communicate(self._input_text, self._voice)
            audio_data = bytearray()

            async for chunk in communicate.stream():
                if chunk["type"] == "audio":
                    audio_data.extend(chunk["data"])

            if audio_data:
                # edge-tts returns mp3, need to decode to PCM
                import subprocess
                proc = await asyncio.create_subprocess_exec(
                    "ffmpeg", "-i", "pipe:0", "-f", "s16le",
                    "-ar", "24000", "-ac", "1", "pipe:1",
                    stdin=subprocess.PIPE,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE,
                )
                pcm_data, stderr = await proc.communicate(bytes(audio_data))

                if pcm_data:
                    frame = utils.audio.AudioFrame(
                        data=pcm_data,
                        sample_rate=24000,
                        num_channels=1,
                        samples_per_channel=len(pcm_data) // 2,
                    )
                    self._event_ch.send_nowait(
                        tts.SynthesizedAudio(
                            request_id=utils.shortuuid(),
                            frame=frame,
                        )
                    )
        except Exception as e:
            logger.error(f"EdgeTTS error: {e}")
