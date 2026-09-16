class LlmProvider {
  async generateQuestions(_input) {
    throw new Error('generateQuestions must be implemented by an LLM provider');
  }
}

module.exports = LlmProvider;
