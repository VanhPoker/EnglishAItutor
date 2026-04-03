import { motion } from "framer-motion";
import { Lightbulb } from "lucide-react";

interface VocabItem {
  word: string;
  definition: string;
  example?: string;
}

interface VocabHighlightProps {
  items: VocabItem[];
}

export default function VocabHighlight({ items }: VocabHighlightProps) {
  if (items.length === 0) return null;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5 text-xs font-medium text-amber-600">
        <Lightbulb className="w-3.5 h-3.5" />
        <span>New Vocabulary</span>
      </div>
      {items.map((item, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.1 }}
          className="bg-amber-50 border border-amber-100 rounded-lg p-3"
        >
          <p className="text-sm font-semibold text-amber-800">{item.word}</p>
          <p className="text-xs text-gray-600 mt-0.5">{item.definition}</p>
          {item.example && (
            <p className="text-xs text-gray-400 mt-1 italic">"{item.example}"</p>
          )}
        </motion.div>
      ))}
    </div>
  );
}
