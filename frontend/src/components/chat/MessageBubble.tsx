import { motion } from "framer-motion";
import { Bot, User } from "lucide-react";
import type { ChatMessage } from "../../stores/chatStore";

interface MessageBubbleProps {
  message: ChatMessage;
}

export default function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === "user";

  return (
    <motion.div
      initial={{ opacity: 0, y: 8, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.2 }}
      className={`flex gap-3 ${isUser ? "flex-row-reverse" : "flex-row"}`}
    >
      {/* Avatar */}
      <div
        className={`
          flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center
          ${isUser ? "bg-primary-100 text-primary-600" : "bg-accent-100 text-accent-600"}
        `}
      >
        {isUser ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
      </div>

      {/* Bubble */}
      <div
        className={`
          max-w-[75%] px-4 py-3 rounded-2xl text-sm leading-relaxed
          ${
            isUser
              ? "bg-primary-600 text-white rounded-br-md"
              : "bg-white border border-gray-100 text-gray-800 rounded-bl-md shadow-sm"
          }
        `}
      >
        <p className="whitespace-pre-wrap">{message.content}</p>

        {/* Correction cards inline */}
        {message.corrections && message.corrections.length > 0 && (
          <div className="mt-2 space-y-1.5 border-t border-gray-200/50 pt-2">
            {message.corrections.map((c, i) => (
              <div key={i} className="text-xs bg-amber-50 border border-amber-200 rounded-lg p-2">
                <span className="font-medium text-amber-700">{c.errorType}:</span>{" "}
                <span className="line-through text-red-400">{c.original}</span>{" "}
                <span className="text-green-600 font-medium">{c.correction}</span>
                {c.explanation && (
                  <p className="text-gray-500 mt-0.5">{c.explanation}</p>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Timestamp */}
        <p
          className={`text-[10px] mt-1 ${
            isUser ? "text-primary-200" : "text-gray-400"
          }`}
        >
          {new Date(message.timestamp).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </p>
      </div>
    </motion.div>
  );
}
