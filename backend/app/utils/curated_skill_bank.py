"""Generated CEFR-aligned listening and speaking question bank.

The items are original app seed data, aligned to CEFR-style can-do skills.
They are stored as normal quiz rows so the live tutor can draw from the
database instead of using fixed runtime templates.
"""

from __future__ import annotations


TOPICS = [
    ("daily_life", "đời sống hằng ngày", "daily routines"),
    ("study", "học tập", "study habits"),
    ("work_career", "công việc", "workplace communication"),
    ("travel", "du lịch", "travel situations"),
]

LEVEL_META = {
    "A1": {
        "min_words": 8,
        "seconds": "15-25",
        "listening_audio": (
            "{name} practices English after dinner. The topic is {topic_en}. "
            "{name} listens to a short dialogue and repeats two useful sentences."
        ),
        "detail_audio": (
            "The lesson starts at seven o'clock. {name} brings a notebook and writes three new words."
        ),
        "inference_audio": (
            "{name} says, 'I do not understand this question. Can you say it again, please?'"
        ),
        "main_answer": "The learner listens and repeats useful sentences.",
        "detail_answer": "The learner writes three new words.",
        "inference_answer": "The learner politely asks someone to repeat the question.",
        "fill_answer": "after dinner",
        "fill_sentence": "{name} practices English after dinner.",
        "fill_prompt": "Nghe câu và điền cụm còn thiếu: {name} practices English ____.",
    },
    "A2": {
        "min_words": 10,
        "seconds": "20-30",
        "listening_audio": (
            "{name} is preparing for a conversation about {topic_en}. "
            "First, {name} reviews five common phrases. Then {name} records a short answer."
        ),
        "detail_audio": (
            "The practice group meets every Tuesday evening. Each student asks one question and gives one answer."
        ),
        "inference_audio": (
            "{name} missed one word in the audio, so {name} played the sentence again before answering."
        ),
        "main_answer": "The learner reviews phrases and records a short answer.",
        "detail_answer": "Each student asks one question and gives one answer.",
        "inference_answer": "The learner wants to check the listening detail before answering.",
        "fill_answer": "records a short answer",
        "fill_sentence": "{name} records a short answer after reviewing the phrases.",
        "fill_prompt": "Nghe câu và điền cụm còn thiếu: {name} ____ after reviewing the phrases.",
    },
    "B1": {
        "min_words": 18,
        "seconds": "30-45",
        "listening_audio": (
            "Before joining a discussion about {topic_en}, {name} writes down one useful phrase. "
            "During the conversation, {name} uses it naturally and asks a follow-up question."
        ),
        "detail_audio": (
            "The tutor suggests recording the answer twice: first to notice hesitation, then to improve pronunciation."
        ),
        "inference_audio": (
            "{name} used to translate every sentence, but now prepares key phrases and speaks more fluently."
        ),
        "main_answer": "The learner prepares a useful phrase and uses it in conversation.",
        "detail_answer": "The tutor suggests recording the answer twice.",
        "inference_answer": "The learner is becoming more fluent by preparing key phrases.",
        "fill_answer": "asks a follow-up question",
        "fill_sentence": "{name} uses the phrase naturally and asks a follow-up question.",
        "fill_prompt": "Nghe câu và điền cụm còn thiếu: {name} uses the phrase naturally and ____.",
    },
    "B2": {
        "min_words": 24,
        "seconds": "45-60",
        "listening_audio": (
            "In a conversation about {topic_en}, {name} compares two possible solutions. "
            "The first is faster, but the second is more reliable in the long term."
        ),
        "detail_audio": (
            "The speaker disagrees politely and explains that the plan needs clearer evidence before the team decides."
        ),
        "inference_audio": (
            "{name} pauses before answering because the question has two parts: an opinion and a supporting example."
        ),
        "main_answer": "The speaker compares a faster solution with a more reliable one.",
        "detail_answer": "The speaker says the plan needs clearer evidence.",
        "inference_answer": "The learner needs to answer both the opinion and the example parts.",
        "fill_answer": "more reliable",
        "fill_sentence": "The second solution is more reliable in the long term.",
        "fill_prompt": "Nghe câu và điền cụm còn thiếu: The second solution is ____ in the long term.",
    },
    "C1": {
        "min_words": 32,
        "seconds": "60-75",
        "listening_audio": (
            "The speaker argues that {topic_en} requires a balance between efficiency and personal responsibility. "
            "Although quick decisions are useful, careful reflection often prevents avoidable mistakes."
        ),
        "detail_audio": (
            "The strongest objection is not about cost; it is about whether the proposal can remain fair under pressure."
        ),
        "inference_audio": (
            "{name} reformulates the question before answering, which helps make a nuanced response easier to follow."
        ),
        "main_answer": "The speaker argues for balancing efficiency with personal responsibility.",
        "detail_answer": "The strongest objection is about fairness under pressure.",
        "inference_answer": "Reformulating the question helps the speaker give a nuanced answer.",
        "fill_answer": "careful reflection",
        "fill_sentence": "Careful reflection often prevents avoidable mistakes.",
        "fill_prompt": "Nghe câu và điền cụm còn thiếu: ____ often prevents avoidable mistakes.",
    },
    "C2": {
        "min_words": 40,
        "seconds": "75-90",
        "listening_audio": (
            "The discussion of {topic_en} moves beyond practical convenience and examines the assumptions behind the decision. "
            "The speaker concedes a minor weakness, then reframes it as a reason for a more transparent process."
        ),
        "detail_audio": (
            "What makes the argument persuasive is the way it anticipates criticism without weakening the central claim."
        ),
        "inference_audio": (
            "{name} distinguishes between a superficial disagreement and a deeper difference in priorities."
        ),
        "main_answer": "The speaker examines assumptions and argues for a more transparent process.",
        "detail_answer": "The argument anticipates criticism without weakening the central claim.",
        "inference_answer": "The speaker identifies a deeper difference in priorities.",
        "fill_answer": "transparent process",
        "fill_sentence": "The speaker reframes the weakness as a reason for a more transparent process.",
        "fill_prompt": "Nghe câu và điền cụm còn thiếu: The speaker argues for a more ____.",
    },
}


def listening_choice(question_id: str, prompt: str, audio_text: str, answer: str, distractors: list[str], explanation: str) -> dict:
    return {
        "id": question_id,
        "type": "listening_choice",
        "prompt": prompt,
        "options": [answer, *distractors[:3]],
        "correct_answer": answer,
        "explanation": explanation,
        "focus": "listening",
        "audio_text": audio_text,
    }


def listening_blank(question_id: str, prompt: str, audio_text: str, answer: str, explanation: str) -> dict:
    return {
        "id": question_id,
        "type": "listening_fill_blank",
        "prompt": prompt,
        "options": [],
        "correct_answer": answer,
        "explanation": explanation,
        "focus": "listening",
        "audio_text": audio_text,
    }


def speaking_prompt(question_id: str, prompt: str, min_words: int, rubric: str) -> dict:
    return {
        "id": question_id,
        "type": "speaking_prompt",
        "prompt": prompt,
        "options": [],
        "correct_answer": rubric,
        "explanation": "Bài nói tốt cần trả lời đúng yêu cầu, có ý chính rõ, ví dụ hoặc lý do cụ thể và cách nối ý tự nhiên.",
        "focus": "speaking",
        "rubric": rubric,
        "min_words": min_words,
    }


def _listening_quiz(level: str, topic_key: str, topic_vi: str, topic_en: str, topic_index: int) -> dict:
    meta = LEVEL_META[level]
    name = ["Mia", "Linh", "Tom", "An"][topic_index % 4]
    main_audio = meta["listening_audio"].format(name=name, topic_en=topic_en)
    detail_audio = meta["detail_audio"].format(name=name, topic_en=topic_en)
    inference_audio = meta["inference_audio"].format(name=name, topic_en=topic_en)
    fill_sentence = meta["fill_sentence"].format(name=name, topic_en=topic_en)
    fill_prompt = meta["fill_prompt"].format(name=name, topic_en=topic_en)

    return {
        "title": f"{level} Listening - {topic_vi.title()}",
        "topic": topic_key,
        "level": level,
        "description": f"Luyện nghe {level} theo tình huống {topic_vi}, gồm bắt ý chính, chi tiết và cụm từ.",
        "questions": [
            listening_choice(
                "q1",
                "Nghe đoạn audio. Ý chính của người nói là gì?",
                main_audio,
                meta["main_answer"],
                [
                    "The learner avoids using English in conversation.",
                    "The learner only studies grammar rules silently.",
                    "The learner stops the practice before answering.",
                ],
                "Đáp án đúng tóm tắt đúng hành động chính trong audio.",
            ),
            listening_blank(
                "q2",
                fill_prompt,
                fill_sentence,
                meta["fill_answer"],
                "Cụm còn thiếu xuất hiện trực tiếp trong audio.",
            ),
            listening_choice(
                "q3",
                "Nghe đoạn audio. Chi tiết nào đúng?",
                detail_audio,
                meta["detail_answer"],
                [
                    "The speaker says the lesson was cancelled.",
                    "The speaker says no one should ask questions.",
                    "The speaker says the learner forgot the whole task.",
                ],
                "Câu đúng bám sát chi tiết được nói trong audio.",
            ),
            listening_choice(
                "q4",
                "Nghe đoạn audio. Có thể suy ra điều gì?",
                inference_audio,
                meta["inference_answer"],
                [
                    "The learner refuses to continue practicing.",
                    "The learner already understands every detail perfectly.",
                    "The learner changes the topic to avoid answering.",
                ],
                "Đây là suy luận hợp lý nhất từ hành động của người nói.",
            ),
            listening_blank(
                "q5",
                "Nghe và điền cụm chính bạn nghe được. Gợi ý: cụm này liên quan trực tiếp đến mục tiêu luyện tập.",
                main_audio,
                meta["main_answer"].split(" and ")[0].replace("The learner ", "").strip(),
                "Cụm này diễn đạt phần hành động chính đầu tiên trong audio.",
            ),
        ],
    }


def _speaking_quiz(level: str, topic_key: str, topic_vi: str, topic_en: str) -> dict:
    meta = LEVEL_META[level]
    min_words = meta["min_words"]
    seconds = meta["seconds"]
    prompts = [
        (
            f"Nói trong {seconds} giây: Describe one experience related to {topic_en}. What happened?",
            "Score task completion, clarity, basic grammar accuracy, and whether the learner describes a concrete experience.",
        ),
        (
            f"Nói trong {seconds} giây: Give your opinion about {topic_en}. Add at least one reason.",
            "Score opinion clarity, reason quality, coherence, vocabulary choice, and grammatical control.",
        ),
        (
            f"Role-play trong {seconds} giây: Ask a tutor for help with a problem about {topic_en}.",
            "Score politeness, functional language, question form, and ability to explain the problem.",
        ),
        (
            f"Nói trong {seconds} giây: Compare two options in {topic_en} and say which one you prefer.",
            "Score comparison language, preference, linking words, vocabulary range, and fluency.",
        ),
        (
            f"Nói trong {seconds} giây: Summarize what you learned from a short practice session about {topic_en}.",
            "Score summary structure, key details, pronunciation clarity inferred from transcript, and self-reflection.",
        ),
    ]
    return {
        "title": f"{level} Speaking - {topic_vi.title()}",
        "topic": topic_key,
        "level": level,
        "description": f"Luyện nói {level} theo tình huống {topic_vi}, tập trung phản xạ, lý do và nối ý.",
        "questions": [
            speaking_prompt(f"q{index}", prompt, min_words, rubric)
            for index, (prompt, rubric) in enumerate(prompts, start=1)
        ],
    }


def _skill_set(level: str) -> dict:
    quizzes = []
    for index, (topic_key, topic_vi, topic_en) in enumerate(TOPICS):
        quizzes.append(_listening_quiz(level, topic_key, topic_vi, topic_en, index))
        quizzes.append(_speaking_quiz(level, topic_key, topic_vi, topic_en))

    return {
        "source_preset": f"cefr_skill_bank_{level.lower()}",
        "title": f"CEFR {level} Listening & Speaking Bank",
        "description": (
            f"Ngân hàng câu hỏi nghe/nói {level} dùng cho quiz và widget trong Gia sư AI. "
            "Các câu hỏi được tạo mới theo CEFR can-do, không sao chép đề thi chính thức."
        ),
        "source_title": "CEFR-aligned original listening and speaking bank",
        "source_url": "https://www.coe.int/web/common-european-framework-reference-languages",
        "license": "Original app seed data aligned to CEFR descriptors; no official exam questions copied.",
        "attribution": "EnglishAItutor CEFR-aligned seed bank.",
        "topic": "communication_skills",
        "level": level,
        "quizzes": quizzes,
    }


CURATED_SKILL_BANK_SETS = [_skill_set(level) for level in ("A1", "A2", "B1", "B2", "C1", "C2")]
