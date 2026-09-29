const TYPE_INSTRUCTIONS = {
  multiple_choice: 'Multiple choice: exactly four unique options. correctAnswer must exactly match one option. Include one correct option and three plausible distractors.',
  true_false: 'True / false: options must be exactly ["True", "False"]. correctAnswer must be exactly "True" or "False".',
  fill_blank: 'Fill in the blank: include a clearly marked blank written as _____. options must be an empty array. correctAnswer must be a concise answer supported by the lecture.',
  short_answer: 'Short answer: ask for a brief factual response. options must be an empty array. correctAnswer must be a concise reference answer for student self-assessment.'
};

const DIFFICULTY_INSTRUCTIONS = {
  basic: 'Focus on terminology, definitions, recall, and identification.',
  intermediate: 'Focus on understanding, relationships, and applying ideas from the lecture.',
  advanced: 'Focus on scenarios, comparison, analysis, and multi-step reasoning grounded in the lecture.',
  mixed: 'Use a useful combination of basic, intermediate, and advanced questions. Label each question with its actual difficulty.'
};

const SYSTEM_PROMPT = 'You create accurate university practice questions from supplied lecture material. Return only valid JSON that follows the provided schema.';

function buildQuestionPrompt({ text, settings, retryReason = '' }) {
  const distribution = Object.entries(settings.distribution)
    .filter(([, count]) => count > 0)
    .map(([type, count]) => `- ${type}: ${count}`)
    .join('\n');
  const formats = settings.types.map(type => TYPE_INSTRUCTIONS[type]).join('\n');

  return `Create exactly ${settings.count} questions using only the lecture material below.

REQUESTED DIFFICULTY
${settings.difficulty}: ${DIFFICULTY_INSTRUCTIONS[settings.difficulty]}

QUESTION DISTRIBUTION
${distribution}

FORMAT RULES
${formats}

QUALITY RULES
- Write clear, unambiguous questions.
- Do not repeat or lightly rephrase the same question.
- Do not invent facts that are absent from the lecture material.
- Every question must have one reference answer and a short explanation.
- For objectively graded questions, provide exactly one correct answer.
- The explanation and source must support the same answer.
- source must be a short supporting excerpt or close paraphrase from the lecture material.
- For mixed difficulty, use only basic, intermediate, or advanced as each question's difficulty.

Return JSON only in this shape:
{"questions":[{"type":"multiple_choice","difficulty":"intermediate","question":"...","options":["...","...","...","..."],"correctAnswer":"...","explanation":"...","source":"..."}]}
${retryReason ? `\nThe previous response was invalid: ${retryReason}\nCorrect that problem in the new response.` : ''}

LECTURE MATERIAL
${text}`;
}

module.exports = { SYSTEM_PROMPT, TYPE_INSTRUCTIONS, DIFFICULTY_INSTRUCTIONS, buildQuestionPrompt };
