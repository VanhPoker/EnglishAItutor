import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Search, Shield, Users, Clock, RefreshCw, Trash2 } from "lucide-react";
import Layout from "../components/ui/Layout";
import Card from "../components/ui/Card";
import Button from "../components/ui/Button";
import { deleteAdminUser, getAdminUsers, updateAdminUser, type AdminUser } from "../lib/api";
import { roleLabel, subscriptionLabel } from "../lib/labels";
import { useAuthStore } from "../stores/authStore";

type UserDraft = Pick<AdminUser, "name" | "native_language" | "cefr_level" | "role" | "subscription_plan">;

const levels = ["A1", "A2", "B1", "B2", "C1", "C2"];
const roles = ["learner", "admin"] as const;
const plans = ["free", "plus", "ultra"] as const;

function createDraft(user: AdminUser): UserDraft {
  return {
    name: user.name,
    native_language: user.native_language,
    cefr_level: user.cefr_level,
    role: user.role,
    subscription_plan: user.subscription_plan,
  };
}

function formatDate(value: string | null): string {
  if (!value) return "Chưa có";
  return new Date(value).toLocaleString("vi-VN");
}

function isDirty(user: AdminUser, draft: UserDraft | undefined): boolean {
  if (!draft) return false;
  return (
    draft.name !== user.name ||
    draft.native_language !== user.native_language ||
    draft.cefr_level !== user.cefr_level ||
    draft.role !== user.role ||
    draft.subscription_plan !== user.subscription_plan
  );
}

export default function AdminUsers() {
  const authUser = useAuthStore((s) => s.user);
  const updateAuthUser = useAuthStore((s) => s.updateUser);

  const [users, setUsers] = useState<AdminUser[]>([]);
  const [total, setTotal] = useState(0);
  const [drafts, setDrafts] = useState<Record<string, UserDraft>>({});
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<"all" | "learner" | "admin">("all");
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await getAdminUsers({ search, role: roleFilter, limit: 100 });
      setUsers(response.users);
      setTotal(response.total);
      setDrafts(
        Object.fromEntries(response.users.map((user) => [user.id, createDraft(user)]))
      );
    } catch (err: any) {
      setError(err.message || "Không tải được danh sách người dùng");
    } finally {
      setLoading(false);
    }
  }, [roleFilter, search]);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  const summary = useMemo(() => {
    const admins = users.filter((user) => user.role === "admin").length;
    const learners = users.filter((user) => user.role === "learner").length;
    const totalMinutes = users.reduce((sum, user) => sum + user.total_minutes, 0);
    return {
      admins,
      learners,
      totalMinutes: Math.round(totalMinutes),
    };
  }, [users]);

  const handleDraftChange = (userId: string, patch: Partial<UserDraft>) => {
    setDrafts((current) => ({
      ...current,
      [userId]: {
        ...current[userId],
        ...patch,
      },
    }));
  };

  const handleSave = async (user: AdminUser) => {
    const draft = drafts[user.id];
    if (!draft || !isDirty(user, draft)) return;

    setSavingId(user.id);
    setError("");
    try {
      const updated = await updateAdminUser(user.id, draft);
      setUsers((current) =>
        current.map((item) => (item.id === updated.id ? updated : item))
      );
      setDrafts((current) => ({
        ...current,
        [updated.id]: createDraft(updated),
      }));

      if (authUser?.id === updated.id) {
        updateAuthUser({
          name: updated.name,
          native_language: updated.native_language,
          cefr_level: updated.cefr_level,
          role: updated.role,
          subscription_plan: updated.subscription_plan,
        });
      }
    } catch (err: any) {
      setError(err.message || "Không cập nhật được người dùng");
    } finally {
      setSavingId(null);
    }
  };

  const handleDelete = async (user: AdminUser) => {
    if (!window.confirm(`Xoá người dùng "${user.email}" và toàn bộ dữ liệu liên quan?`)) return;

    setDeletingId(user.id);
    setError("");
    try {
      await deleteAdminUser(user.id);
      setUsers((current) => current.filter((item) => item.id !== user.id));
      setDrafts((current) => {
        const next = { ...current };
        delete next[user.id];
        return next;
      });
      setTotal((value) => Math.max(0, value - 1));
    } catch (err: any) {
      setError(err.message || "Không xoá được người dùng");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <Layout>
      <div className="max-w-6xl mx-auto px-4 py-8">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <h1 className="text-2xl font-bold text-gray-900">Quản lý người dùng</h1>
          <p className="text-gray-500 mt-1">
            Xem tài khoản, chỉnh trình độ và phân quyền quản trị.
          </p>
        </motion.div>

        <div className="grid md:grid-cols-4 gap-4 mb-6">
          <Card>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
                <Users className="w-5 h-5" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{total}</p>
                <p className="text-sm text-gray-500">Người dùng phù hợp</p>
              </div>
            </div>
          </Card>

          <Card>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-green-50 text-green-600 flex items-center justify-center">
                <Shield className="w-5 h-5" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{summary.admins}</p>
                <p className="text-sm text-gray-500">Quản trị viên</p>
              </div>
            </div>
          </Card>

          <Card>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
                <Users className="w-5 h-5" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{summary.learners}</p>
                <p className="text-sm text-gray-500">Học viên</p>
              </div>
            </div>
          </Card>

          <Card>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center">
                <Clock className="w-5 h-5" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{summary.totalMinutes}</p>
                <p className="text-sm text-gray-500">Phút đã học</p>
              </div>
            </div>
          </Card>
        </div>

        <Card className="mb-6">
          <form
            className="flex flex-col gap-4 md:flex-row md:items-end"
            onSubmit={(e) => {
              e.preventDefault();
              setSearch(searchInput.trim());
            }}
          >
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">Tìm kiếm</label>
              <div className="relative">
                <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder="Tìm theo tên hoặc email"
                  className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-gray-200 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 outline-none transition"
                />
              </div>
            </div>

            <div className="md:w-48">
              <label className="block text-sm font-medium text-gray-700 mb-1">Vai trò</label>
              <select
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value as "all" | "learner" | "admin")}
                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 outline-none transition bg-white"
              >
                <option value="all">Tất cả vai trò</option>
                <option value="admin">Quản trị</option>
                <option value="learner">Học viên</option>
              </select>
            </div>

            <div className="flex gap-2">
              <Button type="submit" icon={<Search className="w-4 h-4" />}>
                Tìm kiếm
              </Button>
              <Button
                type="button"
                variant="secondary"
                icon={<RefreshCw className="w-4 h-4" />}
                onClick={() => void loadUsers()}
              >
                Tải lại
              </Button>
            </div>
          </form>
        </Card>

        <Card>
          <div className="flex items-center justify-between gap-4 mb-4">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Người dùng</h2>
              <p className="text-sm text-gray-500">Đang hiển thị {users.length}/{total} người dùng</p>
            </div>
          </div>

          {error && (
            <p className="mb-4 text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">
              {error}
            </p>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="w-8 h-8 border-2 border-primary-400 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : users.length === 0 ? (
            <p className="text-sm text-gray-400 py-8">Không có người dùng phù hợp bộ lọc.</p>
          ) : (
            <div className="divide-y divide-gray-100">
              {users.map((user, index) => {
                const draft = drafts[user.id];
                const dirty = isDirty(user, draft);
                const isSelf = authUser?.id === user.id;

                return (
                  <motion.div
                    key={user.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.03 }}
                    className="py-5"
                  >
                    <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-base font-semibold text-gray-900">{user.name}</h3>
                          <span
                            className={`px-2 py-1 rounded-full text-xs font-medium ${
                              user.role === "admin"
                                ? "bg-green-50 text-green-700"
                                : "bg-blue-50 text-blue-700"
                            }`}
                          >
                            {roleLabel(user.role)}
                          </span>
                          <span className="px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                            {user.cefr_level}
                          </span>
                          <span className="px-2 py-1 rounded-full text-xs font-medium bg-amber-50 text-amber-700">
                            {subscriptionLabel(user.subscription_plan)}
                          </span>
                          {isSelf && (
                            <span className="px-2 py-1 rounded-full text-xs font-medium bg-amber-50 text-amber-700">
                              Bạn
                            </span>
                          )}
                        </div>

                        <p className="text-sm text-gray-500 mt-1 break-all">{user.email}</p>

                        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
                          <span>Ngôn ngữ: {user.native_language}</span>
                          <span>Phiên học: {user.session_count}</span>
                          <span>Phút học: {Math.round(user.total_minutes)}</span>
                          <span>Ngày tạo: {formatDate(user.created_at)}</span>
                          <span>Phiên gần nhất: {formatDate(user.last_session_at)}</span>
                        </div>
                      </div>

                      <div className="xl:w-[540px]">
                        <div className="grid gap-3 sm:grid-cols-2">
                          <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">Họ tên</label>
                            <input
                              type="text"
                              value={draft?.name || ""}
                              onChange={(e) =>
                                handleDraftChange(user.id, { name: e.target.value })
                              }
                              className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 outline-none transition"
                            />
                          </div>

                          <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">Ngôn ngữ</label>
                            <input
                              type="text"
                              value={draft?.native_language || ""}
                              onChange={(e) =>
                                handleDraftChange(user.id, { native_language: e.target.value })
                              }
                              className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 outline-none transition"
                            />
                          </div>

                          <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">Trình độ CEFR</label>
                            <select
                              value={draft?.cefr_level || user.cefr_level}
                              onChange={(e) =>
                                handleDraftChange(user.id, { cefr_level: e.target.value })
                              }
                              className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 outline-none transition bg-white"
                            >
                              {levels.map((level) => (
                                <option key={level} value={level}>
                                  {level}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">Vai trò</label>
                            <select
                              value={draft?.role || user.role}
                              onChange={(e) =>
                                handleDraftChange(user.id, {
                                  role: e.target.value as AdminUser["role"],
                                })
                              }
                              disabled={isSelf}
                              className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 outline-none transition bg-white disabled:opacity-60"
                            >
                              {roles.map((role) => (
                                <option key={role} value={role}>
                                  {roleLabel(role)}
                                </option>
                              ))}
                            </select>
                            {isSelf && (
                              <p className="mt-1 text-[11px] text-gray-400">
                                Bạn không thể tự gỡ quyền quản trị của chính mình tại đây.
                              </p>
                            )}
                          </div>

                          <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">Gói đăng ký</label>
                            <select
                              value={draft?.subscription_plan || user.subscription_plan}
                              onChange={(e) =>
                                handleDraftChange(user.id, {
                                  subscription_plan: e.target.value as AdminUser["subscription_plan"],
                                })
                              }
                              className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 outline-none transition bg-white"
                            >
                              {plans.map((plan) => (
                                <option key={plan} value={plan}>
                                  {subscriptionLabel(plan)}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>

                        <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
                          <Button
                            size="sm"
                            variant="danger"
                            type="button"
                            onClick={() => void handleDelete(user)}
                            loading={deletingId === user.id}
                            disabled={isSelf}
                            icon={<Trash2 className="w-4 h-4" />}
                          >
                            Xoá
                          </Button>
                          <Button
                            size="sm"
                            variant="secondary"
                            type="button"
                            onClick={() =>
                              setDrafts((current) => ({
                                ...current,
                                [user.id]: createDraft(user),
                              }))
                            }
                            disabled={!dirty || savingId === user.id}
                          >
                            Hoàn tác
                          </Button>
                          <Button
                            size="sm"
                            type="button"
                            onClick={() => void handleSave(user)}
                            loading={savingId === user.id}
                            disabled={!dirty}
                          >
                            Lưu
                          </Button>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </Card>
      </div>
    </Layout>
  );
}
