/* ===================================================
   Quiz App – app.js
   =================================================== */

const TIMER_SECONDS = 49;
const CIRCUMFERENCE_SMALL = 2 * Math.PI * 18; // r=18  → 113.1
const CIRCUMFERENCE_LARGE = 2 * Math.PI * 54; // r=54  → 339.3

// ── DOM references ──────────────────────────────────
const screens = {
  home:    document.getElementById('screen-home'),
  quiz:    document.getElementById('screen-quiz'),
  results: document.getElementById('screen-results'),
};

const categorySelect  = document.getElementById('category-select');
const questionCount   = document.getElementById('question-count');
const timerToggle     = document.getElementById('timer-toggle');
const btnStart        = document.getElementById('btn-start');

const questionCounter = document.getElementById('question-counter');
const categoryBadge   = document.getElementById('category-badge');
const timerContainer  = document.getElementById('timer-container');
const timerCircle     = document.getElementById('timer-circle');
const timerText       = document.getElementById('timer-text');
const progressBar     = document.getElementById('progress-bar');
const questionText    = document.getElementById('question-text');
const optionsContainer= document.getElementById('options-container');
const btnNext         = document.getElementById('btn-next');

const resultEmoji     = document.getElementById('result-emoji');
const resultTitle     = document.getElementById('result-title');
const resultSubtitle  = document.getElementById('result-subtitle');
const scoreValue      = document.getElementById('score-value');
const scoreTotal      = document.getElementById('score-total');
const scoreArc        = document.getElementById('score-arc');
const reviewContainer = document.getElementById('review-container');
const btnRestart      = document.getElementById('btn-restart');
const btnHome         = document.getElementById('btn-home');

// ── State ────────────────────────────────────────────
let allQuestions   = [];
let quizQuestions  = [];
let currentIndex   = 0;
let score          = 0;
let answers        = [];   // { question, correct, chosen, isRight }
let timerInterval  = null;
let timerRemaining = TIMER_SECONDS;
let useTimer       = true;
let failedMode     = false;

// ── Historial de fallos (localStorage) ───────────────
const FAILED_KEY = 'quiz_failed_ids';

function getFailedIds() {
  try { return new Set(JSON.parse(localStorage.getItem(FAILED_KEY) || '[]')); }
  catch { return new Set(); }
}

function saveFailedIds(set) {
  localStorage.setItem(FAILED_KEY, JSON.stringify([...set]));
}

function updateFailedStorage(id, isRight) {
  const failed = getFailedIds();
  isRight ? failed.delete(id) : failed.add(id);
  saveFailedIds(failed);
  refreshFailedBadge();
}

function refreshFailedBadge() {
  const count = getFailedIds().size;
  document.getElementById('failed-count-badge').textContent = count;
  document.getElementById('btn-start-failed').disabled = count === 0;
}

// ── Boot ─────────────────────────────────────────────
async function loadQuestions() {
  try {
    const response = await fetch('questions.json');
    const data = await response.json();
    allQuestions = data.map(q => ({
      id:         q.id,
      numeracion: q.numeracion,
      category:   q.tipo,
      question:   q.pregunta,
      options:    q.opciones,
      correct:    q.correcta,
    }));
  } catch (e) {
    console.error('Error cargando questions.json:', e);
    alert('No se pudo cargar questions.json. Abre la app desde un servidor local (ej. Live Server).');
  }
  populateCategories();
  refreshFailedBadge();
}

loadQuestions();

function populateCategories() {
  const cats = [...new Set(allQuestions.map(q => q.category))];
  cats.forEach(cat => {
    const opt = document.createElement('option');
    opt.value = cat;
    opt.textContent = cat;
    categorySelect.appendChild(opt);
  });
}

// ── Navigation ───────────────────────────────────────
function showScreen(name) {
  Object.values(screens).forEach(s => s.classList.remove('active'));
  screens[name].classList.add('active');
}

// ── Start ─────────────────────────────────────────────
btnStart.addEventListener('click', () => { failedMode = false; startQuiz(); });

function startQuiz() {
  useTimer = timerToggle.checked;

  let pool;
  if (failedMode) {
    const failedIds = getFailedIds();
    pool = allQuestions.filter(q => failedIds.has(q.id));
    if (pool.length === 0) {
      alert('No tienes preguntas falladas guardadas.');
      failedMode = false;
      return;
    }
  } else {
    const cat   = categorySelect.value;
    const count = questionCount.value;
    pool = cat === 'all'
      ? [...allQuestions]
      : allQuestions.filter(q => q.category === cat);
    if (pool.length === 0) {
      alert('No hay preguntas para esta categoría. Selecciona otra.');
      return;
    }
    shuffle(pool);
    if (count !== 'all') pool = pool.slice(0, Number(count));
  }

  shuffle(pool);
  quizQuestions = pool;
  currentIndex  = 0;
  score         = 0;
  answers       = [];

  showScreen('quiz');
  renderQuestion();
}

// ── Question render ───────────────────────────────────
function renderQuestion() {
  const q   = quizQuestions[currentIndex];
  const num = currentIndex + 1;
  const tot = quizQuestions.length;

  // Header
  questionCounter.textContent = `${num} / ${tot}`;
  categoryBadge.textContent   = q.category;
  progressBar.style.width     = `${((num - 1) / tot) * 100}%`;

  // Question
  questionText.textContent = q.question;

  // Options
  optionsContainer.innerHTML = '';
  const letters = ['A', 'B', 'C', 'D'];
  q.options.forEach((opt, i) => {
    const btn = document.createElement('button');
    btn.className = 'option-btn';
    btn.innerHTML = `
      <span class="option-letter">${letters[i]}</span>
      <span>${opt}</span>`;
    btn.addEventListener('click', () => selectOption(i, btn));
    optionsContainer.appendChild(btn);
  });

  btnNext.classList.add('hidden');

  // Timer
  timerContainer.style.display = useTimer ? 'flex' : 'none';
  if (useTimer) startTimer();
}

// ── Option selection ──────────────────────────────────
function selectOption(chosenIndex, btn) {
  stopTimer();
  disableOptions();

  const q            = quizQuestions[currentIndex];
  const correctIndex = q.correct;
  const isRight      = chosenIndex === correctIndex;

  if (isRight) {
    score++;
    btn.classList.add('correct');
  } else {
    btn.classList.add('selected-wrong');
    // Highlight the correct one
    optionsContainer.children[correctIndex].classList.add('correct');
  }

  // Show explanation
  if (q.explanation) {
    const box = document.createElement('div');
    box.className   = 'explanation-box';
    box.textContent = '💡 ' + q.explanation;
    optionsContainer.appendChild(box);
  }

  answers.push({
    question: q.question,
    correct:  q.options[correctIndex],
    chosen:   q.options[chosenIndex],
    isRight,
  });
  updateFailedStorage(q.id, isRight);

  progressBar.style.width = `${(currentIndex + 1) / quizQuestions.length * 100}%`;
  btnNext.classList.remove('hidden');
}

function disableOptions() {
  [...optionsContainer.querySelectorAll('.option-btn')].forEach(b => (b.disabled = true));
}

// ── Next button ───────────────────────────────────────
btnNext.addEventListener('click', () => {
  currentIndex++;
  if (currentIndex < quizQuestions.length) {
    renderQuestion();
  } else {
    showResults();
  }
});

// ── Timer ─────────────────────────────────────────────
function startTimer() {
  timerRemaining = TIMER_SECONDS;
  updateTimerUI(TIMER_SECONDS);

  timerInterval = setInterval(() => {
    timerRemaining--;
    updateTimerUI(timerRemaining);

    if (timerRemaining <= 0) {
      stopTimer();
      timeOut();
    }
  }, 1000);
}

function stopTimer() {
  clearInterval(timerInterval);
  timerInterval = null;
}

function updateTimerUI(secs) {
  timerText.textContent = secs;
  const offset = CIRCUMFERENCE_SMALL * (1 - secs / TIMER_SECONDS);
  timerCircle.style.strokeDashoffset = offset;

  if (secs <= 10) {
    timerCircle.style.stroke = 'var(--danger)';
    timerText.style.color    = 'var(--danger)';
  } else if (secs <= 20) {
    timerCircle.style.stroke = 'var(--warning)';
    timerText.style.color    = 'var(--warning)';
  } else {
    timerCircle.style.stroke = 'var(--primary)';
    timerText.style.color    = 'var(--text)';
  }
}

function timeOut() {
  disableOptions();
  const q = quizQuestions[currentIndex];
  optionsContainer.children[q.correct].classList.add('correct');

  if (q.explanation) {
    const box = document.createElement('div');
    box.className   = 'explanation-box';
    box.textContent = '⏰ Tiempo agotado. ' + q.explanation;
    optionsContainer.appendChild(box);
  }

  answers.push({
    question: q.question,
    correct:  q.options[q.correct],
    chosen:   null,
    isRight:  false,
  });
  updateFailedStorage(q.id, false);

  progressBar.style.width = `${(currentIndex + 1) / quizQuestions.length * 100}%`;
  btnNext.classList.remove('hidden');
}

// ── Results ───────────────────────────────────────────
function showResults() {
  const total   = quizQuestions.length;
  const pct     = score / total;

  // Emoji & message
  let emoji, title, subtitle;
  if (pct === 1) {
    emoji = '🏆'; title = '¡Perfecto!';      subtitle = '¡Has acertado todas las preguntas!';
  } else if (pct >= 0.8) {
    emoji = '🎉'; title = '¡Excelente!';     subtitle = 'Casi lo bordas. ¡Gran resultado!';
  } else if (pct >= 0.6) {
    emoji = '😊'; title = '¡Bien hecho!';    subtitle = 'Buen trabajo, sigue practicando.';
  } else if (pct >= 0.4) {
    emoji = '🙂'; title = 'Puedes mejorar';  subtitle = 'Un poco más de práctica y lo tendrás.';
  } else {
    emoji = '📚'; title = '¡Sigue estudiando!'; subtitle = 'Repasa los temas y vuelve a intentarlo.';
  }

  resultEmoji.textContent   = emoji;
  resultTitle.textContent   = title;
  resultSubtitle.textContent= subtitle;
  scoreValue.textContent    = score;
  scoreTotal.textContent    = `/ ${total}`;

  showScreen('results');

  // Animate donut after screen transition
  requestAnimationFrame(() => {
    const offset = CIRCUMFERENCE_LARGE * (1 - pct);
    scoreArc.style.strokeDashoffset = offset;
    scoreArc.style.stroke = pct >= 0.6 ? 'var(--success)' : pct >= 0.4 ? 'var(--warning)' : 'var(--danger)';
  });

  // Review list
  reviewContainer.innerHTML = '';
  answers.forEach((a, i) => {
    const item = document.createElement('div');
    item.className = 'review-item';
    item.innerHTML = `
      <span class="review-icon">${a.isRight ? '✅' : '❌'}</span>
      <div>
        <div class="review-q">${i + 1}. ${a.question}</div>
        <div class="review-a">
          ${a.isRight
            ? `Correcto: <strong>${a.correct}</strong>`
            : `Tu respuesta: <strong>${a.chosen ?? 'Sin respuesta'}</strong> · Correcta: <strong>${a.correct}</strong>`}
        </div>
      </div>`;
    reviewContainer.appendChild(item);
  });
}

// ── Restart & Home ────────────────────────────────────
btnRestart.addEventListener('click', startQuiz);
btnHome.addEventListener('click', () => { refreshFailedBadge(); showScreen('home'); });

document.getElementById('btn-start-failed').addEventListener('click', () => {
  failedMode = true;
  startQuiz();
});

document.getElementById('btn-clear-failed').addEventListener('click', () => {
  if (confirm('¿Borrar todo el historial de preguntas falladas?')) {
    saveFailedIds(new Set());
    refreshFailedBadge();
  }
});

// ── Utils ─────────────────────────────────────────────
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}
