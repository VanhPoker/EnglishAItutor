import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, ArrowRight, CheckCircle2, Loader2, Send } from "lucide-react";
import Layout from "../components/ui/Layout";
import Card from "../components/ui/Card";
import Badge from "../components/ui/Badge";
import { getQuiz, submitQuiz, type QuizResponse } from "../lib/api";

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
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load quiz"))
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
      setError(err instanceof Error ? err.message : "Failed to submit quiz");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <Layout>
        <div className="min-h-[60vh] flex items-center justify-center">
          <div className="flex items-center gap-3 text-sm text-gray-500">
            <Loader2 className="w-4 h-4 animate-spin" />
            Loading quiz...
          </div>
        </div>
      </Layout>
    );
  }

  if (error || !quiz || !activeQuestion) {
    return (
      <Layout>
        <div className="max-w-3xl mx-auto px-4 py-10">
          <Card>
            <h1 className="text-lg font-semibold text-gray-900">Quiz unavailable</h1>
            <p className="text-sm text-gray-500 mt-1">{error || "This quiz does not have questions."}</p>
            <Link to="/quizzes" className="btn-primary inline-flex items-center gap-2 mt-5">
              Back to quizzes
              <ArrowRight className="w-4 h-4" />
            </Link>
          </Card>
        </div>
      </Layout>
    );
  }

  const progress = Math.round((answeredCount / quiz.questions.length) * 100);

  return (
    <Layout>
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between mb-6">
          <div className="flex items-start gap-3">
            <Link to="/quizzes" className="p-2 rounded-lg hover:bg-gray-100">
              <ArrowLeft className="w-4 h-4 text-gray-500" />
            </Link>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{quiz.title}</h1>
              <div className="flex flex-wrap items-center gap-2 mt-2">
                <Badge variant="info">{quiz.level}</Badge>
                <Badge>{quiz.topic.replace(/_/g, " ")}</Badge>
                <Badge variant="success">{answeredCount}/{quiz.questions.length} answered</Badge>
              </div>
            </div>
          </div>
          <button
            type="button"
            disabled={submitting}
            onClick={handleSubmit}
            className="btn-primary inline-flex items-center justify-center gap-2"
          >
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            Submit quiz
          </button>
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
            {error}
          </div>
        )}

        <div className="h-2 rounded-full bg-gray-100 mb-6 overflow-hidden">
          <div className="h-full bg-primary-500 transition-all" style={{ width: `${progress}%` }} />
        </div>

        <div className="grid lg:grid-cols-[250px_1fr] gap-6">
          <Card className="p-4 h-fit">
            <h2 className="text-sm font-semibold text-gray-700 mb-3">Questions</h2>
            <div className="grid grid-cols-5 lg:grid-cols-3 gap-2">
              {quiz.questions.map((question, index) => {
                const isAnswered = Boolean((answers[question.id] || "").trim());
                return (
                  <button
                    key={question.id}
                    type="button"
                    onClick={() => setActiveIndex(index)}
                    className={`aspect-square rounded-lg border text-sm font-medium transition ${
                      activeIndex === index
                        ? "border-primary-400 bg-primary-50 text-primary-700"
                        : isAnswered
                        ? "border-green-200 bg-green-50 text-green-700"
                        : "border-gray-200 bg-white text-gray-500 hover:bg-gray-50"
                    }`}
                  >
                    {index + 1}
                  </button>
                );
              })}
            </div>
          </Card>

          <motion.div key={activeQuestion.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
            <Card>
              <div className="flex items-start justify-between gap-3 mb-5">
                <div>
                  <Badge variant="warning">{activeQuestion.focus.replace(/_/g, " ")}</Badge>
                  <h2 className="text-xl font-semibold text-gray-900 mt-3">
                    {activeQuestion.prompt}
                  </h2>
                </div>
                <span className="text-sm text-gray-400">
                  {activeIndex + 1}/{quiz.questions.length}
                </span>
              </div>

              {activeQuestion.type === "multiple_choice" ? (
                <div className="space-y-3">
                  {activeQuestion.options.map((option) => {
                    const selected = answers[activeQuestion.id] === option;
                    return (
                      <button
                        key={option}
                        type="button"
                        onClick={() => setAnswers((prev) => ({ ...prev, [activeQuestion.id]: option }))}
                        className={`w-full min-h-14 rounded-lg border px-4 py-3 text-left text-sm transition flex items-center gap-3 ${
                          selected
                            ? "border-primary-400 bg-primary-50 text-primary-800"
                            : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
                        }`}
                      >
                        <span
                          className={`w-5 h-5 rounded-full border flex items-center justify-center ${
                            selected ? "border-primary-500 bg-primary-500 text-white" : "border-gray-300"
                          }`}
                        >
                          {selected && <CheckCircle2 className="w-3.5 h-3.5" />}
                        </span>
                        {option}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <input
                  value={answers[activeQuestion.id] || ""}
                  onChange={(event) =>
                    setAnswers((prev) => ({ ...prev, [activeQuestion.id]: event.target.value }))
                  }
                  placeholder="Type your answer..."
                  className="w-full rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary-100"
                />
              )}

              <div className="flex items-center justify-between mt-6">
                <button
                  type="button"
                  disabled={activeIndex === 0}
                  onClick={() => setActiveIndex((value) => Math.max(0, value - 1))}
                  className="btn-secondary disabled:opacity-50"
                >
                  Previous
                </button>
                <button
                  type="button"
                  disabled={activeIndex === quiz.questions.length - 1}
                  onClick={() => setActiveIndex((value) => Math.min(quiz.questions.length - 1, value + 1))}
                  className="btn-secondary inline-flex items-center gap-2 disabled:opacity-50"
                >
                  Next
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </Card>
          </motion.div>
        </div>
      </div>
    </Layout>
  );
}
