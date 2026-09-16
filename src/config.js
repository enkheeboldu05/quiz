const path = require('path');

module.exports = {
  port: Number(process.env.PORT) || 3000,
  databasePath: process.env.DATABASE_PATH || path.join(__dirname, '..', 'data', 'quiz.db'),
  uploadDir: path.join(__dirname, '..', 'uploads'),
  llmProvider: (process.env.LLM_PROVIDER || 'ollama').toLowerCase(),
  huggingFace: {
    token: process.env.HF_TOKEN || '',
    model: process.env.HF_MODEL || 'Qwen/Qwen3-4B-Instruct-2507:cheapest',
    baseUrl: (process.env.HF_BASE_URL || 'https://router.huggingface.co/v1').replace(/\/$/, '')
  },
  ollama: {
    baseUrl: (process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434').replace(/\/$/, ''),
    model: process.env.OLLAMA_MODEL || 'llama3.2'
  },
  maxPdfChars: Number(process.env.MAX_PDF_CHARS) || 30000
};
