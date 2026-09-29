const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeGenerationSettings } = require('../src/providers/generation-settings');
const { buildQuestionPrompt } = require('../src/providers/prompt-templates');

test('defaults to intermediate multiple-choice generation', () => {
  assert.deepEqual(normalizeGenerationSettings({ count: 3 }), {
    count: 3,
    difficulty: 'intermediate',
    types: ['multiple_choice'],
    distribution: { multiple_choice: 3 }
  });
});

test('balances counts across selected question types', () => {
  const settings = normalizeGenerationSettings({
    count: 7,
    difficulty: 'mixed',
    types: ['multiple_choice', 'true_false', 'fill_blank']
  });
  assert.deepEqual(settings.distribution, { multiple_choice: 3, true_false: 2, fill_blank: 2 });
});

test('rejects a distribution that does not match the total', () => {
  assert.throws(() => normalizeGenerationSettings({
    count: 5,
    types: ['multiple_choice', 'true_false'],
    distribution: { multiple_choice: 3, true_false: 1 }
  }), /totals 4, but 5 questions were requested/);
});

test('prompt includes difficulty, formats, distribution, and grounding rules', () => {
  const settings = normalizeGenerationSettings({
    count: 2,
    difficulty: 'advanced',
    types: ['multiple_choice', 'short_answer'],
    distribution: { multiple_choice: 1, short_answer: 1 }
  });
  const prompt = buildQuestionPrompt({ text: 'Lecture text', settings });
  assert.match(prompt, /advanced: Focus on scenarios/);
  assert.match(prompt, /multiple_choice: 1/);
  assert.match(prompt, /short_answer: 1/);
  assert.match(prompt, /Do not invent facts/);
  assert.match(prompt, /source must be a short supporting excerpt/);
});
