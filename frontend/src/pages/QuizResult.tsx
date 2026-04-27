import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ArrowRight,
  CheckCircle2,
  ClipboardList,
  Loader2,
  RefreshCw,
  Target,
  XCircle,
} from "lucide-react";
import Layout from "../components/ui/Layout";
import Card from "../components/ui/Card";
import Badge from "../components/ui/Badge";
import { getQuizAttempt, type QuizAttemptResponse } from "../lib/api";
import { focusLabel } from "../lib/labels";

function scoreTone(score: number) {
  if (score >= 80) {
    return {
      label: "Tốt",
      className: "border-green-200 bg-green-50 text-green-700",
      badge: "success" as const,
    };
  }
  if (score >= 60) {
    return {
      label: "Đang tiến bộ",
      className: "border-amber-200 bg-amber-50 text-amber-700",
      badge: "warning" as const,
    };
  }
  return {
    label: "Cần ôn lại",
    className: "border-red-200 bg-red-50 text-red-700",
    badge: "error" as const,
  };
}

function trendTone(trend: QuizAttemptResponse["learner_profile"]["recent_trend"]) {
  if (trend === "improving") {
    return {
      label: "Đang tiến bộ",
      className: "border-green-200 bg-green-50 text-green-700",
    };
  }
  if (trend === "declining") {
    return {
      label: "Cần siết lại",
      className: "border-red-200 bg-red-50 text-red-700",
    };
  }
  if (trend === "steady") {
    return {
      label: "Ổn định",
      className: "border-amber-200 bg-amber-50 text-amber-700",
    };
  }
  return {
    label: "Chưa đủ dữ liệu",
    className: "border-gray-200 bg-gray-50 text-gray-600",
  };
}

export default function QuizResult() {
  const { attemptId } = useParams();
  const [attempt, setAttempt] = useState<QuizAttemptResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!attemptId) return;
    getQuizAttempt(attemptId)
      .then(setAttempt)
      .catch((err) => setError(err instanceof Error ? err.message : "Không tải được kết quả"))
      .finally(() => setLoading(false));
  }, [attemptId]);

  const wrongResults = useMemo(() => {
    return attempt?.results.filter((item) => !item.is_correct) || [];
  }, [attempt]);

  const focusSummary = useMemo(() => {
    const counts = new Map<string, number>();
    wrongResults.forEach((item) => counts.set(item.focus, (counts.get(item.focus) || 0) + 1));
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
  }, [wrongResults]);

  if (loading) {
    return (
      <Layout>
        <div className="flex min-h-[60vh] items-center justify-center">
          <div className="flex items-center gap-3 text-sm text-gray-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            Đang tải kết quả...
          </div>
        </div>
      </Layout>
    );
  }

  if (error || !attempt) {
    return (
      <Layout>
        <div className="mx-auto max-w-3xl px-4 py-10">
          <Card>
            <h1 className="text-lg font-semibold text-gray-900">Không mở được kết quả</h1>
            <p className="mt-1 text-sm text-gray-500">{error || "Kết quả này chưa tải được."}</p>
            <Link to="/quizzes" className="btn-primary mt-5 inline-flex items-center gap-2">
              Quay lại quiz
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Card>
        </div>
      </Layout>
    );
  }

  const tone = scoreTone(attempt.score);
  const learnerTone = trendTone(attempt.learner_profile.recent_trend);

  return (
    <Layout>
      <div className="page-shell">
        <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-sm font-semibold text-blue-700">Kết quả quiz</p>
            <h1 className="mt-1 text-3xl font-bold text-gray-900">{attempt.quiz_title}</h1>
            <p className="mt-2 text-sm text-gray-600">
              Xem lại câu sai, sau đó làm lại hoặc tạo bài luyện sát hơn.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link to={`/quizzes/${attempt.quiz_id}`} className="btn-primary inline-flex items-center gap-2">
              <RefreshCw className="h-4 w-4" />
              Làm lại
            </Link>
            <Link to="/quizzes" className="btn-secondary inline-flex items-center gap-2">
              Tạo quiz
            </Link>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
          <section className="space-y-6">
            <Card>
              <div className={`rounded-lg border p-6 text-center ${tone.className}`}>
                <p className="text-sm font-semibold">{tone.label}</p>
                <p className="mt-2 text-5xl font-bold">{attempt.score}%</p>
                <p className="mt-2 text-sm">
                  Đúng {attempt.correct_count}/{attempt.total_questions}
                </p>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3 text-center">
                <div className="rounded-lg bg-gray-50 p-3">
                  <p className="text-xl font-bold text-gray-900">{attempt.total_questions}</p>
                  <p className="text-xs text-gray-500">Câu hỏi</p>
                </div>
                <div className="rounded-lg bg-gray-50 p-3">
                  <p className="text-xl font-bold text-gray-900">{wrongResults.length}</p>
                  <p className="text-xs text-gray-500">Cần ôn</p>
                </div>
              </div>
            </Card>

            <Card>
              <div className="flex items-center gap-3">
                <Target className="h-5 w-5 text-amber-600" />
                <div>
                  <h2 className="font-semibold text-gray-900">Điểm yếu</h2>
                  <p className="text-sm text-gray-500">Dựa trên lần làm bài này</p>
                </div>
              </div>
              <div className="mt-4 space-y-2">
                {focusSummary.length === 0 ? (
                  <p className="text-sm text-gray-500">Chưa có điểm yếu trong bài này.</p>
                ) : (
                  focusSummary.map(([focus, count]) => (
                    <div key={focus} className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2">
                      <span className="text-sm font-medium text-gray-700">{focusLabel(focus)}</span>
                      <Badge variant="warning">Sai {count} câu</Badge>
                    </div>
                  ))
                )}
              </div>
            </Card>

            <Card>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="font-semibold text-gray-900">Hồ sơ người học</h2>
                  <p className="text-sm text-gray-500">Tổng hợp từ các bài quiz gần đây</p>
                </div>
                <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${learnerTone.className}`}>
                  {learnerTone.label}
                </span>
              </div>

              <p className="mt-4 text-sm leading-6 text-gray-700">{attempt.learner_profile.summary}</p>

              <div className="mt-4 grid grid-cols-2 gap-3 text-center">
                <div className="rounded-lg bg-gray-50 p-3">
                  <p className="text-xl font-bold text-gray-900">{attempt.learner_profile.attempts_analyzed}</p>
                  <p className="text-xs text-gray-500">Bài đã phân tích</p>
                </div>
                <div className="rounded-lg bg-gray-50 p-3">
                  <p className="text-xl font-bold text-gray-900">
                    {attempt.learner_profile.average_score == null ? "--" : `${attempt.learner_profile.average_score}%`}
                  </p>
                  <p className="text-xs text-gray-500">Điểm trung bình</p>
                </div>
              </div>

              <div className="mt-4 space-y-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Nhóm đang tốt</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {attempt.learner_profile.strongest_focuses.length === 0 ? (
                      <span className="text-sm text-gray-400">Chưa đủ dữ liệu.</span>
                    ) : (
                      attempt.learner_profile.strongest_focuses.map((item) => (
                        <span
                          key={`strong-${item.focus}`}
                          className="rounded-full border border-green-200 bg-green-50 px-3 py-1 text-xs font-medium text-green-700"
                        >
                          {focusLabel(item.focus)} {item.accuracy}%
                        </span>
                      ))
                    )}
                  </div>
                </div>

                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Nhóm cần ưu tiên</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {attempt.learner_profile.weakest_focuses.length === 0 ? (
                      <span className="text-sm text-gray-400">Chưa đủ dữ liệu.</span>
                    ) : (
                      attempt.learner_profile.weakest_focuses.map((item) => (
                        <span
                          key={`weak-${item.focus}`}
                          className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700"
                        >
                          {focusLabel(item.focus)} {item.accuracy}%
                        </span>
                      ))
                    )}
                  </div>
                </div>

                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Đề xuất luyện tiếp</p>
                  <ul className="mt-2 space-y-2">
                    {attempt.learner_profile.recommendations.length === 0 ? (
                      <li className="text-sm text-gray-400">Chưa có đề xuất.</li>
                    ) : (
                      attempt.learner_profile.recommendations.map((item) => (
                        <li key={item} className="rounded-lg bg-gray-50 px-3 py-2 text-sm leading-6 text-gray-700">
                          {item}
                        </li>
                      ))
                    )}
                  </ul>
                </div>
              </div>
            </Card>
          </section>

          <section className="space-y-6">
            <Card>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-blue-700 ring-1 ring-blue-100">
                  <ClipboardList className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="font-semibold text-gray-900">AI nhận xét</h2>
                  <p className="text-sm text-gray-500">Điểm cần cải thiện trước buổi tiếp theo</p>
                </div>
              </div>

              <p className="mt-5 text-sm leading-6 text-gray-700">{attempt.ai_review.summary}</p>

              <div className="mt-5 grid gap-4 md:grid-cols-3">
                {[
                  { title: "Điểm mạnh", items: attempt.ai_review.strengths, tone: "success" },
                  { title: "Cần cải thiện", items: attempt.ai_review.improvement_areas, tone: "warning" },
                  { title: "Bước tiếp theo", items: attempt.ai_review.next_steps, tone: "info" },
                ].map((group) => (
                  <div key={group.title} className="rounded-lg border border-gray-200 p-4">
                    <Badge variant={group.tone as "success" | "warning" | "info"}>{group.title}</Badge>
                    <ul className="mt-3 space-y-2">
                      {group.items.length === 0 ? (
                        <li className="text-sm text-gray-400">Chưa có mục nào.</li>
                      ) : (
                        group.items.map((item) => (
                          <li key={item} className="text-sm leading-5 text-gray-600">
                            {item}
                          </li>
                        ))
                      )}
                    </ul>
                  </div>
                ))}
              </div>
            </Card>

            <Card>
              <h2 className="font-semibold text-gray-900">Xem lại đáp án</h2>
              <div className="mt-4 space-y-3">
                {attempt.results.map((item, index) => (
                  <motion.div
                    key={item.question_id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.03 }}
                    className="rounded-lg border border-gray-200 bg-white p-4"
                  >
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div>
                        <div className="mb-2 flex flex-wrap items-center gap-2">
                          {item.is_correct ? (
                            <CheckCircle2 className="h-4 w-4 text-green-600" />
                          ) : (
                            <XCircle className="h-4 w-4 text-red-600" />
                          )}
                          <Badge variant={item.is_correct ? "success" : "error"}>
                            {item.is_correct ? "Đúng" : "Cần ôn"}
                          </Badge>
                          <Badge>{focusLabel(item.focus)}</Badge>
                        </div>
                        {item.image_url && (
                          <div className="mb-3 overflow-hidden rounded-lg border border-gray-200 bg-gray-50">
                            <img
                              src={item.image_url}
                              alt={`Minh hoạ cho câu ${index + 1}`}
                              className="max-h-[280px] w-full object-contain"
                            />
                          </div>
                        )}
                        <p className="font-medium leading-6 text-gray-900">{item.prompt}</p>
                      </div>
                      <span className="text-xs font-semibold text-gray-400">#{index + 1}</span>
                    </div>

                    <div className="mt-4 grid gap-3 md:grid-cols-2">
                      <div className="rounded-lg bg-gray-50 p-3">
                        <p className="text-xs font-semibold uppercase text-gray-500">Câu trả lời của bạn</p>
                        <p className="mt-1 text-sm text-gray-700">{item.user_answer || "Chưa trả lời"}</p>
                      </div>
                      <div className="rounded-lg bg-green-50 p-3">
                        <p className="text-xs font-semibold uppercase text-green-700">Đáp án đúng</p>
                        <p className="mt-1 text-sm text-green-800">{item.correct_answer}</p>
                      </div>
                    </div>
                    {item.explanation && (
                      <p className="mt-3 border-t border-gray-200 pt-3 text-sm leading-6 text-gray-600">
                        {item.explanation}
                      </p>
                    )}
                  </motion.div>
                ))}
              </div>
            </Card>
          </section>
        </div>
      </div>
    </Layout>
  );
}
