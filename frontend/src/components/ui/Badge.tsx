interface BadgeProps {
  children: React.ReactNode;
  variant?: "default" | "success" | "warning" | "error" | "info";
  size?: "sm" | "md";
}

const colors = {
  default: "bg-gray-100 text-gray-700 ring-gray-200",
  success: "bg-green-50 text-green-700 ring-green-200",
  warning: "bg-amber-50 text-amber-700 ring-amber-200",
  error: "bg-red-50 text-red-700 ring-red-200",
  info: "bg-blue-50 text-blue-700 ring-blue-200",
};

export default function Badge({ children, variant = "default", size = "sm" }: BadgeProps) {
  return (
    <span
      className={`
        inline-flex items-center rounded-md font-medium ring-1 ring-inset
        ${colors[variant]}
        ${size === "sm" ? "px-2.5 py-0.5 text-xs" : "px-3 py-1 text-sm"}
      `}
    >
      {children}
    </span>
  );
}
