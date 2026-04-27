import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowRight, ClipboardList, Loader2, RefreshCw } from "lucide-react";
import Layout from "../components/ui/Layout";
import Card from "../components/ui/Card";
import Badge from "../components/ui/Badge";
import { getQuizzes, type QuizListItem } from "../lib/api";
import { quizSourceLabel, topicLabel } from "../lib/labels";

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("vi-VN", {
    month: "short",
    day: "numeric",
  });
}

export default function LearnerQuizzes() {
  const [quizzes, setQuizzes] = useState<QuizListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const latestAttemptScore = quizzes.find((quiz) => quiz.latest_score != null)?.latest_score;
  const totalQuestions = useMemo(
    () => quizzes.reduce((sum, quiz) => sum + quiz.question_count, 0),
    [quizzes]
  );

  const loadQuizzes = async () => {
    setLoading(true);
    setError("");
    try {
      setQuizzes(await getQuizzes());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không tải được kho quiz");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadQuizzes();
  }, []);

  return (
    <Layout>
      <div className="page-shell">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-sm font-semibold text-blue-700">Kho bài luyện</p>
              <h1 className="mt-1 text-3xl font-bold text-gray-900">Làm quiz tiếng Anh</h1>
              <p className="mt-2 max-w-2xl text-sm text-gray-600">
                Chọn một bài trong kho đề do quản trị viên chuẩn bị, làm bài và xem AI nhận xét điểm mạnh, điểm yếu.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void loadQuizzes()}
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
          <Card>
            <p className="text-sm text-gray-500">Bài quiz có thể làm</p>
            <p className="mt-1 text-2xl font-bold text-gray-900">{quizzes.length}</p>
          </Card>
          <Card>
            <p className="text-sm text-gray-500">Tổng số câu hỏi</p>
            <p className="mt-1 text-2xl font-bold text-gray-900">{totalQuestions}</p>
          </Card>
          <Card>
            <p className="text-sm text-gray-500">Điểm gần nhất</p>
            <p className="mt-1 text-2xl font-bold text-gray-900">
              {latestAttemptScore == null ? "N/A" : `${latestAttemptScore}%`}
            </p>
          </Card>
        </div>

        <Card className="mt-6">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="font-semibold text-gray-900">Danh sách quiz</h2>
              <p className="mt-1 text-sm text-gray-500">Bạn chỉ cần chọn bài và làm, phần tạo đề nằm ở tài khoản quản trị.</p>
            </div>
            <Badge variant="info">{quizzes.length} bài</Badge>
          </div>

          {loading ? (
            <div className="flex items-center gap-3 py-10 text-sm text-gray-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              Đang tải quiz...
            </div>
          ) : quizzes.length === 0 ? (
            <div className="mt-6 rounded-lg border border-dashed border-gray-300 p-8 text-center">
              <ClipboardList className="mx-auto h-8 w-8 text-gray-400" />
              <h3 className="mt-3 font-semibold text-gray-900">Chưa có quiz để làm</h3>
              <p className="mt-1 text-sm text-gray-500">Quản trị viên cần tạo hoặc import bộ đề trước.</p>
            </div>
          ) : (
            <div className="mt-5 divide-y divide-gray-200">
              {quizzes.map((quiz) => (
                <div
                  key={quiz.id}
                  className="flex flex-col gap-4 py-4 first:pt-0 last:pb-0 md:flex-row md:items-center md:justify-between"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold text-gray-900">{quiz.title}</h3>
                      <Badge variant={quiz.source === "open_source" ? "success" : "info"}>
                        {quizSourceLabel(quiz.source)}
                      </Badge>
                      {quiz.latest_score != null && (
                        <Badge variant={quiz.latest_score >= 70 ? "success" : "error"}>
                          {quiz.latest_score}%
                        </Badge>
                      )}
                    </div>
                    <p className="mt-1 text-sm text-gray-500">
                      {quiz.level} · {topicLabel(quiz.topic)} · {quiz.question_count} câu · {formatDate(quiz.created_at)}
                    </p>
                  </div>
                  <Link
                    to={`/quizzes/${quiz.id}`}
                    className="btn-primary inline-flex items-center justify-center gap-2"
                  >
                    Làm quiz
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </Layout>
  );
}
