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
import { useAuthStore } from "../stores/authStore";
import { useUserStore } from "../stores/userStore";

const topics = [
  { name: "Free Conversation", value: "free_conversation", hint: "Open speaking" },
  { name: "Daily Life", value: "daily_life", hint: "Routine phrases" },
  { name: "Travel", value: "travel", hint: "Trips and plans" },
  { name: "Work & Career", value: "work_career", hint: "Meetings and jobs" },
  { name: "Food & Cooking", value: "food_cooking", hint: "Ordering and recipes" },
  { name: "Movies & Books", value: "movies_books", hint: "Opinions and stories" },
  { name: "Technology", value: "technology", hint: "Products and tools" },
  { name: "Health & Fitness", value: "health_fitness", hint: "Habits and advice" },
];

const levels = [
  { value: "A1", label: "A1", hint: "Simple phrases" },
  { value: "A2", label: "A2", hint: "Everyday tasks" },
  { value: "B1", label: "B1", hint: "Common situations" },
  { value: "B2", label: "B2", hint: "Fluent discussion" },
  { value: "C1", label: "C1", hint: "Precise expression" },
  { value: "C2", label: "C2", hint: "Near native" },
];

function formatTopic(value: string) {
  return value.replace(/_/g, " ");
}

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
      navigate("/admin/users");
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
              <p className="text-sm font-semibold text-blue-700">Workspace</p>
              <h1 className="mt-1 text-3xl font-bold text-gray-900">Today&apos;s learning plan</h1>
              <p className="mt-2 max-w-2xl text-sm text-gray-600">
                Start with a conversation, review captured mistakes, then turn weak points into a short quiz.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge variant="info" size="md">{level}</Badge>
              <Badge size="md">{formatTopic(currentTopic.value)}</Badge>
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
                  <h2 className="font-semibold text-gray-900">Admin access is unclaimed</h2>
                  <p className="mt-1 text-sm text-gray-600">
                    Claim once to manage users and roles from the admin area.
                  </p>
                </div>
              </div>

              <Button type="button" onClick={() => void handleClaimAdmin()} loading={claimingAdmin}>
                Claim Admin
              </Button>
            </div>
          </Card>
        )}

        <div className="grid gap-6 lg:grid-cols-[1.35fr_0.65fr]">
          <Card>
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Next actions</h2>
                <p className="mt-1 text-sm text-gray-500">Use the loop that makes the product different from plain chat.</p>
              </div>
              <Badge variant="success">Learning loop</Badge>
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-3">
              {[
                {
                  title: "Speak with tutor",
                  body: `${level} practice about ${formatTopic(topic)}.`,
                  icon: MessageSquare,
                  action: "Start practice",
                  to: "/practice",
                  tone: "bg-blue-50 text-blue-700 ring-blue-100",
                },
                {
                  title: "Review mistakes",
                  body: recentSession ? "Open feedback from the last completed session." : "Finish one session to unlock review.",
                  icon: Target,
                  action: "Open review",
                  to: "/review",
                  tone: "bg-green-50 text-green-700 ring-green-100",
                },
                {
                  title: "Take a quiz",
                  body: weakArea ? `Focus on ${weakArea.replace(/_/g, " ")} mistakes.` : "Generate questions from a topic or mistakes.",
                  icon: ClipboardList,
                  action: "Open quizzes",
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
                <h2 className="font-semibold text-gray-900">Progress snapshot</h2>
                <p className="text-xs text-gray-500">Conversation data so far</p>
              </div>
            </div>

            <div className="mt-5 grid grid-cols-3 gap-3 text-center">
              <div className="rounded-lg bg-gray-50 p-3">
                <p className="text-xl font-bold text-gray-900">{stats?.total_sessions ?? 0}</p>
                <p className="text-xs text-gray-500">Sessions</p>
              </div>
              <div className="rounded-lg bg-gray-50 p-3">
                <p className="text-xl font-bold text-gray-900">{Math.round(stats?.total_minutes ?? 0)}</p>
                <p className="text-xs text-gray-500">Minutes</p>
              </div>
              <div className="rounded-lg bg-gray-50 p-3">
                <p className="text-xl font-bold text-gray-900">{stats?.streak_days ?? 0}</p>
                <p className="text-xs text-gray-500">Streak</p>
              </div>
            </div>

            <div className="mt-5 rounded-lg border border-gray-200 p-4">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="mt-0.5 h-4 w-4 text-green-600" />
                <div>
                  <p className="text-sm font-semibold text-gray-900">
                    {weakArea ? `Work on ${weakArea.replace(/_/g, " ")}` : "Start a measured session"}
                  </p>
                  <p className="mt-1 text-sm text-gray-500">
                    {weakArea
                      ? "Create a quiz from recent mistakes after speaking."
                      : "One conversation gives the app enough data for review and quiz practice."}
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
                <h2 className="font-semibold text-gray-900">Level</h2>
                <p className="text-sm text-gray-500">Used by tutor and quiz generation</p>
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
                <h2 className="font-semibold text-gray-900">Conversation topic</h2>
                <p className="mt-1 text-sm text-gray-500">Pick a focused context before entering the tutor room.</p>
              </div>
              <Link to="/practice" className="btn-primary inline-flex items-center justify-center gap-2">
                Start practice
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
