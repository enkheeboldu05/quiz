const test = require('node:test');
const assert = require('node:assert/strict');
const { parseQuestions } = require('../src/providers/parse-questions');

test('parses valid fenced model JSON', () => {
  const raw = '```json\n{"questions":[{"question":"Capital of France?","options":["Paris","Rome","Oslo","Lima"],"correctIndex":0,"explanation":"Paris is the capital."}]}\n```';
  const questions = parseQuestions(raw, 1);
  assert.equal(questions[0].question, 'Capital of France?');
  assert.deepEqual(questions[0].options, ['Paris', 'Rome', 'Oslo', 'Lima']);
  assert.equal(questions[0].correctIndex, 0);
});

test('rejects the wrong number of questions', () => {
  assert.throws(
    () => parseQuestions('{"questions":[]}', 2),
    /returned 0 questions instead of 2/
  );
});

test('rejects malformed answer options', () => {
  const raw = '{"questions":[{"question":"Q?","options":["A","B"],"correctIndex":0}]}';
  assert.throws(() => parseQuestions(raw, 1), /exactly four/);
});
