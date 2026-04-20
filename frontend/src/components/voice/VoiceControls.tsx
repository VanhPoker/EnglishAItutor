import { Mic, MicOff, Volume2 } from "lucide-react";
import { motion } from "framer-motion";
import { useChatStore } from "../../stores/chatStore";

interface VoiceControlsProps {
  micEnabled: boolean;
  onToggleMic: () => void;
  isConnected: boolean;
}

export default function VoiceControls({ micEnabled, onToggleMic, isConnected }: VoiceControlsProps) {
  const isAgentSpeaking = useChatStore((s) => s.isAgentSpeaking);
  const currentTranscript = useChatStore((s) => s.currentTranscript);

  return (
    <div className="py-2 px-4">
      <div className="flex items-center justify-center gap-4">
        {/* Agent speaking indicator */}
        {isAgentSpeaking && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex items-center gap-1.5 text-xs text-accent-600"
          >
            <Volume2 className="w-3.5 h-3.5 animate-pulse" />
            <span>Tutor speaking...</span>
          </motion.div>
        )}

        {/* Mic button */}
        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={onToggleMic}
          disabled={!isConnected}
          className={`
            relative p-3 rounded-full transition-all duration-300
            disabled:opacity-30
            ${
              micEnabled
                ? "bg-red-500 text-white shadow-lg shadow-red-500/30"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }
          `}
        >
          {micEnabled ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}

          {/* Recording ring animation */}
          {micEnabled && (
            <motion.div
              className="absolute inset-0 rounded-full border-2 border-red-400"
              animate={{ scale: [1, 1.3, 1], opacity: [0.6, 0, 0.6] }}
              transition={{ duration: 1.5, repeat: Infinity }}
            />
          )}
        </motion.button>

        {/* Status label */}
        <span className={`text-xs ${micEnabled ? "text-red-500 font-medium" : "text-gray-400"}`}>
          {micEnabled ? "Tap to mute" : "Tap to speak"}
        </span>
      </div>

      {currentTranscript && (
        <p className="mx-auto mt-2 max-w-2xl truncate text-center text-xs text-gray-500">
          {currentTranscript}
        </p>
      )}
    </div>
  );
}
