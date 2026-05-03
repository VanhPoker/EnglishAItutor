import { useCallback, useEffect, useState } from "react";
import { ConnectionState } from "livekit-client";
import { Loader2, LockKeyhole, Mic2, Sparkles, WifiOff } from "lucide-react";
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
  const agentReady = useChatStore((s) => s.agentReady);
  const messages = useChatStore((s) => s.messages);
  const interactionLocked = useChatStore((s) => s.interactionLocked);
  const addChatWidget = useChatStore((s) => s.addChatWidget);
  const setInteractionLocked = useChatStore((s) => s.setInteractionLocked);
  const [micEnabled, setMicEnabled] = useState(false);
  const [connecting, setConnecting] = useState(false);

  const handleConnect = useCallback(async () => {
    setConnecting(true);
    setInteractionLocked(false);
    try {
      await connect({ topic, level });
    } catch (err) {
      console.error("Không kết nối được:", err);
      const message = err instanceof Error ? err.message : "Không bắt đầu được phiên học.";
      if (isQuotaErrorMessage(message)) {
        setInteractionLocked(true, message);
        addChatWidget({
          id: `chat-quota-${Date.now()}`,
          type: "paywall",
          title: "Bạn đã hết lượt chat hôm nay",
          description:
            "Gia sư AI đang tạm khóa chat và micro cho tới khi bạn nâng cấp gói hoặc quay lại vào ngày mai.",
          badge: "Đã khóa phiên",
          locked: true,
          highlights: [
            message,
            "Gói Plus mở 25 lượt chat với gia sư AI mỗi ngày.",
            "Gói Ultra mở không giới hạn chat và quiz.",
          ],
          actions: [
            { label: "Xem gói học", to: "/billing?reason=chat-quota", variant: "primary" },
            { label: "Về trang học tập", to: "/", variant: "secondary" },
          ],
        });
      } else {
        addChatWidget({
          id: `connect-error-${Date.now()}`,
          type: "session_recap",
          title: "Chưa bắt đầu được phiên học",
          description: message,
          badge: "Lỗi kết nối",
        });
      }
    } finally {
      setConnecting(false);
    }
  }, [addChatWidget, connect, level, setInteractionLocked, topic]);

  const handleDisconnect = useCallback(() => {
    disconnect();
    setMicEnabled(false);
    navigate("/review");
  }, [disconnect, navigate]);

  const handleToggleMic = useCallback(async () => {
    if (interactionLocked || !agentReady) return;
    const enabled = await toggleMicrophone();
    if (enabled !== undefined) setMicEnabled(enabled);
  }, [agentReady, interactionLocked, toggleMicrophone]);

  useEffect(() => {
    if (!isConnected) setMicEnabled(false);
  }, [isConnected]);

  const lockedInputPlaceholder = interactionLocked
    ? "Bạn đã hết lượt chat hôm nay. Hãy nâng cấp gói hoặc quay lại vào ngày mai."
    : isConnected && !agentReady
    ? "Gia sư đang khởi động, chờ lời chào xong rồi hãy nhắn..."
    : "Nhập câu tiếng Anh của bạn...";

  // Not connected — show connect screen
  if (!isConnected) {
    if (interactionLocked || messages.length > 0) {
      return (
        <div className="flex h-full flex-1 flex-col">
          <div className="flex items-center justify-between border-b border-gray-200/50 bg-white/60 px-4 py-2">
            <div className="flex items-center gap-2">
              <LockKeyhole className="h-3.5 w-3.5 text-gray-400" />
              <span className="text-xs text-gray-500">
                {interactionLocked ? "Chat và micro đang bị khóa" : "Chưa kết nối"}
              </span>
            </div>
            {!interactionLocked && (
              <button
                onClick={handleConnect}
                disabled={connecting}
                className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-50"
              >
                {connecting ? "Đang kết nối..." : "Bắt đầu lại"}
              </button>
            )}
          </div>
          <MessageList />
          <div className="border-t border-gray-200/30">
            <VoiceControls
              micEnabled={false}
              onToggleMic={handleToggleMic}
              isConnected={false}
            />
            <InputBar
              onSend={sendText}
              disabled
              placeholder={lockedInputPlaceholder}
            />
          </div>
        </div>
      );
    }

    return (
      <div className="relative flex-1 flex items-center justify-center overflow-hidden px-4">
        <div className="absolute inset-x-8 top-10 h-px bg-primary-200 signal-line opacity-80" />
        <div className="w-full max-w-xl animate-soft-rise rounded-lg border border-white bg-white/86 p-8 text-center shadow-[0_24px_70px_rgba(15,23,42,0.14)] backdrop-blur-xl">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-lg bg-primary-50 text-primary-800 ring-1 ring-primary-100">
            <WifiOff className="w-8 h-8" />
          </div>
          <div>
            <p className="mt-5 inline-flex items-center gap-2 rounded-lg bg-accent-50 px-3 py-1.5 text-xs font-semibold text-accent-700">
              <Sparkles className="h-3.5 w-3.5" />
              Voice + Chat + Quiz widget
            </p>
            <h3 className="mt-4 text-2xl font-bold text-gray-900">Bắt đầu phiên với Gia sư AI</h3>
            <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-gray-500">
              Nói tiếng Anh, nhắn câu hỏi, hoặc yêu cầu bài nghe/bài nói ngay trong khung chat.
            </p>
          </div>
          <div className="my-6 grid gap-2 text-left sm:grid-cols-3">
            {[
              ["01", "Nói tự nhiên"],
              ["02", "Luyện nghe"],
              ["03", "Làm quiz"],
            ].map(([step, label]) => (
              <div key={step} className="rounded-lg border border-gray-200 bg-white p-3">
                <p className="text-xs font-bold text-primary-800">{step}</p>
                <p className="mt-1 text-sm font-semibold text-gray-800">{label}</p>
              </div>
            ))}
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
                <Mic2 className="w-4 h-4" />
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
      <div className="flex items-center justify-between px-4 py-2 border-b border-white/80 bg-white/75 backdrop-blur">
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
          isConnected={isConnected && agentReady && !interactionLocked}
        />
        <InputBar
          onSend={sendText}
          disabled={!isConnected || !agentReady || interactionLocked}
          placeholder={lockedInputPlaceholder}
        />
      </div>
    </div>
  );
}
