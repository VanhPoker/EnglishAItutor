import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  BarChart3,
  BookOpen,
  ClipboardCheck,
  Home,
  ListChecks,
  LogOut,
  Target,
  Users,
} from "lucide-react";
import type { ReactNode } from "react";
import { logoutRequest } from "../../lib/api";
import { useAuthStore } from "../../stores/authStore";

interface LayoutProps {
  children: ReactNode;
}

const baseItems = [
  { path: "/", label: "Workspace", icon: Home, matches: ["/"] },
  { path: "/practice", label: "Practice", icon: BookOpen, matches: ["/practice"] },
  { path: "/review", label: "Review", icon: Target, matches: ["/review"] },
  {
    path: "/quizzes",
    label: "Quizzes",
    icon: ListChecks,
    matches: ["/quizzes", "/quiz-results"],
  },
  { path: "/dashboard", label: "Progress", icon: BarChart3, matches: ["/dashboard"] },
];

export default function Layout({ children }: LayoutProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const navItems = [
    ...baseItems,
    ...(user?.role === "admin"
      ? [{ path: "/admin/users", label: "Users", icon: Users, matches: ["/admin/users"] }]
      : []),
  ];

  const handleLogout = async () => {
    await logoutRequest().catch(() => undefined);
    navigate("/login");
  };

  const isActive = (matches: string[]) => {
    return matches.some((item) =>
      item === "/" ? location.pathname === "/" : location.pathname.startsWith(item)
    );
  };

  const nav = (
    <>
      {navItems.map(({ path, label, icon: Icon, matches }) => {
        const active = isActive(matches);
        return (
          <Link
            key={path}
            to={path}
            className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
              active
                ? "bg-blue-50 text-blue-700 ring-1 ring-inset ring-blue-100"
                : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
            }`}
          >
            <Icon className="h-4 w-4 shrink-0" />
            <span>{label}</span>
          </Link>
        );
      })}
    </>
  );

  return (
    <div className="min-h-screen bg-gray-50 lg:grid lg:grid-cols-[260px_1fr]">
      <aside className="sticky top-0 hidden h-screen flex-col border-r border-gray-200 bg-white lg:flex">
        <div className="flex h-16 items-center gap-3 border-b border-gray-200 px-5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600 text-white">
            <ClipboardCheck className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-bold text-gray-900">English AI Tutor</p>
            <p className="text-xs text-gray-500">Practice, review, quiz</p>
          </div>
        </div>

        <nav className="flex-1 space-y-1 px-3 py-4">{nav}</nav>

        {user && (
          <div className="border-t border-gray-200 p-4">
            <div className="mb-3">
              <p className="truncate text-sm font-semibold text-gray-900">{user.name}</p>
              <p className="text-xs text-gray-500">
                {user.cefr_level}
                {user.role === "admin" ? " · admin" : ""}
              </p>
            </div>
            <button
              type="button"
              onClick={handleLogout}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-gray-600 transition hover:bg-red-50 hover:text-red-600"
            >
              <LogOut className="h-4 w-4" />
              Log out
            </button>
          </div>
        )}
      </aside>

      <div className="min-w-0">
        <header className="sticky top-0 z-40 border-b border-gray-200 bg-white lg:hidden">
          <div className="flex h-14 items-center justify-between px-4">
            <Link to="/" className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-white">
                <ClipboardCheck className="h-4 w-4" />
              </div>
              <span className="text-sm font-bold text-gray-900">English AI Tutor</span>
            </Link>
            <button
              type="button"
              onClick={handleLogout}
              className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-red-600"
              aria-label="Log out"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
          <nav className="flex gap-2 overflow-x-auto px-3 pb-3">{nav}</nav>
        </header>

        <main className="min-w-0">{children}</main>
      </div>
    </div>
  );
}
