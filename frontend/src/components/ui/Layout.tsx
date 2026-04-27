import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  BarChart3,
  BookOpen,
  ClipboardCheck,
  CreditCard,
  Home,
  ListChecks,
  LogOut,
  ShieldCheck,
  Target,
  Users,
} from "lucide-react";
import type { ReactNode } from "react";
import { logoutRequest } from "../../lib/api";
import { useAuthStore } from "../../stores/authStore";

interface LayoutProps {
  children: ReactNode;
}

const learnerItems = [
  { path: "/", label: "Học tập", icon: Home, matches: ["/"] },
  { path: "/practice", label: "Luyện nói", icon: BookOpen, matches: ["/practice"] },
  { path: "/review", label: "Ôn lỗi", icon: Target, matches: ["/review"] },
  {
    path: "/quizzes",
    label: "Bài quiz",
    icon: ListChecks,
    matches: ["/quizzes", "/quiz-results"],
  },
  { path: "/billing", label: "Gói học", icon: CreditCard, matches: ["/billing"] },
  { path: "/dashboard", label: "Tiến độ", icon: BarChart3, matches: ["/dashboard"] },
];

const adminItems = [
  { path: "/admin", label: "Tổng quan", icon: ShieldCheck, matches: ["/admin"] },
  { path: "/admin/quizzes", label: "Kho quiz", icon: ListChecks, matches: ["/admin/quizzes"] },
  { path: "/admin/payments", label: "Thanh toán", icon: CreditCard, matches: ["/admin/payments"] },
  { path: "/admin/users", label: "Người dùng", icon: Users, matches: ["/admin/users"] },
];

export default function Layout({ children }: LayoutProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const isAdmin = user?.role === "admin";
  const navItems = isAdmin ? adminItems : learnerItems;
  const homePath = isAdmin ? "/admin" : "/";
  const productName = isAdmin ? "Quản trị hệ thống" : "Gia sư AI tiếng Anh";
  const productCaption = isAdmin ? "Người dùng và phân quyền" : "Luyện nói, ôn lỗi, quiz";

  const handleLogout = async () => {
    await logoutRequest().catch(() => undefined);
    navigate("/login");
  };

  const isActive = (matches: string[]) => {
    return matches.some((item) =>
      item === "/" || item === "/admin" ? location.pathname === item : location.pathname.startsWith(item)
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
            <p className="text-sm font-bold text-gray-900">{productName}</p>
            <p className="text-xs text-gray-500">{productCaption}</p>
          </div>
        </div>

        <nav className="flex-1 space-y-1 px-3 py-4">{nav}</nav>

        {user && (
          <div className="border-t border-gray-200 p-4">
            <div className="mb-3">
              <p className="truncate text-sm font-semibold text-gray-900">{user.name}</p>
              <p className="text-xs text-gray-500">
                {isAdmin ? "Quản trị viên" : user.cefr_level}
              </p>
            </div>
            <button
              type="button"
              onClick={handleLogout}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-gray-600 transition hover:bg-red-50 hover:text-red-600"
            >
              <LogOut className="h-4 w-4" />
              Đăng xuất
            </button>
          </div>
        )}
      </aside>

      <div className="min-w-0">
        <header className="sticky top-0 z-40 border-b border-gray-200 bg-white lg:hidden">
          <div className="flex h-14 items-center justify-between px-4">
            <Link to={homePath} className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-white">
                <ClipboardCheck className="h-4 w-4" />
              </div>
              <span className="text-sm font-bold text-gray-900">{productName}</span>
            </Link>
            <button
              type="button"
              onClick={handleLogout}
              className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-red-600"
              aria-label="Đăng xuất"
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
