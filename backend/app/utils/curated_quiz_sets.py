"""Curated open-source quiz sets used to replace low-quality fallback data."""

from __future__ import annotations


def mc(
    question_id: str,
    prompt: str,
    options: list[str],
    answer: str,
    explanation: str,
    focus: str,
) -> dict:
    return {
        "id": question_id,
        "type": "multiple_choice",
        "prompt": prompt,
        "options": options,
        "correct_answer": answer,
        "explanation": explanation,
        "focus": focus,
    }


def blank(
    question_id: str,
    prompt: str,
    answer: str,
    explanation: str,
    focus: str,
) -> dict:
    return {
        "id": question_id,
        "type": "fill_blank",
        "prompt": prompt,
        "options": [],
        "correct_answer": answer,
        "explanation": explanation,
        "focus": focus,
    }


CURATED_OPEN_QUIZ_SETS = [
    {
        "source_preset": "wikibooks_grammar",
        "title": "Wikibooks Grammar Foundations - B1",
        "description": (
            "Bộ đề B1 được biên soạn từ các chủ đề ngữ pháp cơ bản của Wikibooks English Grammar, "
            "tập trung vào câu hoàn chỉnh, liên từ, mệnh đề và cách dùng từ trong ngữ cảnh."
        ),
        "source_title": "Wikibooks English Grammar",
        "source_url": "https://en.wikibooks.org/wiki/English_Grammar",
        "license": "Wikibooks content is generally CC BY-SA; preserve attribution if reused.",
        "attribution": "Wikibooks contributors - English Grammar.",
        "topic": "daily_life",
        "level": "B1",
        "quizzes": [
            {
                "title": "Câu hoàn chỉnh và động từ trong ngữ cảnh",
                "description": "Luyện câu đầy đủ thành phần và cách dùng động từ, đại từ, giới từ.",
                "questions": [
                    mc(
                        "q1",
                        "Choose the complete sentence.",
                        [
                            "My sister works at a library.",
                            "My sister working at a library.",
                            "My sister work at a library yesterday.",
                            "My sister at a library every day.",
                        ],
                        "My sister works at a library.",
                        "A complete sentence needs a subject and a correctly formed verb.",
                        "grammar",
                    ),
                    blank(
                        "q2",
                        "Complete the sentence: If he ___ early, we can start the meeting on time.",
                        "arrives",
                        "Use the present simple after 'if' when talking about a real future condition.",
                        "grammar",
                    ),
                    mc(
                        "q3",
                        "In the sentence 'They invited us after class,' which word is the object pronoun?",
                        ["They", "invited", "us", "class"],
                        "us",
                        "'Us' receives the action of the verb, so it is the object pronoun.",
                        "structure",
                    ),
                    mc(
                        "q4",
                        "Choose the correct preposition: I am interested ___ learning how to speak more naturally.",
                        ["in", "on", "at", "for"],
                        "in",
                        "We use the fixed pattern 'interested in' before a noun or gerund.",
                        "word_choice",
                    ),
                    blank(
                        "q5",
                        "Complete the sentence: The report was short, but it was very ___.",
                        "useful",
                        "The adjective 'useful' matches the idea that the report had value.",
                        "vocabulary",
                    ),
                ],
            },
            {
                "title": "Mệnh đề, liên từ và câu nối ý",
                "description": "Luyện cách nói nguyên nhân, kết quả, nhượng bộ và mệnh đề quan hệ.",
                "questions": [
                    mc(
                        "q1",
                        "Choose the sentence that uses 'although' correctly.",
                        [
                            "Although the task was difficult, we finished it before lunch.",
                            "Although the task was difficult, but we finished it before lunch.",
                            "Although difficult the task, we finished it before lunch.",
                            "Although we finished it before lunch the task was difficult.",
                        ],
                        "Although the task was difficult, we finished it before lunch.",
                        "Use 'although' to introduce contrast without adding 'but' in the same clause.",
                        "grammar",
                    ),
                    blank(
                        "q2",
                        "Complete the sentence: We stayed inside because it ___ raining heavily.",
                        "was",
                        "Use the past continuous idea 'was raining' for an action in progress in the past.",
                        "grammar",
                    ),
                    mc(
                        "q3",
                        "Which sentence uses a relative clause correctly?",
                        [
                            "The app that I use every day helps me review vocabulary.",
                            "The app what I use every day helps me review vocabulary.",
                            "The app I use every day it helps me review vocabulary.",
                            "The app that use every day helps me review vocabulary.",
                        ],
                        "The app that I use every day helps me review vocabulary.",
                        "The relative pronoun 'that' links the noun 'app' to the clause that describes it.",
                        "structure",
                    ),
                    mc(
                        "q4",
                        "Choose the best connector to show a result.",
                        [
                            "The bus was delayed, so we joined the meeting online.",
                            "The bus was delayed, because we joined the meeting online.",
                            "The bus was delayed, although we joined the meeting online.",
                            "The bus was delayed, if we joined the meeting online.",
                        ],
                        "The bus was delayed, so we joined the meeting online.",
                        "'So' introduces the result of the delay.",
                        "coherence",
                    ),
                    blank(
                        "q5",
                        "Complete the sentence: If I had more time this semester, I ___ join the English club.",
                        "would",
                        "Use 'would' in the result clause of a second conditional sentence.",
                        "grammar",
                    ),
                ],
            },
        ],
    },
    {
        "source_preset": "tatoeba_sentences",
        "title": "Tatoeba Everyday Sentences - B1",
        "description": (
            "Bộ đề được chọn từ kho câu mở Tatoeba CC0/CC BY, ưu tiên các tình huống đối thoại ngắn "
            "để học viên luyện câu yêu cầu, thông báo và xử lý tình huống hằng ngày."
        ),
        "source_title": "Tatoeba Sentence Practice",
        "source_url": "https://downloads.tatoeba.org/exports/per_language/eng/eng_sentences_CC0.tsv.bz2",
        "license": "Tatoeba text exports are CC BY 2.0 FR, with some CC0 subsets.",
        "attribution": "Tatoeba Project contributors.",
        "topic": "daily_life",
        "level": "B1",
        "quizzes": [
            {
                "title": "Yêu cầu lịch sự và thông điệp ngắn",
                "description": "Luyện câu nói lịch sự, thông báo trễ giờ và hỏi thông tin trong đời sống.",
                "questions": [
                    mc(
                        "q1",
                        "Choose the most polite request.",
                        [
                            "Could you please print this?",
                            "Print this for me now.",
                            "You print this?",
                            "Please you print this now.",
                        ],
                        "Could you please print this?",
                        "This request sounds polite because it uses 'Could you please...?'",
                        "speaking",
                    ),
                    blank(
                        "q2",
                        "Complete the sentence: Please feel free to correct my ___.",
                        "mistakes",
                        "The natural expression is 'correct my mistakes.'",
                        "vocabulary",
                    ),
                    mc(
                        "q3",
                        "You will arrive a little late. Which message sounds natural?",
                        [
                            "I'm going to be a few minutes late.",
                            "I late a few minutes am going.",
                            "I will delay a little minutes.",
                            "My late is a few minutes.",
                        ],
                        "I'm going to be a few minutes late.",
                        "This is a natural way to warn someone that you will not arrive on time.",
                        "speaking",
                    ),
                    blank(
                        "q4",
                        "Complete the sentence: I forgot that we had ___.",
                        "homework",
                        "The sentence becomes natural as 'I forgot that we had homework.'",
                        "comprehension",
                    ),
                    mc(
                        "q5",
                        "Choose the best question to ask when you want to find food nearby.",
                        [
                            "Where can I get Thai food around here?",
                            "Where I get Thai food around here?",
                            "Where can get Thai food here around?",
                            "Where Thai food is around here get?",
                        ],
                        "Where can I get Thai food around here?",
                        "This question uses the correct word order for asking about a place.",
                        "structure",
                    ),
                ],
            },
            {
                "title": "Kế hoạch, giá cả và công việc thực tế",
                "description": "Luyện đề xuất, xin giúp đỡ, hỏi giá và nói về việc cần làm.",
                "questions": [
                    mc(
                        "q1",
                        "Choose the most natural suggestion.",
                        [
                            "We should try to meet another time.",
                            "We should to meet another time.",
                            "We should meeting another time.",
                            "We should met another time.",
                        ],
                        "We should try to meet another time.",
                        "After 'should', use the base verb. 'Try to meet' is natural here.",
                        "grammar",
                    ),
                    blank(
                        "q2",
                        "Complete the sentence: I need to buy something from the store on the way ___.",
                        "back",
                        "The phrase 'on the way back' means while returning.",
                        "word_choice",
                    ),
                    mc(
                        "q3",
                        "Choose the best way to ask for physical help.",
                        [
                            "Can you help me lift this box?",
                            "Can you help me lifting this box?",
                            "Can help you me lift this box?",
                            "Help me can you this box?",
                        ],
                        "Can you help me lift this box?",
                        "Use 'help someone + base verb' for this kind of request.",
                        "speaking",
                    ),
                    blank(
                        "q4",
                        "Complete the sentence: Could you give me a call at 7 tomorrow ___, please?",
                        "morning",
                        "The original sentence uses the time phrase 'tomorrow morning.'",
                        "vocabulary",
                    ),
                    mc(
                        "q5",
                        "Choose the most natural price question.",
                        [
                            "How much is all this going to cost?",
                            "How much all this is going to cost?",
                            "How much cost all this going to?",
                            "How much is going cost all this?",
                        ],
                        "How much is all this going to cost?",
                        "This question keeps the auxiliary and subject in the correct order.",
                        "structure",
                    ),
                ],
            },
        ],
    },
    {
        "source_preset": "cefr_core",
        "title": "CEFR B1 Communication Tasks",
        "description": (
            "Bộ đề tập trung vào các tình huống giao tiếp B1 được đối chiếu theo can-do statements: "
            "nêu ý kiến, xin giải thích, kể lại trải nghiệm và đề xuất cách xử lý vấn đề."
        ),
        "source_title": "CEFR Self-assessment Grid",
        "source_url": "https://www.coe.int/en/web/portfolio/self-assessment-grid",
        "license": "Council of Europe CEFR descriptors; use as alignment reference.",
        "attribution": "Council of Europe - Common European Framework of Reference for Languages.",
        "topic": "work_career",
        "level": "B1",
        "quizzes": [
            {
                "title": "Nêu ý kiến và giải thích rõ hơn",
                "description": "Luyện cách đưa lý do, trình bày quan điểm và xin giải thích lại một cách lịch sự.",
                "questions": [
                    mc(
                        "q1",
                        "A classmate asks why you study English. Which answer is best for B1 conversation?",
                        [
                            "I study English because I want to work with international clients in the future.",
                            "English because future international clients.",
                            "Study English, yes, work future client.",
                            "Because international, I English.",
                        ],
                        "I study English because I want to work with international clients in the future.",
                        "A strong B1 answer gives a clear reason in a full sentence.",
                        "speaking",
                    ),
                    blank(
                        "q2",
                        "Complete the sentence: In my opinion, online lessons are useful ___ they save travel time.",
                        "because",
                        "Use 'because' to introduce the reason for your opinion.",
                        "coherence",
                    ),
                    mc(
                        "q3",
                        "You need to clarify your point in a discussion. Choose the best response.",
                        [
                            "What I mean is that we need more time to test the idea carefully.",
                            "My meaning more time test idea carefully.",
                            "I mean what time is carefully idea.",
                            "The meaning is we testing more.",
                        ],
                        "What I mean is that we need more time to test the idea carefully.",
                        "This answer clarifies the speaker's meaning in a natural way.",
                        "speaking",
                    ),
                    mc(
                        "q4",
                        "Which sentence best describes a past experience?",
                        [
                            "I used English at a hotel when I traveled to Da Nang last summer.",
                            "I use English at a hotel last summer.",
                            "I am using English at a hotel last summer.",
                            "I have use English at a hotel last summer.",
                        ],
                        "I used English at a hotel when I traveled to Da Nang last summer.",
                        "The past simple fits a completed experience in the past.",
                        "grammar",
                    ),
                    blank(
                        "q5",
                        "Complete the question: Could you explain that one more ___?",
                        "time",
                        "The fixed phrase is 'one more time.'",
                        "speaking",
                    ),
                ],
            },
            {
                "title": "Giải quyết vấn đề và đề xuất cách làm",
                "description": "Luyện đưa đề xuất, kiểm tra đã hiểu đúng và xử lý vấn đề khi giao tiếp.",
                "questions": [
                    mc(
                        "q1",
                        "Your teammate is absent from an online meeting. Which message is best?",
                        [
                            "The meeting has started. Let me know if you need the link again.",
                            "Meeting started. You absent. Link again?",
                            "Started meeting and you no here link?",
                            "The meeting start. Need link absent?",
                        ],
                        "The meeting has started. Let me know if you need the link again.",
                        "This message is clear, helpful, and appropriate in a work context.",
                        "speaking",
                    ),
                    blank(
                        "q2",
                        "Complete the suggestion: Why don't we ___ the quiz first and discuss the answers later?",
                        "finish",
                        "Use the base verb after 'Why don't we...?'",
                        "grammar",
                    ),
                    mc(
                        "q3",
                        "Choose the most polite suggestion.",
                        [
                            "Maybe we could practice in pairs first.",
                            "You practice in pairs first.",
                            "Practice pairs first now.",
                            "Maybe practice pair first you.",
                        ],
                        "Maybe we could practice in pairs first.",
                        "This suggestion sounds cooperative and polite.",
                        "speaking",
                    ),
                    mc(
                        "q4",
                        "Which response shows that you understood and want to confirm the main point?",
                        [
                            "So the main point is that I need to compare the two ideas, right?",
                            "Main point compare two ideas right I need.",
                            "I compare two ideas main point?",
                            "Need two ideas right compare main point.",
                        ],
                        "So the main point is that I need to compare the two ideas, right?",
                        "This sentence summarizes the idea and checks understanding.",
                        "comprehension",
                    ),
                    blank(
                        "q5",
                        "Complete the sentence: I didn't catch the last part. Could you say it ___?",
                        "again",
                        "Use 'say it again' to ask someone to repeat information.",
                        "speaking",
                    ),
                ],
            },
        ],
    },
    {
        "source_preset": "thpt_2025_format",
        "title": "Luyện cấu trúc THPT 2025 - B1",
        "description": (
            "Bộ đề mới được biên soạn theo hướng đọc hiểu ngắn, từ vựng trong ngữ cảnh và language-use "
            "dựa trên cấu trúc THPT 2025. Đây là bộ luyện theo format, không sao chép đề thi thật."
        ),
        "source_title": "THPT 2025 English Format",
        "source_url": "https://xaydungchinhsach.chinhphu.vn/cau-truc-dinh-dang-de-thi-tot-nghiep-thpt-tu-nam-2025-11923122912242127.htm",
        "license": "Use as exam-format reference; generate original questions unless reuse rights are confirmed.",
        "attribution": "Vietnam Ministry of Education and Training format reference.",
        "topic": "work_career",
        "level": "B1",
        "quizzes": [
            {
                "title": "Thông báo ngắn và chi tiết quan trọng",
                "description": "Luyện dạng thông báo ngắn, tìm thông tin trực tiếp và hoàn thành câu.",
                "questions": [
                    mc(
                        "q1",
                        (
                            "Read the notice: 'The school English club will hold a speaking workshop on Friday "
                            "at 6:30 p.m. in Room 204. Students should bring a notebook and arrive 10 minutes "
                            "early. To register, send your name to Ms. Lan before Thursday noon.'\n\n"
                            "What is the notice mainly about?"
                        ),
                        [
                            "An English speaking workshop",
                            "A science competition",
                            "A classroom repair schedule",
                            "A bus timetable",
                        ],
                        "An English speaking workshop",
                        "The whole notice gives information about the time, place, and registration for a workshop.",
                        "reading",
                    ),
                    mc(
                        "q2",
                        "Based on the notice, where will the workshop take place?",
                        ["In Room 204", "In the library", "In Room 104", "In the school yard"],
                        "In Room 204",
                        "The location is stated directly in the notice.",
                        "reading",
                    ),
                    blank(
                        "q3",
                        "Complete the sentence: Students should arrive 10 minutes ___.",
                        "early",
                        "The notice says learners should arrive 10 minutes early.",
                        "reading",
                    ),
                    mc(
                        "q4",
                        "How should students register?",
                        [
                            "Send their name to Ms. Lan before Thursday noon.",
                            "Call the school office after Friday evening.",
                            "Pay at the door on Saturday morning.",
                            "Write their name on the classroom board.",
                        ],
                        "Send their name to Ms. Lan before Thursday noon.",
                        "The notice gives a direct registration instruction.",
                        "reading",
                    ),
                    mc(
                        "q5",
                        "What should students bring?",
                        ["A notebook", "A dictionary", "A laptop", "A school uniform"],
                        "A notebook",
                        "This detail appears in the second sentence of the notice.",
                        "reading",
                    ),
                ],
            },
            {
                "title": "Từ vựng trong ngữ cảnh và language use",
                "description": "Luyện từ vựng, paraphrase, mệnh đề quan hệ và câu dùng trong văn phong học tập.",
                "questions": [
                    mc(
                        "q1",
                        "Choose the best sentence.",
                        [
                            "The volunteer group organized books for the community library.",
                            "The volunteer group organize books for the community library yesterday.",
                            "The volunteer group organizing books for the community library yesterday.",
                            "The volunteer group was organize books for the community library.",
                        ],
                        "The volunteer group organized books for the community library.",
                        "Use the past simple 'organized' for a finished activity.",
                        "grammar",
                    ),
                    mc(
                        "q2",
                        "Choose the word closest in meaning to 'update' in this sentence: 'Please update the class schedule before 5 p.m.'",
                        ["revise", "hide", "forget", "borrow"],
                        "revise",
                        "'Update' means to make information more current or correct.",
                        "vocabulary",
                    ),
                    blank(
                        "q3",
                        "Complete the sentence: The student who won the scholarship is the one ___ studied most consistently.",
                        "who",
                        "Use 'who' for a relative clause that refers to a person.",
                        "grammar",
                    ),
                    mc(
                        "q4",
                        "Choose the best paraphrase: 'The manager approved the plan after the team revised it.'",
                        [
                            "The team changed the plan, and then the manager accepted it.",
                            "The manager changed the team after the plan.",
                            "The team accepted the manager before the plan.",
                            "The plan revised the manager and the team.",
                        ],
                        "The team changed the plan, and then the manager accepted it.",
                        "A good paraphrase keeps the original order of events and meaning.",
                        "comprehension",
                    ),
                    mc(
                        "q5",
                        "Choose the sentence that sounds most natural in an academic context.",
                        [
                            "I need a little more time to check the final draft carefully.",
                            "I need a little more time checking the final draft carefully.",
                            "I need more little time to careful check the final draft.",
                            "I need time to carefully final draft check more.",
                        ],
                        "I need a little more time to check the final draft carefully.",
                        "This sentence keeps the infinitive pattern and adverb placement natural.",
                        "word_choice",
                    ),
                ],
            },
        ],
    },
]
