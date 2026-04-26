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

function scoreTone(score: number) {
  if (score >= 80) {
    return {
      label: "Strong",
      className: "border-green-200 bg-green-50 text-green-700",
      badge: "success" as const,
    };
  }
  if (score >= 60) {
    return {
      label: "Developing",
      className: "border-amber-200 bg-amber-50 text-amber-700",
      badge: "warning" as const,
    };
  }
  return {
    label: "Needs review",
    className: "border-red-200 bg-red-50 text-red-700",
    badge: "error" as const,
  };
}

function formatFocus(value: string) {
  return value.replace(/_/g, " ");
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
            Loading result...
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
            <h1 className="text-lg font-semibold text-gray-900">Result unavailable</h1>
            <p className="mt-1 text-sm text-gray-500">{error || "This result could not be loaded."}</p>
            <Link to="/quizzes" className="btn-primary mt-5 inline-flex items-center gap-2">
              Back to quizzes
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Card>
        </div>
      </Layout>
    );
  }

  const tone = scoreTone(attempt.score);

  return (
    <Layout>
      <div className="page-shell">
        <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-sm font-semibold text-blue-700">Quiz result</p>
            <h1 className="mt-1 text-3xl font-bold text-gray-900">{attempt.quiz_title}</h1>
            <p className="mt-2 text-sm text-gray-600">
              Review the wrong answers, then retry or generate a tighter follow-up quiz.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link to={`/quizzes/${attempt.quiz_id}`} className="btn-primary inline-flex items-center gap-2">
              <RefreshCw className="h-4 w-4" />
              Retry
            </Link>
            <Link to="/quizzes" className="btn-secondary inline-flex items-center gap-2">
              Quiz Studio
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
                  {attempt.correct_count}/{attempt.total_questions} correct
                </p>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3 text-center">
                <div className="rounded-lg bg-gray-50 p-3">
                  <p className="text-xl font-bold text-gray-900">{attempt.total_questions}</p>
                  <p className="text-xs text-gray-500">Questions</p>
                </div>
                <div className="rounded-lg bg-gray-50 p-3">
                  <p className="text-xl font-bold text-gray-900">{wrongResults.length}</p>
                  <p className="text-xs text-gray-500">To review</p>
                </div>
              </div>
            </Card>

            <Card>
              <div className="flex items-center gap-3">
                <Target className="h-5 w-5 text-amber-600" />
                <div>
                  <h2 className="font-semibold text-gray-900">Weak areas</h2>
                  <p className="text-sm text-gray-500">Based on this attempt</p>
                </div>
              </div>
              <div className="mt-4 space-y-2">
                {focusSummary.length === 0 ? (
                  <p className="text-sm text-gray-500">No weak area in this quiz.</p>
                ) : (
                  focusSummary.map(([focus, count]) => (
                    <div key={focus} className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2">
                      <span className="text-sm font-medium capitalize text-gray-700">{formatFocus(focus)}</span>
                      <Badge variant="warning">{count} missed</Badge>
                    </div>
                  ))
                )}
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
                  <h2 className="font-semibold text-gray-900">AI Review</h2>
                  <p className="text-sm text-gray-500">What to improve before the next session</p>
                </div>
              </div>

              <p className="mt-5 text-sm leading-6 text-gray-700">{attempt.ai_review.summary}</p>

              <div className="mt-5 grid gap-4 md:grid-cols-3">
                {[
                  { title: "Strengths", items: attempt.ai_review.strengths, tone: "success" },
                  { title: "Improve", items: attempt.ai_review.improvement_areas, tone: "warning" },
                  { title: "Next steps", items: attempt.ai_review.next_steps, tone: "info" },
                ].map((group) => (
                  <div key={group.title} className="rounded-lg border border-gray-200 p-4">
                    <Badge variant={group.tone as "success" | "warning" | "info"}>{group.title}</Badge>
                    <ul className="mt-3 space-y-2">
                      {group.items.length === 0 ? (
                        <li className="text-sm text-gray-400">No item yet.</li>
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
              <h2 className="font-semibold text-gray-900">Answer review</h2>
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
                            {item.is_correct ? "Correct" : "Needs review"}
                          </Badge>
                          <Badge>{formatFocus(item.focus)}</Badge>
                        </div>
                        <p className="font-medium leading-6 text-gray-900">{item.prompt}</p>
                      </div>
                      <span className="text-xs font-semibold text-gray-400">#{index + 1}</span>
                    </div>

                    <div className="mt-4 grid gap-3 md:grid-cols-2">
                      <div className="rounded-lg bg-gray-50 p-3">
                        <p className="text-xs font-semibold uppercase text-gray-500">Your answer</p>
                        <p className="mt-1 text-sm text-gray-700">{item.user_answer || "No answer"}</p>
                      </div>
                      <div className="rounded-lg bg-green-50 p-3">
                        <p className="text-xs font-semibold uppercase text-green-700">Correct answer</p>
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
