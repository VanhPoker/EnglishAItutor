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
  const [connectionState, setConnectionState] = useState<ConnectionState>(
    ConnectionState.Disconnected
  );

  const { addMessage, updateLastAssistantMessage, setConnected, setAgentSpeaking, setUserSpeaking } =
    useChatStore();

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

      // Text stream from agent
      room.registerTextStreamHandler(CHAT_TOPIC, async (reader, participantIdentity) => {
        const streamIdentity =
          typeof participantIdentity === "string"
            ? participantIdentity
            : participantIdentity.identity;

        if (streamIdentity === room.localParticipant.identity) {
          await reader.readAll().catch(() => "");
          return;
        }

        // This is a streaming response — accumulate chunks
        let fullText = "";
        const textStream = reader as any;

        if (typeof textStream.readAll === "function") {
          fullText = await textStream.readAll();
          addMessage({ role: "assistant", content: fullText });
        } else if (typeof textStream[Symbol.asyncIterator] === "function") {
          for await (const chunk of textStream) {
            fullText += chunk;
            updateLastAssistantMessage(chunk);
          }
        } else {
          fullText = String(textStream);
          addMessage({ role: "assistant", content: fullText });
        }
      });

      await room.connect(getLiveKitUrl(), token);
      return room;
    },
    [addMessage, updateLastAssistantMessage, setConnected]
  );

  const disconnect = useCallback(() => {
    if (roomRef.current) {
      roomRef.current.disconnect();
      roomRef.current = null;
      setConnected(false);
    }
  }, [setConnected]);

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
