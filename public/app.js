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
    const updateProgress = () => {
      const selected = [...examForm.querySelectorAll('input[type="radio"]:checked')].map(input => input.name);
      const typed = [...examForm.querySelectorAll('input[type="text"], textarea')].filter(input => input.value.trim()).map(input => input.name);
      const answered = new Set([...selected, ...typed]).size;
      count.textContent = answered;
      fill.style.width = `${(answered / total) * 100}%`;
    };
    examForm.addEventListener('change', updateProgress);
    examForm.addEventListener('input', updateProgress);
  }

  document.querySelectorAll('[data-confirm-delete]').forEach(form => {
    form.addEventListener('submit', event => {
      if (!window.confirm('Delete this quiz and all of its saved attempts? This cannot be undone.')) event.preventDefault();
    });
  });

  const quizCards = [...document.querySelectorAll('[data-quiz-card]')];
  quizCards.forEach(card => {
    const openCard = event => {
      if (event.target.closest('a, button, input, form, details, summary')) return;
      if (event.type === 'keydown' && event.key !== 'Enter' && event.key !== ' ') return;
      if (event.type === 'keydown') event.preventDefault();
      window.location.href = card.dataset.href;
    };
    card.addEventListener('click', openCard);
    card.addEventListener('keydown', openCard);
  });

  const quizSearch = document.querySelector('#quiz-search');
  if (quizSearch) {
    const empty = document.querySelector('#library-no-results');
    let activeCollection = 'all';
    const filterCards = () => {
      const query = quizSearch.value.trim().toLocaleLowerCase();
      let visible = 0;
      quizCards.forEach(card => {
        const matchesSearch = card.textContent.toLocaleLowerCase().includes(query);
        const matchesCollection = activeCollection === 'all' || card.dataset.collectionId === activeCollection;
        const matches = matchesSearch && matchesCollection;
        card.hidden = !matches;
        if (matches) visible += 1;
      });
      empty.hidden = visible !== 0;
    };
    quizSearch.addEventListener('input', filterCards);
    document.querySelectorAll('[data-collection-filter]').forEach(button => {
      button.addEventListener('click', () => {
        activeCollection = button.dataset.collectionFilter;
        document.querySelectorAll('[data-collection-filter]').forEach(item => item.classList.toggle('active', item === button));
        filterCards();
      });
    });
  }

  document.querySelectorAll('[data-confirm-collection-delete]').forEach(form => {
    form.addEventListener('submit', event => {
      if (!window.confirm('Delete this collection? Its quizzes will remain in Unorganized.')) event.preventDefault();
    });
  });
});
