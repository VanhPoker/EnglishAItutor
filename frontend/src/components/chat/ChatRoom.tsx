import { useCallback, useEffect, useState } from "react";
import { ConnectionState } from "livekit-client";
import { Clock, CreditCard, Loader2, Wifi, WifiOff } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useLiveKit } from "../../hooks/useLiveKit";
import { useUserStore } from "../../stores/userStore";
import { useChatStore } from "../../stores/chatStore";
import MessageList from "./MessageList";
import InputBar from "./InputBar";
import VoiceControls from "../voice/VoiceControls";
import AudioVisualizer from "../voice/AudioVisualizer";
import { topicLabel } from "../../lib/labels";

function isQuotaErrorMessage(message: string) {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("hết") ||
    normalized.includes("quota") ||
    (normalized.includes("gói") && normalized.includes("chat"))
  );
}

export default function ChatRoom() {
  const { room, connectionState, connect, disconnect, sendText, toggleMicrophone, lastError } = useLiveKit();
  const { topic, level } = useUserStore();
  const navigate = useNavigate();
  const isConnected = useChatStore((s) => s.isConnected);
  const [micEnabled, setMicEnabled] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [quotaMessage, setQuotaMessage] = useState<string | null>(null);

  const handleConnect = useCallback(async () => {
    setConnecting(true);
    setQuotaMessage(null);
    try {
      await connect({ topic, level });
    } catch (err) {
      console.error("Không kết nối được:", err);
      const message = err instanceof Error ? err.message : "Không bắt đầu được phiên học.";
      if (isQuotaErrorMessage(message)) {
        setQuotaMessage(message);
      }
    } finally {
      setConnecting(false);
    }
  }, [connect, topic, level]);

  const handleDisconnect = useCallback(() => {
    disconnect();
    setMicEnabled(false);
    navigate("/review");
  }, [disconnect, navigate]);

  const handleToggleMic = useCallback(async () => {
    const enabled = await toggleMicrophone();
    if (enabled !== undefined) setMicEnabled(enabled);
  }, [toggleMicrophone]);

  useEffect(() => {
    if (!quotaMessage) return;
    const timer = window.setTimeout(() => {
      navigate("/billing?reason=chat-quota");
    }, 3200);
    return () => window.clearTimeout(timer);
  }, [navigate, quotaMessage]);

  // Not connected — show connect screen
  if (!isConnected) {
    return (
      <div className="relative flex-1 flex items-center justify-center">
        {quotaMessage && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/80 px-4 backdrop-blur-sm">
            <div className="w-full max-w-sm rounded-lg border border-blue-100 bg-white p-5 shadow-lg">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                <CreditCard className="h-6 w-6" />
              </div>
              <h3 className="mt-4 text-lg font-semibold text-gray-900">
                Bạn đã hết lượt chat hôm nay
              </h3>
              <p className="mt-2 text-sm leading-6 text-gray-600">
                {quotaMessage} Bạn có thể nâng cấp gói học hoặc quay lại vào ngày mai để tiếp tục luyện với gia sư AI.
              </p>
              <div className="mt-3 flex items-center gap-2 rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-500">
                <Clock className="h-4 w-4" />
                Tự chuyển sang màn gói học trong vài giây.
              </div>
              <div className="mt-4 flex gap-2">
                <button
                  type="button"
                  onClick={() => navigate("/billing?reason=chat-quota")}
                  className="flex-1 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700"
                >
                  Xem gói học
                </button>
                <button
                  type="button"
                  onClick={() => setQuotaMessage(null)}
                  className="rounded-lg border border-gray-200 px-3 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-50"
                >
                  Để sau
                </button>
              </div>
            </div>
          </div>
        )}
        <div className="text-center space-y-4">
          <div className="w-16 h-16 mx-auto bg-primary-100 rounded-full flex items-center justify-center">
            <WifiOff className="w-8 h-8 text-primary-400" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-800">Sẵn sàng luyện nói chưa?</h3>
            <p className="text-sm text-gray-500 mt-1">
              Kết nối để bắt đầu phiên trò chuyện tiếng Anh
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
                Đang kết nối...
              </>
            ) : (
              <>
                <Wifi className="w-4 h-4" />
                Bắt đầu phiên học
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
          <span className="text-xs text-gray-500">Đã kết nối</span>
          <span className="text-xs text-gray-400">|</span>
          <span className="text-xs text-gray-500">{topicLabel(topic)}</span>
          <span className="text-xs text-gray-400">|</span>
          <span className="text-xs font-medium text-primary-600">{level}</span>
        </div>
        <button onClick={handleDisconnect} className="text-xs text-red-500 hover:text-red-600">
          Kết thúc
        </button>
      </div>

      {/* Audio visualizer */}
      <AudioVisualizer isActive={micEnabled} />

      {/* Messages */}
      <MessageList />

      {/* Voice + Text controls */}
      <div className="border-t border-gray-200/30">
        {lastError && (
          <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-700">
            {lastError}
          </div>
        )}
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
