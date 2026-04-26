import { motion } from "framer-motion";
import { AlertCircle, CheckCircle2, ArrowRight } from "lucide-react";
import Badge from "../ui/Badge";
import { focusLabel } from "../../lib/labels";

interface CorrectionCardProps {
  errorType: string;
  original: string;
  correction: string;
  explanation?: string;
}

const typeColors: Record<string, "error" | "warning" | "info"> = {
  grammar: "error",
  vocabulary: "warning",
  word_choice: "info",
  pronunciation: "warning",
};

export default function CorrectionCard({
  errorType,
  original,
  correction,
  explanation,
}: CorrectionCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 space-y-2"
    >
      <div className="flex items-center gap-2">
        <AlertCircle className="w-4 h-4 text-amber-500" />
        <Badge variant={typeColors[errorType] || "warning"}>
          {focusLabel(errorType)}
        </Badge>
      </div>

      <div className="flex items-center gap-2 text-sm">
        <span className="line-through text-red-400 bg-red-50 px-2 py-0.5 rounded">
          {original}
        </span>
        <ArrowRight className="w-3 h-3 text-gray-400" />
        <span className="text-green-600 font-medium bg-green-50 px-2 py-0.5 rounded flex items-center gap-1">
          <CheckCircle2 className="w-3 h-3" />
          {correction}
        </span>
      </div>

      {explanation && (
        <p className="text-xs text-gray-500 leading-relaxed">{explanation}</p>
      )}
    </motion.div>
  );
}
