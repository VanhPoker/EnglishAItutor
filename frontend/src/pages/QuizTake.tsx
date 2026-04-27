import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Loader2,
  Send,
} from "lucide-react";
import Layout from "../components/ui/Layout";
import Card from "../components/ui/Card";
import Badge from "../components/ui/Badge";
import { getQuiz, submitQuiz, type QuizResponse } from "../lib/api";
import { focusLabel, topicLabel } from "../lib/labels";

const optionLabels = ["A", "B", "C", "D", "E", "F"];

export default function QuizTake() {
  const { quizId } = useParams();
  const navigate = useNavigate();
  const [quiz, setQuiz] = useState<QuizResponse | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [activeIndex, setActiveIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!quizId) return;
    getQuiz(quizId)
      .then(setQuiz)
      .catch((err) => setError(err instanceof Error ? err.message : "Không tải được quiz"))
      .finally(() => setLoading(false));
  }, [quizId]);

  const activeQuestion = quiz?.questions[activeIndex];
  const answeredCount = useMemo(() => {
    if (!quiz) return 0;
    return quiz.questions.filter((question) => (answers[question.id] || "").trim()).length;
  }, [answers, quiz]);

  const handleSubmit = async () => {
    if (!quiz) return;
    setSubmitting(true);
    setError("");
    try {
      const attempt = await submitQuiz(quiz.id, answers);
      navigate(`/quiz-results/${attempt.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không nộp được bài quiz");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <Layout>
        <div className="flex min-h-[60vh] items-center justify-center">
          <div className="flex items-center gap-3 text-sm text-gray-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            Đang tải quiz...
          </div>
        </div>
      </Layout>
    );
  }

  if (error || !quiz || !activeQuestion) {
    return (
      <Layout>
        <div className="mx-auto max-w-3xl px-4 py-10">
          <Card>
            <h1 className="text-lg font-semibold text-gray-900">Không mở được quiz</h1>
            <p className="mt-1 text-sm text-gray-500">{error || "Quiz này chưa có câu hỏi."}</p>
            <Link to="/quizzes" className="btn-primary mt-5 inline-flex items-center gap-2">
              Quay lại danh sách quiz
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Card>
        </div>
      </Layout>
    );
  }

  const progress = Math.round((answeredCount / quiz.questions.length) * 100);
  const unansweredCount = quiz.questions.length - answeredCount;

  return (
    <Layout>
      <div className="page-shell">
        <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="flex items-start gap-3">
            <Link to="/quizzes" className="rounded-lg border border-gray-200 bg-white p-2 hover:bg-gray-50">
              <ArrowLeft className="h-4 w-4 text-gray-600" />
            </Link>
            <div>
              <p className="text-sm font-semibold text-blue-700">Bài quiz</p>
              <h1 className="mt-1 text-3xl font-bold text-gray-900">{quiz.title}</h1>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Badge variant="info">{quiz.level}</Badge>
                <Badge>{topicLabel(quiz.topic)}</Badge>
                <Badge variant={unansweredCount === 0 ? "success" : "warning"}>
                  Đã trả lời {answeredCount}/{quiz.questions.length}
                </Badge>
              </div>
            </div>
          </div>
          <button
            type="button"
            disabled={submitting}
            onClick={handleSubmit}
            className="btn-primary inline-flex items-center justify-center gap-2"
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Nộp bài
          </button>
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <Card className="mb-6 p-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm font-semibold text-gray-900">Tiến độ</p>
              <p className="text-sm text-gray-500">
                {unansweredCount === 0 ? "Có thể nộp bài." : `Còn ${unansweredCount} câu chưa trả lời.`}
              </p>
            </div>
            <span className="text-sm font-semibold text-gray-700">Hoàn thành {progress}%</span>
          </div>
          <div className="mt-4 h-2 overflow-hidden rounded-full bg-gray-100">
            <div className="h-full bg-blue-600 transition-all" style={{ width: `${progress}%` }} />
          </div>
        </Card>

        <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
          <Card className="p-4 lg:sticky lg:top-6 lg:self-start">
            <h2 className="text-sm font-semibold text-gray-900">Câu hỏi</h2>
            <p className="mt-1 text-xs text-gray-500">Chuyển câu mà không mất đáp án.</p>
            <div className="mt-4 grid grid-cols-5 gap-2 lg:grid-cols-1">
              {quiz.questions.map((question, index) => {
                const isAnswered = Boolean((answers[question.id] || "").trim());
                const active = activeIndex === index;
                return (
                  <button
                    key={question.id}
                    type="button"
                    onClick={() => setActiveIndex(index)}
                    className={`flex min-h-11 items-center justify-center rounded-lg border px-3 text-sm font-semibold transition lg:justify-between ${
                      active
                        ? "border-blue-300 bg-blue-50 text-blue-800"
                        : isAnswered
                        ? "border-green-200 bg-green-50 text-green-700"
                        : "border-gray-200 bg-white text-gray-500 hover:bg-gray-50"
                    }`}
                  >
                    <span>Câu {index + 1}</span>
                    {isAnswered && <CheckCircle2 className="hidden h-4 w-4 lg:block" />}
                  </button>
                );
              })}
            </div>
          </Card>

          <motion.div key={activeQuestion.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
            <Card>
              <div className="mb-6 flex items-start justify-between gap-3">
                <div>
                  <Badge variant="warning">{focusLabel(activeQuestion.focus)}</Badge>
                  <p className="mt-4 text-sm font-semibold text-gray-500">
                    Câu {activeIndex + 1}/{quiz.questions.length}
                  </p>
                  <h2 className="mt-2 text-xl font-semibold leading-relaxed text-gray-900">
                    {activeQuestion.prompt}
                  </h2>
                </div>
              </div>

              {activeQuestion.image_url && (
                <div className="mb-6 overflow-hidden rounded-lg border border-gray-200 bg-gray-50">
                  <img
                    src={activeQuestion.image_url}
                    alt={`Minh hoạ cho câu ${activeIndex + 1}`}
                    className="max-h-[360px] w-full object-contain"
                  />
                </div>
              )}

              {activeQuestion.type === "multiple_choice" ? (
                <div className="space-y-3">
                  {activeQuestion.options.map((option, optionIndex) => {
                    const selected = answers[activeQuestion.id] === option;
                    return (
                      <button
                        key={option}
                        type="button"
                        onClick={() => setAnswers((prev) => ({ ...prev, [activeQuestion.id]: option }))}
                        className={`flex w-full items-start gap-3 rounded-lg border px-4 py-4 text-left text-sm transition ${
                          selected
                            ? "border-blue-300 bg-blue-50 text-blue-900"
                            : "border-gray-200 bg-white text-gray-700 hover:border-gray-300 hover:bg-gray-50"
                        }`}
                      >
                        <span
                          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border text-xs font-bold ${
                            selected ? "border-blue-600 bg-blue-600 text-white" : "border-gray-300 bg-white text-gray-500"
                          }`}
                        >
                          {optionLabels[optionIndex] || optionIndex + 1}
                        </span>
                        <span className="break-words leading-6">{option}</span>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <label className="block">
                  <span className="field-label">Câu trả lời của bạn</span>
                  <input
                    value={answers[activeQuestion.id] || ""}
                    onChange={(event) =>
                      setAnswers((prev) => ({ ...prev, [activeQuestion.id]: event.target.value }))
                    }
                    placeholder="Nhập câu trả lời..."
                    className="field py-3"
                  />
                </label>
              )}

              <div className="mt-6 flex items-center justify-between gap-3 border-t border-gray-200 pt-5">
                <button
                  type="button"
                  disabled={activeIndex === 0}
                  onClick={() => setActiveIndex((value) => Math.max(0, value - 1))}
                  className="btn-secondary"
                >
                  Câu trước
                </button>
                <button
                  type="button"
                  disabled={activeIndex === quiz.questions.length - 1}
                  onClick={() => setActiveIndex((value) => Math.min(quiz.questions.length - 1, value + 1))}
                  className="btn-secondary inline-flex items-center gap-2"
                >
                  Câu tiếp
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </Card>
          </motion.div>
        </div>
      </div>
    </Layout>
  );
}
