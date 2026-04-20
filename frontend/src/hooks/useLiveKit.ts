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

function getLiveKitUrl() {
  if (import.meta.env.VITE_LIVEKIT_URL) {
    return import.meta.env.VITE_LIVEKIT_URL;
  }

  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.hostname}:7880`;
}

export function useLiveKit() {
  const roomRef = useRef<Room | null>(null);
  const sendingRef = useRef(false);
  const finalTranscriptIdsRef = useRef<Set<string>>(new Set());
  const transcriptContentRef = useRef<Map<string, number>>(new Map());
  const [connectionState, setConnectionState] = useState<ConnectionState>(
    ConnectionState.Disconnected
  );

  const { addMessage, setConnected, setCurrentTranscript } = useChatStore();

  const connect = useCallback(
    async (req: TokenRequest) => {
      const { token } = await getToken(req);

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

      const normalizeTranscript = (value: string) =>
        value.trim().replace(/\s+/g, " ").toLowerCase();

      const hasRecentMessage = (role: "user" | "assistant", content: string) => {
        const now = Date.now();
        const normalized = normalizeTranscript(content);
        return useChatStore
          .getState()
          .messages.some(
            (message) =>
              message.role === role &&
              normalizeTranscript(message.content) === normalized &&
              now - message.timestamp < 12_000
          );
      };

      const addTranscriptMessage = (
        role: "user" | "assistant",
        content: string,
        segmentId: string
      ) => {
        const trimmed = content.trim();
        if (!trimmed) return;

        if (segmentId && finalTranscriptIdsRef.current.has(segmentId)) {
          return;
        }

        const key = `${role}:${normalizeTranscript(trimmed)}`;
        const now = Date.now();
        const lastSeen = transcriptContentRef.current.get(key);
        if (lastSeen && now - lastSeen < 2_000) {
          return;
        }

        if (hasRecentMessage(role, trimmed)) {
          transcriptContentRef.current.set(key, now);
          if (segmentId) finalTranscriptIdsRef.current.add(segmentId);
          return;
        }

        transcriptContentRef.current.set(key, now);
        if (segmentId) finalTranscriptIdsRef.current.add(segmentId);
        addMessage({ role, content: trimmed });

        if (finalTranscriptIdsRef.current.size > 200) {
          finalTranscriptIdsRef.current = new Set(
            Array.from(finalTranscriptIdsRef.current).slice(-100)
          );
        }
      };

      room.on(RoomEvent.TranscriptionReceived, (segments, participant) => {
        for (const segment of segments) {
          const text = segment.text?.trim();
          if (!text) continue;

          const isLocal =
            participant?.identity === room.localParticipant.identity;
          const role = isLocal ? "user" : "assistant";
          const label = isLocal ? "You" : "Tutor";

          if (segment.final) {
            setCurrentTranscript("");
            addTranscriptMessage(role, text, segment.id);
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
    if (roomRef.current) {
      roomRef.current.disconnect();
      roomRef.current = null;
      setConnected(false);
      setCurrentTranscript("");
    }
  }, [setConnected, setCurrentTranscript]);

  const sendText = useCallback(async (text: string) => {
    const room = roomRef.current;
    if (!room || sendingRef.current) return;

    sendingRef.current = true;
    addMessage({ role: "user", content: text });

    try {
      const writer = await room.localParticipant.streamText({
        topic: CHAT_TOPIC,
      });
      await writer.write(text);
      await writer.close();
    } finally {
      sendingRef.current = false;
    }
  }, [addMessage]);

  const toggleMicrophone = useCallback(async () => {
    const room = roomRef.current;
    if (!room) return;

    const enabled = room.localParticipant.isMicrophoneEnabled;
    await room.localParticipant.setMicrophoneEnabled(!enabled);
    return !enabled;
  }, []);

  return {
    room: roomRef.current,
    connectionState,
    connect,
    disconnect,
    sendText,
    toggleMicrophone,
  };
}
