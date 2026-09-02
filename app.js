const state = { puzzles: [], puzzle: null, date: null, direction: 'across', selected: null, entries: {}, cells: {}, answers: {}, elapsed: 0, running: true, timerId: null, pendingAction: null };
const $ = (selector) => document.querySelector(selector);

async function loadDates() {
  const dates = await fetch('crucigramas/manifest.json').then((response) => response.json());
  if (!dates.length) throw new Error('No se encontraron JSON en crucigramas/.');
  state.puzzles = dates;
  const select = $('#dateSelect');
  select.innerHTML = dates.map((date) => `<option value="${date}">${formatDate(date)}</option>`).join('');
  const requested = new URLSearchParams(location.search).get('date');
  state.date = dates.includes(requested) ? requested : dates[dates.length - 1];
  select.value = state.date;
  await loadPuzzle(state.date);
}

function formatDate(value) { return new Intl.DateTimeFormat('es-ES', { dateStyle: 'long' }).format(new Date(`${value}T12:00:00`)); }
async function loadPuzzle(date) {
  stopTimer(); state.date = date;
  const payload = await fetch(`crucigramas/${date}.json`).then((response) => response.json());
  state.puzzle = payload.data.attributes; state.entries = state.puzzle.config.entries;
  state.elapsed = Number(localStorage.getItem(`crossword-time-${date}`) || 0); state.running = true;
  $('#puzzleTitle').textContent = formatDate(date);
  buildBoard(); buildClues(); buildKeyboard(); restoreProgress(); startTimer();
}

function buildBoard() {
  const rows = state.puzzle.config.board.replace(/\r/g, '').split('\n'); const board = $('#board');
  board.style.gridTemplateColumns = `repeat(${rows[0].length}, 1fr)`; board.innerHTML = ''; state.cells = {}; state.answers = {};
  rows.forEach((row, r) => [...row].forEach((value, c) => {
    const cell = document.createElement('button'); cell.className = `cell ${value === '#' ? 'black' : ''}`; cell.dataset.row = r; cell.dataset.col = c; cell.setAttribute('role', 'gridcell');
    if (value !== '#') { state.cells[`${r},${c}`] = cell; cell.addEventListener('click', () => { selectCell(r, c); cell.blur(); }); }
    board.appendChild(cell);
  }));
  ['across', 'down'].forEach((direction) => Object.entries(state.entries[direction]).forEach(([number, entry]) => {
    const cells = []; let row = entry.row; let col = entry.col;
    [...entry.answer].forEach((letter) => { cells.push(`${row},${col}`); state.answers[`${row},${col}`] = letter; direction === 'across' ? col++ : row++; });
    state.entries[direction][number] = { ...entry, number, cells };
    const first = state.cells[`${entry.row},${entry.col}`]; if (first && !first.querySelector('.number')) { const label = document.createElement('span'); label.className = 'number'; label.textContent = number; first.appendChild(label); }
  }));
  const firstEntry = state.entries.across[Object.keys(state.entries.across)[0]]; selectCell(firstEntry.row, firstEntry.col, false);
}

function entryAt(row, col, direction) { return Object.values(state.entries[direction]).find((entry) => entry.cells.includes(`${row},${col}`)); }
function orderedEntries() { return ['across', 'down'].flatMap((direction) => Object.values(state.entries[direction]).sort((a, b) => Number(a.number) - Number(b.number)).map((entry) => ({ direction, entry }))); }
function entriesInDirection(direction) { return Object.values(state.entries[direction]).sort((a, b) => Number(a.number) - Number(b.number)); }
function moveToEntry(entry, index = 0, direction = state.direction) { state.direction = direction; const [row, col] = entry.cells[index].split(',').map(Number); selectCell(row, col, false); }
function firstEmptyIndex(entry) { const index = entry.cells.findIndex((key) => !state.cells[key]?.dataset.value); return index === -1 ? null : index; }
function nextIncompleteEntry(entries, startIndex) { for (let offset = 0; offset < entries.length; offset++) { const entry = entries[(startIndex + offset) % entries.length]; const index = firstEmptyIndex(entry); if (index !== null) return { entry, index }; } return null; }
function nextEntry() {
  const current = state.selected && entryAt(state.selected.row, state.selected.col, state.direction);
  const currentEntries = entriesInDirection(state.direction);
  const currentIndex = current ? currentEntries.findIndex((entry) => entry.number === current.number) : -1;
  const next = nextIncompleteEntry(currentEntries, currentIndex + 1);
  if (next && (!current || next.entry.number !== current.number)) return moveToEntry(next.entry, next.index, state.direction);
  const nextDirection = state.direction === 'across' ? 'down' : 'across';
  const nextEntries = entriesInDirection(nextDirection);
  const nextDirectionEntry = nextIncompleteEntry(nextEntries, 0);
  if (nextDirectionEntry) return moveToEntry(nextDirectionEntry.entry, nextDirectionEntry.index, nextDirection);
  if (next && current) return moveToEntry(next.entry, next.index, state.direction);
}
function previousEntry() { const current = state.selected && entryAt(state.selected.row, state.selected.col, state.direction); const currentEntries = entriesInDirection(state.direction); const currentIndex = current ? currentEntries.findIndex((entry) => entry.number === current.number) : 0; if (currentIndex > 0) return moveToEntry(currentEntries[currentIndex - 1], currentEntries[currentIndex - 1].cells.length - 1); const previousDirection = state.direction === 'down' ? 'across' : 'down'; const previousEntries = entriesInDirection(previousDirection); moveToEntry(previousEntries[previousEntries.length - 1], previousEntries[previousEntries.length - 1].cells.length - 1, previousDirection); }
function selectCell(row, col, toggle = true) {
  if (!state.cells[`${row},${col}`]) return; const across = entryAt(row, col, 'across'); const down = entryAt(row, col, 'down');
  if (toggle && across && down && state.selected?.row === row && state.selected?.col === col) state.direction = state.direction === 'across' ? 'down' : 'across';
  state.selected = { row, col }; if (!entryAt(row, col, state.direction)) state.direction = across ? 'across' : 'down'; renderSelection(); renderClueState();
}
function renderSelection() { Object.values(state.cells).forEach((cell) => cell.classList.remove('selected', 'in-word')); if (!state.selected) return; const { row, col } = state.selected; state.cells[`${row},${col}`].classList.add('selected'); const entry = entryAt(row, col, state.direction); entry?.cells.forEach((key) => state.cells[key]?.classList.add('in-word')); }
function renderClueState() { const entry = state.selected && entryAt(state.selected.row, state.selected.col, state.direction); document.querySelectorAll('.clue').forEach((clue) => { const active = clue.dataset.number === entry?.number && clue.dataset.direction === state.direction; clue.classList.toggle('active', active); if (active) clue.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }); }

function buildClues() { ['across', 'down'].forEach((direction) => { const list = $(`#${direction}Clues`); list.innerHTML = entriesInDirection(direction).map((entry) => `<button class="clue" data-number="${entry.number}" data-direction="${direction}"><span class="clue-number">${entry.number}</span><span>${entry.clue}</span></button>`).join(''); list.querySelectorAll('.clue').forEach((clue) => clue.addEventListener('click', () => { const entry = state.entries[clue.dataset.direction][clue.dataset.number]; state.direction = clue.dataset.direction; moveToEntry(entry); })); }); renderClueState(); }
function buildKeyboard() { const keys = 'ABCDEFGHIJKLMNÑOPQRSTUVWXYZ'.split(''); $('#keyboard').innerHTML = [...keys.map((key) => `<button class="key" data-key="${key}">${key}</button>`), '<button class="key wide" data-key="backspace">Borrar</button>'].join(''); document.querySelectorAll('.key').forEach((key) => key.addEventListener('click', () => handleKey(key.dataset.key))); }

function handleKey(key) { if (!state.selected || !state.running) return; if (key === 'backspace') return erase(); if (!/^[A-ZÑ]$/.test(key)) return; const cell = state.cells[`${state.selected.row},${state.selected.col}`]; cell.dataset.value = key; cell.querySelector('.letter')?.remove(); const text = document.createElement('span'); text.className = 'letter'; text.textContent = key; cell.appendChild(text); const entry = entryAt(state.selected.row, state.selected.col, state.direction); const index = entry.cells.indexOf(`${state.selected.row},${state.selected.col}`); if (index === entry.cells.length - 1) nextEntry(); else moveWithinEntry(1); persistProgress(); updateProgress(); }
function erase() { const entry = entryAt(state.selected.row, state.selected.col, state.direction); if (!entry) return; const index = entry.cells.indexOf(`${state.selected.row},${state.selected.col}`); const cell = state.cells[entry.cells[index]]; if (cell.dataset.value) { cell.dataset.value = ''; cell.querySelector('.letter')?.remove(); } else if (index > 0) { moveWithinEntry(-1); const previous = state.cells[entry.cells[index - 1]]; previous.dataset.value = ''; previous.querySelector('.letter')?.remove(); } else { previousEntry(); const previousEntryAt = entryAt(state.selected.row, state.selected.col, state.direction); const previousCell = state.cells[previousEntryAt.cells[previousEntryAt.cells.length - 1]]; previousCell.dataset.value = ''; previousCell.querySelector('.letter')?.remove(); } persistProgress(); updateProgress(); }
function moveWithinEntry(step) { const entry = entryAt(state.selected.row, state.selected.col, state.direction); if (!entry) return; const index = entry.cells.indexOf(`${state.selected.row},${state.selected.col}`); const nextIndex = Math.max(0, Math.min(entry.cells.length - 1, index + step)); const [row, col] = entry.cells[nextIndex].split(',').map(Number); selectCell(row, col, false); }
function moveOnGrid(rowStep, colStep) { if (!state.selected) return; let row = state.selected.row + rowStep; let col = state.selected.col + colStep; while (row >= 0 && col >= 0 && state.cells[`${row},${col}`] === undefined) { row += rowStep; col += colStep; } if (!state.cells[`${row},${col}`]) return; state.direction = rowStep ? 'down' : 'across'; selectCell(row, col, false); }
function handleTyping(event) { if (event.key === 'Tab') { event.preventDefault(); nextEntry(); } else if (event.key === ' ') { event.preventDefault(); state.direction = state.direction === 'across' ? 'down' : 'across'; if (!entryAt(state.selected.row, state.selected.col, state.direction)) state.direction = state.direction === 'across' ? 'down' : 'across'; renderSelection(); renderClueState(); } else if (event.key === 'Backspace') { event.preventDefault(); erase(); } else if (/^[a-zñ]$/i.test(event.key)) handleKey(event.key.toUpperCase()); else if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) { event.preventDefault(); const delta = { ArrowLeft: [0, -1], ArrowRight: [0, 1], ArrowUp: [-1, 0], ArrowDown: [1, 0] }[event.key]; moveOnGrid(delta[0], delta[1]); } }
function updateProgress() { const total = Object.keys(state.answers).length; const filled = Object.values(state.cells).filter((cell) => cell.dataset.value).length; if (filled === total) finish(); }
function persistProgress() { const values = Object.fromEntries(Object.entries(state.cells).filter(([, cell]) => cell.dataset.value).map(([key, cell]) => [key, cell.dataset.value])); localStorage.setItem(`crossword-progress-${state.date}`, JSON.stringify(values)); localStorage.setItem(`crossword-time-${state.date}`, state.elapsed); }
function restoreProgress() { const values = JSON.parse(localStorage.getItem(`crossword-progress-${state.date}`) || '{}'); Object.entries(values).forEach(([key, value]) => { const cell = state.cells[key]; if (cell) { cell.dataset.value = value; const text = document.createElement('span'); text.className = 'letter'; text.textContent = value; cell.appendChild(text); } }); updateProgress(); }
function checkEntry(entry) { entry.cells.forEach((key) => { const cell = state.cells[key]; if (!cell?.dataset.value) return; cell.classList.toggle('correct', cell.dataset.value === state.answers[key]); cell.classList.toggle('wrong', cell.dataset.value !== state.answers[key]); }); }
function checkAnswers() { Object.entries(state.cells).forEach(([key, cell]) => { if (!cell.dataset.value) return; cell.classList.toggle('correct', cell.dataset.value === state.answers[key]); cell.classList.toggle('wrong', cell.dataset.value !== state.answers[key]); }); $('#statusMessage').textContent = 'Las respuestas se han marcado'; }
function checkLetter() { if (!state.selected) return; const key = `${state.selected.row},${state.selected.col}`; showConfirmation('¿Comprobar esta letra?', 'Se comprobará la letra de la casilla seleccionada.', () => { const cell = state.cells[key]; if (!cell.dataset.value) { $('#statusMessage').textContent = 'La casilla está vacía'; return; } cell.classList.toggle('correct', cell.dataset.value === state.answers[key]); cell.classList.toggle('wrong', cell.dataset.value !== state.answers[key]); $('#statusMessage').textContent = 'Letra comprobada'; }); }
function currentEntry() { return state.selected && entryAt(state.selected.row, state.selected.col, state.direction); }
function showConfirmation(title, text, action) { state.pendingAction = action; $('#modalTitle').textContent = title; $('#modalText').textContent = text; $('#modalAction').textContent = 'Confirmar'; $('#modalAction').hidden = false; $('#modalCancel').hidden = false; $('#modal').classList.remove('hidden'); }
function closeModal() { state.pendingAction = null; $('#modal').classList.add('hidden'); }
function revealCell(key) { const cell = state.cells[key]; if (!cell) return; cell.dataset.value = state.answers[key]; cell.querySelector('.letter')?.remove(); const letter = document.createElement('span'); letter.className = 'letter'; letter.textContent = state.answers[key]; cell.appendChild(letter); cell.classList.add('correct'); }
function revealLetter() { if (!state.selected) return; const key = `${state.selected.row},${state.selected.col}`; showConfirmation('¿Revelar esta letra?', 'La letra correcta aparecerá en la casilla seleccionada.', () => { revealCell(key); persistProgress(); updateProgress(); $('#statusMessage').textContent = 'Letra revelada'; }); }
function revealWord() { const entry = currentEntry(); if (!entry) return; showConfirmation('¿Revelar esta palabra?', 'Se mostrarán todas las letras de la palabra seleccionada.', () => { entry.cells.forEach(revealCell); persistProgress(); updateProgress(); $('#statusMessage').textContent = 'Palabra revelada'; }); }
function revealPuzzle() { showConfirmation('¿Revelar el crucigrama?', 'Se mostrarán todas las letras del crucigrama.', () => { Object.keys(state.cells).forEach(revealCell); persistProgress(); updateProgress(); $('#statusMessage').textContent = 'Crucigrama revelado'; }); }
function finish() { if (Object.entries(state.cells).some(([key, cell]) => cell.dataset.value !== state.answers[key])) return; stopTimer(); state.pendingAction = null; $('#modalTitle').textContent = '¡Crucigrama terminado!'; $('#modalText').textContent = `Has completado el crucigrama en ${formatTime(state.elapsed)}.`; $('#modalAction').hidden = true; $('#modalCancel').hidden = true; $('#modal').classList.remove('hidden'); }
function formatTime(seconds) { return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`; }
function startTimer() { state.timerId = setInterval(() => { if (state.running) { state.elapsed++; $('#timer').textContent = formatTime(state.elapsed); } }, 1000); $('#timer').textContent = formatTime(state.elapsed); }
function stopTimer() { if (state.timerId) clearInterval(state.timerId); state.timerId = null; }

document.addEventListener('keydown', handleTyping); $('#dateSelect').addEventListener('change', (event) => loadPuzzle(event.target.value)); document.querySelectorAll('.menu-trigger').forEach((trigger) => trigger.addEventListener('click', () => { const menu = trigger.parentElement; document.querySelectorAll('.action-menu.open').forEach((openMenu) => { if (openMenu !== menu) openMenu.classList.remove('open'); }); menu.classList.toggle('open'); })); document.addEventListener('click', (event) => { if (!event.target.closest('.action-menu')) document.querySelectorAll('.action-menu.open').forEach((menu) => menu.classList.remove('open')); }); document.querySelectorAll('.menu-items button').forEach((button) => button.addEventListener('click', () => button.closest('.action-menu').classList.remove('open'))); $('#checkLetterButton').addEventListener('click', checkLetter); $('#checkWordButton').addEventListener('click', () => { const entry = currentEntry(); if (entry) showConfirmation('¿Comprobar esta palabra?', 'Se marcarán las letras introducidas de la palabra seleccionada.', () => { checkEntry(entry); $('#statusMessage').textContent = 'Palabra comprobada'; }); }); $('#checkPuzzleButton').addEventListener('click', () => showConfirmation('¿Comprobar el crucigrama?', 'Se marcarán todas las letras que hayas introducido.', () => { checkAnswers(); })); $('#revealLetterButton').addEventListener('click', revealLetter); $('#revealWordButton').addEventListener('click', revealWord); $('#revealPuzzleButton').addEventListener('click', revealPuzzle); $('#resetButton').addEventListener('click', () => showConfirmation('¿Reiniciar el crucigrama?', 'Se borrarán todas las letras y se pondrá el tiempo a cero.', () => { localStorage.removeItem(`crossword-progress-${state.date}`); localStorage.removeItem(`crossword-time-${state.date}`); closeModal(); loadPuzzle(state.date); })); $('#pauseButton').addEventListener('click', () => { state.running = !state.running; $('#pauseButton').textContent = state.running ? 'Ⅱ' : '▶'; }); $('#themeButton').addEventListener('click', () => document.body.classList.toggle('dark')); $('#closeModal').addEventListener('click', closeModal); $('#modalCancel').addEventListener('click', closeModal); $('#modalAction').addEventListener('click', () => { const action = state.pendingAction; closeModal(); action?.(); });
loadDates().catch((error) => { $('#puzzleTitle').textContent = 'No se pudo cargar'; $('#statusMessage').textContent = error.message; });