function log(event, details = {}) {
  console.log(JSON.stringify({
    time: new Date().toISOString(),
    service: 'quiz-generation',
    event,
    ...details
  }));
}

module.exports = { log };
