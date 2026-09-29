const LlmProvider = require('./llm-provider');
const { normalizeGenerationSettings } = require('./generation-settings');
const { buildQuestionPrompt, SYSTEM_PROMPT } = require('./prompt-templates');
const { questionSchema } = require('./question-schema');
const { parseQuestions } = require('./parse-questions');

class HuggingFaceProvider extends LlmProvider {
  constructor({ token, model, baseUrl }) {
    super();
    this.token = token;
    this.model = model;
    this.baseUrl = baseUrl;
  }

  async generateQuestions({ text, count, difficulty, types, distribution }) {
    if (!this.token || this.token === 'hf_your_token_here') {
      throw new Error('HF_TOKEN is missing. Add a Hugging Face token to .env.');
    }
    if (!String(text || '').trim()) throw new Error('Lecture material is empty.');

    const settings = normalizeGenerationSettings({ count, difficulty, types, distribution });
    let lastValidationError;

    for (let attempt = 1; attempt <= 2; attempt += 1) {
      const prompt = buildQuestionPrompt({
        text: String(text).trim(),
        settings,
        retryReason: attempt === 2 ? lastValidationError.message : ''
      });
      const content = await this.request(prompt, settings.count);
      try {
        return parseQuestions(content, settings);
      } catch (error) {
        lastValidationError = error;
      }
    }

    throw new Error(`Hugging Face could not produce ${settings.count} valid questions after two attempts: ${lastValidationError.message}`);
  }

  async request(prompt, count) {
    let response;
    try {
      response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.model,
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: prompt }
          ],
          response_format: {
            type: 'json_schema',
            json_schema: { name: 'lecture_quiz', strict: true, schema: questionSchema(count) }
          },
          temperature: 0.2,
          max_tokens: Math.max(800, count * 320)
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

    let result;
    try {
      result = await response.json();
    } catch (_error) {
      throw new Error('Hugging Face returned an unreadable response.');
    }
    return result.choices?.[0]?.message?.content || '';
  }
}

module.exports = HuggingFaceProvider;
