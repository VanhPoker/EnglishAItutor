import { AlertTriangle, ArrowRight, BookOpenCheck, CreditCard, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
import type { ChatWidget } from "../../stores/chatStore";
import { focusLabel } from "../../lib/labels";

interface ChatWidgetCardProps {
  widget: ChatWidget;
}

const widgetStyles = {
  paywall: {
    icon: CreditCard,
    eyebrow: "Gói học",
    shell: "border-blue-200 bg-blue-50/90",
    iconBox: "bg-blue-600 text-white",
    badge: "border-blue-200 bg-white text-blue-700",
  },
  session_recap: {
    icon: Sparkles,
    eyebrow: "Tổng kết phiên",
    shell: "border-sky-200 bg-sky-50/90",
    iconBox: "bg-sky-600 text-white",
    badge: "border-sky-200 bg-white text-sky-700",
  },
  mistake_notebook: {
    icon: BookOpenCheck,
    eyebrow: "Sổ lỗi cá nhân",
    shell: "border-amber-200 bg-amber-50/90",
    iconBox: "bg-amber-500 text-white",
    badge: "border-amber-200 bg-white text-amber-700",
  },
};

function metricToneClass(tone?: string) {
  if (tone === "good") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (tone === "warning") return "border-amber-200 bg-amber-50 text-amber-800";
  return "border-gray-200 bg-white text-gray-700";
}

export default function ChatWidgetCard({ widget }: ChatWidgetCardProps) {
  const style = widgetStyles[widget.type] ?? widgetStyles.session_recap;
  const Icon = style.icon;

  return (
    <div className={`w-full max-w-[580px] rounded-lg border p-4 text-gray-900 ${style.shell}`}>
      <div className="flex items-start gap-3">
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${style.iconBox}`}>
          {widget.locked ? <AlertTriangle className="h-5 w-5" /> : <Icon className="h-5 w-5" />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-600">
              {style.eyebrow}
            </p>
            {widget.badge && (
              <span className={`rounded-lg border px-2 py-0.5 text-[11px] font-medium ${style.badge}`}>
                {widget.badge}
              </span>
            )}
          </div>
          <h4 className="mt-1 text-sm font-semibold text-gray-950">{widget.title}</h4>
          {widget.description && (
            <p className="mt-1 text-xs leading-5 text-gray-600">{widget.description}</p>
          )}
        </div>
      </div>

      {widget.metrics?.length ? (
        <div className="mt-4 grid gap-2 sm:grid-cols-3">
          {widget.metrics.map((metric) => (
            <div key={`${metric.label}-${metric.value}`} className={`rounded-lg border px-3 py-2 ${metricToneClass(metric.tone)}`}>
              <p className="text-[11px] text-gray-500">{metric.label}</p>
              <p className="mt-0.5 text-sm font-semibold">{metric.value}</p>
            </div>
          ))}
        </div>
      ) : null}

      {widget.highlights?.length ? (
        <ul className="mt-4 space-y-2 text-xs leading-5 text-gray-700">
          {widget.highlights.map((item) => (
            <li key={item} className="flex gap-2">
              <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-gray-500" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      ) : null}

      {widget.mistakes?.length ? (
        <div className="mt-4 space-y-2">
          {widget.mistakes.map((mistake, index) => (
            <div key={`${mistake.error_type}-${mistake.original}-${index}`} className="rounded-lg border border-white/70 bg-white px-3 py-2 text-xs leading-5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold text-gray-900">{focusLabel(mistake.error_type)}</span>
                {mistake.count ? <span className="text-gray-400">{mistake.count} lần</span> : null}
              </div>
              <p className="mt-1">
                <span className="text-red-500 line-through">{mistake.original}</span>
                <span className="mx-2 text-gray-400">→</span>
                <span className="font-semibold text-emerald-700">{mistake.correction}</span>
              </p>
              {mistake.explanation && <p className="mt-1 text-gray-500">{mistake.explanation}</p>}
            </div>
          ))}
        </div>
      ) : null}

      {widget.actions?.length ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {widget.actions.map((action) => {
            const className =
              action.variant === "secondary"
                ? "inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                : "inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700";

            if (!action.to) {
              return (
                <button key={action.label} type="button" className={className}>
                  {action.label}
                </button>
              );
            }

            return (
              <Link key={action.label} to={action.to} className={className}>
                {action.label}
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
