import { Link, useLocation, useNavigate } from "react-router-dom";
import { BookOpen, Home, BarChart3, LogOut } from "lucide-react";
import type { ReactNode } from "react";
import { logoutRequest } from "../../lib/api";
import { useAuthStore } from "../../stores/authStore";

interface LayoutProps {
  children: ReactNode;
}

const navItems = [
  { path: "/", label: "Home", icon: Home },
  { path: "/practice", label: "Practice", icon: BookOpen },
  { path: "/dashboard", label: "Dashboard", icon: BarChart3 },
];

export default function Layout({ children }: LayoutProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuthStore();

  const handleLogout = async () => {
    await logoutRequest().catch(() => undefined);
    navigate("/login");
  };

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-lg border-b border-gray-200/50 sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <div className="w-8 h-8 bg-primary-600 rounded-lg flex items-center justify-center">
              <BookOpen className="w-5 h-5 text-white" />
            </div>
            <span className="font-bold text-lg text-gray-900">English AI Tutor</span>
          </Link>

          <nav className="flex items-center gap-1">
            {navItems.map(({ path, label, icon: Icon }) => (
              <Link
                key={path}
                to={path}
                className={`
                  flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all
                  ${
                    location.pathname === path
                      ? "bg-primary-50 text-primary-700"
                      : "text-gray-600 hover:bg-gray-100"
                  }
                `}
              >
                <Icon className="w-4 h-4" />
                {label}
              </Link>
            ))}

            {user && (
              <div className="flex items-center gap-3 ml-4 pl-4 border-l border-gray-200">
                <span className="text-sm text-gray-600">
                  {user.name}
                  {user.role === "admin" ? " · admin" : ""}
                </span>
                <button
                  onClick={handleLogout}
                  className="p-2 text-gray-400 hover:text-red-500 rounded-lg hover:bg-red-50 transition"
                  title="Logout"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            )}
          </nav>
        </div>
      </header>

      {/* Main */}
      <main className="flex-1">{children}</main>
    </div>
  );
}
