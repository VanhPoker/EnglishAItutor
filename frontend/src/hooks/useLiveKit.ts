import { useCallback, useRef, useState } from "react";
import {
  Room,
  RoomEvent,
  Track,
  RemoteTrack,
  RemoteTrackPublication,
  RemoteParticipant,
  ConnectionState,
} from "livekit-client";
import { getToken, type TokenRequest } from "../lib/api";
import { useChatStore } from "../stores/chatStore";

const CHAT_TOPIC = "ai-text-stream";
const SECURE_LIVEKIT_URL = "wss://livekit.4.145.98.216.sslip.io";
type ChatRole = "user" | "assistant";
type TranscriptBuffer = { texts: string[]; ids: Set<string> };

function createTranscriptBuffers(): Record<ChatRole, TranscriptBuffer> {
  return {
    user: { texts: [], ids: new Set() },
    assistant: { texts: [], ids: new Set() },
  };
}

function normalizeTranscript(value: string) {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function isSimilarTranscript(a: string, b: string) {
  const normalizedA = normalizeTranscript(a);
  const normalizedB = normalizeTranscript(b);
  if (!normalizedA || !normalizedB) return false;
  if (normalizedA === normalizedB) return true;
  const minLength = Math.min(normalizedA.length, normalizedB.length);
  return minLength >= 24 && (normalizedA.includes(normalizedB) || normalizedB.includes(normalizedA));
}

function combineTranscriptParts(parts: string[]) {
  const combined: string[] = [];

  for (const rawPart of parts) {
    const part = rawPart.trim();
    if (!part) continue;

    const last = combined[combined.length - 1];
    if (!last) {
      combined.push(part);
      continue;
    }

    const normalizedLast = normalizeTranscript(last);
    const normalizedPart = normalizeTranscript(part);
    if (normalizedLast === normalizedPart || normalizedLast.endsWith(normalizedPart)) {
      continue;
    }
    if (normalizedPart.startsWith(normalizedLast)) {
      combined[combined.length - 1] = part;
      continue;
    }

    combined.push(part);
  }

  return combined.join(" ").replace(/\s+/g, " ").trim();
}

function getLiveKitUrl() {
  if (import.meta.env.VITE_LIVEKIT_URL) {
    return import.meta.env.VITE_LIVEKIT_URL;
  }

  if (window.location.protocol === "https:") {
    return SECURE_LIVEKIT_URL;
  }

  if (window.location.hostname === "127.0.0.1" || window.location.hostname === "localhost") {
    return "ws://127.0.0.1:7880";
  }

  return `ws://${window.location.hostname}:7880`;
}

export function useLiveKit() {
  const roomRef = useRef<Room | null>(null);
  const sendingRef = useRef(false);
  const finalTranscriptIdsRef = useRef<Set<string>>(new Set());
  const transcriptContentRef = useRef<Map<string, number>>(new Map());
  const transcriptBuffersRef = useRef<Record<ChatRole, TranscriptBuffer>>(createTranscriptBuffers());
  const transcriptTimersRef = useRef<Partial<Record<ChatRole, number>>>({});
  const [connectionState, setConnectionState] = useState<ConnectionState>(
    ConnectionState.Disconnected
  );
  const [lastError, setLastError] = useState<string | null>(null);

  const { addMessage, setConnected, setCurrentTranscript } = useChatStore();

  const connect = useCallback(
    async (req: TokenRequest) => {
      const { token } = await getToken(req);
      setLastError(null);

      finalTranscriptIdsRef.current.clear();
      transcriptContentRef.current.clear();
      transcriptBuffersRef.current = createTranscriptBuffers();
      Object.values(transcriptTimersRef.current).forEach((timer) => {
        if (timer) window.clearTimeout(timer);
      });
      transcriptTimersRef.current = {};
      setCurrentTranscript("");

      const room = new Room({
        adaptiveStream: true,
        dynacast: true,
      });
      roomRef.current = room;

      // Connection state
      room.on(RoomEvent.ConnectionStateChanged, (state: ConnectionState) => {
        setConnectionState(state);
        setConnected(state === ConnectionState.Connected);
      });

      room.on(RoomEvent.MediaDevicesError, (error) => {
        console.error("Media device error:", error);
        setLastError("Không truy cập được micro trên trình duyệt.");
      });

      room.on(RoomEvent.ParticipantPermissionsChanged, () => {
        const permissions = room.localParticipant.permissions;
        if (permissions?.canPublish === false) {
          setLastError("Token hiện tại không có quyền publish audio.");
          return;
        }
        if (permissions?.canPublishData === false) {
          setLastError("Token hiện tại không có quyền gửi dữ liệu chat.");
        }
      });

      room.on(RoomEvent.LocalTrackPublished, () => {
        setLastError(null);
      });

      // Agent audio track
      room.on(
        RoomEvent.TrackSubscribed,
        (track: RemoteTrack, pub: RemoteTrackPublication, participant: RemoteParticipant) => {
          if (track.kind === Track.Kind.Audio) {
            const el = track.attach();
            el.id = "agent-audio";
            document.body.appendChild(el);
          }
        }
      );

      room.on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack) => {
        track.detach().forEach((el) => el.remove());
      });

      const hasRecentMessage = (role: ChatRole, content: string) => {
        const now = Date.now();
        return useChatStore
          .getState()
          .messages.some(
            (message) =>
              message.role === role &&
              isSimilarTranscript(message.content, content) &&
              now - message.timestamp < 12_000
          );
      };

      const addTranscriptMessage = (
        role: ChatRole,
        content: string
      ) => {
        const trimmed = content.trim();
        if (!trimmed) return;

        const key = `${role}:${normalizeTranscript(trimmed)}`;
        const now = Date.now();
        const lastSeen = transcriptContentRef.current.get(key);
        if (lastSeen && now - lastSeen < 8_000) {
          return;
        }

        if (hasRecentMessage(role, trimmed)) {
          transcriptContentRef.current.set(key, now);
          return;
        }

        transcriptContentRef.current.set(key, now);
        addMessage({ role, content: trimmed });
      };

      const flushTranscriptBuffer = (role: ChatRole) => {
        const buffer = transcriptBuffersRef.current[role];
        transcriptTimersRef.current[role] = undefined;
        const text = combineTranscriptParts(buffer.texts);
        transcriptBuffersRef.current[role] = { texts: [], ids: new Set() };
        addTranscriptMessage(role, text);
      };

      const queueTranscriptMessage = (
        role: ChatRole,
        content: string,
        segmentId?: string
      ) => {
        const trimmed = content.trim();
        if (!trimmed) return;

        if (segmentId && finalTranscriptIdsRef.current.has(segmentId)) {
          return;
        }
        if (segmentId) finalTranscriptIdsRef.current.add(segmentId);

        const buffer = transcriptBuffersRef.current[role];
        if (!buffer.texts.some((item) => isSimilarTranscript(item, trimmed))) {
          buffer.texts.push(trimmed);
        }
        if (segmentId) buffer.ids.add(segmentId);

        const existingTimer = transcriptTimersRef.current[role];
        if (existingTimer) window.clearTimeout(existingTimer);

        const delay = role === "assistant" ? 1000 : 900;
        transcriptTimersRef.current[role] = window.setTimeout(() => {
          flushTranscriptBuffer(role);
        }, delay);

        if (finalTranscriptIdsRef.current.size > 250) {
          finalTranscriptIdsRef.current = new Set(Array.from(finalTranscriptIdsRef.current).slice(-150));
        }
      };

      room.on(RoomEvent.TranscriptionReceived, (segments, participant) => {
        for (const segment of segments) {
          const text = segment.text?.trim();
          if (!text) continue;

          const isLocal =
            participant?.identity === room.localParticipant.identity;
          const role = isLocal ? "user" : "assistant";
          const label = isLocal ? "Bạn" : "Gia sư";

          if (segment.final) {
            setCurrentTranscript("");
            queueTranscriptMessage(role, text, segment.id);
          } else {
            setCurrentTranscript(`${label}: ${text}`);
          }
        }
      });

      // Text streams on this topic are used for typed user input. Older backend
      // builds also sent assistant text here, so drain remote streams and let
      // the final LiveKit transcription be the only assistant bubble source.
      room.registerTextStreamHandler(CHAT_TOPIC, async (reader) => {
        const textStream = reader as any;
        if (typeof textStream.readAll === "function") {
          await textStream.readAll().catch(() => "");
        } else if (typeof textStream[Symbol.asyncIterator] === "function") {
          for await (const chunk of textStream) {
            void chunk;
            // Drain the stream so LiveKit can close it cleanly.
          }
        }
      });

      await room.connect(getLiveKitUrl(), token);
      return room;
    },
    [addMessage, setConnected, setCurrentTranscript]
  );

  const disconnect = useCallback(() => {
    (["user", "assistant"] as ChatRole[]).forEach((role) => {
      const timer = transcriptTimersRef.current[role];
      if (timer) window.clearTimeout(timer);
      const text = combineTranscriptParts(transcriptBuffersRef.current[role].texts);
      if (text) addMessage({ role, content: text });
    });
    transcriptTimersRef.current = {};
    transcriptBuffersRef.current = createTranscriptBuffers();

    if (roomRef.current) {
      roomRef.current.disconnect();
      roomRef.current = null;
      setConnected(false);
      setCurrentTranscript("");
      setLastError(null);
    }
  }, [addMessage, setConnected, setCurrentTranscript]);

  const sendText = useCallback(async (text: string) => {
    const room = roomRef.current;
    if (!room || sendingRef.current) return;

    sendingRef.current = true;
    addMessage({ role: "user", content: text });

    try {
      await room.localParticipant.sendText(text, {
        topic: CHAT_TOPIC,
      });
      setLastError(null);
    } catch (error) {
      console.error("Failed to send text over LiveKit:", error);
      setLastError("Không gửi được tin nhắn vào phiên học. Đường RTC data chưa sẵn sàng.");
    } finally {
      sendingRef.current = false;
    }
  }, [addMessage]);

  const toggleMicrophone = useCallback(async () => {
    const room = roomRef.current;
    if (!room) return;

    const enabled = room.localParticipant.isMicrophoneEnabled;
    try {
      await room.localParticipant.setMicrophoneEnabled(!enabled);
      setLastError(null);
      return !enabled;
    } catch (error) {
      console.error("Failed to toggle microphone:", error);
      const message =
        room.localParticipant.lastMicrophoneError?.message ||
        "Không bật được micro. Có thể WebRTC chưa thiết lập được hoặc trình duyệt chưa cấp quyền.";
      setLastError(message);
      return enabled;
    }
  }, []);

  return {
    room: roomRef.current,
    connectionState,
    connect,
    disconnect,
    sendText,
    toggleMicrophone,
    lastError,
  };
}
