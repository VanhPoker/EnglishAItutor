import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ArrowRight,
  BarChart3,
  BookOpen,
  CheckCircle2,
  ClipboardList,
  MessageSquare,
  Shield,
  Target,
} from "lucide-react";
import Layout from "../components/ui/Layout";
import Card from "../components/ui/Card";
import Button from "../components/ui/Button";
import Badge from "../components/ui/Badge";
import {
  claimAdminAccess,
  getAdminBootstrapStatus,
  getDashboard,
  type DashboardStats,
} from "../lib/api";
import { focusLabel, topicLabel } from "../lib/labels";
import { useAuthStore } from "../stores/authStore";
import { useUserStore } from "../stores/userStore";

const topics = [
  { name: "Trò chuyện tự do", value: "free_conversation", hint: "Luyện phản xạ nói" },
  { name: "Đời sống hằng ngày", value: "daily_life", hint: "Câu nói thường dùng" },
  { name: "Du lịch", value: "travel", hint: "Kế hoạch và tình huống" },
  { name: "Công việc", value: "work_career", hint: "Họp, phỏng vấn, nghề nghiệp" },
  { name: "Ăn uống", value: "food_cooking", hint: "Gọi món và nấu ăn" },
  { name: "Phim và sách", value: "movies_books", hint: "Kể chuyện, nêu ý kiến" },
  { name: "Công nghệ", value: "technology", hint: "Sản phẩm và công cụ" },
  { name: "Sức khoẻ", value: "health_fitness", hint: "Thói quen và lời khuyên" },
];

const levels = [
  { value: "A1", label: "A1", hint: "Cụm từ đơn giản" },
  { value: "A2", label: "A2", hint: "Giao tiếp thường ngày" },
  { value: "B1", label: "B1", hint: "Tình huống phổ biến" },
  { value: "B2", label: "B2", hint: "Thảo luận trôi chảy" },
  { value: "C1", label: "C1", hint: "Diễn đạt chính xác" },
  { value: "C2", label: "C2", hint: "Gần bản ngữ" },
];

export default function Home() {
  const navigate = useNavigate();
  const authUser = useAuthStore((s) => s.user);
  const updateAuthUser = useAuthStore((s) => s.updateUser);
  const { level, topic, setLevel, setTopic } = useUserStore();
  const [canClaimAdmin, setCanClaimAdmin] = useState(false);
  const [claimingAdmin, setClaimingAdmin] = useState(false);
  const [stats, setStats] = useState<DashboardStats | null>(null);

  useEffect(() => {
    if (authUser?.role === "admin") {
      setCanClaimAdmin(false);
      return;
    }

    getAdminBootstrapStatus()
      .then((status) => setCanClaimAdmin(!status.admin_exists))
      .catch(() => setCanClaimAdmin(false));
  }, [authUser?.role]);

  useEffect(() => {
    getDashboard()
      .then(setStats)
      .catch(() => setStats(null));
  }, []);

  const currentTopic = useMemo(() => {
    return topics.find((item) => item.value === topic) || topics[0];
  }, [topic]);

  const recentSession = stats?.recent_sessions?.[0];
  const weakArea = stats?.common_errors?.[0]?.type;

  const handleClaimAdmin = async () => {
    setClaimingAdmin(true);
    try {
      const updatedUser = await claimAdminAccess();
      updateAuthUser(updatedUser);
      navigate("/admin");
    } finally {
      setClaimingAdmin(false);
    }
  };

  return (
    <Layout>
      <div className="page-shell">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-sm font-semibold text-blue-700">Không gian học tập</p>
              <h1 className="mt-1 text-3xl font-bold text-gray-900">Kế hoạch học hôm nay</h1>
              <p className="mt-2 max-w-2xl text-sm text-gray-600">
                Bắt đầu bằng một cuộc trò chuyện, xem lại lỗi đã ghi nhận, rồi biến điểm yếu thành bài quiz ngắn.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge variant="info" size="md">{level}</Badge>
              <Badge size="md">{topicLabel(currentTopic.value)}</Badge>
            </div>
          </div>
        </motion.div>

        {canClaimAdmin && (
          <Card className="mb-6 border-green-200 bg-green-50">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white text-green-700 ring-1 ring-green-200">
                  <Shield className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="font-semibold text-gray-900">Chưa có tài khoản quản trị</h2>
                  <p className="mt-1 text-sm text-gray-600">
                    Nhận quyền một lần để quản lý người dùng và phân quyền.
                  </p>
                </div>
              </div>

              <Button type="button" onClick={() => void handleClaimAdmin()} loading={claimingAdmin}>
                Nhận quyền quản trị
              </Button>
            </div>
          </Card>
        )}

        <div className="grid gap-6 lg:grid-cols-[1.35fr_0.65fr]">
          <Card>
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Việc nên làm tiếp</h2>
                <p className="mt-1 text-sm text-gray-500">Luyện nói, ôn lỗi, rồi làm quiz từ lỗi thật.</p>
              </div>
              <Badge variant="success">Lộ trình học</Badge>
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-3">
              {[
                {
                  title: "Nói với gia sư",
                  body: `Luyện ${level} theo chủ đề ${topicLabel(topic)}.`,
                  icon: MessageSquare,
                  action: "Bắt đầu luyện nói",
                  to: "/practice",
                  tone: "bg-blue-50 text-blue-700 ring-blue-100",
                },
                {
                  title: "Ôn lại lỗi sai",
                  body: recentSession ? "Mở phần nhận xét từ phiên học gần nhất." : "Hoàn thành một phiên học để có phần ôn lỗi.",
                  icon: Target,
                  action: "Mở phần ôn lỗi",
                  to: "/review",
                  tone: "bg-green-50 text-green-700 ring-green-100",
                },
                {
                  title: "Làm bài quiz",
                  body: weakArea ? `Tập trung vào lỗi ${focusLabel(weakArea)}.` : "Chọn bài có sẵn trong kho đề.",
                  icon: ClipboardList,
                  action: "Mở bài quiz",
                  to: "/quizzes",
                  tone: "bg-amber-50 text-amber-700 ring-amber-100",
                },
              ].map((item) => (
                <Link
                  key={item.title}
                  to={item.to}
                  className="group rounded-lg border border-gray-200 bg-white p-4 transition hover:border-gray-300 hover:shadow-sm"
                >
                  <div className={`mb-4 flex h-10 w-10 items-center justify-center rounded-lg ring-1 ${item.tone}`}>
                    <item.icon className="h-5 w-5" />
                  </div>
                  <h3 className="font-semibold text-gray-900">{item.title}</h3>
                  <p className="mt-2 min-h-10 text-sm text-gray-500">{item.body}</p>
                  <span className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-blue-700">
                    {item.action}
                    <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
                  </span>
                </Link>
              ))}
            </div>
          </Card>

          <Card>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gray-100 text-gray-700">
                <BarChart3 className="h-5 w-5" />
              </div>
              <div>
                <h2 className="font-semibold text-gray-900">Tổng quan tiến độ</h2>
                <p className="text-xs text-gray-500">Dữ liệu luyện nói đã ghi nhận</p>
              </div>
            </div>

            <div className="mt-5 grid grid-cols-3 gap-3 text-center">
              <div className="rounded-lg bg-gray-50 p-3">
                <p className="text-xl font-bold text-gray-900">{stats?.total_sessions ?? 0}</p>
                <p className="text-xs text-gray-500">Phiên học</p>
              </div>
              <div className="rounded-lg bg-gray-50 p-3">
                <p className="text-xl font-bold text-gray-900">{Math.round(stats?.total_minutes ?? 0)}</p>
                <p className="text-xs text-gray-500">Phút học</p>
              </div>
              <div className="rounded-lg bg-gray-50 p-3">
                <p className="text-xl font-bold text-gray-900">{stats?.streak_days ?? 0}</p>
                <p className="text-xs text-gray-500">Chuỗi ngày</p>
              </div>
            </div>

            <div className="mt-5 rounded-lg border border-gray-200 p-4">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="mt-0.5 h-4 w-4 text-green-600" />
                <div>
                  <p className="text-sm font-semibold text-gray-900">
                    {weakArea ? `Cần luyện thêm ${focusLabel(weakArea)}` : "Bắt đầu một phiên học có đo lường"}
                  </p>
                  <p className="mt-1 text-sm text-gray-500">
                    {weakArea
                      ? "Sau khi luyện nói, hãy chọn quiz phù hợp để kiểm tra lại."
                      : "Một cuộc trò chuyện sẽ tạo dữ liệu cho phần ôn lỗi và quiz."}
                  </p>
                </div>
              </div>
            </div>
          </Card>
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-[0.7fr_1.3fr]">
          <Card>
            <div className="flex items-center gap-3">
              <BookOpen className="h-5 w-5 text-blue-700" />
              <div>
                <h2 className="font-semibold text-gray-900">Trình độ</h2>
                <p className="text-sm text-gray-500">Dùng cho gia sư và gợi ý bài luyện</p>
              </div>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-2">
              {levels.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => setLevel(item.value)}
                  className={`rounded-lg border p-3 text-left transition ${
                    level === item.value
                      ? "border-blue-300 bg-blue-50 text-blue-800"
                      : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
                  }`}
                >
                  <span className="block text-sm font-bold">{item.label}</span>
                  <span className="mt-1 block text-xs text-gray-500">{item.hint}</span>
                </button>
              ))}
            </div>
          </Card>

          <Card>
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <h2 className="font-semibold text-gray-900">Chủ đề trò chuyện</h2>
                <p className="mt-1 text-sm text-gray-500">Chọn ngữ cảnh trước khi vào phòng luyện nói.</p>
              </div>
              <Link to="/practice" className="btn-primary inline-flex items-center justify-center gap-2">
                Bắt đầu luyện nói
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>

            <div className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {topics.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => setTopic(item.value)}
                  className={`min-h-20 rounded-lg border p-3 text-left transition ${
                    topic === item.value
                      ? "border-blue-300 bg-blue-50 text-blue-800"
                      : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
                  }`}
                >
                  <span className="block text-sm font-semibold">{item.name}</span>
                  <span className="mt-1 block text-xs text-gray-500">{item.hint}</span>
                </button>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </Layout>
  );
}
