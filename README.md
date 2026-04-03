# English AI Tutor 🎓

An AI-powered English tutoring web app that helps learners practice conversation, check grammar, and explore vocabulary — all powered by OpenAI GPT.

## Features

- 💬 **Conversation Practice** – Chat naturally and receive friendly corrections and tips
- ✏️ **Grammar Check** – Paste any text for detailed grammar corrections with explanations
- 📚 **Vocabulary** – Look up words for definitions, examples, synonyms, and antonyms

## Getting Started

### Prerequisites

- Python 3.10+
- An [OpenAI API key](https://platform.openai.com/api-keys)

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/VanhPoker/EnglishAItutor.git
   cd EnglishAItutor
   ```

2. **Install dependencies**
   ```bash
   pip install -r requirements.txt
   ```

3. **Configure environment variables**
   ```bash
   cp .env.example .env
   # Edit .env and add your OPENAI_API_KEY
   ```

4. **Run the app**
   ```bash
   python app.py
   ```

5. Open your browser at `http://localhost:5000`

## Project Structure

```
EnglishAItutor/
├── app.py              # Flask backend & OpenAI integration
├── requirements.txt    # Python dependencies
├── .env.example        # Environment variable template
├── templates/
│   └── index.html      # Main UI template
└── static/
    ├── css/
    │   └── style.css   # Styles
    └── js/
        └── app.js      # Frontend logic
```

## License

MIT