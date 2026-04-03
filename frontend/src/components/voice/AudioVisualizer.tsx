import { motion } from "framer-motion";

interface AudioVisualizerProps {
  isActive: boolean;
}

export default function AudioVisualizer({ isActive }: AudioVisualizerProps) {
  if (!isActive) return null;

  return (
    <div className="flex items-center justify-center gap-1 py-3 bg-gradient-to-r from-primary-50/50 to-accent-50/50">
      {Array.from({ length: 12 }).map((_, i) => (
        <motion.div
          key={i}
          className="w-1 rounded-full bg-primary-400"
          animate={{
            height: isActive ? [4, 12 + Math.random() * 20, 4] : 4,
          }}
          transition={{
            duration: 0.4 + Math.random() * 0.4,
            repeat: Infinity,
            repeatType: "reverse",
            delay: i * 0.05,
            ease: "easeInOut",
          }}
          style={{ minHeight: 4 }}
        />
      ))}
      <span className="ml-3 text-xs text-primary-500 font-medium">Listening...</span>
    </div>
  );
}
