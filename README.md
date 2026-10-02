# Lecture Quiz

Lecture Quiz turns text-based lecture PDFs into reusable practice quizzes. It is a server-rendered student project built with Node.js, Express, EJS, SQLite, and a modular LLM provider layer. Hugging Face is the default provider.

## Features

- Account sign-up, login, logout, and user-owned data
- PDF text extraction and AI-generated questions
- Multiple choice, True/False, fill-in-the-blank, and short-answer formats
- Basic, intermediate, advanced, and mixed difficulty
- Structured-response validation with one retry for invalid model output
- Saved quizzes, scores, explanations, and lecture source excerpts
- Reusable quiz collections for organizing related material
- Dashboard search, collection filters, rename, move, and delete controls
- Duplicate-generation protection for matching material and settings
- Responsive EJS interface with no frontend framework

## Tech stack

- Node.js and Express
- EJS and plain CSS/JavaScript
- SQLite with `better-sqlite3`
- `pdf-parse` for embedded PDF text
- `bcrypt` and `express-session` for authentication
- Hugging Face Inference Providers by default
- Optional Ollama provider

## Setup

Requirements: Node.js 18+ and a Hugging Face token with inference permission.

```bash
cd /home/enkheeboldu/projects/lecture-quiz
cp .env.example .env
npm install
```

Add your token to `.env`, then start the application:

```env
LLM_PROVIDER=huggingface
HF_TOKEN=your_token_here
```

```bash
npm start
```

Open <http://localhost:3000>.

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `3000` | Local web-server port |
| `LLM_PROVIDER` | `huggingface` | `huggingface` or `ollama` |
| `HF_TOKEN` | — | Hugging Face access token |
| `HF_MODEL` | `Qwen/Qwen3-4B-Instruct-2507:cheapest` | Hosted model and routing policy |
| `OLLAMA_BASE_URL` | `http://127.0.0.1:11434` | Local Ollama API URL |
| `OLLAMA_MODEL` | `llama3.2` | Local Ollama model |
| `MAX_PDF_CHARS` | `30000` | Maximum extracted characters sent to the model |
| `DATABASE_PATH` | `data/quiz.db` | SQLite database location |
| `SESSION_SECRET` | Random per startup | Session-signing secret; set a stable value locally |

Never commit `.env` or access tokens. Temporary PDF uploads are deleted after processing, and generated database files are ignored by Git.

## Project structure

```text
lecture-quiz/
├── src/
│   ├── app.js                 # Express routes and application flow
│   ├── db.js                  # SQLite schema and data access
│   ├── middleware/            # Authentication middleware
│   ├── providers/             # Hugging Face, Ollama, prompts and validation
│   ├── routes/                # Authentication routes
│   └── services/              # PDF extraction and logging
├── views/                     # EJS pages
├── public/                    # Browser JavaScript and CSS
├── test/                      # Node test-runner tests
├── data/                      # Local SQLite data
└── uploads/                   # Temporary PDF uploads
```

## Provider architecture

The generation layer is isolated under `src/providers`. A provider receives lecture text and normalized generation settings, then returns validated questions:

```js
generateQuestions({ text, count, difficulty, types, distribution })
```

This keeps the application ready for another provider without rewriting upload, database, authentication, or quiz routes.

## Current limitations

- Only PDFs with embedded text are supported; scanned documents require OCR first.
- Only the first `MAX_PDF_CHARS` characters are used; semantic document chunking is not implemented.
- Fill-in and short answers use normalized exact matching, so equivalent alternative wording may be marked incorrect.
- Generated source excerpts improve traceability but do not independently prove factual correctness.
- The default in-memory session store is suitable for local development, not production deployment.
- The Ollama fallback still focuses on the older multiple-choice generation flow.

## Tests

```bash
npm test
```

Tests mock hosted-model responses and should not consume Hugging Face inference tokens.
