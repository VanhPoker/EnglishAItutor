import { useRef, useState, type KeyboardEvent } from "react";
import { Send } from "lucide-react";

interface InputBarProps {
  onSend: (text: string) => Promise<void> | void;
  disabled?: boolean;
  placeholder?: string;
}

export default function InputBar({
  onSend,
  disabled = false,
  placeholder = "Type your message in English...",
}: InputBarProps) {
  const [text, setText] = useState("");
  const [isSending, setIsSending] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const textRef = useRef("");
  const isSendingRef = useRef(false);
  const isComposingRef = useRef(false);

  const setInputText = (value: string) => {
    textRef.current = value;
    setText(value);
  };

  const resetInput = () => {
    setInputText("");
    if (inputRef.current) {
      inputRef.current.value = "";
      inputRef.current.style.height = "44px";
    }
  };

  const handleSend = async () => {
    if (isSendingRef.current) return;

    const trimmed = textRef.current.trim();
    if (!trimmed || disabled) return;

    isSendingRef.current = true;
    setIsSending(true);
    resetInput();

    try {
      await onSend(trimmed);
    } finally {
      isSendingRef.current = false;
      setIsSending(false);
      inputRef.current?.focus();
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    const nativeEvent = e.nativeEvent as KeyboardEvent["nativeEvent"] & {
      isComposing?: boolean;
    };

    if (nativeEvent.isComposing || isComposingRef.current || e.key === "Process") {
      return;
    }

    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  };

  const handleInput = (target: HTMLTextAreaElement) => {
    textRef.current = target.value;
    target.style.height = "auto";
    target.style.height = `${Math.min(target.scrollHeight, 128)}px`;
  };

  const isDisabled = disabled || isSending;

  return (
    <div className="border-t border-gray-200/50 bg-white/50 backdrop-blur-sm p-3">
      <div className="flex items-end gap-2 max-w-3xl mx-auto">
        <textarea
          ref={inputRef}
          value={text}
          onChange={(e) => setInputText(e.target.value)}
          onInput={(e) => handleInput(e.target as HTMLTextAreaElement)}
          onCompositionStart={() => {
            isComposingRef.current = true;
          }}
          onCompositionEnd={(e) => {
            isComposingRef.current = false;
            setInputText(e.currentTarget.value);
          }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={isDisabled}
          rows={1}
          className="
            flex-1 resize-none rounded-xl border border-gray-200 px-4 py-3
            text-sm placeholder:text-gray-400
            focus:outline-none focus:ring-2 focus:ring-primary-500/30 focus:border-primary-400
            disabled:opacity-50 disabled:bg-gray-50
            max-h-32
          "
          style={{ minHeight: "44px" }}
        />
        <button
          onClick={() => void handleSend()}
          disabled={isDisabled || !text.trim()}
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
