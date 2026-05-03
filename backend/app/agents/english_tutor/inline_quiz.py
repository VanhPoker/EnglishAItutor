"""Helpers for generating exercise-set widgets inside the chat room."""

from __future__ import annotations

import hashlib
from typing import Any
from uuid import uuid4

from langchain_core.messages import HumanMessage

from app.agents.english_tutor.models import EnglishTutorState


def _clean(value: Any) -> str:
    return str(value or "").strip()


def _last_user_text(state: EnglishTutorState) -> str:
    for msg in reversed(state.get("messages", [])):
        if isinstance(msg, HumanMessage) and isinstance(msg.content, str):
            return msg.content.strip()
    return ""


def _topic_display(state: EnglishTutorState) -> str:
    topic = _clean(state.get("current_topic")) or "free_conversation"
    return topic.replace("_", " ").strip()


def _choice(choice_id: str, text: str) -> dict[str, str]:
    return {"id": choice_id, "text": text}


def _variant(seed_text: str, sequence: int, modulo: int) -> int:
    if modulo <= 1:
        return 0
    digest = hashlib.sha1(f"{seed_text}|{sequence}".encode("utf-8")).hexdigest()
    return int(digest[:8], 16) % modulo


def _question(
    *,
    question_id: str,
    prompt: str,
    focus: str,
    choices: list[dict[str, str]],
    correct_choice_id: str,
    explanation: str,
    source_text: str | None = None,
    question_type: str = "multiple_choice",
    audio_text: str | None = None,
    correct_answer: str | None = None,
    min_words: int | None = None,
) -> dict[str, Any]:
    payload = {
        "id": question_id,
        "prompt": prompt,
        "focus": focus,
        "question_type": question_type,
        "choices": choices,
        "correct_choice_id": correct_choice_id,
        "explanation": explanation,
        "source_text": source_text,
    }
    if audio_text:
        payload["audio_text"] = audio_text
    if correct_answer:
        payload["correct_answer"] = correct_answer
    if min_words:
        payload["min_words"] = min_words
    return payload


def _error_question(index: int, item: dict[str, Any], source_text: str) -> dict[str, Any] | None:
    original = _clean(item.get("original"))
    correction = _clean(item.get("correction"))
    explanation = _clean(item.get("explanation"))
    focus = (_clean(item.get("error_type")) or "grammar").lower()

    if not original or not correction or original.lower() == correction.lower():
        return None

    return _question(
        question_id=f"q-error-{index}",
        prompt=f"Chọn cách diễn đạt tự nhiên hơn cho phần: “{original}”.",
        focus=focus,
        choices=[
            _choice("correct", correction),
            _choice("original", original),
            _choice("too-short", "I understand, but I need to say it more clearly."),
        ],
        correct_choice_id="correct",
        explanation=explanation or f"Cách diễn đạt tốt hơn là: {correction}",
        source_text=source_text or original,
    )


def _conversation_question(topic: str, level: str, source_text: str, variant: int) -> dict[str, Any]:
    beginner_sets = [
        (
            [
                _choice("a", "What do you like about it?"),
                _choice("b", "What you like about it?"),
                _choice("c", "What like you about it?"),
                _choice("d", "You like about it what?"),
            ],
            "Câu hỏi cần có trợ động từ 'do': What do you like about it?",
        ),
        (
            [
                _choice("a", "Where do you usually practice English?"),
                _choice("b", "Where you usually practice English?"),
                _choice("c", "Where usually you practice English?"),
                _choice("d", "You practice English where usually?"),
            ],
            "Với câu hỏi hiện tại đơn, dùng 'do' trước chủ ngữ: Where do you usually...?",
        ),
        (
            [
                _choice("a", "Can you say that again, please?"),
                _choice("b", "Can you again say that, please?"),
                _choice("c", "You can say that again please?"),
                _choice("d", "Say again that can you please?"),
            ],
            "Câu A tự nhiên và lịch sự khi muốn người khác nhắc lại.",
        ),
    ]
    higher_sets = [
        (
            [
                _choice("a", f"Could you tell me more about {topic}?"),
                _choice("b", f"Could you tell more about {topic}?"),
                _choice("c", f"Tell me more {topic}?"),
                _choice("d", f"You can tell me more about {topic}?"),
            ],
            "Câu A tự nhiên và lịch sự nhất vì có cấu trúc 'Could you tell me more about...?'",
        ),
        (
            [
                _choice("a", "What makes you say that?"),
                _choice("b", "What makes you to say that?"),
                _choice("c", "What make you say that?"),
                _choice("d", "What you say that makes?"),
            ],
            "Sau 'make someone' dùng động từ nguyên mẫu không 'to': What makes you say that?",
        ),
        (
            [
                _choice("a", "Could you give me an example?"),
                _choice("b", "Could you give me example?"),
                _choice("c", "Could you give for me an example?"),
                _choice("d", "You could give example for me?"),
            ],
            "Câu A có mạo từ 'an' và trật tự từ tự nhiên.",
        ),
    ]
    choices, explanation = (beginner_sets if level in {"A1", "A2"} else higher_sets)[variant % 3]

    return _question(
        question_id=f"q-follow-up-{variant}",
        prompt=f"Chọn câu hỏi phù hợp để tiếp tục chủ đề '{topic}'.",
        focus="conversation",
        choices=choices,
        correct_choice_id="a",
        explanation=explanation,
        source_text=source_text,
    )


def _structure_question(level: str, source_text: str, variant: int) -> dict[str, Any]:
    beginner_sets = [
        (
            [
                _choice("a", "I went to school yesterday."),
                _choice("b", "I go to school yesterday."),
                _choice("c", "I did went to school yesterday."),
                _choice("d", "I was go to school yesterday."),
            ],
            "Với 'yesterday', dùng quá khứ đơn: 'went'.",
        ),
        (
            [
                _choice("a", "She likes music."),
                _choice("b", "She like music."),
                _choice("c", "She liking music."),
                _choice("d", "She is like music."),
            ],
            "Ngôi thứ ba số ít ở hiện tại đơn thêm 's': She likes...",
        ),
        (
            [
                _choice("a", "There are two books on the table."),
                _choice("b", "There is two books on the table."),
                _choice("c", "There have two books on the table."),
                _choice("d", "There two books are on the table."),
            ],
            "Danh từ số nhiều 'two books' đi với 'There are'.",
        ),
    ]
    mid_sets = [
        (
            [
                _choice("a", "Could you explain the answer again?"),
                _choice("b", "Explain answer again you?"),
                _choice("c", "Can explain me the answer?"),
                _choice("d", "You explain answer again?"),
            ],
            "Câu A rõ nghĩa và lịch sự nhất. 'Explain something to someone' hoặc 'explain the answer again'.",
        ),
        (
            [
                _choice("a", "I have been studying English for two years."),
                _choice("b", "I study English since two years."),
                _choice("c", "I am studying English since two years."),
                _choice("d", "I have study English for two years."),
            ],
            "Với khoảng thời gian kéo dài đến hiện tại, dùng hiện tại hoàn thành tiếp diễn và 'for'.",
        ),
        (
            [
                _choice("a", "If I had more time, I would practice every day."),
                _choice("b", "If I have more time, I would practice every day."),
                _choice("c", "If I had more time, I will practice every day."),
                _choice("d", "If I would have more time, I practiced every day."),
            ],
            "Câu điều kiện loại 2: If + quá khứ đơn, would + V.",
        ),
    ]
    advanced_sets = [
        (
            [
                _choice("a", "I would appreciate it if you could clarify the main point."),
                _choice("b", "I will appreciate if you clarify main point."),
                _choice("c", "I appreciate you clarify the main point."),
                _choice("d", "Clarify main point for appreciate."),
            ],
            "Câu A dùng cấu trúc lịch sự và tự nhiên: 'I would appreciate it if...'.",
        ),
        (
            [
                _choice("a", "Had I known earlier, I would have changed my plan."),
                _choice("b", "Had I knew earlier, I would change my plan."),
                _choice("c", "If I would know earlier, I had changed my plan."),
                _choice("d", "I had known earlier, I would change my plan."),
            ],
            "Đảo ngữ điều kiện loại 3: Had + S + V3, S + would have + V3.",
        ),
        (
            [
                _choice("a", "The proposal was rejected despite being carefully prepared."),
                _choice("b", "The proposal rejected despite carefully prepared."),
                _choice("c", "The proposal was rejected despite it carefully prepared."),
                _choice("d", "The proposal rejected despite it was carefully prepared."),
            ],
            "Câu A dùng bị động và cụm 'despite being...' chính xác.",
        ),
    ]
    if level in {"A1", "A2"}:
        choices, explanation = beginner_sets[variant % 3]
    elif level in {"B1", "B2"}:
        choices, explanation = mid_sets[variant % 3]
    else:
        choices, explanation = advanced_sets[variant % 3]

    return _question(
        question_id=f"q-structure-{variant}",
        prompt="Chọn câu tự nhiên và đúng ngữ pháp nhất.",
        focus="grammar",
        choices=choices,
        correct_choice_id="a",
        explanation=explanation,
        source_text=source_text,
    )


def _listening_choice_question(topic: str, level: str, source_text: str, variant: int) -> dict[str, Any]:
    topic_text = topic or "free conversation"
    beginner_sets = [
        (
            f"I like practicing English because it helps me talk about {topic_text}. I try to speak a little every day.",
            [
                _choice("a", "The speaker practices a little every day."),
                _choice("b", "The speaker only reads grammar books."),
                _choice("c", "The speaker does not like English."),
                _choice("d", "The speaker wants to stop studying."),
            ],
            "Trong audio, người nói nói rằng họ cố gắng nói một chút mỗi ngày.",
        ),
        (
            "Anna studies English after dinner. She listens to one short story and repeats three useful sentences.",
            [
                _choice("a", "Anna listens and repeats useful sentences."),
                _choice("b", "Anna studies before breakfast."),
                _choice("c", "Anna writes a long essay every night."),
                _choice("d", "Anna never repeats sentences."),
            ],
            "Anna nghe một câu chuyện ngắn và lặp lại ba câu hữu ích.",
        ),
        (
            "Tom is going to the library at four o'clock. He wants to borrow an English book about travel.",
            [
                _choice("a", "Tom wants to borrow a travel book in English."),
                _choice("b", "Tom is going to the cinema."),
                _choice("c", "Tom wants to buy a dictionary."),
                _choice("d", "Tom goes to the library at seven."),
            ],
            "Ý đúng là Tom muốn mượn một cuốn sách tiếng Anh về du lịch.",
        ),
    ]
    higher_sets = [
        (
            f"When I practice {topic_text}, I usually write down one useful phrase first. Then I try to use it in a real answer so it becomes easier to remember.",
            [
                _choice("a", "The speaker uses a useful phrase in a real answer."),
                _choice("b", "The speaker memorizes ten unrelated words."),
                _choice("c", "The speaker avoids using new phrases."),
                _choice("d", "The speaker only listens and never speaks."),
            ],
            "Ý chính là người nói ghi một cụm hữu ích rồi dùng nó trong câu trả lời thật.",
        ),
        (
            "The teacher suggested recording a one-minute answer twice: first to notice hesitation, then to improve pronunciation and linking.",
            [
                _choice("a", "The student should record twice to notice and improve speaking."),
                _choice("b", "The student should avoid recording their voice."),
                _choice("c", "The teacher only cares about grammar rules."),
                _choice("d", "The answer must be ten minutes long."),
            ],
            "Giáo viên gợi ý ghi âm hai lần để nhận ra ngập ngừng rồi cải thiện phát âm và nối âm.",
        ),
        (
            "Mina used to translate every sentence in her head, but now she prepares key phrases and speaks more fluently.",
            [
                _choice("a", "Mina speaks more fluently by preparing key phrases."),
                _choice("b", "Mina still translates every sentence aloud."),
                _choice("c", "Mina stopped learning English."),
                _choice("d", "Mina only studies vocabulary lists."),
            ],
            "Mina cải thiện độ trôi chảy bằng cách chuẩn bị các cụm chính.",
        ),
    ]
    audio_text, choices, explanation = (beginner_sets if level in {"A1", "A2"} else higher_sets)[variant % 3]

    return _question(
        question_id=f"q-listening-choice-{variant}",
        prompt="Nghe đoạn audio ngắn rồi chọn ý đúng nhất.",
        focus="listening",
        question_type="listening_choice",
        choices=choices,
        correct_choice_id="a",
        explanation=explanation,
        source_text=source_text,
        audio_text=audio_text,
    )


def _listening_fill_question(topic: str, level: str, source_text: str, variant: int) -> dict[str, Any]:
    beginner_sets = [
        (
            "My favorite time to practice English is in the morning.",
            "in the morning",
            "Nghe câu và điền cụm thời gian còn thiếu: My favorite time to practice English is ____.",
            "Cụm còn thiếu là 'in the morning'.",
        ),
        (
            "I usually review new words before I go to bed.",
            "before I go to bed",
            "Nghe câu và điền cụm còn thiếu: I usually review new words ____.",
            "Cụm còn thiếu là 'before I go to bed'.",
        ),
        (
            "Could you repeat the last question, please?",
            "repeat the last question",
            "Nghe câu và điền cụm còn thiếu: Could you ____, please?",
            "Cụm còn thiếu là 'repeat the last question'.",
        ),
    ]
    higher_sets = [
        (
            "I realized that speaking slowly helped me organize my ideas more clearly.",
            "organize my ideas",
            "Nghe câu và điền cụm còn thiếu: Speaking slowly helped me ____ more clearly.",
            "Cụm còn thiếu là 'organize my ideas'.",
        ),
        (
            "The most useful feedback was about sentence stress and natural pauses.",
            "sentence stress",
            "Nghe câu và điền cụm còn thiếu: The most useful feedback was about ____ and natural pauses.",
            "Cụm còn thiếu là 'sentence stress'.",
        ),
        (
            "Instead of memorizing full answers, I prepare flexible phrases for different situations.",
            "flexible phrases",
            "Nghe câu và điền cụm còn thiếu: I prepare ____ for different situations.",
            "Cụm còn thiếu là 'flexible phrases'.",
        ),
    ]
    audio_text, correct_answer, prompt, explanation = (
        beginner_sets if level in {"A1", "A2"} else higher_sets
    )[variant % 3]

    return _question(
        question_id=f"q-listening-fill-{variant}",
        prompt=prompt,
        focus="listening",
        question_type="listening_fill_blank",
        choices=[],
        correct_choice_id="",
        correct_answer=correct_answer,
        explanation=explanation,
        source_text=source_text,
        audio_text=audio_text,
    )


def _speaking_prompt(topic: str, level: str, source_text: str, variant: int) -> dict[str, Any]:
    min_words = 10 if level in {"A1", "A2"} else 18
    prompts = [
        f"Nói bằng tiếng Anh trong 20-40 giây: Give your opinion about {topic}. Use at least one reason.",
        f"Nói như đang trả lời gia sư: What is one thing you want to improve in {topic}, and why?",
        f"Nói một câu chuyện ngắn: Describe a recent situation related to {topic}. What happened?",
        "Role-play: You do not understand the question. Politely ask the tutor to explain it again.",
    ]
    prompt = prompts[variant % len(prompts)]
    if source_text and variant % 2 == 0:
        prompt = (
            "Nói lại ý của bạn bằng tiếng Anh tốt hơn trong 20-40 giây. "
            f"Use this context: “{source_text[:120]}”. Add one reason."
        )

    return _question(
        question_id=f"q-speaking-{variant}",
        prompt=prompt,
        focus="speaking",
        question_type="speaking_prompt",
        choices=[],
        correct_choice_id="",
        correct_answer="A clear spoken answer with an opinion and at least one reason.",
        explanation=(
            "Câu nói tốt cần có ý chính, lý do rõ ràng, và nên dùng từ nối như because, so, but, for example."
        ),
        source_text=source_text,
        min_words=min_words,
    )


def build_inline_exercise_set(
    state: EnglishTutorState,
    *,
    request_text: str | None = None,
    exercise_mode: str = "auto",
    sequence: int = 0,
) -> dict | None:
    """Create a compact exercise set from the current practice session."""
    session_stats = state.get("session_stats") or {}
    source_text = _last_user_text(state)
    topic = _topic_display(state)
    level = _clean(state.get("working_level") or state.get("user_level")) or "B1"
    seed_text = "|".join(
        [
            topic,
            level,
            source_text[:120],
            request_text or "",
            str(session_stats.get("turns") or ""),
        ]
    )
    base_variant = _variant(seed_text, sequence, 12)
    text_questions: list[dict[str, Any]] = []

    patterns = sorted(
        (session_stats.get("error_patterns") or {}).values(),
        key=lambda item: (-(int(item.get("count") or 0)), _clean(item.get("correction")).lower()),
    )
    latest_errors = state.get("errors_detected") or []
    source_items = patterns[:2] or latest_errors[:2]

    for index, item in enumerate(source_items, start=1):
        question = _error_question(index, item, source_text)
        if question:
            text_questions.append(question)

    text_questions.append(_conversation_question(topic, level, source_text, base_variant))
    text_questions.append(_structure_question(level, source_text, base_variant + 1))

    unique_questions: list[dict[str, Any]] = []
    seen_prompts: set[str] = set()
    for question in text_questions:
        key = f"{question['prompt'].lower()}::{question.get('correct_choice_id', '')}"
        if key in seen_prompts:
            continue
        seen_prompts.add(key)
        unique_questions.append(question)

    selected_mode = exercise_mode
    if selected_mode == "auto":
        selected_mode = ("grammar", "listening", "speaking", "mixed")[sequence % 4]

    if selected_mode == "listening":
        final_questions = [
            _listening_choice_question(topic, level, source_text, base_variant),
            _listening_fill_question(topic, level, source_text, base_variant + 1),
        ]
        title = "Bài luyện nghe trong chat"
        description = "Nghe từng đoạn ngắn rồi trả lời. Phù hợp khi bạn muốn tập bắt ý chính và cụm từ."
    elif selected_mode == "speaking":
        final_questions = [
            _speaking_prompt(topic, level, source_text, base_variant),
            _speaking_prompt(topic, level, source_text, base_variant + 1),
        ]
        title = "Bài luyện nói trong chat"
        description = "Nói câu trả lời ngắn, lấy transcript ngay trong widget rồi nhận review nhanh."
    elif selected_mode == "grammar":
        final_questions = unique_questions[:3]
        title = "Bài sửa lỗi và mẫu câu"
        description = "Ôn nhanh lỗi, ngữ pháp và câu nối tiếp từ chính phiên trò chuyện."
    else:
        final_questions = [
            unique_questions[0] if unique_questions else _conversation_question(topic, level, source_text, base_variant),
            _listening_choice_question(topic, level, source_text, base_variant + 1),
            _speaking_prompt(topic, level, source_text, base_variant + 2),
        ]
        title = "Bài luyện tổng hợp"
        description = "Một vòng ngắn gồm câu chữ, nghe và nói. Lần sau hệ thống sẽ xoay sang dạng khác."

    if not final_questions:
        return None

    return {
        "id": f"inline-exercise-{uuid4()}",
        "type": "exercise_set",
        "mode": selected_mode,
        "title": title,
        "description": description,
        "topic": topic,
        "level": level,
        "questions": final_questions[:4],
    }
