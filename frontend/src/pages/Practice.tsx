import { motion } from "framer-motion";
import { ArrowLeft, Settings } from "lucide-react";
import { Link } from "react-router-dom";
import ChatRoom from "../components/chat/ChatRoom";
import { useUserStore } from "../stores/userStore";
import Badge from "../components/ui/Badge";

export default function Practice() {
  const { level, topic } = useUserStore();

  return (
    <div className="h-screen flex flex-col bg-gradient-to-br from-blue-50 via-white to-indigo-50">
      {/* Compact header */}
      <header className="bg-white/80 backdrop-blur-lg border-b border-gray-200/50 px-4 py-2.5">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              to="/"
              className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <ArrowLeft className="w-4 h-4 text-gray-500" />
            </Link>
            <div>
              <h1 className="text-sm font-semibold text-gray-800">English Practice</h1>
              <div className="flex items-center gap-2 mt-0.5">
                <Badge variant="info" size="sm">{level}</Badge>
                <Badge size="sm">{topic.replace(/_/g, " ")}</Badge>
              </div>
            </div>
          </div>
          <Link
            to="/"
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            title="Change settings"
          >
            <Settings className="w-4 h-4 text-gray-400" />
          </Link>
        </div>
      </header>

      {/* Chat area — fills remaining height */}
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
