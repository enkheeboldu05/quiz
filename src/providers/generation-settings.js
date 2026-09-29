const QUESTION_TYPES = ['multiple_choice', 'true_false', 'fill_blank', 'short_answer'];
const DIFFICULTIES = ['basic', 'intermediate', 'advanced', 'mixed'];

function resolveDistribution(count, types, requestedDistribution) {
  if (requestedDistribution !== undefined) {
    if (!requestedDistribution || typeof requestedDistribution !== 'object' || Array.isArray(requestedDistribution)) {
      throw new Error('Question distribution must be an object.');
    }

    const unknown = Object.keys(requestedDistribution).find(type => !types.includes(type));
    if (unknown) throw new Error(`Question distribution includes unselected type "${unknown}".`);

    const distribution = Object.fromEntries(types.map(type => {
      const amount = Number(requestedDistribution[type] ?? 0);
      if (!Number.isInteger(amount) || amount < 0) {
        throw new Error(`Question count for ${type} must be a non-negative integer.`);
      }
      return [type, amount];
    }));

    const total = Object.values(distribution).reduce((sum, amount) => sum + amount, 0);
    if (total !== count) throw new Error(`Question distribution totals ${total}, but ${count} questions were requested.`);
    return distribution;
  }

  const base = Math.floor(count / types.length);
  const remainder = count % types.length;
  return Object.fromEntries(types.map((type, index) => [type, base + (index < remainder ? 1 : 0)]));
}

function normalizeGenerationSettings(input = {}) {
  const count = Number(input.count);
  if (!Number.isInteger(count) || count < 1 || count > 20) {
    throw new Error('Choose between 1 and 20 questions.');
  }

  const difficulty = String(input.difficulty || 'intermediate').toLowerCase();
  if (!DIFFICULTIES.includes(difficulty)) {
    throw new Error(`Unknown difficulty "${difficulty}".`);
  }

  const requestedTypes = input.types === undefined ? ['multiple_choice'] : input.types;
  if (!Array.isArray(requestedTypes) || requestedTypes.length === 0) {
    throw new Error('Choose at least one question type.');
  }
  const types = [...new Set(requestedTypes.map(type => String(type).toLowerCase()))];
  const unknownType = types.find(type => !QUESTION_TYPES.includes(type));
  if (unknownType) throw new Error(`Unknown question type "${unknownType}".`);

  return {
    count,
    difficulty,
    types,
    distribution: resolveDistribution(count, types, input.distribution)
  };
}

module.exports = { QUESTION_TYPES, DIFFICULTIES, normalizeGenerationSettings, resolveDistribution };
