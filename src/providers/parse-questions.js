const { normalizeGenerationSettings } = require('./generation-settings');

function extractJson(raw) {
  const cleaned = String(raw || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end < start) throw new Error('The model did not return JSON.');
  try {
    return JSON.parse(cleaned.slice(start, end + 1));
  } catch (_error) {
    throw new Error('The model returned malformed JSON.');
  }
}

function comparisonValue(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').toLocaleLowerCase();
}

function questionFingerprint(value) {
  return comparisonValue(value).replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

function parseExpected(expected) {
  if (typeof expected === 'number') {
    return { settings: normalizeGenerationSettings({ count: expected }), requireMetadata: false };
  }
  return { settings: normalizeGenerationSettings(expected), requireMetadata: true };
}

function validateOptions(type, options, index) {
  if (type === 'multiple_choice') {
    if (options.length !== 4 || options.some(option => !option)) {
      throw new Error(`Question ${index + 1} must have text and exactly four non-empty options.`);
    }
    if (new Set(options.map(comparisonValue)).size !== 4) {
      throw new Error(`Question ${index + 1} has duplicate answer options.`);
    }
    return;
  }

  if (type === 'true_false') {
    if (options.length !== 2 || comparisonValue(options[0]) !== 'true' || comparisonValue(options[1]) !== 'false') {
      throw new Error(`Question ${index + 1} must use exactly the options True and False.`);
    }
    return;
  }

  if (options.length !== 0) {
    throw new Error(`Question ${index + 1} must not include options for ${type}.`);
  }
}

function parseQuestions(raw, expected) {
  const { settings, requireMetadata } = parseExpected(expected);
  const payload = typeof raw === 'string' ? extractJson(raw) : raw;
  if (!payload || !Array.isArray(payload.questions)) {
    throw new Error('The model response must contain a questions array.');
  }
  if (payload.questions.length !== settings.count) {
    throw new Error(`The model returned ${payload.questions.length} questions instead of ${settings.count}.`);
  }

  const seenQuestions = new Set();
  const seenDifficulties = new Set();
  const actualDistribution = Object.fromEntries(settings.types.map(type => [type, 0]));
  const questions = payload.questions.map((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new Error(`Question ${index + 1} is not a valid object.`);
    }

    const type = String(item.type || (requireMetadata ? '' : 'multiple_choice')).toLowerCase();
    if (!settings.types.includes(type)) {
      throw new Error(`Question ${index + 1} has unexpected type "${type || 'missing'}".`);
    }

    const difficulty = String(item.difficulty || (requireMetadata ? '' : settings.difficulty)).toLowerCase();
    if (!['basic', 'intermediate', 'advanced'].includes(difficulty)) {
      throw new Error(`Question ${index + 1} has invalid difficulty "${difficulty || 'missing'}".`);
    }
    if (settings.difficulty !== 'mixed' && difficulty !== settings.difficulty) {
      throw new Error(`Question ${index + 1} must use ${settings.difficulty} difficulty.`);
    }
    seenDifficulties.add(difficulty);

    const question = String(item.question || '').trim();
    if (!question) throw new Error(`Question ${index + 1} must have text.`);
    if (type === 'fill_blank' && !/_{3,}/.test(question)) {
      throw new Error(`Question ${index + 1} must contain a clearly marked blank.`);
    }
    const fingerprint = questionFingerprint(question);
    if (seenQuestions.has(fingerprint)) throw new Error(`Question ${index + 1} duplicates an earlier question.`);
    seenQuestions.add(fingerprint);

    const options = Array.isArray(item.options) ? item.options.map(value => String(value).trim()) : [];
    validateOptions(type, options, index);

    const legacyIndex = Number(item.correctIndex);
    const legacyAnswer = Number.isInteger(legacyIndex) && legacyIndex >= 0 && legacyIndex < options.length
      ? options[legacyIndex]
      : '';
    const correctAnswer = String(item.correctAnswer || legacyAnswer).trim();
    if (!correctAnswer) throw new Error(`Question ${index + 1} must have a correct answer.`);

    let correctIndex = null;
    if (type === 'multiple_choice' || type === 'true_false') {
      correctIndex = options.findIndex(option => comparisonValue(option) === comparisonValue(correctAnswer));
      if (correctIndex < 0) {
        throw new Error(`Question ${index + 1} correctAnswer must match an available option.`);
      }
      if (item.correctIndex !== undefined && legacyIndex !== correctIndex) {
        throw new Error(`Question ${index + 1} correctIndex does not match correctAnswer.`);
      }
    }

    const explanation = String(item.explanation || '').trim();
    if (!explanation) throw new Error(`Question ${index + 1} must include an explanation.`);
    const source = String(item.source || '').trim();
    if (requireMetadata && !source) throw new Error(`Question ${index + 1} must include a supporting source excerpt.`);

    actualDistribution[type] += 1;
    return { type, difficulty, question, options, correctAnswer, correctIndex, explanation, source };
  });

  Object.entries(settings.distribution).forEach(([type, expectedCount]) => {
    if (actualDistribution[type] !== expectedCount) {
      throw new Error(`The model returned ${actualDistribution[type]} ${type} questions instead of ${expectedCount}.`);
    }
  });

  if (settings.difficulty === 'mixed' && settings.count > 1 && seenDifficulties.size < 2) {
    throw new Error('Mixed difficulty must include at least two difficulty levels.');
  }

  return questions;
}

module.exports = { extractJson, parseQuestions };
