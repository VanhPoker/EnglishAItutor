import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ArrowRight,
  CheckCircle2,
  Clock,
  Loader2,
  MessageSquare,
  RefreshCw,
  Sparkles,
  Target,
  XCircle,
} from "lucide-react";
import Layout from "../components/ui/Layout";
import Card from "../components/ui/Card";
import Badge from "../components/ui/Badge";
import {
  generateQuiz,
  getLatestSessionReview,
  getSessionReview,
  type SessionReviewResponse,
} from "../lib/api";
import { focusLabel, topicLabel } from "../lib/labels";

type CheckState = "correct" | "retry";

function normalizeAnswer(value: string) {
  return value.trim().replace(/\s+/g, " ").replace(/[.!?]+$/g, "").toLowerCase();
}

function isCloseEnough(answer: string, target: string) {
  const normalizedAnswer = normalizeAnswer(answer);
  const normalizedTarget = normalizeAnswer(target);
  if (!normalizedAnswer || !normalizedTarget) return false;
  return (
    normalizedAnswer === normalizedTarget ||
    normalizedAnswer.includes(normalizedTarget) ||
    normalizedTarget.includes(normalizedAnswer)
  );
}

function scoreLabel(value: number | null) {
  if (value == null) return "Chưa có";
  return `${value}%`;
}

export default function Review() {
  const navigate = useNavigate();
  const { sessionId } = useParams();
  const [review, setReview] = useState<SessionReviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [checks, setChecks] = useState<Record<string, CheckState>>({});
  const [generatingQuiz, setGeneratingQuiz] = useState(false);
  const [actionMessage, setActionMessage] = useState("");

  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;
    let attempts = 0;

    const load = async () => {
      attempts += 1;
      try {
        const data = sessionId
          ? await getSessionReview(sessionId)
          : await getLatestSessionReview();
        if (cancelled) return;
        setReview(data);
        setError("");
        setLoading(false);
      } catch (err) {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : "Phần ôn lỗi chưa sẵn sàng";
        if (!sessionId && attempts < 8) {
          timer = window.setTimeout(load, 1000);
          return;
        }
        setError(message);
        setLoading(false);
      }
    };

    void load();

    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [sessionId]);

  const stats = useMemo(() => {
    return (review?.stats_json || {}) as {
      working_level?: string;
      recommended_profile_level?: string | null;
      quality_average?: number;
      error_type_counts?: Record<string, number>;
    };
  }, [review]);

  const handleCheck = (drillId: string, target: string) => {
    setChecks((prev) => ({
      ...prev,
      [drillId]: isCloseEnough(answers[drillId] || "", target) ? "correct" : "retry",
    }));
  };

  const handleGenerateRemedialQuiz = async () => {
    if (!review) return;
    setGeneratingQuiz(true);
    setError("");
    setActionMessage("");
    try {
      const quiz = await generateQuiz({
        topic: review.session.topic,
        level: review.session.level,
        question_count: 5,
        source: "mistakes",
      });
      setActionMessage("Đã tạo bài ôn lỗi mới. Đang chuyển sang bài quiz.");
      navigate(`/quizzes/${quiz.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không tạo được quiz ôn lỗi");
    } finally {
      setGeneratingQuiz(false);
    }
  };

  if (loading) {
    return (
      <Layout>
        <div className="min-h-[60vh] flex items-center justify-center">
          <div className="flex items-center gap-3 text-sm text-gray-500">
            <Loader2 className="w-4 h-4 animate-spin" />
            Đang chuẩn bị phần ôn lỗi...
          </div>
        </div>
      </Layout>
    );
  }

  if (error || !review) {
    return (
      <Layout>
        <div className="max-w-3xl mx-auto px-4 py-10">
          <Card>
            <div className="flex items-start gap-3">
              <XCircle className="w-5 h-5 text-amber-500 mt-0.5" />
              <div>
                <h1 className="text-lg font-semibold text-gray-900">Chưa có phiên học hoàn thành</h1>
                <p className="text-sm text-gray-500 mt-1">{error || "Hãy hoàn thành một phiên luyện nói trước."}</p>
                <Link to="/practice" className="btn-primary inline-flex items-center gap-2 mt-5">
                  Bắt đầu luyện nói
                  <ArrowRight className="w-4 h-4" />
                </Link>
              </div>
            </div>
          </Card>
        </div>
      </Layout>
    );
  }

  const session = review.session;

  return (
    <Layout>
      <div className="max-w-5xl mx-auto px-4 py-8">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Ôn lại phiên học</h1>
              <div className="flex flex-wrap items-center gap-2 mt-2">
                <Badge variant="info">{session.level}</Badge>
                <Badge>{topicLabel(session.topic)}</Badge>
                {stats.working_level && <Badge variant="success">Mức đang luyện {stats.working_level}</Badge>}
              </div>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => void handleGenerateRemedialQuiz()}
                disabled={generatingQuiz}
                className="btn-secondary inline-flex items-center gap-2"
              >
                {generatingQuiz ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                Tạo quiz ôn lỗi
              </button>
              <Link to="/practice" className="btn-primary inline-flex items-center gap-2">
                Luyện lại
                <RefreshCw className="w-4 h-4" />
              </Link>
              <Link to="/dashboard" className="btn-secondary inline-flex items-center gap-2">
                Tiến độ
              </Link>
            </div>
          </div>
        </motion.div>

        {actionMessage && (
          <div className="mb-4 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
            {actionMessage}
          </div>
        )}

        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
          {[
            { icon: Clock, label: "Phút học", value: Math.round(session.duration_minutes) },
            { icon: MessageSquare, label: "Lượt trao đổi", value: session.total_turns },
            { icon: Target, label: "Lỗi sai", value: session.total_errors },
            { icon: CheckCircle2, label: "Ngữ pháp", value: scoreLabel(session.grammar_score) },
            { icon: CheckCircle2, label: "Trôi chảy", value: scoreLabel(session.fluency_score) },
          ].map((item, index) => (
            <motion.div
              key={item.label}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.04 }}
            >
              <Card className="p-4">
                <item.icon className="w-4 h-4 text-primary-500 mb-2" />
                <p className="text-xl font-bold text-gray-900">{item.value}</p>
                <p className="text-xs text-gray-500">{item.label}</p>
              </Card>
            </motion.div>
          ))}
        </div>

        <div className="grid lg:grid-cols-[1.05fr_0.95fr] gap-6">
          <section>
            <h2 className="text-sm font-semibold text-gray-700 mb-3">Lỗi cần sửa</h2>
            <div className="space-y-3">
              {review.top_errors.length === 0 ? (
                <Card>
                  <p className="text-sm text-gray-500">
                    Phiên này chưa ghi nhận lỗi lặp lại.
                  </p>
                </Card>
              ) : (
                review.top_errors.map((item, index) => (
                  <Card key={`${item.original}-${index}`} className="p-5">
                    <div className="flex items-start justify-between gap-3">
                      <Badge variant={item.error_type === "grammar" ? "error" : "warning"}>
                        {focusLabel(item.error_type)}
                      </Badge>
                      <span className="text-xs text-gray-400">{item.count}x</span>
                    </div>
                    <div className="mt-4 space-y-3">
                      <div>
                        <p className="text-xs font-medium text-gray-400">Câu gốc</p>
                        <p className="text-sm text-red-500 line-through decoration-red-300">
                          {item.original || "Chưa ghi nhận câu gốc"}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs font-medium text-gray-400">Cách nói tốt hơn</p>
                        <p className="text-sm font-medium text-green-700">
                          {item.correction || "Chưa có câu sửa"}
                        </p>
                      </div>
                      {item.explanation && (
                        <p className="text-sm text-gray-600 border-t border-gray-100 pt-3">
                          {item.explanation}
                        </p>
                      )}
                    </div>
                  </Card>
                ))
              )}
            </div>
          </section>

          <section>
            <h2 className="text-sm font-semibold text-gray-700 mb-3">Bài tập từ phiên học</h2>
            <div className="space-y-3">
              {review.drills.length === 0 ? (
                <Card>
                  <p className="text-sm text-gray-500">
                    Trò chuyện lâu hơn sẽ tạo được bài ôn tốt hơn.
                  </p>
                </Card>
              ) : (
                review.drills.map((drill) => {
                  const state = checks[drill.id];
                  return (
                    <Card key={drill.id} className="p-5">
                      <Badge variant="info">{focusLabel(drill.error_type)}</Badge>
                      <p className="text-sm font-medium text-gray-900 mt-3">{drill.instruction}</p>
                      <p className="text-sm text-gray-500 mt-2">{drill.prompt}</p>
                      <textarea
                        value={answers[drill.id] || ""}
                        onChange={(event) => {
                          setAnswers((prev) => ({ ...prev, [drill.id]: event.target.value }));
                          setChecks((prev) => {
                            const next = { ...prev };
                            delete next[drill.id];
                            return next;
                          });
                        }}
                        className="mt-3 w-full min-h-24 resize-none rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-100"
                        placeholder="Viết câu đã sửa..."
                      />
                      <div className="flex items-center justify-between gap-3 mt-3">
                        <button
                          type="button"
                          onClick={() => handleCheck(drill.id, drill.target)}
                          className="btn-secondary px-4 py-2 inline-flex items-center gap-2"
                        >
                          Kiểm tra
                          <ArrowRight className="w-4 h-4" />
                        </button>
                        {state === "correct" && (
                          <span className="text-xs font-medium text-green-600">Có vẻ đúng</span>
                        )}
                        {state === "retry" && (
                          <span className="text-xs font-medium text-amber-600">Thử viết sát với câu sửa hơn</span>
                        )}
                      </div>
                      {(state === "retry" || state === "correct") && (
                        <p className="text-xs text-gray-500 mt-3">
                          Đáp án: <span className="font-medium text-gray-700">{drill.target}</span>
                        </p>
                      )}
                    </Card>
                  );
                })
              )}
            </div>
          </section>
        </div>
      </div>
    </Layout>
  );
}
