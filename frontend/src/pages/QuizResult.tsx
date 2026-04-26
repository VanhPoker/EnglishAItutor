import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ArrowRight,
  CheckCircle2,
  Loader2,
  RefreshCw,
  Target,
  XCircle,
} from "lucide-react";
import Layout from "../components/ui/Layout";
import Card from "../components/ui/Card";
import Badge from "../components/ui/Badge";
import { getQuizAttempt, type QuizAttemptResponse } from "../lib/api";

function scoreTone(score: number) {
  if (score >= 80) return "text-green-600 bg-green-50 border-green-100";
  if (score >= 60) return "text-amber-600 bg-amber-50 border-amber-100";
  return "text-red-600 bg-red-50 border-red-100";
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
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load result"))
      .finally(() => setLoading(false));
  }, [attemptId]);

  if (loading) {
    return (
      <Layout>
        <div className="min-h-[60vh] flex items-center justify-center">
          <div className="flex items-center gap-3 text-sm text-gray-500">
            <Loader2 className="w-4 h-4 animate-spin" />
            Loading result...
          </div>
        </div>
      </Layout>
    );
  }

  if (error || !attempt) {
    return (
      <Layout>
        <div className="max-w-3xl mx-auto px-4 py-10">
          <Card>
            <h1 className="text-lg font-semibold text-gray-900">Result unavailable</h1>
            <p className="text-sm text-gray-500 mt-1">{error || "This result could not be loaded."}</p>
            <Link to="/quizzes" className="btn-primary inline-flex items-center gap-2 mt-5">
              Back to quizzes
              <ArrowRight className="w-4 h-4" />
            </Link>
          </Card>
        </div>
      </Layout>
    );
  }

  const wrongResults = attempt.results.filter((item) => !item.is_correct);

  return (
    <Layout>
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between mb-7">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Quiz Result</h1>
            <p className="text-sm text-gray-500 mt-1">{attempt.quiz_title}</p>
          </div>
          <div className="flex gap-2">
            <Link to={`/quizzes/${attempt.quiz_id}`} className="btn-primary inline-flex items-center gap-2">
              <RefreshCw className="w-4 h-4" />
              Retry
            </Link>
            <Link to="/quizzes" className="btn-secondary inline-flex items-center gap-2">
              Quiz Studio
            </Link>
          </div>
        </div>

        <div className="grid md:grid-cols-[260px_1fr] gap-6 mb-6">
          <Card>
            <div className={`rounded-lg border p-5 text-center ${scoreTone(attempt.score)}`}>
              <p className="text-5xl font-bold">{attempt.score}%</p>
              <p className="text-sm mt-2">
                {attempt.correct_count}/{attempt.total_questions} correct
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3 mt-4 text-center">
              <div className="rounded-lg bg-gray-50 p-3">
                <p className="text-xl font-semibold text-gray-900">{attempt.total_questions}</p>
                <p className="text-xs text-gray-500">Questions</p>
              </div>
              <div className="rounded-lg bg-gray-50 p-3">
                <p className="text-xl font-semibold text-gray-900">{wrongResults.length}</p>
                <p className="text-xs text-gray-500">To review</p>
              </div>
            </div>
          </Card>

          <Card>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-9 h-9 rounded-lg bg-primary-50 text-primary-600 flex items-center justify-center">
                <Target className="w-5 h-5" />
              </div>
              <div>
                <h2 className="font-semibold text-gray-900">AI Review</h2>
                <p className="text-xs text-gray-500">What to improve before the next session.</p>
              </div>
            </div>
            <p className="text-sm text-gray-700 leading-relaxed">{attempt.ai_review.summary}</p>

            <div className="grid md:grid-cols-3 gap-4 mt-5">
              {[
                { title: "Strengths", items: attempt.ai_review.strengths, tone: "success" },
                { title: "Improve", items: attempt.ai_review.improvement_areas, tone: "warning" },
                { title: "Next steps", items: attempt.ai_review.next_steps, tone: "info" },
              ].map((group) => (
                <div key={group.title} className="rounded-lg border border-gray-100 bg-white p-4">
                  <Badge variant={group.tone as "success" | "warning" | "info"}>{group.title}</Badge>
                  <ul className="mt-3 space-y-2">
                    {group.items.length === 0 ? (
                      <li className="text-sm text-gray-400">No item yet.</li>
                    ) : (
                      group.items.map((item) => (
                        <li key={item} className="text-sm text-gray-600">
                          {item}
                        </li>
                      ))
                    )}
                  </ul>
                </div>
              ))}
            </div>
          </Card>
        </div>

        <Card>
          <h2 className="font-semibold text-gray-900 mb-4">Answer review</h2>
          <div className="space-y-3">
            {attempt.results.map((item, index) => (
              <motion.div
                key={item.question_id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.03 }}
                className="rounded-lg border border-gray-100 bg-white p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      {item.is_correct ? (
                        <CheckCircle2 className="w-4 h-4 text-green-500" />
                      ) : (
                        <XCircle className="w-4 h-4 text-red-500" />
                      )}
                      <Badge variant={item.is_correct ? "success" : "error"}>
                        {item.is_correct ? "Correct" : "Needs review"}
                      </Badge>
                      <Badge>{item.focus.replace(/_/g, " ")}</Badge>
                    </div>
                    <p className="font-medium text-gray-900">{item.prompt}</p>
                  </div>
                  <span className="text-xs text-gray-400">#{index + 1}</span>
                </div>
                <div className="grid md:grid-cols-2 gap-3 mt-4">
                  <div className="rounded-lg bg-gray-50 p-3">
                    <p className="text-xs font-medium text-gray-400">Your answer</p>
                    <p className="text-sm text-gray-700 mt-1">{item.user_answer || "No answer"}</p>
                  </div>
                  <div className="rounded-lg bg-green-50 p-3">
                    <p className="text-xs font-medium text-green-600">Correct answer</p>
                    <p className="text-sm text-green-700 mt-1">{item.correct_answer}</p>
                  </div>
                </div>
                {item.explanation && (
                  <p className="text-sm text-gray-600 mt-3 border-t border-gray-100 pt-3">
                    {item.explanation}
                  </p>
                )}
              </motion.div>
            ))}
          </div>
        </Card>
      </div>
    </Layout>
  );
}
