import { CheckCircle2, ClipboardCheck, Send, Sparkles, XCircle } from "lucide-react";
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

function buildReviewText(questions: InlineQuizQuestion[], answers: Record<string, string>) {
  const total = questions.length;
  const correctCount = questions.filter((question) => answers[question.id] === question.correct_choice_id).length;

  if (correctCount === total) {
    return "Rất ổn. Bạn xử lý tốt các mẫu câu trong phiên này, có thể tiếp tục nói dài hơn và thêm chi tiết.";
  }
  if (correctCount >= Math.ceil(total * 0.6)) {
    const missedFocus = questions
      .filter((question) => answers[question.id] !== question.correct_choice_id)
      .map((question) => focusLabel(question.focus))
      .filter(Boolean)
      .slice(0, 2)
      .join(", ");
    return `Bạn nắm được phần chính. Nên luyện thêm ${missedFocus || "các câu chưa đúng"} trước khi chuyển chủ đề.`;
  }
  return "Nên đi chậm lại một chút. Các câu sai đang chỉ ra phần cần ôn ngay trong phiên, hãy đọc lại giải thích rồi thử dùng một câu đúng khi nói tiếp.";
}

export default function InlineQuizWidget({ widget, onAnswer, onSubmit }: InlineQuizWidgetProps) {
  const isSubmitted = Boolean(widget.submitted);
  const answers = widget.answers ?? {};
  const totalQuestions = widget.questions.length;
  const answeredCount = widget.questions.filter((question) => Boolean(answers[question.id])).length;
  const correctCount = widget.questions.filter(
    (question) => answers[question.id] === question.correct_choice_id
  ).length;
  const canSubmit = answeredCount === totalQuestions && totalQuestions > 0;
  const reviewText = buildReviewText(widget.questions, answers);

  return (
    <div className="w-full max-w-[560px] rounded-lg border border-emerald-200 bg-emerald-50/80 p-4 text-gray-900">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase text-emerald-700">
            Bài tập trong chat
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
          const isQuestionCorrect = selectedId === question.correct_choice_id;

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
                  isQuestionCorrect ? (
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

              <div className="mt-3 space-y-2">
                {question.choices.map((choice, index) => {
                  const isSelected = selectedId === choice.id;
                  const showCorrect = isSubmitted && choice.id === question.correct_choice_id;
                  const showWrong = isSubmitted && isSelected && !isQuestionCorrect;

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

              {isSubmitted && (
                <p className="mt-2 text-xs leading-5 text-gray-700">
                  <span className="font-semibold">Giải thích:</span> {question.explanation}
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
