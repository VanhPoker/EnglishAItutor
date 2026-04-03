import { useEffect, useRef, useState } from "react";
import type { Room } from "livekit-client";

export interface TranscriptEntry {
  id: string;
  speaker: "user" | "agent";
  text: string;
  isFinal: boolean;
  timestamp: number;
}

export function useTranscript(room: Room | null) {
  const [entries, setEntries] = useState<TranscriptEntry[]>([]);
  const [liveUserText, setLiveUserText] = useState("");
  const [liveAgentText, setLiveAgentText] = useState("");

  useEffect(() => {
    if (!room) return;

    const handleTranscription = (
      segments: any[],
      participant: any
    ) => {
      for (const segment of segments) {
        const isLocal = participant?.identity === room.localParticipant.identity;
        const speaker = isLocal ? "user" : "agent";

        if (segment.final) {
          setEntries((prev) => [
            ...prev,
            {
              id: segment.id || crypto.randomUUID(),
              speaker,
              text: segment.text,
              isFinal: true,
              timestamp: Date.now(),
            },
          ]);
          if (isLocal) setLiveUserText("");
          else setLiveAgentText("");
        } else {
          if (isLocal) setLiveUserText(segment.text);
          else setLiveAgentText(segment.text);
        }
      }
    };

    room.on("transcriptionReceived" as any, handleTranscription);
    return () => {
      room.off("transcriptionReceived" as any, handleTranscription);
    };
  }, [room]);

  const clearTranscript = () => {
    setEntries([]);
    setLiveUserText("");
    setLiveAgentText("");
  };

  return { entries, liveUserText, liveAgentText, clearTranscript };
}
