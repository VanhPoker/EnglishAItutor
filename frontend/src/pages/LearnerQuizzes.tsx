import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowRight, ClipboardList, Loader2, RefreshCw, Sparkles, Target } from "lucide-react";
import Layout from "../components/ui/Layout";
import Card from "../components/ui/Card";
import Badge from "../components/ui/Badge";
import { generateQuiz, getQuizSets, getQuizzes, type QuizListItem, type QuizSetInfo } from "../lib/api";
import { quizSourceLabel, topicLabel } from "../lib/labels";
import { useUserStore } from "../stores/userStore";

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("vi-VN", {
    month: "short",
    day: "numeric",
  });
}

export default function LearnerQuizzes() {
  const navigate = useNavigate();
  const { topic, level } = useUserStore();
  const [quizzes, setQuizzes] = useState<QuizListItem[]>([]);
  const [quizSets, setQuizSets] = useState<QuizSetInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionMessage, setActionMessage] = useState("");
  const [generatingRemedial, setGeneratingRemedial] = useState(false);

  const allQuizzes = useMemo(
    () => [...quizSets.flatMap((set) => set.quizzes), ...quizzes],
    [quizSets, quizzes]
  );
  const latestAttemptScore = allQuizzes.find((quiz) => quiz.latest_score != null)?.latest_score;
  const totalQuestions = useMemo(
    () => allQuizzes.reduce((sum, quiz) => sum + quiz.question_count, 0),
    [allQuizzes]
  );

  const loadQuizzes = async () => {
    setLoading(true);
    setError("");
    try {
      const [sets, quizItems] = await Promise.all([getQuizSets(), getQuizzes()]);
      setQuizSets(sets);
      setQuizzes(quizItems.filter((quiz) => !quiz.quiz_set_id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không tải được kho quiz");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadQuizzes();
  }, []);

  const handleGenerateRemedialQuiz = async () => {
    setGeneratingRemedial(true);
    setError("");
    setActionMessage("");
    try {
      const quiz = await generateQuiz({
        topic,
        level,
        question_count: 5,
        source: "mistakes",
      });
      setActionMessage("Đã tạo bài ôn lỗi cá nhân. Đang mở bài cho bạn.");
      navigate(`/quizzes/${quiz.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không tạo được quiz ôn lỗi");
    } finally {
      setGeneratingRemedial(false);
    }
  };

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

        {actionMessage && (
          <div className="mb-4 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
            {actionMessage}
          </div>
        )}

        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <p className="text-sm text-gray-500">Bài quiz có thể làm</p>
            <p className="mt-1 text-2xl font-bold text-gray-900">{allQuizzes.length}</p>
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

        <Card className="mt-6 border-amber-200 bg-amber-50">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white text-amber-700 ring-1 ring-amber-200">
                <Target className="h-5 w-5" />
              </div>
              <div>
                <h2 className="font-semibold text-gray-900">Quiz ôn lỗi cá nhân</h2>
                <p className="mt-1 text-sm text-gray-600">
                  Tạo một bài ngắn bám vào lỗi nói, lỗi quiz gần đây và nhóm kỹ năng bạn còn yếu.
                </p>
              </div>
            </div>
            <button
              type="button"
              disabled={generatingRemedial}
              onClick={() => void handleGenerateRemedialQuiz()}
              className="btn-primary inline-flex items-center justify-center gap-2"
            >
              {generatingRemedial ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              Tạo quiz ôn lỗi
            </button>
          </div>
        </Card>

        <Card className="mt-6">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="font-semibold text-gray-900">Danh sách quiz</h2>
              <p className="mt-1 text-sm text-gray-500">Quiz được gom theo bộ đề và lọc theo trình độ hiện tại của bạn.</p>
            </div>
            <Badge variant="info">{quizSets.length} bộ · {allQuizzes.length} bài</Badge>
          </div>

          {loading ? (
            <div className="flex items-center gap-3 py-10 text-sm text-gray-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              Đang tải quiz...
            </div>
          ) : allQuizzes.length === 0 ? (
            <div className="mt-6 rounded-lg border border-dashed border-gray-300 p-8 text-center">
              <ClipboardList className="mx-auto h-8 w-8 text-gray-400" />
              <h3 className="mt-3 font-semibold text-gray-900">Chưa có quiz để làm</h3>
              <p className="mt-1 text-sm text-gray-500">Quản trị viên cần tạo hoặc import bộ đề trước.</p>
            </div>
          ) : (
            <div className="mt-5 space-y-5">
              {quizSets.map((set) => (
                <div key={set.id} className="rounded-lg border border-gray-200 bg-white p-4">
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-semibold text-gray-900">{set.title}</h3>
                        <Badge variant="success">{quizSourceLabel(set.source)}</Badge>
                        <Badge variant="info">{set.level}</Badge>
                      </div>
                      <p className="mt-1 text-sm text-gray-500">
                        {topicLabel(set.topic)} · {set.quiz_count} bài · {set.question_count} câu
                      </p>
                      {set.description && <p className="mt-2 text-sm text-gray-600">{set.description}</p>}
                    </div>
                    {set.latest_score != null && (
                      <Badge variant={set.latest_score >= 70 ? "success" : "error"}>{set.latest_score}% gần nhất</Badge>
                    )}
                  </div>

                  <div className="mt-4 divide-y divide-gray-100">
                    {set.quizzes.map((quiz) => (
                      <div key={quiz.id} className="flex flex-col gap-3 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-medium text-gray-900">{quiz.title}</p>
                            {quiz.latest_score != null && (
                              <Badge variant={quiz.latest_score >= 70 ? "success" : "error"}>{quiz.latest_score}%</Badge>
                            )}
                          </div>
                          <p className="mt-1 text-sm text-gray-500">
                            {quiz.level} · {quiz.question_count} câu · {formatDate(quiz.created_at)}
                          </p>
                        </div>
                        <Link to={`/quizzes/${quiz.id}`} className="btn-primary inline-flex items-center justify-center gap-2">
                          Làm quiz
                          <ArrowRight className="h-4 w-4" />
                        </Link>
                      </div>
                    ))}
                  </div>
                </div>
              ))}

              {quizzes.length > 0 && (
                <div className="divide-y divide-gray-200 rounded-lg border border-gray-200 bg-white p-4">
                  <h3 className="pb-3 font-semibold text-gray-900">Bài lẻ</h3>
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
            </div>
          )}
        </Card>
      </div>
    </Layout>
  );
}
