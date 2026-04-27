import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowRight, ListChecks, RefreshCw, ShieldCheck, UserCheck, Users } from "lucide-react";
import Layout from "../components/ui/Layout";
import Card from "../components/ui/Card";
import Badge from "../components/ui/Badge";
import { getAdminUsers, type AdminUser } from "../lib/api";
import { roleLabel } from "../lib/labels";

interface AdminSummary {
  totalUsers: number;
  learnerCount: number;
  adminCount: number;
  recentUsers: AdminUser[];
}

function formatDate(value: string | null) {
  if (!value) return "Chưa có";
  return new Date(value).toLocaleString("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export default function AdminDashboard() {
  const [summary, setSummary] = useState<AdminSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadSummary = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [allUsers, learners, admins] = await Promise.all([
        getAdminUsers({ limit: 5 }),
        getAdminUsers({ role: "learner", limit: 1 }),
        getAdminUsers({ role: "admin", limit: 1 }),
      ]);
      setSummary({
        totalUsers: allUsers.total,
        learnerCount: learners.total,
        adminCount: admins.total,
        recentUsers: allUsers.users,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không tải được dữ liệu quản trị");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSummary();
  }, [loadSummary]);

  const stats = useMemo(
    () => [
      {
        label: "Tổng người dùng",
        value: summary?.totalUsers ?? 0,
        icon: Users,
        tone: "bg-gray-100 text-gray-700 ring-gray-200",
      },
      {
        label: "Học viên",
        value: summary?.learnerCount ?? 0,
        icon: UserCheck,
        tone: "bg-green-50 text-green-700 ring-green-200",
      },
      {
        label: "Quản trị viên",
        value: summary?.adminCount ?? 0,
        icon: ShieldCheck,
        tone: "bg-amber-50 text-amber-700 ring-amber-200",
      },
    ],
    [summary]
  );

  return (
    <Layout>
      <div className="page-shell">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-sm font-semibold text-gray-700">Không gian quản trị</p>
              <h1 className="mt-1 text-3xl font-bold text-gray-900">Tổng quan hệ thống</h1>
              <p className="mt-2 max-w-2xl text-sm text-gray-600">
                Theo dõi tài khoản, phân quyền và kiểm tra tình trạng học viên.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void loadSummary()}
              className="btn-secondary inline-flex items-center justify-center gap-2"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              Tải lại
            </button>
          </div>
        </motion.div>

        {error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="grid gap-4 md:grid-cols-3">
          {stats.map((item) => (
            <Card key={item.label}>
              <div className="flex items-center gap-3">
                <div className={`flex h-10 w-10 items-center justify-center rounded-lg ring-1 ${item.tone}`}>
                  <item.icon className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-900">{loading ? "..." : item.value}</p>
                  <p className="text-sm text-gray-500">{item.label}</p>
                </div>
              </div>
            </Card>
          ))}
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
          <div className="grid gap-4">
            <Card>
              <div className="flex h-full flex-col justify-between gap-5">
                <div>
                  <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-gray-100 text-gray-700">
                    <ListChecks className="h-5 w-5" />
                  </div>
                  <h2 className="mt-4 text-lg font-semibold text-gray-900">Quản lý kho quiz</h2>
                  <p className="mt-2 text-sm text-gray-500">
                    Tạo quiz bằng AI, import file, lấy nguồn mở và xoá các bộ đề không còn dùng.
                  </p>
                </div>
                <Link to="/admin/quizzes" className="btn-primary inline-flex items-center justify-center gap-2">
                  Mở kho quiz
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </Card>

            <Card>
              <div className="flex h-full flex-col justify-between gap-5">
                <div>
                  <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-gray-100 text-gray-700">
                    <Users className="h-5 w-5" />
                  </div>
                  <h2 className="mt-4 text-lg font-semibold text-gray-900">Quản lý người dùng</h2>
                  <p className="mt-2 text-sm text-gray-500">
                    Tìm kiếm tài khoản, đổi trình độ CEFR và cấp hoặc gỡ quyền quản trị.
                  </p>
                </div>
                <Link to="/admin/users" className="btn-secondary inline-flex items-center justify-center gap-2">
                  Mở danh sách người dùng
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </Card>
          </div>

          <Card>
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Người dùng mới</h2>
                <p className="mt-1 text-sm text-gray-500">Các tài khoản được tạo gần đây.</p>
              </div>
              <Badge variant="default">{summary?.recentUsers.length ?? 0} tài khoản</Badge>
            </div>

            <div className="mt-5 divide-y divide-gray-100">
              {loading ? (
                <p className="py-6 text-sm text-gray-500">Đang tải dữ liệu...</p>
              ) : summary?.recentUsers.length ? (
                summary.recentUsers.map((user) => (
                  <div key={user.id} className="flex flex-col gap-2 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold text-gray-900">{user.name}</p>
                        <Badge variant={user.role === "admin" ? "warning" : "success"}>{roleLabel(user.role)}</Badge>
                        <Badge variant="default">{user.cefr_level}</Badge>
                      </div>
                      <p className="mt-1 break-all text-sm text-gray-500">{user.email}</p>
                    </div>
                    <p className="text-xs text-gray-500">{formatDate(user.created_at)}</p>
                  </div>
                ))
              ) : (
                <p className="py-6 text-sm text-gray-500">Chưa có người dùng.</p>
              )}
            </div>
          </Card>
        </div>
      </div>
    </Layout>
  );
}
