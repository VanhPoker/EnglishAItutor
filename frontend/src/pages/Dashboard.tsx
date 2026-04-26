import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  Clock,
  MessageSquare,
  Target,
  TrendingUp,
  Award,
  Calendar,
  ArrowRight,
} from "lucide-react";
import { Link } from "react-router-dom";
import Layout from "../components/ui/Layout";
import Card from "../components/ui/Card";
import ScoreDisplay from "../components/feedback/ScoreDisplay";
import { getDashboard, type DashboardStats } from "../lib/api";
import { focusLabel, topicLabel } from "../lib/labels";
import { useAuthStore } from "../stores/authStore";

export default function Dashboard() {
  const user = useAuthStore((s) => s.user);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getDashboard()
      .then(setStats)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-64">
          <div className="w-8 h-8 border-2 border-primary-400 border-t-transparent rounded-full animate-spin" />
        </div>
      </Layout>
    );
  }

  const s = stats || {
    total_sessions: 0,
    total_minutes: 0,
    total_turns: 0,
    total_errors: 0,
    avg_grammar: null,
    avg_vocabulary: null,
    avg_fluency: null,
    streak_days: 0,
    common_errors: [],
    recent_sessions: [],
  };

  return (
    <Layout>
      <div className="max-w-5xl mx-auto px-4 py-8">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <h1 className="text-2xl font-bold text-gray-900">Tiến độ học tập</h1>
          <p className="text-gray-500 mt-1">
            Trình độ: <span className="font-semibold text-primary-600">{user?.cefr_level || "B1"}</span> | Luyện đều để lên cấp.
          </p>
        </motion.div>

        {/* Stats grid */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
          {[
            { icon: MessageSquare, label: "Phiên học", value: s.total_sessions, color: "text-blue-500 bg-blue-50" },
            { icon: Clock, label: "Phút học", value: Math.round(s.total_minutes), color: "text-purple-500 bg-purple-50" },
            { icon: Target, label: "Lượt trao đổi", value: s.total_turns, color: "text-green-500 bg-green-50" },
            { icon: TrendingUp, label: "Lỗi đã ghi", value: s.total_errors, color: "text-amber-500 bg-amber-50" },
            { icon: Award, label: "Chuỗi ngày", value: `${s.streak_days} ngày`, color: "text-red-500 bg-red-50" },
          ].map((stat, i) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
            >
              <Card>
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center mb-2 ${stat.color}`}>
                  <stat.icon className="w-4 h-4" />
                </div>
                <p className="text-xl font-bold text-gray-800">{stat.value}</p>
                <p className="text-xs text-gray-500">{stat.label}</p>
              </Card>
            </motion.div>
          ))}
        </div>

        <div className="grid md:grid-cols-2 gap-6 mb-8">
          {/* Score circles */}
          <Card>
            <h2 className="text-sm font-semibold text-gray-700 mb-4">Điểm kỹ năng</h2>
            <div className="flex justify-around">
              <ScoreDisplay label="Ngữ pháp" score={s.avg_grammar ?? 0} />
              <ScoreDisplay label="Từ vựng" score={s.avg_vocabulary ?? 0} />
              <ScoreDisplay label="Trôi chảy" score={s.avg_fluency ?? 0} />
            </div>
          </Card>

          {/* Common errors */}
          <Card>
            <h2 className="text-sm font-semibold text-gray-700 mb-4">Điểm cần cải thiện</h2>
            <div className="space-y-3">
              {s.common_errors.length === 0 ? (
                <p className="text-sm text-gray-400">Chưa ghi nhận lỗi nào. Hãy bắt đầu luyện nói.</p>
              ) : (
                s.common_errors.map((err, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span
                        className={`w-2 h-2 rounded-full ${
                          err.type === "grammar" ? "bg-red-400" : "bg-amber-400"
                        }`}
                      />
                      <span className="text-sm text-gray-700">{focusLabel(err.type)}</span>
                    </div>
                    <span className="text-xs text-gray-400">{err.count}x</span>
                  </div>
                ))
              )}
            </div>
          </Card>
        </div>

        {/* Recent sessions */}
        <Card>
          <h2 className="text-sm font-semibold text-gray-700 mb-4 flex items-center gap-2">
            <Calendar className="w-4 h-4 text-gray-400" />
            Phiên học gần đây
          </h2>
          <div className="space-y-2">
            {s.recent_sessions.length === 0 ? (
              <p className="text-sm text-gray-400">Chưa có phiên học nào. Hãy bắt đầu phiên đầu tiên.</p>
            ) : (
              s.recent_sessions.map((session, i) => (
                <motion.div
                  key={session.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-gray-400 w-20">
                      {new Date(session.started_at).toLocaleDateString()}
                    </span>
                    <span className="text-sm text-gray-700 capitalize">
                      {topicLabel(session.topic)}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-gray-400">
                      {Math.round(session.duration_minutes)} phút
                    </span>
                    {session.grammar_score != null && (
                      <span
                        className={`text-sm font-semibold ${
                          session.grammar_score >= 75
                            ? "text-green-600"
                            : session.grammar_score >= 60
                            ? "text-amber-600"
                            : "text-red-500"
                        }`}
                      >
                        {session.grammar_score}%
                      </span>
                    )}
                    <Link
                      to={`/review/${session.id}`}
                      className="inline-flex items-center gap-1 text-xs font-medium text-primary-600 hover:text-primary-700"
                    >
                      Ôn lỗi
                      <ArrowRight className="w-3 h-3" />
                    </Link>
                  </div>
                </motion.div>
              ))
            )}
          </div>
        </Card>
      </div>
    </Layout>
  );
}
