const LlmProvider = require('./llm-provider');
const { parseQuestions } = require('./parse-questions');

function questionSchema(count) {
  return {
    type: 'object',
    additionalProperties: false,
    properties: {
      questions: {
        type: 'array', minItems: count, maxItems: count,
        items: {
          type: 'object', additionalProperties: false,
          properties: {
            question: { type: 'string' },
            options: { type: 'array', minItems: 4, maxItems: 4, items: { type: 'string' } },
            correctIndex: { type: 'integer', minimum: 0, maximum: 3 },
            explanation: { type: 'string' }
          },
          required: ['question', 'options', 'correctIndex', 'explanation']
        }
      }
    },
    required: ['questions']
  };
}

class HuggingFaceProvider extends LlmProvider {
  constructor({ token, model, baseUrl }) {
    super();
    this.token = token;
    this.model = model;
    this.baseUrl = baseUrl;
  }

  async generateQuestions({ text, count }) {
    if (!this.token || this.token === 'hf_your_token_here') {
      throw new Error('HF_TOKEN is missing. Add a Hugging Face token to .env.');
    }

    const prompt = `Create exactly ${count} multiple-choice questions using only the lecture text below.
Return JSON only. Every question needs exactly four non-empty options, a zero-based correctIndex, and a short explanation.
Exactly one option must be factually correct. The correctIndex must point to that option, and the explanation must support the same option from the lecture text. Make distractors clearly incorrect but plausible.
Use this exact shape:
{"questions":[{"question":"...","options":["...","...","...","..."],"correctIndex":0,"explanation":"..."}]}

LECTURE TEXT:
${text}`;

    let response;
    try {
      response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.model,
          messages: [
            { role: 'system', content: 'You create accurate quizzes and return only valid JSON.' },
            { role: 'user', content: prompt }
          ],
          response_format: {
            type: 'json_schema',
            json_schema: { name: 'lecture_quiz', strict: true, schema: questionSchema(count) }
          },
          temperature: 0.2,
          max_tokens: Math.max(500, count * 250)
        }),
        signal: AbortSignal.timeout(120000)
      });
    } catch (error) {
      if (error.name === 'TimeoutError') throw new Error('Hugging Face timed out after two minutes.');
      throw new Error(`Could not connect to Hugging Face: ${error.message}`);
    }

    if (!response.ok) {
      const details = await response.text();
      throw new Error(`Hugging Face request failed (${response.status}): ${details.slice(0, 300)}`);
    }

    const result = await response.json();
    const content = result.choices && result.choices[0] && result.choices[0].message && result.choices[0].message.content;
    if (!content) throw new Error('Hugging Face returned an empty response.');
    return parseQuestions(content, count);
  }
}

module.exports = HuggingFaceProvider;
