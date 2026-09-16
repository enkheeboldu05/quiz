function extractJson(raw) {
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end < start) throw new Error('The model did not return JSON.');
  return JSON.parse(cleaned.slice(start, end + 1));
}

function parseQuestions(raw, expectedCount) {
  const payload = typeof raw === 'string' ? extractJson(raw) : raw;
  if (!payload || !Array.isArray(payload.questions)) {
    throw new Error('The model response must contain a questions array.');
  }
  if (payload.questions.length !== expectedCount) {
    throw new Error(`The model returned ${payload.questions.length} questions instead of ${expectedCount}.`);
  }

  return payload.questions.map((item, index) => {
    const question = String(item.question || '').trim();
    const options = Array.isArray(item.options) ? item.options.map(value => String(value).trim()) : [];
    const correctIndex = Number(item.correctIndex);
    if (!question || options.length !== 4 || options.some(option => !option)) {
      throw new Error(`Question ${index + 1} must have text and exactly four non-empty options.`);
    }
    if (!Number.isInteger(correctIndex) || correctIndex < 0 || correctIndex > 3) {
      throw new Error(`Question ${index + 1} has an invalid correctIndex.`);
    }
    return { question, options, correctIndex, explanation: String(item.explanation || '').trim() };
  });
}

module.exports = { parseQuestions };
