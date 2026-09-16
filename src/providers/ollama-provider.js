const LlmProvider = require('./llm-provider');
const { parseQuestions } = require('./parse-questions');

class OllamaProvider extends LlmProvider {
  constructor({ baseUrl, model }) {
    super();
    this.baseUrl = baseUrl;
    this.model = model;
  }

  async generateQuestions({ text, count }) {
    const schema = {
      type: 'object',
      properties: {
        questions: {
          type: 'array',
          minItems: count,
          maxItems: count,
          items: {
            type: 'object',
            properties: {
              question: { type: 'string', minLength: 1 },
              options: {
                type: 'array',
                minItems: 4,
                maxItems: 4,
                items: { type: 'string', minLength: 1 }
              },
              correctIndex: { type: 'integer', minimum: 0, maximum: 3 },
              explanation: { type: 'string' }
            },
            required: ['question', 'options', 'correctIndex', 'explanation']
          }
        }
      },
      required: ['questions']
    };
    const prompt = `Create exactly ${count} multiple-choice questions using only the lecture text below.
Return valid JSON only, with this exact shape:
{"questions":[{"question":"...","options":["...","...","...","..."],"correctIndex":0,"explanation":"..."}]}
Each question must have exactly 4 non-empty plausible options. correctIndex is zero-based. Avoid duplicates.

LECTURE TEXT:
${text}`;

    let lastError;
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      try {
        const raw = await this.request(prompt, schema);
        return parseQuestions(raw, count);
      } catch (error) {
        lastError = error;
      }
    }
    throw new Error(`Ollama could not produce valid quiz questions after two attempts: ${lastError.message}`);
  }

  async request(prompt, schema) {
    let response;
    try {
      response = await fetch(`${this.baseUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.model,
          prompt,
          stream: false,
          format: schema,
          options: { temperature: 0 }
        })
      });
    } catch (_error) {
      throw new Error(`Could not connect to Ollama at ${this.baseUrl}. Is it running?`);
    }
    if (!response.ok) {
      const details = await response.text();
      throw new Error(`Ollama request failed (${response.status}): ${details.slice(0, 200)}`);
    }
    const result = await response.json();
    return result.response;
  }
}

module.exports = OllamaProvider;
