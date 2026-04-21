import { useCallback, useEffect, useState } from "react";
import { ConnectionState } from "livekit-client";
import { Wifi, WifiOff, Loader2 } from "lucide-react";
import { useLiveKit } from "../../hooks/useLiveKit";
import { useUserStore } from "../../stores/userStore";
import { useChatStore } from "../../stores/chatStore";
import MessageList from "./MessageList";
import InputBar from "./InputBar";
import VoiceControls from "../voice/VoiceControls";
import AudioVisualizer from "../voice/AudioVisualizer";

export default function ChatRoom() {
  const { room, connectionState, connect, disconnect, sendText, toggleMicrophone } = useLiveKit();
  const { topic, level } = useUserStore();
  const isConnected = useChatStore((s) => s.isConnected);
  const [micEnabled, setMicEnabled] = useState(false);
  const [connecting, setConnecting] = useState(false);

  const handleConnect = useCallback(async () => {
    setConnecting(true);
    try {
      await connect({ topic, level });
    } catch (err) {
      console.error("Failed to connect:", err);
    } finally {
      setConnecting(false);
    }
  }, [connect, topic, level]);

  const handleDisconnect = useCallback(() => {
    disconnect();
    setMicEnabled(false);
  }, [disconnect]);

  const handleToggleMic = useCallback(async () => {
    const enabled = await toggleMicrophone();
    if (enabled !== undefined) setMicEnabled(enabled);
  }, [toggleMicrophone]);

  // Not connected — show connect screen
  if (!isConnected) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="w-16 h-16 mx-auto bg-primary-100 rounded-full flex items-center justify-center">
            <WifiOff className="w-8 h-8 text-primary-400" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-800">Ready to practice?</h3>
            <p className="text-sm text-gray-500 mt-1">
              Connect to start your English conversation session
            </p>
          </div>
          <button
            onClick={handleConnect}
            disabled={connecting}
            className="btn-primary inline-flex items-center gap-2"
          >
            {connecting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Connecting...
              </>
            ) : (
              <>
                <Wifi className="w-4 h-4" />
                Start Session
              </>
            )}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-200/50 bg-white/60">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
          <span className="text-xs text-gray-500">Connected</span>
          <span className="text-xs text-gray-400">|</span>
          <span className="text-xs text-gray-500 capitalize">{topic.replace(/_/g, " ")}</span>
          <span className="text-xs text-gray-400">|</span>
          <span className="text-xs font-medium text-primary-600">{level}</span>
        </div>
        <button onClick={handleDisconnect} className="text-xs text-red-500 hover:text-red-600">
          Disconnect
        </button>
      </div>

      {/* Audio visualizer */}
      <AudioVisualizer isActive={micEnabled} />

      {/* Messages */}
      <MessageList />

      {/* Voice + Text controls */}
      <div className="border-t border-gray-200/30">
        <VoiceControls
          micEnabled={micEnabled}
          onToggleMic={handleToggleMic}
          isConnected={isConnected}
        />
        <InputBar onSend={sendText} disabled={!isConnected} />
      </div>
    </div>
  );
}
