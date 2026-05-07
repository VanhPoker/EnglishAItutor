import { motion } from "framer-motion";
import { ArrowLeft, Settings } from "lucide-react";
import { Link } from "react-router-dom";
import ChatRoom from "../components/chat/ChatRoom";
import { useUserStore } from "../stores/userStore";
import Badge from "../components/ui/Badge";
import { topicLabel } from "../lib/labels";

export default function Practice() {
  const { level, topic } = useUserStore();

  return (
    <div className="study-grid flex h-screen flex-col bg-[linear-gradient(135deg,#f6fbf9_0%,#fff7ed_48%,#ecfeff_100%)]">
      {/* Compact header */}
      <header className="border-b border-white/80 bg-white/85 px-4 py-2.5 shadow-sm backdrop-blur-xl">
        <div className="mx-auto flex max-w-4xl items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              to="/"
              className="rounded-lg p-1.5 transition-colors hover:bg-primary-50"
            >
              <ArrowLeft className="w-4 h-4 text-gray-500" />
            </Link>
            <div>
              <h1 className="text-sm font-semibold text-gray-900">Gia sư AI trực tuyến</h1>
              <div className="flex items-center gap-2 mt-0.5">
                <Badge variant="info" size="sm">{level}</Badge>
                <Badge size="sm">{topicLabel(topic)}</Badge>
              </div>
            </div>
          </div>
          <Link
            to="/"
            className="p-2 hover:bg-primary-50 rounded-lg transition-colors"
            title="Đổi thiết lập"
          >
            <Settings className="w-4 h-4 text-gray-400" />
          </Link>
        </div>
      </header>

      {/* Chat area fills remaining height */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="flex-1 flex flex-col max-w-4xl w-full mx-auto overflow-hidden"
      >
        <ChatRoom />
      </motion.div>
    </div>
  );
}
