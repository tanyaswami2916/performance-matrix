// --- 1. Global State & History (Undo Stack) ---
let state = [];
let historyStack = [];
let draggingType = null;
let timerInterval = null;
let activeCardId = null; // Used for context menu & modals

const defaultState = [
  { id: 'col-1', title: 'To Do', cards: [] },
  { id: 'col-2', title: 'In Progress', cards: [] },
  { id: 'col-3', title: 'Done', cards: [] }
];

function init() {
  const saved = localStorage.getItem('kanbanGodTier');
  state = saved ? JSON.parse(saved) : defaultState;
  renderBoard();
  startGlobalTimer();
}

// --- 2. Undo Logic (Ctrl+Z) ---
function pushToHistory() {
  // Save a deep copy of the current state before making changes
  historyStack.push(JSON.parse(JSON.stringify(state)));
  if (historyStack.length > 50) historyStack.shift(); // Keep limit
}

document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
    e.preventDefault();
    if (historyStack.length > 0) {
      state = historyStack.pop();
      saveState();
      renderBoard();
    }
  }
});

function saveState() {
  localStorage.setItem('kanbanGodTier', JSON.stringify(state));
}

// Ensure DOM structure translates back to State safely without losing nested data
function saveStateFromDOM() {
  pushToHistory();
  const newState = [];
  document.querySelectorAll('.column').forEach((col, colIndex) => {
    const colData = { id: col.dataset.id, title: col.querySelector('.col-title').innerText, cards: [] };
    const isMiddleCol = colIndex > 0 && colIndex < document.querySelectorAll('.column').length - 1;

    col.querySelectorAll('.card').forEach(card => {
      // Find old data to preserve modal details
      const oldCard = findCardInState(card.dataset.id) || { description: '', subtasks: [] };
      
      let isRunningNow = isMiddleCol;
      let elapsed = parseInt(card.dataset.timeElapsed);
      let started = parseInt(card.dataset.lastStarted);

      if (isRunningNow && card.dataset.isRunning === 'false') { started = Date.now(); } 
      else if (!isRunningNow && card.dataset.isRunning === 'true') { elapsed += (Date.now() - started); }

      card.dataset.isRunning = isRunningNow;
      card.dataset.timeElapsed = elapsed;
      card.dataset.lastStarted = started;

      colData.cards.push({
        id: card.dataset.id,
        text: card.querySelector('.task-text').innerText,
        color: Array.from(card.classList).find(c => c.startsWith('accent-')),
        progress: card.querySelector('.progress-slider').value,
        timeElapsed: elapsed,
        isRunning: isRunningNow,
        lastStarted: started,
        description: oldCard.description,
        subtasks: oldCard.subtasks
      });
    });
    newState.push(colData);
  });
  state = newState;
  saveState();
  renderBoard();
}

function findCardInState(id) {
  for (let col of state) {
    const card = col.cards.find(c => c.id === id);
    if (card) return card;
  }
  return null;
}

// --- 3. Render Engine ---
function renderBoard() {
  const board = document.getElementById('board');
  board.innerHTML = '';

  state.forEach((colData, colIndex) => {
    const colEl = document.createElement('div');
    colEl.classList.add('column');
    colEl.dataset.id = colData.id;
    colEl.draggable = true;

    const header = document.createElement('div');
    header.classList.add('column-header');
    header.innerHTML = `
      <div class="col-title-area">
        <h2 contenteditable="true" class="col-title">${colData.title}</h2>
        <span class="task-count">${colData.cards.length}</span>
      </div>
      <div class="col-actions">
        <button class="icon-btn zen-btn" title="Zen Focus">⛶</button>
        <button class="icon-btn delete-col-btn" title="Delete">×</button>
      </div>
    `;

    header.querySelector('.col-title').addEventListener('blur', (e) => {
      pushToHistory(); colData.title = e.target.innerText; saveState();
    });
    header.querySelector('.zen-btn').addEventListener('click', () => {
      document.body.classList.toggle('zen-mode'); colEl.classList.toggle('zen-focused');
    });
    header.querySelector('.delete-col-btn').addEventListener('click', () => {
      if(confirm('Delete column?')) { pushToHistory(); state = state.filter(c => c.id !== colData.id); saveState(); renderBoard(); }
    });

    colEl.addEventListener('dragstart', (e) => { if (!e.target.classList.contains('card')) { draggingType = 'column'; colEl.classList.add('dragging-col'); } });
    colEl.addEventListener('dragend', () => { colEl.classList.remove('dragging-col'); draggingType = null; saveStateFromDOM(); });

    const content = document.createElement('div');
    content.classList.add('column-content');
    content.addEventListener('dragover', (e) => {
      e.preventDefault(); if (draggingType !== 'card') return;
      const afterElement = getDragAfterElement(content, e.clientY);
      const draggingCard = document.querySelector('.card.dragging');
      if (afterElement == null) content.appendChild(draggingCard); else content.insertBefore(draggingCard, afterElement);
    });

    colData.cards.forEach(cardData => content.appendChild(createCardElement(cardData, colIndex, state.length)));

    colEl.append(header, content);
    board.appendChild(colEl);
  });

  board.addEventListener('dragover', (e) => {
    e.preventDefault(); if (draggingType !== 'column') return;
    const afterCol = getDragAfterColumn(board, e.clientX);
    const draggingCol = document.querySelector('.dragging-col');
    if (afterCol == null) board.appendChild(draggingCol); else board.insertBefore(draggingCol, afterCol);
  });
}

function createCardElement(data, colIndex, totalCols) {
  const card = document.createElement('div');
  card.classList.add('card', data.color);
  card.dataset.id = data.id;
  card.draggable = true;

  const header = document.createElement('div');
  header.classList.add('card-header');
  
  const textSpan = document.createElement('span');
  textSpan.classList.add('task-text');
  textSpan.innerText = data.text;
  textSpan.title = "Click to open details";
  textSpan.onclick = () => openCardModal(data.id);
  
  const timerSpan = document.createElement('span');
  timerSpan.classList.add('timer-badge');
  timerSpan.innerText = formatTime(data.timeElapsed);

  header.append(textSpan, timerSpan);

  const sliderContainer = document.createElement('div');
  sliderContainer.classList.add('progress-container');
  const slider = document.createElement('input');
  slider.type = 'range'; slider.min = 0; slider.max = 100; slider.value = data.progress;
  slider.classList.add('progress-slider');
  
  const updateSliderVisual = (val) => slider.style.background = `linear-gradient(to right, #592e83 ${val}%, #2a2a2a ${val}%)`;
  updateSliderVisual(data.progress);

  slider.addEventListener('change', (e) => {
    const val = parseInt(e.target.value); updateSliderVisual(val);
    let targetColIndex = 0;
    if (val === 100) targetColIndex = totalCols - 1;
    else if (val > 0) targetColIndex = Math.floor((totalCols - 1) / 2) || 1;
    
    const targetCol = document.querySelectorAll('.column-content')[targetColIndex];
    if (card.parentElement !== targetCol) targetCol.appendChild(card);
    saveStateFromDOM();
  });

  sliderContainer.appendChild(slider);
  card.append(header, sliderContainer);

  card.addEventListener('dragstart', (e) => { e.stopPropagation(); draggingType = 'card'; card.classList.add('dragging'); });
  card.addEventListener('dragend', () => {
    card.classList.remove('dragging'); draggingType = null;
    const newCol = card.closest('.column');
    const newIndex = Array.from(document.querySelectorAll('.column')).indexOf(newCol);
    if (newIndex === 0) slider.value = 0; else if (newIndex === totalCols - 1) slider.value = 100; else slider.value = 50;
    updateSliderVisual(slider.value);
    saveStateFromDOM(); 
  });

  card.dataset.timeElapsed = data.timeElapsed; card.dataset.isRunning = data.isRunning; card.dataset.lastStarted = data.lastStarted;

  // Custom Context Menu Trigger
  card.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    activeCardId = data.id;
    const menu = document.getElementById('context-menu');
    menu.style.top = `${e.pageY}px`;
    menu.style.left = `${e.pageX}px`;
    menu.classList.remove('hidden');
  });

  return card;
}

// --- 4. Context Menu Logic ---
document.addEventListener('click', (e) => {
  if (!e.target.closest('#context-menu')) {
    document.getElementById('context-menu').classList.add('hidden');
  }
});

document.getElementById('menu-edit').onclick = () => { openCardModal(activeCardId); document.getElementById('context-menu').classList.add('hidden'); };

document.getElementById('menu-duplicate').onclick = () => {
  pushToHistory();
  const cardToDup = JSON.parse(JSON.stringify(findCardInState(activeCardId)));
  cardToDup.id = 'task-' + Date.now();
  cardToDup.timeElapsed = 0; cardToDup.isRunning = false;
  state.find(col => col.cards.some(c => c.id === activeCardId)).cards.push(cardToDup);
  saveState(); renderBoard();
  document.getElementById('context-menu').classList.add('hidden');
};

document.getElementById('menu-delete').onclick = () => {
  pushToHistory();
  state.forEach(col => col.cards = col.cards.filter(c => c.id !== activeCardId));
  saveState(); renderBoard();
  document.getElementById('context-menu').classList.add('hidden');
};

document.querySelectorAll('#context-menu .color-dot').forEach(dot => {
  dot.onclick = (e) => {
    pushToHistory();
    const newColor = e.target.dataset.color;
    const card = findCardInState(activeCardId);
    card.color = newColor;
    saveState(); renderBoard();
    document.getElementById('context-menu').classList.add('hidden');
  };
});

// --- 5. Interactive Modals (Subtasks & Descriptions) ---
function openCardModal(cardId) {
  activeCardId = cardId;
  const card = findCardInState(cardId);
  if(!card.subtasks) card.subtasks = [];

  document.getElementById('modal-title').value = card.text;
  document.getElementById('modal-desc').value = card.description || '';
  renderSubtasks(card.subtasks);

  document.getElementById('card-modal').classList.remove('hidden');
}

function renderSubtasks(subtasks) {
  const list = document.getElementById('subtask-list');
  list.innerHTML = '';
  subtasks.forEach((st, index) => {
    const item = document.createElement('div');
    item.classList.add('subtask-item');
    item.innerHTML = `
      <input type="checkbox" ${st.done ? 'checked' : ''}>
      <span class="${st.done ? 'done' : ''}">${st.text}</span>
      <button class="icon-btn text-danger">×</button>
    `;
    item.querySelector('input').onchange = (e) => { st.done = e.target.checked; renderSubtasks(subtasks); };
    item.querySelector('button').onclick = () => { subtasks.splice(index, 1); renderSubtasks(subtasks); };
    list.appendChild(item);
  });
}

document.getElementById('add-subtask-form').onsubmit = (e) => {
  e.preventDefault();
  const input = document.getElementById('new-subtask-input');
  if(!input.value) return;
  const card = findCardInState(activeCardId);
  card.subtasks.push({ text: input.value, done: false });
  input.value = '';
  renderSubtasks(card.subtasks);
};

document.getElementById('save-modal-btn').onclick = () => {
  pushToHistory();
  const card = findCardInState(activeCardId);
  card.text = document.getElementById('modal-title').value || 'Untitled';
  card.description = document.getElementById('modal-desc').value;
  document.getElementById('card-modal').classList.add('hidden');
  saveState(); renderBoard();
};

// --- 6. Analytics Dashboard ---
document.getElementById('dashboard-btn').onclick = () => {
  const container = document.getElementById('stats-container');
  container.innerHTML = '';
  
  let totalCards = 0; let totalTime = 0;
  let gradientStops = []; let currentPercentage = 0;
  const colors = ['#e50914', '#007bff', '#28a745', '#6f42c1', '#f39c12'];

  state.forEach((col, index) => {
    const count = col.cards.length;
    totalCards += count;
    col.cards.forEach(c => totalTime += c.timeElapsed);

    const statRow = document.createElement('div');
    statRow.classList.add('stat-row');
    statRow.innerHTML = `<div><span class="stat-color-box" style="background:${colors[index]}"></span>${col.title}</div> <div>${count} tasks</div>`;
    container.appendChild(statRow);
  });

  // Build Pie Chart CSS
  if (totalCards > 0) {
    state.forEach((col, index) => {
      const percentage = (col.cards.length / totalCards) * 100;
      gradientStops.push(`${colors[index]} ${currentPercentage}% ${currentPercentage + percentage}%`);
      currentPercentage += percentage;
    });
    document.getElementById('pie-chart').style.background = `conic-gradient(${gradientStops.join(', ')})`;
  } else {
    document.getElementById('pie-chart').style.background = '#444';
  }

  const timeRow = document.createElement('div');
  timeRow.classList.add('stat-row');
  timeRow.style.marginTop = '15px';
  timeRow.innerHTML = `<strong>Total Time Tracked:</strong> <strong>${formatTime(totalTime)}</strong>`;
  container.appendChild(timeRow);

  document.getElementById('dashboard-modal').classList.remove('hidden');
};

document.getElementById('close-dashboard-btn').onclick = () => document.getElementById('dashboard-modal').classList.add('hidden');

// --- 7. Helpers & Basics ---
document.getElementById('add-task-form').addEventListener('submit', (e) => {
  e.preventDefault(); pushToHistory();
  state[0].cards.push({ id: 'task-' + Date.now(), text: document.getElementById('task-input').value, color: document.querySelector('input[name="task-color"]:checked').value, progress: 0, timeElapsed: 0, isRunning: false, lastStarted: 0, description: '', subtasks: [] });
  saveState(); renderBoard(); document.getElementById('task-input').value = '';
});

document.getElementById('add-column-btn').addEventListener('click', () => {
  pushToHistory(); state.push({ id: 'col-' + Date.now(), title: 'New Column', cards: [] }); saveState(); renderBoard();
});

document.getElementById('search-input').addEventListener('input', (e) => {
  const term = e.target.value.toLowerCase();
  document.querySelectorAll('.card').forEach(card => card.classList.toggle('hidden', !card.querySelector('.task-text').innerText.toLowerCase().includes(term)));
});

function formatTime(ms) {
  const totalSecs = Math.floor(ms / 1000);
  return `${String(Math.floor(totalSecs / 60)).padStart(2, '0')}:${String(totalSecs % 60).padStart(2, '0')}`;
}

function startGlobalTimer() {
  if (timerInterval) clearInterval(timerInterval);
  timerInterval = setInterval(() => {
    document.querySelectorAll('.card').forEach(card => {
      if (card.dataset.isRunning === 'true') {
        card.querySelector('.timer-badge').innerText = formatTime(parseInt(card.dataset.timeElapsed) + (Date.now() - parseInt(card.dataset.lastStarted)));
      }
    });
  }, 1000);
}

function getDragAfterElement(container, y) {
  return [...container.querySelectorAll('.card:not(.dragging)')].reduce((closest, child) => {
    const offset = y - child.getBoundingClientRect().top - child.getBoundingClientRect().height / 2;
    return (offset < 0 && offset > closest.offset) ? { offset, element: child } : closest;
  }, { offset: Number.NEGATIVE_INFINITY }).element;
}

function getDragAfterColumn(container, x) {
  return [...container.querySelectorAll('.column:not(.dragging-col)')].reduce((closest, child) => {
    const offset = x - child.getBoundingClientRect().left - child.getBoundingClientRect().width / 2;
    return (offset < 0 && offset > closest.offset) ? { offset, element: child } : closest;
  }, { offset: Number.NEGATIVE_INFINITY }).element;
}

document.getElementById('export-btn').addEventListener('click', () => {
  saveStateFromDOM();
  const dlAnchorElem = document.createElement('a');
  dlAnchorElem.setAttribute("href", "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(state)));
  dlAnchorElem.setAttribute("download", "ultimate_kanban.json");
  dlAnchorElem.click();
});

document.getElementById('import-input').addEventListener('change', (e) => {
  if (!e.target.files[0]) return;
  const reader = new FileReader();
  reader.onload = (event) => {
    try { pushToHistory(); state = JSON.parse(event.target.result); saveState(); renderBoard(); } catch (err) { alert('Invalid file format'); }
  };
  reader.readAsText(e.target.files[0]);
});

init();