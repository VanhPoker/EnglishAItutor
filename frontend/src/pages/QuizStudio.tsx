import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ArrowRight,
  BookOpenCheck,
  Brain,
  CheckCircle2,
  ClipboardList,
  FilePlus2,
  Loader2,
  Plus,
  RefreshCw,
  Sparkles,
  Trash2,
} from "lucide-react";
import Layout from "../components/ui/Layout";
import Card from "../components/ui/Card";
import Badge from "../components/ui/Badge";
import {
  createQuiz,
  generateQuiz,
  getQuizzes,
  type QuizCreateRequest,
  type QuizListItem,
} from "../lib/api";
import { useUserStore } from "../stores/userStore";

const LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"];
const TOPICS = [
  "free_conversation",
  "daily_life",
  "travel",
  "work_career",
  "food_cooking",
  "movies_books",
  "technology",
  "health_fitness",
];

type ManualQuestion = QuizCreateRequest["questions"][number];
type Mode = "generate" | "manual";

function emptyManualQuestion(index: number): ManualQuestion {
  return {
    id: `q${index}`,
    type: "multiple_choice",
    prompt: "",
    options: ["", "", "", ""],
    correct_answer: "",
    explanation: "",
    focus: "grammar",
  };
}

function formatTopic(value: string) {
  return value.replace(/_/g, " ");
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

export default function QuizStudio() {
  const navigate = useNavigate();
  const { topic: currentTopic, level: currentLevel } = useUserStore();
  const [quizzes, setQuizzes] = useState<QuizListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [savingManual, setSavingManual] = useState(false);
  const [error, setError] = useState("");

  const [mode, setMode] = useState<Mode>("generate");
  const [source, setSource] = useState<"mistakes" | "topic">("mistakes");
  const [topic, setTopic] = useState(currentTopic || "free_conversation");
  const [level, setLevel] = useState(currentLevel || "B1");
  const [questionCount, setQuestionCount] = useState(5);
  const [focus, setFocus] = useState("");

  const [manualTitle, setManualTitle] = useState("Targeted English quiz");
  const [manualQuestions, setManualQuestions] = useState<ManualQuestion[]>([
    emptyManualQuestion(1),
  ]);

  const topicLabel = useMemo(() => formatTopic(topic), [topic]);
  const latestAttemptScore = quizzes.find((quiz) => quiz.latest_score != null)?.latest_score;

  const loadQuizzes = async () => {
    setLoading(true);
    try {
      setQuizzes(await getQuizzes());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load quizzes");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadQuizzes();
  }, []);

  const handleGenerate = async () => {
    setGenerating(true);
    setError("");
    try {
      const quiz = await generateQuiz({
        topic,
        level,
        question_count: questionCount,
        source,
        focus: focus.trim() || undefined,
      });
      await loadQuizzes();
      navigate(`/quizzes/${quiz.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate quiz");
    } finally {
      setGenerating(false);
    }
  };

  const updateManualQuestion = (index: number, patch: Partial<ManualQuestion>) => {
    setManualQuestions((prev) =>
      prev.map((question, itemIndex) =>
        itemIndex === index ? { ...question, ...patch } : question
      )
    );
  };

  const updateOption = (questionIndex: number, optionIndex: number, value: string) => {
    const question = manualQuestions[questionIndex];
    const nextOptions = [...question.options];
    nextOptions[optionIndex] = value;
    updateManualQuestion(questionIndex, { options: nextOptions });
  };

  const removeManualQuestion = (index: number) => {
    setManualQuestions((prev) =>
      prev.length === 1 ? prev : prev.filter((_, itemIndex) => itemIndex !== index)
    );
  };

  const handleManualSave = async () => {
    const cleaned = manualQuestions
      .map((question, index) => ({
        ...question,
        id: question.id || `q${index + 1}`,
        prompt: question.prompt.trim(),
        options:
          question.type === "multiple_choice"
            ? question.options.map((item) => item.trim()).filter(Boolean).slice(0, 4)
            : [],
        correct_answer: question.correct_answer.trim(),
        explanation: question.explanation.trim(),
        focus: question.focus.trim() || "grammar",
      }))
      .filter((question) => question.prompt && question.correct_answer);

    if (!cleaned.length) {
      setError("Add at least one complete manual question.");
      return;
    }

    setSavingManual(true);
    setError("");
    try {
      const quiz = await createQuiz({
        title: manualTitle.trim() || "Targeted English quiz",
        topic,
        level,
        source: "manual",
        questions: cleaned,
      });
      await loadQuizzes();
      navigate(`/quizzes/${quiz.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save quiz");
    } finally {
      setSavingManual(false);
    }
  };

  return (
    <Layout>
      <div className="page-shell">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-sm font-semibold text-blue-700">Quiz Studio</p>
              <h1 className="mt-1 text-3xl font-bold text-gray-900">Practice from mistakes</h1>
              <p className="mt-2 max-w-2xl text-sm text-gray-600">
                Generate short drills from conversation errors, or build a controlled quiz for demo scenarios.
              </p>
            </div>
            <button
              type="button"
              onClick={loadQuizzes}
              className="btn-secondary inline-flex items-center justify-center gap-2"
            >
              <RefreshCw className="h-4 w-4" />
              Refresh
            </button>
          </div>
        </motion.div>

        {error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
          <section className="space-y-6">
            <Card>
              <div className="grid gap-4 md:grid-cols-3">
                <div className="rounded-lg bg-gray-50 p-4">
                  <p className="text-sm text-gray-500">Saved quizzes</p>
                  <p className="mt-1 text-2xl font-bold text-gray-900">{quizzes.length}</p>
                </div>
                <div className="rounded-lg bg-gray-50 p-4">
                  <p className="text-sm text-gray-500">Current level</p>
                  <p className="mt-1 text-2xl font-bold text-gray-900">{level}</p>
                </div>
                <div className="rounded-lg bg-gray-50 p-4">
                  <p className="text-sm text-gray-500">Latest score</p>
                  <p className="mt-1 text-2xl font-bold text-gray-900">
                    {latestAttemptScore == null ? "N/A" : `${latestAttemptScore}%`}
                  </p>
                </div>
              </div>
            </Card>

            <Card>
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <h2 className="font-semibold text-gray-900">Quiz library</h2>
                  <p className="mt-1 text-sm text-gray-500">
                    Current focus: {level} · {topicLabel}
                  </p>
                </div>
                <Badge variant="info">{quizzes.length} total</Badge>
              </div>

              {loading ? (
                <div className="flex items-center gap-3 py-10 text-sm text-gray-500">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading quizzes...
                </div>
              ) : quizzes.length === 0 ? (
                <div className="mt-6 rounded-lg border border-dashed border-gray-300 p-8 text-center">
                  <ClipboardList className="mx-auto h-8 w-8 text-gray-400" />
                  <h3 className="mt-3 font-semibold text-gray-900">No quiz yet</h3>
                  <p className="mt-1 text-sm text-gray-500">
                    Generate one from mistakes after a tutor session, or create a manual set.
                  </p>
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
                          <Badge variant={quiz.source === "mistakes" ? "warning" : "info"}>
                            {quiz.source}
                          </Badge>
                          {quiz.latest_score != null && (
                            <Badge variant={quiz.latest_score >= 70 ? "success" : "error"}>
                              {quiz.latest_score}%
                            </Badge>
                          )}
                        </div>
                        <p className="mt-1 text-sm text-gray-500">
                          {quiz.level} · {formatTopic(quiz.topic)} · {quiz.question_count} questions · {formatDate(quiz.created_at)}
                        </p>
                      </div>
                      <Link
                        to={`/quizzes/${quiz.id}`}
                        className="btn-secondary inline-flex items-center justify-center gap-2"
                      >
                        Do quiz
                        <ArrowRight className="h-4 w-4" />
                      </Link>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </section>

          <aside className="space-y-4 xl:sticky xl:top-6 xl:self-start">
            <Card>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-blue-700 ring-1 ring-blue-100">
                  <Sparkles className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="font-semibold text-gray-900">Create practice</h2>
                  <p className="text-sm text-gray-500">Short and focused beats broad chat.</p>
                </div>
              </div>

              <div className="mt-5 grid grid-cols-2 gap-2 rounded-lg bg-gray-100 p-1">
                {[
                  { value: "generate", label: "Generate" },
                  { value: "manual", label: "Manual" },
                ].map((item) => (
                  <button
                    key={item.value}
                    type="button"
                    onClick={() => setMode(item.value as Mode)}
                    className={`rounded-md px-3 py-2 text-sm font-semibold transition ${
                      mode === item.value ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-900"
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>

              <div className="mt-5 grid grid-cols-2 gap-3">
                <label>
                  <span className="field-label">Level</span>
                  <select value={level} onChange={(event) => setLevel(event.target.value)} className="field">
                    {LEVELS.map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span className="field-label">Questions</span>
                  <input
                    type="number"
                    min={3}
                    max={10}
                    value={questionCount}
                    onChange={(event) => setQuestionCount(Number(event.target.value))}
                    className="field"
                  />
                </label>
              </div>

              <label className="mt-4 block">
                <span className="field-label">Topic</span>
                <select value={topic} onChange={(event) => setTopic(event.target.value)} className="field capitalize">
                  {TOPICS.map((item) => (
                    <option key={item} value={item}>
                      {formatTopic(item)}
                    </option>
                  ))}
                </select>
              </label>

              {mode === "generate" ? (
                <div className="mt-5 space-y-4">
                  <div>
                    <span className="field-label">Source</span>
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        { value: "mistakes", label: "Mistakes", icon: Brain },
                        { value: "topic", label: "Topic", icon: BookOpenCheck },
                      ].map((item) => (
                        <button
                          key={item.value}
                          type="button"
                          onClick={() => setSource(item.value as "mistakes" | "topic")}
                          className={`rounded-lg border p-3 text-left transition ${
                            source === item.value
                              ? "border-blue-300 bg-blue-50 text-blue-800"
                              : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
                          }`}
                        >
                          <item.icon className="mb-2 h-4 w-4" />
                          <span className="text-sm font-semibold">{item.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  <label className="block">
                    <span className="field-label">Extra focus</span>
                    <textarea
                      value={focus}
                      onChange={(event) => setFocus(event.target.value)}
                      placeholder="Past tense, polite requests, interview answers..."
                      className="field min-h-24 resize-none"
                    />
                  </label>

                  <button
                    type="button"
                    disabled={generating}
                    onClick={handleGenerate}
                    className="btn-primary inline-flex w-full items-center justify-center gap-2"
                  >
                    {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                    Generate quiz
                  </button>
                </div>
              ) : (
                <div className="mt-5 space-y-4">
                  <label className="block">
                    <span className="field-label">Title</span>
                    <input
                      value={manualTitle}
                      onChange={(event) => setManualTitle(event.target.value)}
                      className="field"
                    />
                  </label>

                  <div className="max-h-[520px] space-y-4 overflow-y-auto pr-1">
                    {manualQuestions.map((question, index) => (
                      <div key={question.id} className="rounded-lg border border-gray-200 bg-white p-4">
                        <div className="mb-3 flex items-center justify-between gap-3">
                          <Badge variant="info">Question {index + 1}</Badge>
                          <div className="flex items-center gap-2">
                            <select
                              value={question.type}
                              onChange={(event) =>
                                updateManualQuestion(index, {
                                  type: event.target.value as ManualQuestion["type"],
                                  options: event.target.value === "multiple_choice" ? question.options : [],
                                })
                              }
                              className="rounded-lg border border-gray-300 bg-white px-2 py-1 text-xs"
                            >
                              <option value="multiple_choice">Multiple choice</option>
                              <option value="fill_blank">Fill blank</option>
                            </select>
                            <button
                              type="button"
                              onClick={() => removeManualQuestion(index)}
                              className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600"
                              aria-label="Remove question"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </div>

                        <input
                          value={question.prompt}
                          onChange={(event) => updateManualQuestion(index, { prompt: event.target.value })}
                          placeholder="Question prompt"
                          className="field"
                        />

                        {question.type === "multiple_choice" && (
                          <div className="mt-2 grid grid-cols-2 gap-2">
                            {question.options.map((option, optionIndex) => (
                              <input
                                key={optionIndex}
                                value={option}
                                onChange={(event) => updateOption(index, optionIndex, event.target.value)}
                                placeholder={`Option ${optionIndex + 1}`}
                                className="field"
                              />
                            ))}
                          </div>
                        )}

                        <input
                          value={question.correct_answer}
                          onChange={(event) => updateManualQuestion(index, { correct_answer: event.target.value })}
                          placeholder="Correct answer"
                          className="field mt-2"
                        />
                        <input
                          value={question.explanation}
                          onChange={(event) => updateManualQuestion(index, { explanation: event.target.value })}
                          placeholder="Short explanation"
                          className="field mt-2"
                        />
                      </div>
                    ))}
                  </div>

                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setManualQuestions((prev) => [...prev, emptyManualQuestion(prev.length + 1)])}
                      className="btn-secondary inline-flex items-center gap-2"
                    >
                      <Plus className="h-4 w-4" />
                      Add
                    </button>
                    <button
                      type="button"
                      disabled={savingManual}
                      onClick={handleManualSave}
                      className="btn-primary inline-flex flex-1 items-center justify-center gap-2"
                    >
                      {savingManual ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                      Save quiz
                    </button>
                  </div>
                </div>
              )}
            </Card>

            <div className="rounded-lg border border-blue-100 bg-blue-50 p-4">
              <div className="flex gap-3">
                <FilePlus2 className="mt-0.5 h-5 w-5 text-blue-700" />
                <div>
                  <p className="text-sm font-semibold text-blue-900">Demo-safe flow</p>
                  <p className="mt-1 text-sm text-blue-800">
                    Conversation creates mistakes. Quiz turns those mistakes into measurable practice.
                  </p>
                </div>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </Layout>
  );
}
