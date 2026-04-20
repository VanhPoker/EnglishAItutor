"""Custom STT using faster-whisper (local, free, no API key needed)."""

import io
import wave
from typing import Optional

from faster_whisper import WhisperModel
from livekit.agents import stt, utils
from livekit.agents.utils import AudioBuffer
from loguru import logger

_model: Optional[WhisperModel] = None


def _get_model() -> WhisperModel:
    global _model
    if _model is None:
        logger.info("Loading Whisper model (base.en)...")
        _model = WhisperModel("base.en", device="cpu", compute_type="int8")
        logger.info("Whisper model loaded")
    return _model


class WhisperSTT(stt.STT):
    def __init__(self, model_size: str = "base.en"):
        capabilities = stt.STTCapabilities(streaming=False, interim_results=False)
        super().__init__(capabilities=capabilities)
        self._model_size = model_size

    async def _recognize_impl(
        self,
        buffer: AudioBuffer,
        *,
        language: str | None = None,
        conn_options: Optional[dict] = None,
    ) -> stt.SpeechEvent:
        try:
            buffer = utils.merge_frames(buffer)
            io_buffer = io.BytesIO()

            with wave.open(io_buffer, "wb") as wav:
                wav.setnchannels(buffer.num_channels)
                wav.setsampwidth(2)
                wav.setframerate(buffer.sample_rate)
                wav.writeframes(buffer.data)

            io_buffer.seek(0)

            model = _get_model()
            segments, info = model.transcribe(io_buffer, language="en")
            text = " ".join(seg.text.strip() for seg in segments)

            logger.info(f"WhisperSTT: '{text}'")

            return stt.SpeechEvent(
                type=stt.SpeechEventType.FINAL_TRANSCRIPT,
                alternatives=[stt.SpeechData(text=text, language="en")],
            )
        except Exception as e:
            logger.error(f"WhisperSTT error: {e}")
            return stt.SpeechEvent(
                type=stt.SpeechEventType.FINAL_TRANSCRIPT,
                alternatives=[stt.SpeechData(text="", language="en")],
            )
