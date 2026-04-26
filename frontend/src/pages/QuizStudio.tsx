import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ArrowRight,
  BookOpenCheck,
  Brain,
  CheckCircle2,
  Loader2,
  Plus,
  RefreshCw,
  Sparkles,
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

export default function QuizStudio() {
  const navigate = useNavigate();
  const { topic: currentTopic, level: currentLevel } = useUserStore();
  const [quizzes, setQuizzes] = useState<QuizListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [savingManual, setSavingManual] = useState(false);
  const [error, setError] = useState("");

  const [source, setSource] = useState<"mistakes" | "topic">("mistakes");
  const [topic, setTopic] = useState(currentTopic || "free_conversation");
  const [level, setLevel] = useState(currentLevel || "B1");
  const [questionCount, setQuestionCount] = useState(5);
  const [focus, setFocus] = useState("");

  const [manualTitle, setManualTitle] = useState("Custom English quiz");
  const [manualQuestions, setManualQuestions] = useState<ManualQuestion[]>([
    emptyManualQuestion(1),
  ]);

  const topicLabel = useMemo(() => topic.replace(/_/g, " "), [topic]);

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
        title: manualTitle.trim() || "Custom English quiz",
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
      <div className="max-w-6xl mx-auto px-4 py-8">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mb-7">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Quiz Studio</h1>
              <p className="text-sm text-gray-500 mt-1">
                Build short English drills from conversation mistakes or a selected topic.
              </p>
            </div>
            <button
              type="button"
              onClick={loadQuizzes}
              className="btn-secondary inline-flex items-center gap-2"
            >
              <RefreshCw className="w-4 h-4" />
              Refresh
            </button>
          </div>
        </motion.div>

        {error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
            {error}
          </div>
        )}

        <div className="grid lg:grid-cols-[0.95fr_1.05fr] gap-6 mb-8">
          <Card>
            <div className="flex items-center gap-3 mb-5">
              <div className="w-9 h-9 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
                <Sparkles className="w-5 h-5" />
              </div>
              <div>
                <h2 className="font-semibold text-gray-900">Generate with AI</h2>
                <p className="text-xs text-gray-500">Best for quick demo and post-session practice.</p>
              </div>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <label className="text-sm">
                  <span className="block text-xs font-medium text-gray-500 mb-1">Level</span>
                  <select
                    value={level}
                    onChange={(event) => setLevel(event.target.value)}
                    className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-100"
                  >
                    {LEVELS.map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-sm">
                  <span className="block text-xs font-medium text-gray-500 mb-1">Questions</span>
                  <input
                    type="number"
                    min={3}
                    max={10}
                    value={questionCount}
                    onChange={(event) => setQuestionCount(Number(event.target.value))}
                    className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-100"
                  />
                </label>
              </div>

              <label className="text-sm block">
                <span className="block text-xs font-medium text-gray-500 mb-1">Topic</span>
                <select
                  value={topic}
                  onChange={(event) => setTopic(event.target.value)}
                  className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 capitalize focus:outline-none focus:ring-2 focus:ring-primary-100"
                >
                  {TOPICS.map((item) => (
                    <option key={item} value={item}>
                      {item.replace(/_/g, " ")}
                    </option>
                  ))}
                </select>
              </label>

              <div className="grid grid-cols-2 gap-2">
                {[
                  { value: "mistakes", label: "From mistakes", icon: Brain },
                  { value: "topic", label: "From topic", icon: BookOpenCheck },
                ].map((item) => (
                  <button
                    key={item.value}
                    type="button"
                    onClick={() => setSource(item.value as "mistakes" | "topic")}
                    className={`rounded-lg border px-3 py-3 text-left transition ${
                      source === item.value
                        ? "border-primary-300 bg-primary-50 text-primary-700"
                        : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
                    }`}
                  >
                    <item.icon className="w-4 h-4 mb-2" />
                    <span className="text-sm font-medium">{item.label}</span>
                  </button>
                ))}
              </div>

              <label className="text-sm block">
                <span className="block text-xs font-medium text-gray-500 mb-1">Extra focus</span>
                <textarea
                  value={focus}
                  onChange={(event) => setFocus(event.target.value)}
                  placeholder="Past tense, speaking politely, interview answers..."
                  className="w-full min-h-20 resize-none rounded-lg border border-gray-200 bg-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-100"
                />
              </label>

              <button
                type="button"
                disabled={generating}
                onClick={handleGenerate}
                className="btn-primary w-full inline-flex items-center justify-center gap-2"
              >
                {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                Generate quiz
              </button>
            </div>
          </Card>

          <Card>
            <div className="flex items-center gap-3 mb-5">
              <div className="w-9 h-9 rounded-lg bg-green-50 text-green-600 flex items-center justify-center">
                <Plus className="w-5 h-5" />
              </div>
              <div>
                <h2 className="font-semibold text-gray-900">Manual quiz</h2>
                <p className="text-xs text-gray-500">A small creator for controlled demo questions.</p>
              </div>
            </div>

            <label className="text-sm block mb-3">
              <span className="block text-xs font-medium text-gray-500 mb-1">Title</span>
              <input
                value={manualTitle}
                onChange={(event) => setManualTitle(event.target.value)}
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-100"
              />
            </label>

            <div className="space-y-3 max-h-[430px] overflow-y-auto pr-1">
              {manualQuestions.map((question, index) => (
                <div key={question.id} className="rounded-lg border border-gray-200 bg-white p-4">
                  <div className="flex items-center justify-between mb-3">
                    <Badge variant="info">Question {index + 1}</Badge>
                    <select
                      value={question.type}
                      onChange={(event) =>
                        updateManualQuestion(index, {
                          type: event.target.value as ManualQuestion["type"],
                          options:
                            event.target.value === "multiple_choice" ? question.options : [],
                        })
                      }
                      className="rounded-lg border border-gray-200 bg-white px-2 py-1 text-xs"
                    >
                      <option value="multiple_choice">Multiple choice</option>
                      <option value="fill_blank">Fill blank</option>
                    </select>
                  </div>
                  <input
                    value={question.prompt}
                    onChange={(event) => updateManualQuestion(index, { prompt: event.target.value })}
                    placeholder="Question prompt"
                    className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-100"
                  />
                  {question.type === "multiple_choice" && (
                    <div className="grid grid-cols-2 gap-2 mt-2">
                      {question.options.map((option, optionIndex) => (
                        <input
                          key={optionIndex}
                          value={option}
                          onChange={(event) => {
                            const nextOptions = [...question.options];
                            nextOptions[optionIndex] = event.target.value;
                            updateManualQuestion(index, { options: nextOptions });
                          }}
                          placeholder={`Option ${optionIndex + 1}`}
                          className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-100"
                        />
                      ))}
                    </div>
                  )}
                  <input
                    value={question.correct_answer}
                    onChange={(event) => updateManualQuestion(index, { correct_answer: event.target.value })}
                    placeholder="Correct answer"
                    className="mt-2 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-100"
                  />
                  <input
                    value={question.explanation}
                    onChange={(event) => updateManualQuestion(index, { explanation: event.target.value })}
                    placeholder="Short explanation"
                    className="mt-2 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-100"
                  />
                </div>
              ))}
            </div>

            <div className="flex gap-2 mt-4">
              <button
                type="button"
                onClick={() => setManualQuestions((prev) => [...prev, emptyManualQuestion(prev.length + 1)])}
                className="btn-secondary inline-flex items-center gap-2"
              >
                <Plus className="w-4 h-4" />
                Add
              </button>
              <button
                type="button"
                disabled={savingManual}
                onClick={handleManualSave}
                className="btn-primary flex-1 inline-flex items-center justify-center gap-2"
              >
                {savingManual ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                Save quiz
              </button>
            </div>
          </Card>
        </div>

        <Card>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-semibold text-gray-900">Your quizzes</h2>
              <p className="text-xs text-gray-500">Current focus: {level} · {topicLabel}</p>
            </div>
            <Badge>{quizzes.length} quizzes</Badge>
          </div>

          {loading ? (
            <div className="flex items-center gap-3 text-sm text-gray-500 py-6">
              <Loader2 className="w-4 h-4 animate-spin" />
              Loading quizzes...
            </div>
          ) : quizzes.length === 0 ? (
            <p className="text-sm text-gray-400 py-6">No quiz yet. Generate one from your mistakes.</p>
          ) : (
            <div className="divide-y divide-gray-100">
              {quizzes.map((quiz) => (
                <div key={quiz.id} className="py-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-medium text-gray-900">{quiz.title}</h3>
                      <Badge variant={quiz.source === "mistakes" ? "warning" : "info"}>
                        {quiz.source}
                      </Badge>
                      {quiz.latest_score != null && (
                        <Badge variant={quiz.latest_score >= 70 ? "success" : "error"}>
                          {quiz.latest_score}%
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 mt-1">
                      {quiz.level} · {quiz.topic.replace(/_/g, " ")} · {quiz.question_count} questions
                    </p>
                  </div>
                  <Link to={`/quizzes/${quiz.id}`} className="btn-secondary inline-flex items-center justify-center gap-2">
                    Do quiz
                    <ArrowRight className="w-4 h-4" />
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
