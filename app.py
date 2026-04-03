import os
from flask import Flask, render_template, request, jsonify, session
from openai import OpenAI
from dotenv import load_dotenv

import warnings

load_dotenv()

app = Flask(__name__)

_secret_key = os.getenv("FLASK_SECRET_KEY")
if not _secret_key:
    warnings.warn(
        "FLASK_SECRET_KEY is not set. Using an insecure default. "
        "Set FLASK_SECRET_KEY in your environment for production use.",
        stacklevel=1,
    )
    _secret_key = "dev-secret-key-change-in-production"
app.secret_key = _secret_key

_api_key = os.getenv("OPENAI_API_KEY")
if not _api_key:
    warnings.warn(
        "OPENAI_API_KEY is not set. Chat endpoints will fail until it is configured.",
        stacklevel=1,
    )
client = OpenAI(api_key=_api_key or "")


SYSTEM_PROMPTS = {
    "conversation": (
        "You are a friendly English tutor. Help the user practice conversational English. "
        "Correct any grammar or vocabulary mistakes naturally during the conversation, "
        "explain corrections briefly, and keep the conversation engaging. "
        "Always respond in English and encourage the learner."
    ),
    "grammar": (
        "You are an expert English grammar teacher. The user will provide text and you will: "
        "1. Identify all grammar mistakes. "
        "2. Provide the corrected version. "
        "3. Explain each correction clearly. "
        "Format your response as:\n"
        "**Corrected text:** <corrected version>\n\n"
        "**Corrections:**\n<numbered list of explanations>"
    ),
    "vocabulary": (
        "You are an English vocabulary coach. Help the user learn and practice new words. "
        "When given a word, provide: definition, part of speech, example sentences, synonyms, "
        "and antonyms. When given a sentence, suggest more sophisticated vocabulary alternatives. "
        "Make learning fun and memorable."
    ),
}


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/chat", methods=["POST"])
def chat():
    data = request.get_json()
    mode = data.get("mode", "conversation")
    user_message = data.get("message", "").strip()

    if not user_message:
        return jsonify({"error": "Message cannot be empty"}), 400

    if mode not in SYSTEM_PROMPTS:
        return jsonify({"error": "Invalid mode"}), 400

    history_key = f"history_{mode}"
    if history_key not in session:
        session[history_key] = []

    messages = [{"role": "system", "content": SYSTEM_PROMPTS[mode]}]
    messages.extend(session[history_key])
    messages.append({"role": "user", "content": user_message})

    try:
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=messages,
            max_tokens=1024,
            temperature=0.7,
        )
        assistant_message = response.choices[0].message.content

        session[history_key] = session[history_key] + [
            {"role": "user", "content": user_message},
            {"role": "assistant", "content": assistant_message},
        ]
        # Keep last 20 messages to avoid token limits
        if len(session[history_key]) > 20:
            session[history_key] = session[history_key][-20:]
        session.modified = True

        return jsonify({"response": assistant_message})
    except Exception as e:
        app.logger.error("OpenAI API error: %s", e)
        return jsonify({"error": "An error occurred while contacting the AI service. Please try again."}), 500


@app.route("/api/clear", methods=["POST"])
def clear_history():
    data = request.get_json()
    mode = data.get("mode", "conversation")
    history_key = f"history_{mode}"
    session.pop(history_key, None)
    session.modified = True
    return jsonify({"status": "cleared"})


if __name__ == "__main__":
    debug = os.getenv("FLASK_DEBUG", "false").lower() == "true"
    app.run(debug=debug)
