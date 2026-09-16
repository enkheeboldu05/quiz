document.addEventListener('DOMContentLoaded', () => {
  const generatorForm = document.querySelector('#quiz-generator-form');
  const overlay = document.querySelector('#generation-overlay');

  if (generatorForm && overlay) {
    generatorForm.addEventListener('submit', () => {
      if (!generatorForm.checkValidity()) return;
      overlay.hidden = false;
      document.body.classList.add('is-generating');
      const headings = ['Reading your lecture…', 'Checking your library…', 'Writing your questions…', 'Finishing your quiz…'];
      const steps = [...overlay.querySelectorAll('.generation-steps li')];
      const heading = overlay.querySelector('#generation-title');
      let activeStep = 0;

      window.setInterval(() => {
        if (activeStep >= steps.length - 1) return;
        steps[activeStep].classList.remove('active');
        steps[activeStep].classList.add('complete');
        activeStep += 1;
        steps[activeStep].classList.add('active');
        heading.textContent = headings[activeStep];
      }, 3500);
    });
  }

  const examForm = document.querySelector('#exam-form');
  if (examForm) {
    const total = Number(examForm.dataset.questionCount);
    const count = document.querySelector('#answered-count');
    const fill = document.querySelector('#progress-fill');
    examForm.addEventListener('change', () => {
      const answered = new Set([...examForm.querySelectorAll('input[type="radio"]:checked')].map(input => input.name)).size;
      count.textContent = answered;
      fill.style.width = `${(answered / total) * 100}%`;
    });
  }

  document.querySelectorAll('[data-confirm-delete]').forEach(form => {
    form.addEventListener('submit', event => {
      if (!window.confirm('Delete this quiz and all of its saved attempts? This cannot be undone.')) event.preventDefault();
    });
  });
});
