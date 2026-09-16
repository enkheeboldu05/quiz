const config = require('../config');
const OllamaProvider = require('./ollama-provider');
const HuggingFaceProvider = require('./huggingface-provider');

function createLlmProvider() {
  if (config.llmProvider === 'huggingface') return new HuggingFaceProvider(config.huggingFace);
  if (config.llmProvider === 'ollama') return new OllamaProvider(config.ollama);
  throw new Error(`Unknown LLM_PROVIDER "${config.llmProvider}". Use "ollama" or "huggingface".`);
}

module.exports = { createLlmProvider };
