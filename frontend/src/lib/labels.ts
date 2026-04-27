const topicLabels: Record<string, string> = {
  free_conversation: "Trò chuyện tự do",
  daily_life: "Đời sống hằng ngày",
  travel: "Du lịch",
  work_career: "Công việc",
  food_cooking: "Ăn uống",
  movies_books: "Phim và sách",
  technology: "Công nghệ",
  health_fitness: "Sức khoẻ",
};

const focusLabels: Record<string, string> = {
  grammar: "Ngữ pháp",
  vocabulary: "Từ vựng",
  word_choice: "Chọn từ",
  pronunciation: "Phát âm",
  fluency: "Độ trôi chảy",
  structure: "Cấu trúc câu",
  comprehension: "Đọc hiểu",
  speaking: "Nói",
  listening: "Nghe",
};

const sourceLabels: Record<string, string> = {
  ai: "AI theo chủ đề",
  mistakes: "Từ lỗi sai",
  topic: "Theo chủ đề",
  manual: "Tự tạo",
  imported: "Import file",
  open_source: "Nguồn mở",
};

const roleLabels: Record<string, string> = {
  admin: "Quản trị",
  learner: "Học viên",
};

const subscriptionLabels: Record<string, string> = {
  free: "Free",
  plus: "Plus",
  ultra: "Ultra",
};

const questionTypeLabels: Record<string, string> = {
  multiple_choice: "Trắc nghiệm",
  fill_blank: "Điền từ",
};

function humanize(value: string) {
  return value.replace(/_/g, " ").trim();
}

export function topicLabel(value: string) {
  return topicLabels[value] || humanize(value);
}

export function focusLabel(value: string) {
  return focusLabels[value] || humanize(value);
}

export function quizSourceLabel(value: string) {
  return sourceLabels[value] || humanize(value);
}

export function roleLabel(value: string) {
  return roleLabels[value] || humanize(value);
}

export function subscriptionLabel(value: string) {
  return subscriptionLabels[value] || humanize(value);
}

export function questionTypeLabel(value: string) {
  return questionTypeLabels[value] || humanize(value);
}
