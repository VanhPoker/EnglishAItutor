import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  CheckCircle2,
  ClipboardList,
  Download,
  FilePlus2,
  Globe2,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Sparkles,
  Trash2,
  Upload,
} from "lucide-react";
import Layout from "../components/ui/Layout";
import Card from "../components/ui/Card";
import Badge from "../components/ui/Badge";
import {
  createQuiz,
  deleteQuiz,
  generateQuizSetsFromSources,
  generateQuiz,
  getAdminQuiz,
  getQuizzes,
  importQuizzes,
  importQuizzesFromSource,
  syncCuratedQuizLibrary,
  updateQuiz,
  uploadQuizImage,
  type QuizCreateRequest,
  type QuizImportItem,
  type QuizListItem,
  type QuizSourcePreset,
} from "../lib/api";
import { questionTypeLabel, quizSourceLabel, topicLabel } from "../lib/labels";
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

const SOURCE_PRESETS: Array<{
  value: QuizSourcePreset;
  label: string;
  description: string;
  url?: string;
}> = [
  {
    value: "cefr_core",
    label: "CEFR",
    description: "Sinh bài theo năng lực A1-C2, hợp để chứng minh độ khó có chuẩn.",
    url: "coe.int",
  },
  {
    value: "wikibooks_grammar",
    label: "Wikibooks Grammar",
    description: "Lấy ngữ cảnh ngữ pháp mở để tạo câu hỏi grammar và cấu trúc câu.",
    url: "en.wikibooks.org",
  },
  {
    value: "tatoeba_sentences",
    label: "Tatoeba style",
    description: "Tạo bài luyện câu ngắn, từ vựng và điền từ theo kiểu corpus câu mở.",
    url: "tatoeba.org",
  },
  {
    value: "thpt_2025_format",
    label: "THPT 2025",
    description: "Tạo câu hỏi theo format đọc hiểu, từ vựng, ngữ pháp kiểu đề tốt nghiệp.",
    url: "chinhphu.vn",
  },
  {
    value: "custom_url",
    label: "URL riêng",
    description: "Dán trang tài liệu công khai để AI tạo quiz từ ngữ cảnh đó.",
  },
];

type ManualQuestion = QuizCreateRequest["questions"][number];
type Mode = "generate" | "manual" | "import" | "source";

function emptyManualQuestion(index: number): ManualQuestion {
  return {
    id: `q${index}`,
    type: "multiple_choice",
    prompt: "",
    options: ["", "", "", ""],
    correct_answer: "",
    explanation: "",
    focus: "grammar",
    image_url: "",
  };
}

function normalizeHeader(value: string) {
  return value.trim().toLowerCase().replace(/[\s-]+/g, "_");
}

function parseDelimitedOptions(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }
  if (typeof value !== "string") return [];
  return value
    .split("|")
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (char === '"' && inQuotes && next === '"') {
      cell += '"';
      i += 1;
      continue;
    }
    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (char === "," && !inQuotes) {
      row.push(cell.trim());
      cell = "";
      continue;
    }
    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") i += 1;
      row.push(cell.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      cell = "";
      continue;
    }
    cell += char;
  }

  row.push(cell.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

function firstValue(row: Record<string, string>, keys: string[]) {
  for (const key of keys) {
    const value = row[key];
    if (value?.trim()) return value.trim();
  }
  return "";
}

function normalizeQuestion(raw: any, index: number): ManualQuestion | null {
  const prompt = String(raw.prompt || raw.question || raw.question_text || "").trim();
  const correctAnswer = String(raw.correct_answer || raw.answer || raw.correct || raw.correct_option || "").trim();
  if (!prompt || !correctAnswer) return null;

  const rawType = String(raw.type || raw.question_type || "multiple_choice").toLowerCase();
  const type = rawType.includes("fill") || rawType.includes("blank") ? "fill_blank" : "multiple_choice";
  const options = type === "multiple_choice"
    ? [
        ...parseDelimitedOptions(raw.options),
        raw.option_a,
        raw.option_b,
        raw.option_c,
        raw.option_d,
        raw.option_e,
        raw.option_f,
        raw.a,
        raw.b,
        raw.c,
        raw.d,
        raw.e,
        raw.f,
      ]
        .map((item) => String(item || "").trim())
        .filter(Boolean)
        .slice(0, 6)
    : [];

  return {
    id: String(raw.id || `q${index}`),
    type,
    prompt,
    options,
    correct_answer: correctAnswer,
    explanation: String(raw.explanation || raw.explain || "").trim(),
    focus: String(raw.focus || raw.skill || "grammar").trim() || "grammar",
    image_url: String(raw.image_url || raw.image || raw.image_link || raw.prompt_image || "").trim(),
  };
}

function normalizeQuiz(raw: any, fallbackTopic: string, fallbackLevel: string, index: number): QuizImportItem | null {
  const rawQuestions: any[] = Array.isArray(raw.questions) ? raw.questions : [];
  const questions = rawQuestions
    .map((question, questionIndex) => normalizeQuestion(question, questionIndex + 1))
    .filter(Boolean) as ManualQuestion[];
  if (!questions.length) return null;

  return {
    title: String(raw.title || raw.quiz_title || `Bộ quiz import ${index}`).trim(),
    topic: String(raw.topic || fallbackTopic).trim() || fallbackTopic,
    level: String(raw.level || fallbackLevel).trim() || fallbackLevel,
    description: String(raw.description || "").trim() || undefined,
    questions,
  };
}

function parseJsonImport(text: string, fallbackTopic: string, fallbackLevel: string): QuizImportItem[] {
  const parsed = JSON.parse(text);
  const rawQuizzes = Array.isArray(parsed)
    ? parsed
    : Array.isArray(parsed.quizzes)
    ? parsed.quizzes
    : parsed.questions
    ? [parsed]
    : [];

  return rawQuizzes
    .map((item: any, index: number) => normalizeQuiz(item, fallbackTopic, fallbackLevel, index + 1))
    .filter(Boolean) as QuizImportItem[];
}

function parseCsvImport(text: string, fallbackTopic: string, fallbackLevel: string): QuizImportItem[] {
  const rows = parseCsvRows(text);
  if (rows.length < 2) return [];

  const headers = rows[0].map(normalizeHeader);
  const grouped = new Map<string, QuizImportItem>();

  rows.slice(1).forEach((values, rowIndex) => {
    const row = Object.fromEntries(headers.map((header, index) => [header, values[index] || ""]));
    const title = firstValue(row, ["quiz_title", "title", "quiz"]) || "Bộ quiz import";
    const rowTopic = firstValue(row, ["topic", "category"]) || fallbackTopic;
    const rowLevel = firstValue(row, ["level", "cefr_level"]) || fallbackLevel;
    const description = firstValue(row, ["description", "desc"]);
    const key = `${title}|||${rowTopic}|||${rowLevel}|||${description}`;
    const question = normalizeQuestion(
      {
        id: firstValue(row, ["id", "question_id"]) || `q${rowIndex + 1}`,
        type: firstValue(row, ["type", "question_type"]),
        prompt: firstValue(row, ["prompt", "question", "question_text"]),
        image_url: firstValue(row, ["image_url", "image", "image_link", "prompt_image"]),
        options: firstValue(row, ["options"]),
        option_a: firstValue(row, ["option_a", "option_1", "a"]),
        option_b: firstValue(row, ["option_b", "option_2", "b"]),
        option_c: firstValue(row, ["option_c", "option_3", "c"]),
        option_d: firstValue(row, ["option_d", "option_4", "d"]),
        option_e: firstValue(row, ["option_e", "option_5", "e"]),
        option_f: firstValue(row, ["option_f", "option_6", "f"]),
        correct_answer: firstValue(row, ["correct_answer", "answer", "correct", "correct_option"]),
        explanation: firstValue(row, ["explanation", "explain"]),
        focus: firstValue(row, ["focus", "skill"]),
      },
      rowIndex + 1
    );
    if (!question) return;

    if (!grouped.has(key)) {
      grouped.set(key, {
        title,
        topic: rowTopic,
        level: rowLevel,
        description: description || undefined,
        questions: [],
      });
    }
    grouped.get(key)!.questions.push(question);
  });

  return Array.from(grouped.values()).filter((item) => item.questions.length > 0);
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("vi-VN", {
    month: "short",
    day: "numeric",
  });
}

export default function QuizStudio() {
  const { topic: currentTopic, level: currentLevel } = useUserStore();
  const [quizzes, setQuizzes] = useState<QuizListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [savingManual, setSavingManual] = useState(false);
  const [importing, setImporting] = useState(false);
  const [sourceImporting, setSourceImporting] = useState(false);
  const [sourceSetGenerating, setSourceSetGenerating] = useState(false);
  const [curatedSyncing, setCuratedSyncing] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [editingQuizId, setEditingQuizId] = useState<string | null>(null);
  const [loadingEditId, setLoadingEditId] = useState<string | null>(null);
  const [uploadingImageFor, setUploadingImageFor] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [actionMessage, setActionMessage] = useState("");

  const [mode, setMode] = useState<Mode>("generate");
  const [topic, setTopic] = useState(currentTopic || "free_conversation");
  const [level, setLevel] = useState(currentLevel || "B1");
  const [questionCount, setQuestionCount] = useState(5);
  const [focus, setFocus] = useState("");

  const [manualTitle, setManualTitle] = useState("Bài quiz tiếng Anh theo mục tiêu");
  const [manualQuestions, setManualQuestions] = useState<ManualQuestion[]>([
    emptyManualQuestion(1),
  ]);
  const [importFileName, setImportFileName] = useState("");
  const [importPreview, setImportPreview] = useState<QuizImportItem[]>([]);
  const [importMessage, setImportMessage] = useState("");
  const [sourcePreset, setSourcePreset] = useState<QuizSourcePreset>("cefr_core");
  const [sourceUrl, setSourceUrl] = useState("");
  const [sourceQuizCount, setSourceQuizCount] = useState(3);
  const [sourceFocus, setSourceFocus] = useState("");
  const [sourceMessage, setSourceMessage] = useState("");

  const selectedSourcePreset = useMemo(
    () => SOURCE_PRESETS.find((item) => item.value === sourcePreset) || SOURCE_PRESETS[0],
    [sourcePreset]
  );
  const importQuestionCount = importPreview.reduce((sum, item) => sum + item.questions.length, 0);

  const loadQuizzes = async () => {
    setLoading(true);
    try {
      setQuizzes(await getQuizzes());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không tải được danh sách quiz");
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
    setActionMessage("");
    try {
      const quiz = await generateQuiz({
        topic,
        level,
        question_count: questionCount,
        source: "topic",
        focus: focus.trim() || undefined,
      });
      await loadQuizzes();
      setActionMessage(`Đã tạo quiz "${quiz.title}". Học viên sẽ thấy bài này trong kho đề.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không tạo được quiz");
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

  const resetManualForm = () => {
    setEditingQuizId(null);
    setManualTitle("Bài quiz tiếng Anh theo mục tiêu");
    setManualQuestions([emptyManualQuestion(1)]);
  };

  const handleQuestionImageUpload = async (index: number, file: File | null) => {
    if (!file) return;
    const question = manualQuestions[index];
    setUploadingImageFor(question.id);
    setError("");
    try {
      const uploaded = await uploadQuizImage(file);
      updateManualQuestion(index, { image_url: uploaded.url });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không tải được ảnh câu hỏi");
    } finally {
      setUploadingImageFor(null);
    }
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
        image_url: question.image_url?.trim() || undefined,
      }))
      .filter((question) => question.prompt && question.correct_answer);

    if (!cleaned.length) {
      setError("Hãy thêm ít nhất một câu hỏi đầy đủ.");
      return;
    }

    setSavingManual(true);
    setError("");
    setActionMessage("");
    try {
      const payload = {
        title: manualTitle.trim() || "Bài quiz tiếng Anh theo mục tiêu",
        topic,
        level,
        questions: cleaned,
      };
      const quiz = editingQuizId
        ? await updateQuiz(editingQuizId, payload)
        : await createQuiz({ ...payload, source: "manual" });
      await loadQuizzes();
      setActionMessage(editingQuizId ? `Đã cập nhật quiz "${quiz.title}".` : `Đã lưu quiz "${quiz.title}".`);
      resetManualForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không lưu được quiz");
    } finally {
      setSavingManual(false);
    }
  };

  const handleImportFile = async (file: File | null) => {
    setImportMessage("");
    setError("");
    setImportFileName(file?.name || "");
    setImportPreview([]);
    if (!file) return;

    try {
      const text = await file.text();
      const lowerName = file.name.toLowerCase();
      const parsed = lowerName.endsWith(".json")
        ? parseJsonImport(text, topic, level)
        : parseCsvImport(text, topic, level);

      if (!parsed.length) {
        setError("Không tìm thấy quiz hợp lệ trong file. Hãy kiểm tra header CSV hoặc cấu trúc JSON.");
        return;
      }
      setImportPreview(parsed);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không đọc được file import");
    }
  };

  const handleImportSubmit = async () => {
    if (!importPreview.length) {
      setError("Hãy chọn file CSV hoặc JSON trước khi import.");
      return;
    }

    setImporting(true);
    setError("");
    setActionMessage("");
    setImportMessage("");
    try {
      const response = await importQuizzes(importPreview);
      await loadQuizzes();
      setImportMessage(`Đã import ${response.imported_count} quiz với ${response.question_count} câu hỏi.`);
      setImportPreview([]);
      setImportFileName("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import file thất bại");
    } finally {
      setImporting(false);
    }
  };

  const handleSourceImport = async () => {
    if (sourcePreset === "custom_url" && !sourceUrl.trim()) {
      setError("Hãy nhập URL nguồn để tạo quiz.");
      return;
    }

    setSourceImporting(true);
    setError("");
    setActionMessage("");
    setSourceMessage("");
    try {
      const response = await importQuizzesFromSource({
        preset: sourcePreset,
        source_url: sourceUrl.trim() || undefined,
        topic,
        level,
        quiz_count: sourceQuizCount,
        questions_per_quiz: questionCount,
        focus: sourceFocus.trim() || undefined,
      });
      await loadQuizzes();
      setSourceMessage(
        `Đã tạo ${response.imported_count} quiz với ${response.question_count} câu từ ${response.source_title}.`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không tạo được quiz từ nguồn mở");
    } finally {
      setSourceImporting(false);
    }
  };

  const handleGenerateSourceSets = async () => {
    setSourceSetGenerating(true);
    setError("");
    setActionMessage("");
    setSourceMessage("");
    try {
      const response = await generateQuizSetsFromSources({
        topic,
        level,
        quiz_count_per_set: sourceQuizCount,
        questions_per_quiz: questionCount,
        focus: sourceFocus.trim() || undefined,
      });
      await loadQuizzes();
      setSourceMessage(
        `Đã tạo ${response.generated_count} bộ quiz từ các nguồn với ${response.quiz_count} bài và ${response.question_count} câu.`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không tạo được các bộ quiz từ nguồn");
    } finally {
      setSourceSetGenerating(false);
    }
  };

  const handleCuratedSync = async () => {
    const confirmed = window.confirm(
      "Thay toàn bộ quiz nguồn mở hiện tại bằng bộ dữ liệu curated mới? Các lượt làm bài gắn với quiz nguồn mở cũ cũng sẽ bị xoá."
    );
    if (!confirmed) return;

    setCuratedSyncing(true);
    setError("");
    setActionMessage("");
    setSourceMessage("");
    try {
      const response = await syncCuratedQuizLibrary(true);
      await loadQuizzes();
      setSourceMessage(
        `Đã thay ${response.deleted_quiz_count} quiz cũ bằng ${response.imported_set_count} bộ mới (${response.imported_quiz_count} quiz, ${response.question_count} câu).`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không đồng bộ được bộ dữ liệu curated");
    } finally {
      setCuratedSyncing(false);
    }
  };

  const handleDeleteQuiz = async (quiz: QuizListItem) => {
    if (!window.confirm(`Xoá quiz "${quiz.title}" khỏi kho đề?`)) return;

    setDeletingId(quiz.id);
    setError("");
    setActionMessage("");
    try {
      await deleteQuiz(quiz.id);
      await loadQuizzes();
      if (editingQuizId === quiz.id) {
        resetManualForm();
      }
      setActionMessage(`Đã xoá quiz "${quiz.title}".`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không xoá được quiz");
    } finally {
      setDeletingId(null);
    }
  };

  const handleEditQuiz = async (quiz: QuizListItem) => {
    setLoadingEditId(quiz.id);
    setError("");
    setActionMessage("");
    try {
      const detail = await getAdminQuiz(quiz.id);
      setEditingQuizId(detail.id);
      setManualTitle(detail.title);
      setTopic(detail.topic);
      setLevel(detail.level);
      setManualQuestions(
        detail.questions.map((question, index) => ({
          id: question.id || `q${index + 1}`,
          type: question.type,
          prompt: question.prompt,
          options: question.type === "multiple_choice" ? [...question.options, "", "", "", ""].slice(0, 4) : [],
          correct_answer: question.correct_answer,
          explanation: question.explanation,
          focus: question.focus,
          image_url: question.image_url || "",
        }))
      );
      setMode("manual");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không tải được quiz để sửa");
    } finally {
      setLoadingEditId(null);
    }
  };

  const downloadSampleCsv = () => {
    const sample = [
      "quiz_title,topic,level,type,prompt,image_url,option_a,option_b,option_c,option_d,correct_answer,explanation,focus",
      '"Basic Grammar A2",daily_life,A2,multiple_choice,"Choose the correct sentence.","https://example.com/classroom.jpg","She goes to school.","She go to school.","She going to school.","She gone to school.",A,"Use goes with she/he/it.","grammar"',
      '"Basic Grammar A2",daily_life,A2,fill_blank,"Complete: I have lived here ___ 2020.",,,,,since,"Use since with a starting point.","grammar"',
    ].join("\n");
    const blob = new Blob([sample], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "english-quiz-import-sample.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Layout>
      <div className="page-shell">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-sm font-semibold text-blue-700">Quản trị kho đề</p>
              <h1 className="mt-1 text-3xl font-bold text-gray-900">Quản lý quiz tiếng Anh</h1>
              <p className="mt-2 max-w-2xl text-sm text-gray-600">
                Tạo, import và quản lý các bộ quiz để học viên vào làm bài.
              </p>
            </div>
            <button
              type="button"
              onClick={loadQuizzes}
              className="btn-secondary inline-flex items-center justify-center gap-2"
            >
              <RefreshCw className="h-4 w-4" />
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

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
          <section className="space-y-6">
            <Card>
              <div className="grid gap-4 md:grid-cols-3">
                <div className="rounded-lg bg-gray-50 p-4">
                  <p className="text-sm text-gray-500">Quiz trong kho</p>
                  <p className="mt-1 text-2xl font-bold text-gray-900">{quizzes.length}</p>
                </div>
                <div className="rounded-lg bg-gray-50 p-4">
                  <p className="text-sm text-gray-500">Trình độ hiện tại</p>
                  <p className="mt-1 text-2xl font-bold text-gray-900">{level}</p>
                </div>
                <div className="rounded-lg bg-gray-50 p-4">
                  <p className="text-sm text-gray-500">Chế độ</p>
                  <p className="mt-1 text-2xl font-bold text-gray-900">
                    Quản trị
                  </p>
                </div>
              </div>
            </Card>

            <Card>
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <h2 className="font-semibold text-gray-900">Kho quiz</h2>
                  <p className="mt-1 text-sm text-gray-500">
                    Học viên sẽ chỉ thấy danh sách bài để làm, không thấy công cụ tạo đề.
                  </p>
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
                  <h3 className="mt-3 font-semibold text-gray-900">Chưa có quiz</h3>
                  <p className="mt-1 text-sm text-gray-500">
                    Tạo bằng AI, import file hoặc nhập thủ công để học viên có bài làm.
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
                            {quizSourceLabel(quiz.source)}
                          </Badge>
                          {quiz.quiz_set_title && (
                            <Badge variant="success">{quiz.quiz_set_title}</Badge>
                          )}
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
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={loadingEditId === quiz.id}
                          onClick={() => void handleEditQuiz(quiz)}
                          className="btn-secondary inline-flex items-center justify-center gap-2"
                        >
                          {loadingEditId === quiz.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Pencil className="h-4 w-4" />}
                          Sửa
                        </button>
                        <button
                          type="button"
                          disabled={deletingId === quiz.id}
                          onClick={() => void handleDeleteQuiz(quiz)}
                          className="btn-secondary inline-flex items-center justify-center gap-2 text-red-600 hover:bg-red-50 hover:text-red-700"
                        >
                          {deletingId === quiz.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                          Xoá
                        </button>
                      </div>
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
                  <h2 className="font-semibold text-gray-900">Tạo bộ quiz</h2>
                  <p className="text-sm text-gray-500">Bộ đề chung cho học viên.</p>
                </div>
              </div>

              <div className="mt-5 grid grid-cols-2 gap-2 rounded-lg bg-gray-100 p-1 md:grid-cols-4">
                {[
                  { value: "generate", label: "Tạo bằng AI" },
                  { value: "source", label: "Nguồn mở" },
                  { value: "manual", label: "Tự tạo" },
                  { value: "import", label: "Import file" },
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
                  <span className="field-label">Trình độ</span>
                  <select value={level} onChange={(event) => setLevel(event.target.value)} className="field">
                    {LEVELS.map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span className="field-label">Số câu</span>
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
                <span className="field-label">Chủ đề</span>
                <select value={topic} onChange={(event) => setTopic(event.target.value)} className="field capitalize">
                  {TOPICS.map((item) => (
                    <option key={item} value={item}>
                      {topicLabel(item)}
                    </option>
                  ))}
                </select>
              </label>

              {mode === "generate" ? (
                <div className="mt-5 space-y-4">
                  <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">
                    AI sẽ tạo bộ câu hỏi theo trình độ, chủ đề và trọng tâm bạn nhập. Phần này không phụ thuộc dữ liệu hội thoại của học viên.
                  </div>

                  <label className="block">
                    <span className="field-label">Trọng tâm thêm</span>
                    <textarea
                      value={focus}
                      onChange={(event) => setFocus(event.target.value)}
                      placeholder="Thì quá khứ, cách nói lịch sự, trả lời phỏng vấn..."
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
                    Tạo quiz
                  </button>
                </div>
              ) : mode === "source" ? (
                <div className="mt-5 space-y-4">
                  <div>
                    <span className="field-label">Nguồn tham khảo</span>
                    <div className="space-y-2">
                      {SOURCE_PRESETS.map((item) => (
                        <button
                          key={item.value}
                          type="button"
                          onClick={() => setSourcePreset(item.value)}
                          className={`w-full rounded-lg border p-3 text-left transition ${
                            sourcePreset === item.value
                              ? "border-blue-300 bg-blue-50 text-blue-900"
                              : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
                          }`}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-sm font-semibold">{item.label}</span>
                            {item.url && <span className="text-xs text-gray-500">{item.url}</span>}
                          </div>
                          <p className="mt-1 text-xs leading-5 text-gray-500">{item.description}</p>
                        </button>
                      ))}
                    </div>
                  </div>

                  <label className="block">
                    <span className="field-label">
                      {sourcePreset === "custom_url" ? "URL nguồn" : "URL tuỳ chọn"}
                    </span>
                    <input
                      value={sourceUrl}
                      onChange={(event) => setSourceUrl(event.target.value)}
                      placeholder={
                        sourcePreset === "custom_url"
                          ? "https://..."
                          : `Để trống để dùng nguồn mặc định ${selectedSourcePreset.url || ""}`
                      }
                      className="field"
                    />
                  </label>

                  <div className="grid grid-cols-2 gap-3">
                    <label>
                      <span className="field-label">Số bộ quiz</span>
                      <input
                        type="number"
                        min={1}
                        max={10}
                        value={sourceQuizCount}
                        onChange={(event) => {
                          const next = Number(event.target.value);
                          setSourceQuizCount(Math.min(10, Math.max(1, Number.isFinite(next) ? next : 1)));
                        }}
                        className="field"
                      />
                    </label>
                    <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                      <p className="text-xs font-semibold uppercase text-gray-500">Tổng câu</p>
                      <p className="mt-1 text-xl font-bold text-gray-900">{sourceQuizCount * questionCount}</p>
                    </div>
                  </div>

                  <label className="block">
                    <span className="field-label">Trọng tâm</span>
                    <textarea
                      value={sourceFocus}
                      onChange={(event) => setSourceFocus(event.target.value)}
                      placeholder="Ví dụ: đọc hiểu, mệnh đề quan hệ, từ vựng du lịch, dạng đề THPT..."
                      className="field min-h-24 resize-none"
                    />
                  </label>

                  <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                    Luồng này chỉ tạo quiz khi đọc được nội dung nguồn và sinh được câu hỏi hợp lệ. Nếu nguồn lỗi, hệ
                    thống sẽ dừng và báo lỗi thay vì đẻ bộ quiz mock.
                  </div>

                  {sourceMessage && (
                    <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
                      {sourceMessage}
                    </div>
                  )}

                  <button
                    type="button"
                    disabled={sourceImporting}
                    onClick={handleSourceImport}
                    className="btn-primary inline-flex w-full items-center justify-center gap-2"
                  >
                    {sourceImporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Globe2 className="h-4 w-4" />}
                    Tạo từ nguồn mở
                  </button>
                  <button
                    type="button"
                    disabled={sourceSetGenerating}
                    onClick={handleGenerateSourceSets}
                    className="btn-secondary inline-flex w-full items-center justify-center gap-2"
                  >
                    {sourceSetGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Globe2 className="h-4 w-4" />}
                    Tạo bộ từ tất cả nguồn
                  </button>
                  <button
                    type="button"
                    disabled={curatedSyncing}
                    onClick={handleCuratedSync}
                    className="btn-secondary inline-flex w-full items-center justify-center gap-2 border-green-200 bg-green-50 text-green-700 hover:bg-green-100"
                  >
                    {curatedSyncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                    Thay bằng bộ dữ liệu curated
                  </button>
                </div>
              ) : mode === "manual" ? (
                <div className="mt-5 space-y-4">
                  {editingQuizId && (
                    <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <Badge variant="info">Đang sửa quiz</Badge>
                          <p className="mt-2 text-sm text-blue-900">
                            Lưu form này sẽ cập nhật bộ đề đang chọn, không tạo quiz mới.
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={resetManualForm}
                          className="btn-secondary inline-flex items-center justify-center"
                        >
                          Huỷ sửa
                        </button>
                      </div>
                    </div>
                  )}

                  <label className="block">
                    <span className="field-label">Tiêu đề</span>
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
                          <Badge variant="info">Câu {index + 1}</Badge>
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
                              <option value="multiple_choice">{questionTypeLabel("multiple_choice")}</option>
                              <option value="fill_blank">{questionTypeLabel("fill_blank")}</option>
                            </select>
                            <button
                              type="button"
                              onClick={() => removeManualQuestion(index)}
                              className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600"
                              aria-label="Xoá câu hỏi"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </div>

                        <input
                          value={question.prompt}
                          onChange={(event) => updateManualQuestion(index, { prompt: event.target.value })}
                          placeholder="Nội dung câu hỏi"
                          className="field"
                        />

                        <div className="mt-2 grid gap-2 md:grid-cols-[1fr_auto]">
                          <input
                            value={question.image_url || ""}
                            onChange={(event) => updateManualQuestion(index, { image_url: event.target.value })}
                            placeholder="URL ảnh minh hoạ (nếu có)"
                            className="field"
                          />
                          <label className="btn-secondary inline-flex cursor-pointer items-center justify-center gap-2">
                            {uploadingImageFor === question.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Upload className="h-4 w-4" />
                            )}
                            Tải ảnh
                            <input
                              type="file"
                              accept="image/png,image/jpeg,image/webp,image/gif"
                              className="hidden"
                              onChange={(event) => {
                                void handleQuestionImageUpload(index, event.target.files?.[0] || null);
                                event.currentTarget.value = "";
                              }}
                            />
                          </label>
                        </div>

                        {question.image_url && (
                          <div className="mt-3 overflow-hidden rounded-lg border border-gray-200">
                            <img
                              src={question.image_url}
                              alt={`Minh hoạ câu ${index + 1}`}
                              className="h-48 w-full object-cover"
                            />
                            <div className="flex items-center justify-between bg-gray-50 px-3 py-2">
                              <span className="truncate text-xs text-gray-500">{question.image_url}</span>
                              <button
                                type="button"
                                onClick={() => updateManualQuestion(index, { image_url: "" })}
                                className="text-xs font-semibold text-red-600 hover:text-red-700"
                              >
                                Gỡ ảnh
                              </button>
                            </div>
                          </div>
                        )}

                        {question.type === "multiple_choice" && (
                          <div className="mt-2 grid grid-cols-2 gap-2">
                            {question.options.map((option, optionIndex) => (
                              <input
                                key={optionIndex}
                                value={option}
                                onChange={(event) => updateOption(index, optionIndex, event.target.value)}
                                placeholder={`Lựa chọn ${optionIndex + 1}`}
                                className="field"
                              />
                            ))}
                          </div>
                        )}

                        <input
                          value={question.correct_answer}
                          onChange={(event) => updateManualQuestion(index, { correct_answer: event.target.value })}
                          placeholder="Đáp án đúng"
                          className="field mt-2"
                        />
                        <input
                          value={question.explanation}
                          onChange={(event) => updateManualQuestion(index, { explanation: event.target.value })}
                          placeholder="Giải thích ngắn"
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
                      Thêm câu
                    </button>
                    <button
                      type="button"
                      disabled={savingManual}
                      onClick={handleManualSave}
                      className="btn-primary inline-flex flex-1 items-center justify-center gap-2"
                    >
                      {savingManual ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                      {editingQuizId ? "Cập nhật quiz" : "Lưu quiz"}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="mt-5 space-y-4">
                  <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-4">
                    <Upload className="h-5 w-5 text-gray-500" />
                    <h3 className="mt-3 text-sm font-semibold text-gray-900">Import CSV hoặc JSON</h3>
                    <p className="mt-1 text-sm text-gray-500">
                      Phù hợp khi bạn có nhiều bộ câu hỏi tiếng Anh thật. CSV sẽ gom câu hỏi theo cột
                      <span className="font-medium text-gray-700"> quiz_title</span>.
                    </p>
                    <input
                      type="file"
                      accept=".csv,.json,text/csv,application/json"
                      onChange={(event) => void handleImportFile(event.target.files?.[0] || null)}
                      className="mt-4 block w-full text-sm text-gray-600 file:mr-3 file:rounded-lg file:border-0 file:bg-blue-50 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-blue-700 hover:file:bg-blue-100"
                    />
                    <button
                      type="button"
                      onClick={downloadSampleCsv}
                      className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-blue-700 hover:text-blue-800"
                    >
                      <Download className="h-4 w-4" />
                      Tải file CSV mẫu
                    </button>
                  </div>

                  <div className="rounded-lg border border-gray-200 p-4">
                    <p className="text-sm font-semibold text-gray-900">Định dạng hỗ trợ</p>
                    <ul className="mt-2 space-y-1 text-sm text-gray-500">
                      <li>
                        CSV: <code>quiz_title, topic, level, type, prompt, image_url, option_a...option_d, correct_answer, explanation, focus</code>.
                      </li>
                      <li>
                        JSON: object có <code>quizzes</code>, hoặc một quiz đơn có <code>questions</code>.
                      </li>
                      <li>Đáp án trắc nghiệm có thể là nội dung đáp án hoặc ký tự A/B/C/D.</li>
                      <li>Mỗi câu hỏi có thể có thêm <code>image_url</code> để hiển thị ảnh minh hoạ.</li>
                    </ul>
                  </div>

                  {importFileName && (
                    <div className="rounded-lg border border-blue-100 bg-blue-50 p-4">
                      <p className="text-sm font-semibold text-blue-900">{importFileName}</p>
                      <p className="mt-1 text-sm text-blue-800">
                        Đọc được {importPreview.length} quiz, tổng {importQuestionCount} câu hỏi.
                      </p>
                      {importPreview.length > 0 && (
                        <div className="mt-3 space-y-2">
                          {importPreview.slice(0, 4).map((item) => (
                            <div key={`${item.title}-${item.questions.length}`} className="rounded-md bg-white/70 px-3 py-2 text-xs text-blue-900">
                              {item.title} · {item.level} · {topicLabel(item.topic)} · {item.questions.length} câu
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {importMessage && (
                    <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
                      {importMessage}
                    </div>
                  )}

                  <button
                    type="button"
                    disabled={importing || importPreview.length === 0}
                    onClick={handleImportSubmit}
                    className="btn-primary inline-flex w-full items-center justify-center gap-2"
                  >
                    {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                    Import vào thư viện
                  </button>
                </div>
              )}
            </Card>

            <div className="rounded-lg border border-blue-100 bg-blue-50 p-4">
              <div className="flex gap-3">
                <FilePlus2 className="mt-0.5 h-5 w-5 text-blue-700" />
                <div>
                  <p className="text-sm font-semibold text-blue-900">Luồng quản trị</p>
                  <p className="mt-1 text-sm text-blue-800">
                    Admin chuẩn bị kho đề. Học viên chỉ vào danh sách quiz, làm bài và xem AI nhận xét.
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
