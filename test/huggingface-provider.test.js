const test = require('node:test');
const assert = require('node:assert/strict');
const HuggingFaceProvider = require('../src/providers/huggingface-provider');

function responseWith(content) {
  return {
    ok: true,
    async json() {
      return { choices: [{ message: { content: JSON.stringify(content) } }] };
    }
  };
}

function validQuestion() {
  return {
    questions: [{
      type: 'multiple_choice',
      difficulty: 'intermediate',
      question: 'Which layer routes packets?',
      options: ['Network', 'Transport', 'Session', 'Physical'],
      correctAnswer: 'Network',
      explanation: 'The network layer performs routing.',
      source: 'The network layer routes packets.'
    }]
  };
}

test('uses one Hugging Face request when output is valid', async t => {
  const requests = [];
  t.mock.method(global, 'fetch', async (_url, options) => {
    requests.push(JSON.parse(options.body));
    return responseWith(validQuestion());
  });
  const provider = new HuggingFaceProvider({ token: 'test-token', model: 'configured-model', baseUrl: 'https://example.test/v1' });
  const questions = await provider.generateQuestions({ text: 'Lecture text', count: 1 });
  assert.equal(requests.length, 1);
  assert.equal(requests[0].model, 'configured-model');
  assert.equal(requests[0].response_format.type, 'json_schema');
  assert.equal(questions[0].correctIndex, 0);
});

test('retries once after invalid generated JSON', async t => {
  let calls = 0;
  t.mock.method(global, 'fetch', async () => {
    calls += 1;
    return calls === 1 ? responseWith({ questions: [] }) : responseWith(validQuestion());
  });
  const provider = new HuggingFaceProvider({ token: 'test-token', model: 'configured-model', baseUrl: 'https://example.test/v1' });
  const questions = await provider.generateQuestions({ text: 'Lecture text', count: 1 });
  assert.equal(calls, 2);
  assert.equal(questions.length, 1);
});
