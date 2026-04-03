import { useState, useRef, type KeyboardEvent } from "react";
import { Send } from "lucide-react";

interface InputBarProps {
  onSend: (text: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

export default function InputBar({
  onSend,
  disabled = false,
  placeholder = "Type your message in English...",
}: InputBarProps) {
  const [text, setText] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const handleSend = () => {
    const trimmed = text.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setText("");
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="border-t border-gray-200/50 bg-white/50 backdrop-blur-sm p-3">
      <div className="flex items-end gap-2 max-w-3xl mx-auto">
        <textarea
          ref={inputRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          rows={1}
          className="
            flex-1 resize-none rounded-xl border border-gray-200 px-4 py-3
            text-sm placeholder:text-gray-400
            focus:outline-none focus:ring-2 focus:ring-primary-500/30 focus:border-primary-400
            disabled:opacity-50 disabled:bg-gray-50
            max-h-32
          "
          style={{ minHeight: "44px" }}
          onInput={(e) => {
            const target = e.target as HTMLTextAreaElement;
            target.style.height = "auto";
            target.style.height = `${Math.min(target.scrollHeight, 128)}px`;
          }}
        />
        <button
          onClick={handleSend}
          disabled={disabled || !text.trim()}
          className="
            p-3 rounded-xl bg-primary-600 text-white
            hover:bg-primary-700 active:bg-primary-800
            disabled:opacity-30 disabled:cursor-not-allowed
            transition-all duration-150
          "
        >
          <Send className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
