# Lecture Quiz

A minimal server-rendered quiz generator built with Node.js, Express, SQLite, EJS, and Hugging Face as the default LLM provider. Accounts keep each student's generated quizzes, attempts, and scores private and available for later study.

## Study library

- Sign up or log in to reach a private dashboard.
- Generated questions and attempt scores remain in SQLite.
- Uploading the same extracted PDF content again opens the existing quiz before any LLM request is made.
- On upgrade, the first account claims quizzes created by the earlier single-user version.
- Every quiz read and submission is scoped to the authenticated user.

## Requirements

- Node.js 18 or newer
- Either a Hugging Face token with Inference Providers permission or Ollama running locally

## Run it

```bash
cd /home/enkheeboldu/projects/lecture-quiz
cp .env.example .env
npm install
# Edit .env and replace HF_TOKEN with your Hugging Face token.
```

In another terminal:

```bash
npm start
```

Open <http://localhost:3000>. Run the automated tests with `npm test`.

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `3000` | Web server port |
| `LLM_PROVIDER` | `huggingface` | `huggingface` or `ollama` |
| `HF_TOKEN` | — | Hugging Face access token; required for the hosted provider |
| `HF_MODEL` | `Qwen/Qwen3-4B-Instruct-2507:cheapest` | Hosted model and routing policy |
| `OLLAMA_BASE_URL` | `http://127.0.0.1:11434` | Ollama API origin |
| `OLLAMA_MODEL` | `llama3.2` | Local model used for generation |
| `MAX_PDF_CHARS` | `30000` | Maximum extracted text sent to the model |
| `DATABASE_PATH` | `data/quiz.db` | Optional SQLite path |

Generated databases and temporary uploads are ignored by Git. Uploaded files are deleted immediately after processing. `pdf-parse` extracts embedded text; image-only scans require OCR before upload.

## Structure

```text
src/
  app.js                    Express routes and request flow
  db.js                     SQLite schema and data access
  providers/
    generation-settings.js Generation settings and distribution validation
    huggingface-provider.js Hugging Face implementation
    llm-provider.js         Provider contract
    ollama-provider.js      Ollama implementation
    prompt-templates.js     Prompt templates and difficulty guidance
    question-schema.js      Structured response schema
    parse-questions.js      JSON parsing and validation
    index.js                Provider factory
  services/pdf.js           PDF text extraction
views/                      EJS pages
public/styles.css           UI styles
test/                       Node test runner tests
```

## Adding another LLM provider

Create a class in `src/providers` that extends `LlmProvider` and implements:

```js
async generateQuestions({
  text,
  count,
  difficulty,
  types,
  distribution
}) {
  // Call the remote model, then return:
  // [{ type, difficulty, question, options, correctAnswer,
}
```

Use `parseQuestions` to apply the same response validation, then change `createLlmProvider()` in `src/providers/index.js`. The upload, database, and exam layers do not need to change. API keys should be read from environment variables and never committed.

## Current limits

- Question generation uses the first `MAX_PDF_CHARS` characters, rather than semantic chunking.
- There is no user authentication; quiz URLs are accessible to anyone who knows the ID.
- This first version supports embedded PDF text only, not OCR.
