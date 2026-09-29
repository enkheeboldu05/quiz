const { QUESTION_TYPES } = require('./generation-settings');

function questionSchema(count) {
  return {
    type: 'object',
    additionalProperties: false,
    properties: {
      questions: {
        type: 'array',
        minItems: count,
        maxItems: count,
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            type: { type: 'string', enum: QUESTION_TYPES },
            difficulty: { type: 'string', enum: ['basic', 'intermediate', 'advanced'] },
            question: { type: 'string' },
            options: { type: 'array', minItems: 0, maxItems: 4, items: { type: 'string' } },
            correctAnswer: { type: 'string' },
            explanation: { type: 'string' },
            source: { type: 'string' }
          },
          required: ['type', 'difficulty', 'question', 'options', 'correctAnswer', 'explanation', 'source']
        }
      }
    },
    required: ['questions']
  };
}

module.exports = { questionSchema };
