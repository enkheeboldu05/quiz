const test = require('node:test');
const assert = require('node:assert/strict');
const { parseQuestions } = require('../src/providers/parse-questions');

function question(overrides) {
  return {
    type: 'multiple_choice',
    difficulty: 'intermediate',
    question: 'Which protocol provides reliable transport?',
    options: ['TCP', 'UDP', 'IP', 'ARP'],
    correctAnswer: 'TCP',
    explanation: 'The lecture describes TCP as reliable.',
    source: 'TCP provides reliable transport.',
    ...overrides
  };
}

test('parses all supported question formats with a requested distribution', () => {
  const payload = { questions: [
    question({}),
    question({
      type: 'true_false',
      difficulty: 'basic',
      question: 'TCP is connection-oriented.',
      options: ['True', 'False'],
      correctAnswer: 'True'
    }),
    question({
      type: 'fill_blank',
      difficulty: 'advanced',
      question: 'The transport protocol that guarantees ordered delivery is _____.',
      options: [],
      correctAnswer: 'TCP'
    }),
    question({
      type: 'short_answer',
      difficulty: 'advanced',
      question: 'Why does TCP use acknowledgements?',
      options: [],
      correctAnswer: 'To confirm successful delivery and support retransmission.'
    })
  ] };
  const parsed = parseQuestions(payload, {
    count: 4,
    difficulty: 'mixed',
    types: ['multiple_choice', 'true_false', 'fill_blank', 'short_answer'],
    distribution: { multiple_choice: 1, true_false: 1, fill_blank: 1, short_answer: 1 }
  });
  assert.equal(parsed[0].correctIndex, 0);
  assert.equal(parsed[1].correctIndex, 0);
  assert.equal(parsed[2].correctIndex, null);
  assert.equal(parsed[3].type, 'short_answer');
});

test('rejects duplicate questions', () => {
  const duplicate = question({ question: 'Which protocol provides reliable transport?!' });
  assert.throws(() => parseQuestions({ questions: [question({}), duplicate] }, {
    count: 2,
    difficulty: 'intermediate',
    types: ['multiple_choice'],
    distribution: { multiple_choice: 2 }
  }), /duplicates an earlier question/);
});

test('rejects answers that are absent from objective options', () => {
  assert.throws(() => parseQuestions({ questions: [question({ correctAnswer: 'HTTP' })] }, {
    count: 1, difficulty: 'intermediate', types: ['multiple_choice']
  }), /must match an available option/);
});

test('rejects invalid true-false options and missing fill-in blanks', () => {
  assert.throws(() => parseQuestions({ questions: [question({
    type: 'true_false', options: ['Yes', 'No'], correctAnswer: 'Yes'
  })] }, { count: 1, difficulty: 'intermediate', types: ['true_false'] }), /True and False/);

  assert.throws(() => parseQuestions({ questions: [question({
    type: 'fill_blank', question: 'Name the reliable transport protocol.', options: [], correctAnswer: 'TCP'
  })] }, { count: 1, difficulty: 'intermediate', types: ['fill_blank'] }), /clearly marked blank/);
});

test('rejects difficulty mismatches and malformed JSON', () => {
  assert.throws(() => parseQuestions({ questions: [question({ difficulty: 'basic' })] }, {
    count: 1, difficulty: 'advanced', types: ['multiple_choice']
  }), /must use advanced difficulty/);
  assert.throws(() => parseQuestions('{"questions":[}', 1), /malformed JSON/);
});
