interface BrandMarkProps {
  title?: string;
  caption?: string;
  size?: "sm" | "md" | "lg";
  inverted?: boolean;
}

const sizeClass = {
  sm: "h-8 w-8",
  md: "h-9 w-9",
  lg: "h-12 w-12",
};

export default function BrandMark({
  title = "Gia sư AI tiếng Anh",
  caption,
  size = "md",
  inverted = false,
}: BrandMarkProps) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <img
        src="/brand-mark.svg"
        alt="English AI Tutor"
        className={`${sizeClass[size]} shrink-0 rounded-lg shadow-sm`}
      />
      <div className="min-w-0">
        <p className={`truncate text-sm font-bold ${inverted ? "text-white" : "text-gray-900"}`}>{title}</p>
        {caption && (
          <p className={`truncate text-xs ${inverted ? "text-white/75" : "text-gray-500"}`}>{caption}</p>
        )}
      </div>
    </div>
  );
}
