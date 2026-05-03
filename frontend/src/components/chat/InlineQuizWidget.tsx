import { useEffect, useRef, useState } from "react";
import { CheckCircle2, ClipboardCheck, Mic, Send, Sparkles, Square, Volume2, XCircle } from "lucide-react";
import type {
  InlineQuizQuestion,
  InlineQuizWidget as InlineQuizWidgetData,
} from "../../stores/chatStore";
import { focusLabel } from "../../lib/labels";

interface InlineQuizWidgetProps {
  widget: InlineQuizWidgetData;
  onAnswer: (widgetId: string, questionId: string, choiceId: string) => void;
  onSubmit: (widgetId: string) => void;
}

function normalizeAnswer(value: string) {
  return value.trim().replace(/\s+/g, " ").toLowerCase().replace(/[.!?,;:]+$/g, "");
}

function isChoiceQuestion(question: InlineQuizQuestion) {
  return question.question_type === "multiple_choice" || question.question_type === "listening_choice";
}

function isFillQuestion(question: InlineQuizQuestion) {
  return question.question_type === "listening_fill_blank";
}

function isSpeakingQuestion(question: InlineQuizQuestion) {
  return question.question_type === "speaking_prompt";
}

function isListeningQuestion(question: InlineQuizQuestion) {
  return question.question_type === "listening_choice" || question.question_type === "listening_fill_blank";
}

function wordCount(value: string) {
  return (value.match(/[A-Za-z']+/g) || []).length;
}

function isQuestionCorrect(question: InlineQuizQuestion, answer: string | undefined) {
  const value = answer || "";
  if (isChoiceQuestion(question)) {
    return value === question.correct_choice_id;
  }
  if (isFillQuestion(question)) {
    return normalizeAnswer(value) === normalizeAnswer(question.correct_answer || "");
  }
  if (isSpeakingQuestion(question)) {
    return wordCount(value) >= (question.min_words || 10);
  }
  return false;
}

function buildReviewText(questions: InlineQuizQuestion[], answers: Record<string, string>) {
  const total = questions.length;
  const correctCount = questions.filter((question) => isQuestionCorrect(question, answers[question.id])).length;
  const hasListening = questions.some(isListeningQuestion);
  const hasSpeaking = questions.some(isSpeakingQuestion);

  if (correctCount === total) {
    return hasListening || hasSpeaking
      ? "Rất ổn. Bạn vừa xử lý được cả câu chữ, phần nghe và phần nói trong cùng phiên chat."
      : "Rất ổn. Bạn xử lý tốt các mẫu câu trong phiên này, có thể tiếp tục nói dài hơn và thêm chi tiết.";
  }
  if (correctCount >= Math.ceil(total * 0.6)) {
    const missedFocus = questions
      .filter((question) => !isQuestionCorrect(question, answers[question.id]))
      .map((question) => focusLabel(question.focus))
      .filter(Boolean)
      .slice(0, 2)
      .join(", ");
    return `Bạn nắm được phần chính. Nên luyện thêm ${missedFocus || "các câu chưa đúng"} trước khi chuyển chủ đề.`;
  }
  return "Nên đi chậm lại một chút. Các câu sai đang chỉ ra phần cần ôn ngay trong phiên, hãy đọc lại giải thích rồi thử dùng một câu đúng khi nói tiếp.";
}

function widgetModeLabel(mode?: InlineQuizWidgetData["mode"]) {
  if (mode === "listening") return "Bài nghe trong chat";
  if (mode === "speaking") return "Bài nói trong chat";
  if (mode === "mixed") return "Bài tổng hợp trong chat";
  if (mode === "grammar") return "Bài sửa lỗi trong chat";
  return "Bài tập trong chat";
}

export default function InlineQuizWidget({ widget, onAnswer, onSubmit }: InlineQuizWidgetProps) {
  const recognitionRef = useRef<any>(null);
  const [recordingQuestionId, setRecordingQuestionId] = useState<string | null>(null);
  const [speechMessage, setSpeechMessage] = useState("");
  const isSubmitted = Boolean(widget.submitted);
  const answers = widget.answers ?? {};
  const totalQuestions = widget.questions.length;
  const answeredCount = widget.questions.filter((question) => Boolean(answers[question.id])).length;
  const correctCount = widget.questions.filter((question) => isQuestionCorrect(question, answers[question.id])).length;
  const canSubmit = answeredCount === totalQuestions && totalQuestions > 0;
  const reviewText = buildReviewText(widget.questions, answers);

  useEffect(() => {
    return () => {
      window.speechSynthesis?.cancel();
      recognitionRef.current?.stop?.();
    };
  }, []);

  const playAudio = (text?: string) => {
    if (!text?.trim() || isSubmitted) return;
    window.speechSynthesis?.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "en-US";
    utterance.rate = 0.9;
    const voices = window.speechSynthesis?.getVoices?.() || [];
    const englishVoice = voices.find((voice) => voice.lang.toLowerCase().startsWith("en"));
    if (englishVoice) utterance.voice = englishVoice;
    window.speechSynthesis?.speak(utterance);
  };

  const stopRecording = () => {
    recognitionRef.current?.stop?.();
    recognitionRef.current = null;
    setRecordingQuestionId(null);
  };

  const startRecording = (questionId: string) => {
    const Recognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!Recognition) {
      setSpeechMessage("Trình duyệt chưa hỗ trợ nhận diện giọng nói. Bạn có thể nhập transcript bằng tay.");
      return;
    }

    stopRecording();
    setSpeechMessage("");
    const recognition = new Recognition();
    recognition.lang = "en-US";
    recognition.interimResults = true;
    recognition.continuous = true;
    recognition.maxAlternatives = 1;

    let finalTranscript = answers[questionId] || "";
    recognition.onresult = (event: any) => {
      let interim = "";
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const transcript = event.results[index][0]?.transcript || "";
        if (event.results[index].isFinal) {
          finalTranscript = `${finalTranscript} ${transcript}`.trim();
        } else {
          interim += transcript;
        }
      }
      const merged = `${finalTranscript}${interim ? ` ${interim}` : ""}`.trim();
      onAnswer(widget.id, questionId, merged);
    };
    recognition.onerror = () => {
      setSpeechMessage("Micro hoặc nhận diện giọng nói đang lỗi. Bạn có thể nhập transcript bằng tay.");
      setRecordingQuestionId(null);
    };
    recognition.onend = () => setRecordingQuestionId(null);

    recognitionRef.current = recognition;
    setRecordingQuestionId(questionId);
    recognition.start();
  };

  return (
    <div className="w-full max-w-[560px] rounded-lg border border-emerald-200 bg-emerald-50/80 p-4 text-gray-900">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase text-emerald-700">
            {widgetModeLabel(widget.mode)}
          </p>
          <h4 className="mt-1 text-sm font-semibold text-gray-900">{widget.title}</h4>
          {widget.description && (
            <p className="mt-1 text-xs leading-5 text-gray-600">{widget.description}</p>
          )}
        </div>
        <div className="shrink-0 rounded-lg bg-white px-2 py-1 text-[11px] font-medium text-emerald-700">
          {answeredCount}/{totalQuestions}
        </div>
      </div>

      {(widget.topic || widget.level) && (
        <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-medium">
          {widget.level && <span className="rounded-lg border border-emerald-200 bg-white px-2 py-1">{widget.level}</span>}
          {widget.topic && <span className="rounded-lg border border-emerald-200 bg-white px-2 py-1">{widget.topic}</span>}
        </div>
      )}

      <div className="mt-4 space-y-4">
        {widget.questions.map((question, questionIndex) => {
          const selectedId = answers[question.id];
          const questionCorrect = isQuestionCorrect(question, selectedId);

          return (
            <div key={question.id} className="border-t border-emerald-200 pt-4 first:border-t-0 first:pt-0">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold text-emerald-700">
                    Câu {questionIndex + 1} · {focusLabel(question.focus)}
                  </p>
                  <p className="mt-1 text-sm font-medium leading-6 text-gray-900">{question.prompt}</p>
                </div>
                {isSubmitted && (
                  questionCorrect ? (
                    <CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-emerald-700" />
                  ) : (
                    <XCircle className="mt-1 h-4 w-4 shrink-0 text-red-600" />
                  )
                )}
              </div>

              {question.source_text && (
                <p className="mt-2 text-xs leading-5 text-gray-600">
                  Gợi nhắc: “{question.source_text}”
                </p>
              )}

              {isListeningQuestion(question) && (
                <div className="mt-3 rounded-lg border border-blue-200 bg-blue-50 px-3 py-3 text-xs text-blue-900">
                  <p className="font-semibold">Bài nghe mini</p>
                  <p className="mt-1 leading-5">Bấm phát audio rồi trả lời ngay trong chat.</p>
                  <button
                    type="button"
                    disabled={isSubmitted}
                    onClick={() => playAudio(question.audio_text)}
                    className="mt-2 inline-flex items-center gap-2 rounded-lg border border-blue-200 bg-white px-3 py-2 text-xs font-semibold text-blue-700 disabled:opacity-50"
                  >
                    <Volume2 className="h-3.5 w-3.5" />
                    Phát audio
                  </button>
                </div>
              )}

              {isChoiceQuestion(question) ? (
                <div className="mt-3 space-y-2">
                  {question.choices.map((choice, index) => {
                    const isSelected = selectedId === choice.id;
                    const showCorrect = isSubmitted && choice.id === question.correct_choice_id;
                    const showWrong = isSubmitted && isSelected && !questionCorrect;

                    return (
                      <button
                        key={choice.id}
                        type="button"
                        disabled={isSubmitted}
                        onClick={() => onAnswer(widget.id, question.id, choice.id)}
                        className={`flex w-full items-start gap-3 rounded-lg border px-3 py-3 text-left text-sm transition ${
                          showCorrect
                            ? "border-emerald-400 bg-emerald-100"
                            : showWrong
                            ? "border-red-300 bg-red-50"
                            : isSelected
                            ? "border-emerald-300 bg-white shadow-sm"
                            : "border-emerald-200 bg-white hover:border-emerald-300 hover:bg-emerald-50"
                        }`}
                      >
                        <span
                          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border text-[11px] font-bold ${
                            showCorrect
                              ? "border-emerald-600 bg-emerald-600 text-white"
                              : showWrong
                              ? "border-red-500 bg-red-500 text-white"
                              : isSelected
                              ? "border-emerald-500 bg-emerald-500 text-white"
                              : "border-gray-300 bg-white text-gray-500"
                          }`}
                        >
                          {String.fromCharCode(65 + index)}
                        </span>
                        <span className="flex-1 leading-6">{choice.text}</span>
                      </button>
                    );
                  })}
                </div>
              ) : isFillQuestion(question) ? (
                <label className="mt-3 block">
                  <span className="text-[11px] font-semibold text-gray-600">Câu trả lời nghe được</span>
                  <input
                    value={selectedId || ""}
                    disabled={isSubmitted}
                    onChange={(event) => onAnswer(widget.id, question.id, event.target.value)}
                    placeholder="Nhập từ/cụm từ còn thiếu..."
                    className="mt-1 w-full rounded-lg border border-emerald-200 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-400 disabled:bg-gray-50"
                  />
                </label>
              ) : isSpeakingQuestion(question) ? (
                <div className="mt-3 rounded-lg border border-green-200 bg-white px-3 py-3">
                  <p className="text-xs font-semibold text-green-800">Bài nói mini</p>
                  <p className="mt-1 text-xs leading-5 text-gray-600">
                    Nói tối thiểu {question.min_words || 10} từ. Widget sẽ dùng transcript để review nhanh.
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={isSubmitted}
                      onClick={() =>
                        recordingQuestionId === question.id
                          ? stopRecording()
                          : startRecording(question.id)
                      }
                      className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold text-white disabled:bg-gray-300 ${
                        recordingQuestionId === question.id ? "bg-red-600" : "bg-green-700"
                      }`}
                    >
                      {recordingQuestionId === question.id ? (
                        <>
                          <Square className="h-3.5 w-3.5" />
                          Dừng ghi
                        </>
                      ) : (
                        <>
                          <Mic className="h-3.5 w-3.5" />
                          Bắt đầu nói
                        </>
                      )}
                    </button>
                    <button
                      type="button"
                      disabled={isSubmitted}
                      onClick={() => onAnswer(widget.id, question.id, "")}
                      className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-600 disabled:opacity-50"
                    >
                      Xoá transcript
                    </button>
                  </div>
                  {speechMessage && <p className="mt-2 text-xs text-amber-700">{speechMessage}</p>}
                  <textarea
                    value={selectedId || ""}
                    disabled={isSubmitted}
                    onChange={(event) => onAnswer(widget.id, question.id, event.target.value)}
                    placeholder="Transcript sẽ hiện ở đây, hoặc nhập tay nếu micro lỗi..."
                    className="mt-3 min-h-20 w-full rounded-lg border border-emerald-200 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-400 disabled:bg-gray-50"
                  />
                </div>
              ) : null}

              {isSubmitted && (
                <p className="mt-2 text-xs leading-5 text-gray-700">
                  <span className="font-semibold">Giải thích:</span>{" "}
                  {isSpeakingQuestion(question)
                    ? `${question.explanation} Transcript của bạn có ${wordCount(selectedId || "")} từ.`
                    : question.explanation}
                </p>
              )}
            </div>
          );
        })}
      </div>

      {isSubmitted && (
        <div className="mt-4 rounded-lg border border-emerald-300 bg-white px-3 py-3 text-xs leading-5 text-emerald-900">
          <div className="flex items-start gap-2">
            <Sparkles className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <p className="font-semibold">Nhận xét AI: {correctCount}/{totalQuestions} câu đúng</p>
              <p className="mt-1">{reviewText}</p>
            </div>
          </div>
        </div>
      )}

      {!isSubmitted && (
        <button
          type="button"
          disabled={!canSubmit}
          onClick={() => onSubmit(widget.id)}
          className="mt-4 inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-gray-300"
        >
          {canSubmit ? <Send className="h-4 w-4" /> : <ClipboardCheck className="h-4 w-4" />}
          {canSubmit ? "Nộp bài" : `Còn ${totalQuestions - answeredCount} câu`}
        </button>
      )}
    </div>
  );
}
