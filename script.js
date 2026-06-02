(function () {
  'use strict';

  var STORAGE_KEY = 'planner.v2';
  var SETTINGS_KEY = 'planner.v2.settings';
  var UNDO_KEY = 'planner.v2.undo';
  var ACCORDION_KEY = 'planner.v2.accordions';
  var DAY_MS = 24 * 60 * 60 * 1000;
  var DEFAULT_SETTINGS = {
    name: 'To Do List',
    workStart: '09:00',
    workEnd: '18:00',
    dayLimit: 8,
    theme: 'warm'
  };

  var state = {
    tasks: [],
    editingId: null,
    editingSeriesId: '',
    pendingRemoveTaskId: '',
    pendingMoveTaskId: '',
    pendingMoveDate: '',
    undoStack: [],
    statusFilter: 'all',
    categoryFilter: 'all',
    search: '',
    viewMode: 'today',
    weekAnchor: startOfWeek(new Date()),
    monthAnchor: startOfMonth(new Date()),
    selectedMonthDate: toISODate(new Date()),
    settings: DEFAULT_SETTINGS
  };

  var el = {
    appTitle: document.getElementById('appTitle'),
    todayLabel: document.getElementById('todayLabel'),
    taskForm: document.getElementById('taskForm'),
    titleInput: document.getElementById('titleInput'),
    dateInput: document.getElementById('dateInput'),
    timeInput: document.getElementById('timeInput'),
    durationInput: document.getElementById('durationInput'),
    priorityInput: document.getElementById('priorityInput'),
    categoryInput: document.getElementById('categoryInput'),
    noteInput: document.getElementById('noteInput'),
    recurrenceInput: document.getElementById('recurrenceInput'),
    repeatCountInput: document.getElementById('repeatCountInput'),
    repeatUntilInput: document.getElementById('repeatUntilInput'),
    repeatDaysBox: document.getElementById('repeatDaysBox'),
    repeatDays: Array.prototype.slice.call(document.querySelectorAll('.repeat-day')),
    accordions: Array.prototype.slice.call(document.querySelectorAll('.accordion')),
    repeatSummary: document.getElementById('repeatSummary'),
    formFeedback: document.getElementById('formFeedback'),
    editScopeRow: document.getElementById('editScopeRow'),
    editScopeSelect: document.getElementById('editScopeSelect'),
    saveBtn: document.getElementById('saveBtn'),
    cancelEditBtn: document.getElementById('cancelEditBtn'),
    clearCompletedBtn: document.getElementById('clearCompletedBtn'),
    undoBtn: document.getElementById('undoBtn'),
    exportBtn: document.getElementById('exportBtn'),
    weeklyReportBtn: document.getElementById('weeklyReportBtn'),
    importInput: document.getElementById('importInput'),
    viewModeSelect: document.getElementById('viewModeSelect'),
    viewTabs: Array.prototype.slice.call(document.querySelectorAll('.view-tab')),
    statusFilter: document.getElementById('statusFilter'),
    categoryFilter: document.getElementById('categoryFilter'),
    searchInput: document.getElementById('searchInput'),
    listPanel: document.getElementById('listPanel'),
    weekPanel: document.getElementById('weekPanel'),
    weekGrid: document.getElementById('weekGrid'),
    weekLabel: document.getElementById('weekLabel'),
    prevWeekBtn: document.getElementById('prevWeekBtn'),
    nextWeekBtn: document.getElementById('nextWeekBtn'),
    thisWeekBtn: document.getElementById('thisWeekBtn'),
    monthPanel: document.getElementById('monthPanel'),
    monthGrid: document.getElementById('monthGrid'),
    monthLabel: document.getElementById('monthLabel'),
    monthDayPanel: document.getElementById('monthDayPanel'),
    monthDayTitle: document.getElementById('monthDayTitle'),
    monthDayList: document.getElementById('monthDayList'),
    monthCreateTaskBtn: document.getElementById('monthCreateTaskBtn'),
    prevMonthBtn: document.getElementById('prevMonthBtn'),
    nextMonthBtn: document.getElementById('nextMonthBtn'),
    thisMonthBtn: document.getElementById('thisMonthBtn'),
    taskList: document.getElementById('taskList'),
    emptyState: document.getElementById('emptyState'),
    emptyHint: document.getElementById('emptyHint'),
    emptyActions: document.getElementById('emptyActions'),
    templateButtons: Array.prototype.slice.call(document.querySelectorAll('[data-template]')),
    statTotal: document.getElementById('statTotal'),
    statOpen: document.getElementById('statOpen'),
    statDone: document.getElementById('statDone'),
    statProgress: document.getElementById('statProgress'),
    focusDate: document.getElementById('focusDate'),
    focusNextTask: document.getElementById('focusNextTask'),
    focusOverdue: document.getElementById('focusOverdue'),
    focusLoad: document.getElementById('focusLoad'),
    focusTip: document.getElementById('focusTip'),
    weekPlanRange: document.getElementById('weekPlanRange'),
    weekPlanGrid: document.getElementById('weekPlanGrid'),
    weekNoteThemes: document.getElementById('weekNoteThemes'),
    weekOverload: document.getElementById('weekOverload'),
    weekAdvice: document.getElementById('weekAdvice'),
    aiTips: document.getElementById('aiTips'),
    plannerNameInput: document.getElementById('plannerNameInput'),
    workStartInput: document.getElementById('workStartInput'),
    workEndInput: document.getElementById('workEndInput'),
    dayLimitInput: document.getElementById('dayLimitInput'),
    themeSelect: document.getElementById('themeSelect'),
    saveSettingsBtn: document.getElementById('saveSettingsBtn'),
    clearAllBtn: document.getElementById('clearAllBtn'),
    confirmModal: document.getElementById('confirmModal'),
    confirmTitle: document.getElementById('confirmTitle'),
    confirmText: document.getElementById('confirmText'),
    confirmSeriesBtn: document.getElementById('confirmSeriesBtn'),
    confirmSingleBtn: document.getElementById('confirmSingleBtn'),
    confirmCancelBtn: document.getElementById('confirmCancelBtn')
  };

  init();

  function init() {
    state.tasks = loadData();
    state.settings = loadSettings();
    state.undoStack = loadUndoStack();
    applySettingsToUi();
    el.todayLabel.textContent = new Date().toLocaleDateString('ru-RU', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });

    el.taskForm.addEventListener('submit', onSubmit);
    el.cancelEditBtn.addEventListener('click', resetForm);
    el.clearCompletedBtn.addEventListener('click', clearCompleted);
    el.undoBtn.addEventListener('click', undoLastAction);
    el.exportBtn.addEventListener('click', exportData);
    el.weeklyReportBtn.addEventListener('click', exportWeeklyReport);
    el.importInput.addEventListener('change', importData);
    el.confirmSeriesBtn.addEventListener('click', function () { confirmSeriesAction('series'); });
    el.confirmSingleBtn.addEventListener('click', function () { confirmSeriesAction('single'); });
    el.confirmCancelBtn.addEventListener('click', closeConfirmModal);
    el.confirmModal.addEventListener('click', function (event) {
      if (event.target === el.confirmModal) {
        closeConfirmModal();
      }
    });
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && !el.confirmModal.classList.contains('hidden')) {
        closeConfirmModal();
      }
    });

    for (var t = 0; t < el.templateButtons.length; t += 1) {
      el.templateButtons[t].addEventListener('click', function () {
        applyQuickTemplate(this.getAttribute('data-template') || '');
      });
    }

    initAccordions();

    el.recurrenceInput.addEventListener('change', onRecurrenceChange);
    el.dateInput.addEventListener('change', function () {
      syncRepeatUntilMin();
      if (el.recurrenceInput.value === 'weekly') {
        applyRecurrencePreset('weekly');
      }
      updateRepeatSummary();
    });
    el.repeatCountInput.addEventListener('change', updateRepeatSummary);
    el.repeatUntilInput.addEventListener('change', updateRepeatSummary);

    el.editScopeSelect.addEventListener('change', applyEditScopeMode);

    for (var i = 0; i < el.repeatDays.length; i += 1) {
      el.repeatDays[i].addEventListener('click', function () {
        if (this.disabled) return;
        var pressed = this.getAttribute('aria-pressed') === 'true';
        setRepeatDayState(this, !pressed);
        updateRepeatSummary();
      });
    }

    el.viewModeSelect.addEventListener('change', function () {
      state.viewMode = el.viewModeSelect.value;
      render();
    });

    for (var v = 0; v < el.viewTabs.length; v += 1) {
      el.viewTabs[v].addEventListener('click', function () {
        state.viewMode = this.getAttribute('data-view') || 'today';
        el.viewModeSelect.value = state.viewMode;
        render();
      });
    }

    el.statusFilter.addEventListener('change', function () {
      state.statusFilter = el.statusFilter.value;
      render();
    });

    el.categoryFilter.addEventListener('change', function () {
      state.categoryFilter = el.categoryFilter.value;
      render();
    });

    el.searchInput.addEventListener('input', function () {
      state.search = (el.searchInput.value || '').trim().toLowerCase();
      render();
    });

    el.prevWeekBtn.addEventListener('click', function () {
      state.weekAnchor = addDays(state.weekAnchor, -7);
      renderWeek();
    });

    el.nextWeekBtn.addEventListener('click', function () {
      state.weekAnchor = addDays(state.weekAnchor, 7);
      renderWeek();
    });

    el.thisWeekBtn.addEventListener('click', function () {
      state.weekAnchor = startOfWeek(new Date());
      renderWeek();
    });

    el.prevMonthBtn.addEventListener('click', function () {
      state.monthAnchor = addMonths(state.monthAnchor, -1);
      renderMonth();
    });

    el.nextMonthBtn.addEventListener('click', function () {
      state.monthAnchor = addMonths(state.monthAnchor, 1);
      renderMonth();
    });

    el.thisMonthBtn.addEventListener('click', function () {
      state.monthAnchor = startOfMonth(new Date());
      state.selectedMonthDate = toISODate(new Date());
      renderMonth();
    });

    el.monthCreateTaskBtn.addEventListener('click', function () {
      selectDateForNewTask(state.selectedMonthDate);
    });

    el.saveSettingsBtn.addEventListener('click', function () { saveSettingsFromUi(false); });
    el.clearAllBtn.addEventListener('click', clearAllTasks);
    el.plannerNameInput.addEventListener('input', autoSaveSettings);
    el.workStartInput.addEventListener('change', autoSaveSettings);
    el.workEndInput.addEventListener('change', autoSaveSettings);
    el.dayLimitInput.addEventListener('input', autoSaveSettings);
    el.themeSelect.addEventListener('change', autoSaveSettings);

    resetForm();
    syncRepeatUntilMin();
    render();
  }

  function onSubmit(event) {
    event.preventDefault();
    clearFeedback();
    var wasEditing = !!state.editingId;

    var title = (el.titleInput.value || '').trim();
    var date = el.dateInput.value;
    var time = el.timeInput.value;
    var duration = Number(el.durationInput.value);
    var priority = el.priorityInput.value;
    var category = el.categoryInput.value;
    var note = (el.noteInput.value || '').trim();
    var recurrence = el.recurrenceInput.value;
    var repeatCount = Math.max(1, Number(el.repeatCountInput.value) || 1);
    var repeatUntil = recurrence !== 'none' ? (el.repeatUntilInput.value || '') : '';
    var repeatDays = getSelectedRepeatDays();

    if (!title || !date || !time || !Number.isFinite(duration)) {
      showFeedback('Заполни название, дату, время и длительность.');
      return;
    }

    if (recurrence !== 'none' && repeatDays.length === 0) {
      showFeedback('Выбери хотя бы один день повтора.');
      return;
    }

    if (recurrence !== 'none' && repeatUntil && repeatUntil < date) {
      showFeedback('Дата "повторять до" не может быть раньше даты задачи.');
      return;
    }

    if (recurrence !== 'none' && repeatCount === 1 && !repeatUntil) {
      showFeedback('Для повтора выбери количество больше 1 или дату "повторять до".');
      return;
    }

    pushUndo(wasEditing ? 'редактирование задачи' : 'добавление задачи');
    if (state.editingId) {
      var editingTask = findTask(state.editingId);
      if (!editingTask) return;

      if (editingTask.seriesId && el.editScopeSelect.value === 'series') {
        updateSeries(editingTask.seriesId, {
          title: title,
          date: date,
          time: time,
          duration: duration,
          priority: priority,
          category: category,
          note: note,
          recurrence: recurrence,
          repeatCount: repeatCount,
          repeatUntil: repeatUntil,
          repeatDays: repeatDays
        });
      } else {
        editingTask.title = title;
        editingTask.date = date;
        editingTask.time = time;
        editingTask.duration = duration;
        editingTask.priority = priority;
        editingTask.category = category;
        editingTask.note = note;
      }
    } else {
      createTaskSeries({
        title: title,
        date: date,
        time: time,
        duration: duration,
        priority: priority,
        category: category,
        note: note,
        recurrence: recurrence,
        repeatCount: repeatCount,
        repeatUntil: repeatUntil,
        repeatDays: repeatDays
      });
    }

    saveData();
    resetForm();
    showFeedback(wasEditing ? 'Изменения сохранены.' : 'Задача добавлена.', 'success');
    render();
  }

  function createTaskSeries(input) {
    var baseDate = parseISODate(input.date);
    var recurring = input.recurrence !== 'none' && (input.repeatCount > 1 || !!input.repeatUntil);
    var seriesId = recurring ? (input.seriesId || createId('series')) : '';
    var repeatDays = normalizeRepeatDays(input.repeatDays, baseDate);
    var untilDate = input.repeatUntil ? parseISODate(input.repeatUntil) : null;
    var doneByDate = input.doneByDate || {};
    if (untilDate && untilDate < baseDate) {
      untilDate = new Date(baseDate);
    }
    var targetCount = recurring ? Math.max(1, input.repeatCount) : 1;

    var cursor = new Date(baseDate);
    var added = 0;
    var safety = 0;

    while (safety < 2000) {
      safety += 1;
      if (!recurring && added >= 1) {
        break;
      }
      if (recurring && untilDate && cursor > untilDate) {
        break;
      }
      if (recurring && !untilDate && added >= targetCount) {
        break;
      }
      var allowed = recurring ? dayInArray(cursor.getDay(), repeatDays) : toISODate(cursor) === toISODate(baseDate);

      if (allowed && cursor >= baseDate) {
        state.tasks.push({
          id: createId('task'),
          seriesId: seriesId,
          recurrence: recurring ? input.recurrence : 'none',
          repeatDays: recurring ? repeatDays.slice() : [],
          repeatUntil: recurring && untilDate ? toISODate(untilDate) : '',
          title: input.title,
          note: input.note || '',
          date: toISODate(cursor),
          time: input.time,
          duration: input.duration,
          priority: input.priority,
          category: input.category,
          archived: false,
          done: !!doneByDate[toISODate(cursor)],
          createdAt: Date.now()
        });
        added += 1;
      }

      if (!recurring) {
        break;
      }
      cursor = addDays(cursor, 1);
    }
  }

  function updateSeries(seriesId, payload) {
    var previousSeries = getSeriesTasks(seriesId);
    var doneByDate = {};
    for (var i = 0; i < previousSeries.length; i += 1) {
      if (previousSeries[i].done) {
        doneByDate[previousSeries[i].date] = true;
      }
    }

    state.tasks = state.tasks.filter(function (t) {
      return t.seriesId !== seriesId;
    });

    createTaskSeries({
      seriesId: seriesId,
      title: payload.title,
      note: payload.note,
      date: payload.date,
      time: payload.time,
      duration: payload.duration,
      priority: payload.priority,
      category: payload.category,
      recurrence: payload.recurrence,
      repeatCount: payload.repeatCount,
      repeatUntil: payload.repeatUntil,
      repeatDays: payload.repeatDays,
      doneByDate: doneByDate
    });
  }

  function onRecurrenceChange() {
    var recurrence = el.recurrenceInput.value;
    if (recurrence === 'none') {
      el.repeatDaysBox.classList.add('hidden');
      el.repeatUntilInput.disabled = true;
      updateRepeatSummary();
      clearFeedback();
      return;
    }

    el.repeatDaysBox.classList.remove('hidden');
    el.repeatUntilInput.disabled = false;
    if (el.repeatCountInput.value === '1' && !el.repeatUntilInput.value) {
      setRepeatCountValue(10);
    }
    syncRepeatUntilMin();
    applyRecurrencePreset(recurrence);
    applyEditScopeMode();
    updateRepeatSummary();
    showFeedback('Повтор включен. Выбери дни и укажи количество или дату окончания.', 'success');
  }

  function applyRecurrencePreset(recurrence) {
    var baseDate = parseISODate(el.dateInput.value || toISODate(new Date()));
    var day = baseDate.getDay();

    if (recurrence === 'daily') {
      setSelectedRepeatDays([0, 1, 2, 3, 4, 5, 6]);
      return;
    }

    if (recurrence === 'weekdays') {
      setSelectedRepeatDays([1, 2, 3, 4, 5]);
      return;
    }

    if (recurrence === 'weekly') {
      setSelectedRepeatDays([day]);
      return;
    }

    if (recurrence === 'custom') {
      var current = getSelectedRepeatDays();
      if (!current.length) {
        setSelectedRepeatDays([day]);
      }
      return;
    }
  }

  function applyEditScopeMode() {
    if (!state.editingSeriesId) {
      return;
    }

    var scope = el.editScopeSelect.value;
    var isSeries = scope === 'series';
    var noRepeat = el.recurrenceInput.value === 'none';

    el.recurrenceInput.disabled = !isSeries;
    el.repeatCountInput.disabled = !isSeries;
    el.repeatUntilInput.disabled = !isSeries || noRepeat;

    var disableDays = !isSeries || noRepeat;
    setRepeatDaysDisabled(disableDays);
    if (disableDays) {
      el.repeatDaysBox.classList.add('hidden');
    } else {
      el.repeatDaysBox.classList.remove('hidden');
    }
  }

  function render() {
    renderPanels();
    renderViewTabs();
    renderFocus();
    renderWeekPlan();
    renderList();
    renderStats();
    renderWeek();
    renderMonth();
    renderTips();
    renderUndo();
  }

  function renderViewTabs() {
    for (var i = 0; i < el.viewTabs.length; i += 1) {
      var active = el.viewTabs[i].getAttribute('data-view') === state.viewMode;
      el.viewTabs[i].classList.toggle('is-active', active);
      el.viewTabs[i].setAttribute('aria-pressed', active ? 'true' : 'false');
    }
  }

  function renderPanels() {
    if (state.viewMode === 'week') {
      el.weekPanel.classList.remove('hidden');
      el.monthPanel.classList.add('hidden');
      el.listPanel.classList.add('hidden');
    } else if (state.viewMode === 'month') {
      el.weekPanel.classList.add('hidden');
      el.monthPanel.classList.remove('hidden');
      el.listPanel.classList.add('hidden');
    } else {
      el.weekPanel.classList.add('hidden');
      el.monthPanel.classList.add('hidden');
      el.listPanel.classList.remove('hidden');
    }
  }

  function initAccordions() {
    var saved = loadAccordionState();
    for (var i = 0; i < el.accordions.length; i += 1) {
      var section = el.accordions[i];
      var key = section.getAttribute('data-accordion') || String(i);
      var toggle = section.querySelector('.accordion-toggle');
      var open = Object.prototype.hasOwnProperty.call(saved, key)
        ? !!saved[key]
        : section.getAttribute('data-open') === 'true';
      setAccordionOpen(section, open);
      if (toggle) {
        toggle.addEventListener('click', function () {
          var currentSection = this.closest('.accordion');
          var isOpen = currentSection.getAttribute('data-open') === 'true';
          setAccordionOpen(currentSection, !isOpen);
          saveAccordionState();
        });
      }
    }
  }

  function setAccordionOpen(section, open) {
    var body = section.querySelector('.accordion-body');
    var toggle = section.querySelector('.accordion-toggle');
    var arrow = section.querySelector('.accordion-arrow');
    section.setAttribute('data-open', open ? 'true' : 'false');
    if (body) {
      body.classList.toggle('hidden', !open);
    }
    if (toggle) {
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    }
    if (arrow) {
      arrow.textContent = open ? '▾' : '▸';
    }
  }

  function saveAccordionState() {
    var stateMap = {};
    for (var i = 0; i < el.accordions.length; i += 1) {
      var key = el.accordions[i].getAttribute('data-accordion') || String(i);
      stateMap[key] = el.accordions[i].getAttribute('data-open') === 'true';
    }
    localStorage.setItem(ACCORDION_KEY, JSON.stringify(stateMap));
  }

  function openAccordionByKey(key) {
    for (var i = 0; i < el.accordions.length; i += 1) {
      if (el.accordions[i].getAttribute('data-accordion') === key) {
        setAccordionOpen(el.accordions[i], true);
        saveAccordionState();
        return;
      }
    }
  }

  function loadAccordionState() {
    try {
      var raw = localStorage.getItem(ACCORDION_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (e) {
      return {};
    }
  }

  function renderList() {
    var filtered = getFilteredTasks();
    el.taskList.innerHTML = '';

    for (var i = 0; i < filtered.length; i += 1) {
      el.taskList.appendChild(renderTask(filtered[i]));
    }

    if (filtered.length) {
      el.emptyState.style.display = 'none';
      return;
    }

    el.emptyState.style.display = 'block';
    if (!state.tasks.length) {
      el.emptyHint.textContent = 'Пока нет задач';
      el.emptyActions.style.display = 'flex';
    } else if (state.statusFilter === 'archived') {
      el.emptyHint.textContent = 'Архив пуст';
      el.emptyActions.style.display = 'none';
    } else if (state.viewMode === 'today') {
      el.emptyHint.textContent = 'На сегодня и просроченных задач нет';
      el.emptyActions.style.display = 'none';
    } else {
      el.emptyHint.textContent = 'По текущим фильтрам задач нет';
      el.emptyActions.style.display = 'none';
    }
  }

  function renderTask(task) {
    var li = document.createElement('li');
    li.className = 'task-item category-line-' + task.category +
      (task.done ? ' done' : '') +
      (isOverdue(task) ? ' overdue' : '');
    if (!task.archived) {
      attachDragSource(li, task.id);
    }

    var check = document.createElement('input');
    check.type = 'checkbox';
    check.checked = !!task.done;
    check.setAttribute('aria-label', task.done ? 'Отметить как активную' : 'Отметить как выполненную');
    check.addEventListener('change', function () {
      pushUndo(task.done ? 'возврат задачи' : 'выполнение задачи');
      task.done = !task.done;
      saveData();
      render();
    });

    var body = document.createElement('div');
    body.className = 'task-body';

    var titleRow = document.createElement('div');
    titleRow.className = 'task-title-row';

    var timePill = document.createElement('span');
    timePill.className = 'task-time';
    timePill.textContent = task.time;

    var title = document.createElement('div');
    title.className = 'title';
    title.textContent = task.title;
    titleRow.appendChild(timePill);
    titleRow.appendChild(title);

    var meta = document.createElement('div');
    meta.className = 'meta';
    meta.innerHTML = '<span>' + formatDate(task.date) + '</span>' +
      '<span>' + (Math.round(task.duration / 6) / 10) + ' ч</span>' +
      '<span class="badge ' + escapeHtml(task.priority) + '">' + priorityLabel(task.priority) + '</span>' +
      '<span class="badge category-badge category-' + escapeHtml(task.category) + '">' + categoryLabel(task.category) + '</span>' +
      (isOverdue(task) ? '<span class="badge overdue-badge">просрочено</span>' : '') +
      (task.archived ? '<span class="badge archived-badge">архив</span>' : '') +
      (task.seriesId ? '<span class="badge">повтор: ' + repeatDaysLabel(task.repeatDays) + (task.repeatUntil ? ' до ' + formatDate(task.repeatUntil) : '') + '</span>' : '');

    body.appendChild(titleRow);
    body.appendChild(meta);
    if (task.note) {
      var note = document.createElement('p');
      note.className = 'task-note';
      note.textContent = task.note;
      body.appendChild(note);
    }

    var actions = document.createElement('div');
    actions.className = 'row-actions';

    var moreSelect = document.createElement('select');
    moreSelect.className = 'more-actions';
    moreSelect.setAttribute('aria-label', 'Дополнительные действия');
    moreSelect.innerHTML = '<option value="">Еще</option><option value="tomorrow">+1 день</option><option value="today">Сегодня</option><option value="copy">Копия</option>';
    moreSelect.addEventListener('change', function () {
      if (this.value === 'tomorrow') moveTaskByDays(task.id, 1);
      if (this.value === 'today') moveTaskToToday(task.id);
      if (this.value === 'copy') duplicateTask(task.id);
      this.value = '';
    });

    var editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.className = 'ghost';
    editBtn.textContent = 'Изменить';
    editBtn.addEventListener('click', function () {
      startEdit(task.id);
    });

    var delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.className = 'danger';
    delBtn.textContent = 'Удалить';
    delBtn.addEventListener('click', function () {
      removeTask(task.id);
    });

    if (task.archived) {
      var restoreBtn = document.createElement('button');
      restoreBtn.type = 'button';
      restoreBtn.className = 'ghost';
      restoreBtn.textContent = 'Восстановить';
      restoreBtn.addEventListener('click', function () {
        restoreTask(task.id);
      });
      actions.appendChild(restoreBtn);
    } else {
      actions.appendChild(editBtn);
      actions.appendChild(moreSelect);
      actions.appendChild(delBtn);
    }

    li.appendChild(check);
    li.appendChild(body);
    li.appendChild(actions);

    return li;
  }

  function renderWeek() {
    var start = startOfWeek(state.weekAnchor);
    var end = addDays(start, 6);
    el.weekLabel.textContent = formatDate(start) + ' - ' + formatDate(end);

    el.weekGrid.innerHTML = '';
    for (var i = 0; i < 7; i += 1) {
      var dayDate = addDays(start, i);
      var dayStr = toISODate(dayDate);
      var dayTasks = getActiveTasks()
        .filter(function (t) { return t.date === dayStr; })
        .sort(function (a, b) { return (a.time + a.title).localeCompare(b.time + b.title, 'ru'); });

      var doneCount = dayTasks.filter(function (t) { return t.done; }).length;
      var hours = dayTasks.reduce(function (sum, t) { return sum + t.duration; }, 0) / 60;

      var card = document.createElement('article');
      card.className = 'week-day';
      attachDateDropTarget(card, dayStr);

      var head = document.createElement('h3');
      head.textContent = weekdayLabel(dayDate) + ', ' + formatDate(dayStr);
      card.appendChild(head);

      var meta = document.createElement('p');
      meta.textContent = dayTasks.length + ' задач, ' + doneCount + ' выполнено, ' + hours.toFixed(1) + ' ч';
      card.appendChild(meta);

      if (!dayTasks.length) {
        var empty = document.createElement('span');
        empty.className = 'week-chip';
        empty.textContent = 'пусто';
        card.appendChild(empty);
      } else {
        for (var j = 0; j < dayTasks.length && j < 6; j += 1) {
          var chip = document.createElement('button');
          chip.type = 'button';
          chip.className = 'week-chip week-chip-btn category-line-' + dayTasks[j].category;
          chip.textContent = dayTasks[j].time + ' - ' + dayTasks[j].title + (dayTasks[j].done ? ' (done)' : '');
          chip.setAttribute('title', 'Открыть для редактирования');
          attachDragSource(chip, dayTasks[j].id);
          (function (id) {
            chip.addEventListener('click', function () {
              startEdit(id);
            });
          })(dayTasks[j].id);
          card.appendChild(chip);
        }
        if (dayTasks.length > 6) {
          var more = document.createElement('span');
          more.className = 'week-chip';
          more.textContent = 'и еще ' + (dayTasks.length - 6);
          card.appendChild(more);
        }
      }

      el.weekGrid.appendChild(card);
    }
  }

  function renderMonth() {
    var start = startOfMonth(state.monthAnchor);
    var gridStart = startOfWeek(start);
    var monthName = start.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' });
    el.monthLabel.textContent = monthName;
    el.monthGrid.innerHTML = '';

    for (var i = 0; i < 42; i += 1) {
      var date = addDays(gridStart, i);
      var dateStr = toISODate(date);
      var tasks = getActiveTasks().filter(function (t) { return t.date === dateStr; });
      var openCount = tasks.filter(function (t) { return !t.done; }).length;

      var cell = document.createElement('button');
      cell.type = 'button';
      cell.className = 'month-day' +
        (date.getMonth() !== start.getMonth() ? ' is-muted' : '') +
        (dateStr === toISODate(new Date()) ? ' is-today' : '') +
        (dateStr === state.selectedMonthDate ? ' is-selected' : '') +
        (openCount ? ' has-tasks' : '');
      cell.innerHTML = '<span>' + date.getDate() + '</span><strong>' + openCount + '</strong>';
      cell.title = openCount ? openCount + ' активных задач' : 'Нет активных задач';
      attachDateDropTarget(cell, dateStr);
      (function (selectedDate) {
        cell.addEventListener('click', function () {
          state.selectedMonthDate = selectedDate;
          renderMonth();
        });
      })(dateStr);
      el.monthGrid.appendChild(cell);
    }

    renderMonthDayPanel();
  }

  function renderMonthDayPanel() {
    var selectedDate = state.selectedMonthDate || toISODate(new Date());
    var tasks = getActiveTasks()
      .filter(function (t) { return t.date === selectedDate; })
      .sort(function (a, b) { return (a.time + a.title).localeCompare(b.time + b.title, 'ru'); });

    el.monthDayTitle.textContent = 'Задачи на ' + formatDate(selectedDate);
    el.monthDayList.innerHTML = '';
    el.monthDayPanel.classList.remove('hidden');

    if (!tasks.length) {
      var empty = document.createElement('li');
      empty.className = 'muted';
      empty.textContent = 'На этот день задач нет';
      el.monthDayList.appendChild(empty);
      return;
    }

    for (var i = 0; i < tasks.length; i += 1) {
      var item = document.createElement('li');
      item.className = 'month-day-task category-line-' + tasks[i].category + (tasks[i].done ? ' done' : '');
      item.innerHTML = '<span>' + escapeHtml(tasks[i].time) + '</span><strong>' + escapeHtml(tasks[i].title) + '</strong>';
      (function (id) {
        item.addEventListener('click', function () {
          startEdit(id);
        });
      })(tasks[i].id);
      el.monthDayList.appendChild(item);
    }
  }

  function selectDateForNewTask(date) {
    if (!date) return;
    el.dateInput.value = date;
    syncRepeatUntilMin();
    updateRepeatSummary();
    openAccordionByKey('taskForm');
    showFeedback('Дата для новой задачи выбрана: ' + formatDate(date) + '.', 'success');
    el.titleInput.focus();
  }

  function renderFocus() {
    var todayStr = toISODate(new Date());
    var nowText = new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    var todayTasks = getActiveTasks().filter(function (t) { return t.date === todayStr; });
    var openToday = todayTasks.filter(function (t) { return !t.done; });
    var overdue = getActiveTasks().filter(isOverdue);
    var minutes = todayTasks.reduce(function (sum, t) { return sum + Number(t.duration || 0); }, 0);
    var hours = minutes / 60;
    var next = openToday
      .slice()
      .sort(function (a, b) { return (a.time + a.title).localeCompare(b.time + b.title, 'ru'); })[0];
    var limit = Number(state.settings.dayLimit) || DEFAULT_SETTINGS.dayLimit;

    el.focusDate.textContent = 'сейчас ' + nowText;
    el.focusNextTask.textContent = next ? next.time + ' - ' + next.title : 'нет активных задач';
    el.focusOverdue.textContent = String(overdue.length);
    el.focusLoad.textContent = hours.toFixed(1) + ' ч / ' + limit + ' ч';
    if (overdue.length) {
      el.focusTip.textContent = 'сначала закрыть просроченное';
    } else if (hours > limit) {
      el.focusTip.textContent = 'день перегружен';
    } else if (next) {
      el.focusTip.textContent = 'начать с ближайшей';
    } else {
      el.focusTip.textContent = 'можно планировать спокойно';
    }
  }

  function renderWeekPlan() {
    var start = startOfWeek(new Date());
    var end = addDays(start, 6);
    var limit = Number(state.settings.dayLimit) || DEFAULT_SETTINGS.dayLimit;
    var weekTasks = state.tasks.filter(function (t) {
      return !t.archived && t.date >= toISODate(start) && t.date <= toISODate(end);
    });
    var noteText = weekTasks.map(function (t) { return t.note || ''; }).join(' ');
    var themes = extractKeywords(noteText).slice(0, 4);
    var overloaded = [];

    el.weekPlanRange.textContent = formatDate(start) + ' - ' + formatDate(end);
    el.weekPlanGrid.innerHTML = '';

    for (var i = 0; i < 7; i += 1) {
      var date = addDays(start, i);
      var dateStr = toISODate(date);
      var dayTasks = weekTasks.filter(function (t) { return t.date === dateStr; });
      var done = dayTasks.filter(function (t) { return t.done; }).length;
      var minutes = dayTasks.reduce(function (sum, t) { return sum + Number(t.duration || 0); }, 0);
      var hours = minutes / 60;
      var ratio = limit ? Math.min(100, Math.round(hours / limit * 100)) : 0;
      var loadClass = hours > limit ? ' is-hot' : (hours > limit * 0.75 ? ' is-warm' : '');
      if (hours > limit) {
        overloaded.push(weekdayLabel(date) + ' ' + hours.toFixed(1) + ' ч');
      }

      var item = document.createElement('button');
      item.type = 'button';
      item.className = 'week-plan-day' + loadClass;
      item.innerHTML = '<span>' + weekdayLabel(date) + '</span>' +
        '<strong>' + hours.toFixed(1) + ' ч</strong>' +
        '<em>' + dayTasks.length + ' задач, ' + done + ' выполнено</em>' +
        '<i style="width:' + ratio + '%"></i>';
      (function (selectedDate) {
        item.addEventListener('click', function () {
          selectDateForNewTask(selectedDate);
        });
      })(dateStr);
      el.weekPlanGrid.appendChild(item);
    }

    el.weekNoteThemes.textContent = themes.join(', ');
    el.weekOverload.textContent = overloaded.length ? overloaded.join('; ') : 'нет';
    el.weekAdvice.textContent = buildWeekPlanAdvice(weekTasks, overloaded, themes);
  }

  function buildWeekPlanAdvice(tasks, overloaded, themes) {
    if (!tasks.length) return 'запланируй 3-5 ключевых задач на неделю';
    if (overloaded.length) return 'разгрузи перегруженные дни или перенеси часть задач';
    var open = tasks.filter(function (t) { return !t.done; }).length;
    if (open > 8) return 'выбери 3 главных задачи и начни с них';
    if (themes.length && themes[0] !== 'нет данных') return 'тема недели: ' + themes[0] + ', выдели под нее отдельный блок';
    return 'неделя выглядит сбалансированной';
  }

  function attachDragSource(element, taskId) {
    element.draggable = true;
    element.addEventListener('dragstart', function (event) {
      event.dataTransfer.setData('text/plain', taskId);
      event.dataTransfer.effectAllowed = 'move';
      element.classList.add('is-dragging');
    });
    element.addEventListener('dragend', function () {
      element.classList.remove('is-dragging');
    });
  }

  function attachDateDropTarget(element, date) {
    element.addEventListener('dragover', function (event) {
      event.preventDefault();
      element.classList.add('is-drop-target');
    });
    element.addEventListener('dragleave', function () {
      element.classList.remove('is-drop-target');
    });
    element.addEventListener('drop', function (event) {
      event.preventDefault();
      element.classList.remove('is-drop-target');
      moveTaskToDate(event.dataTransfer.getData('text/plain'), date);
    });
  }

  function renderStats() {
    var active = getActiveTasks();
    var total = active.length;
    var done = active.filter(function (t) { return t.done; }).length;
    var open = total - done;
    var progress = total ? Math.round(done / total * 100) : 0;

    el.statTotal.textContent = String(total);
    el.statOpen.textContent = String(open);
    el.statDone.textContent = String(done);
    el.statProgress.textContent = String(progress) + '%';
  }

  function renderTips() {
    var tips = buildTips();
    el.aiTips.innerHTML = '';
    for (var i = 0; i < tips.length; i += 1) {
      var li = document.createElement('li');
      li.textContent = tips[i];
      el.aiTips.appendChild(li);
    }
  }

  function buildTips() {
    var tips = [];
    var activeTasks = getActiveTasks();
    var total = activeTasks.length;
    if (!total) {
      return [
        'начни с 3 задач на неделю: одна рабочая, одна личная, одна на здоровье.',
        'ставь длительность задач не больше 90 минут для стабильного фокуса.',
        'в конце дня закрывай хотя бы 1 маленькую задачу для ритма.'
      ];
    }

    var todayStr = toISODate(new Date());
    var overdue = activeTasks.filter(function (t) { return !t.done && t.date < todayStr; }).length;
    if (overdue > 0) {
      tips.push('есть просроченные задачи: ' + overdue + '. сначала закрой 1-2 самые старые.');
    }

    var byDay = {};
    for (var i = 0; i < activeTasks.length; i += 1) {
      byDay[activeTasks[i].date] = (byDay[activeTasks[i].date] || 0) + activeTasks[i].duration;
    }

    var maxDate = '';
    var maxMinutes = 0;
    for (var key in byDay) {
      if (Object.prototype.hasOwnProperty.call(byDay, key) && byDay[key] > maxMinutes) {
        maxMinutes = byDay[key];
        maxDate = key;
      }
    }
    if (maxMinutes > 8 * 60) {
      tips.push('перегрузка ' + formatDate(maxDate) + ': ' + (maxMinutes / 60).toFixed(1) + ' ч. перенеси часть задач на соседние дни.');
    }

    var done = activeTasks.filter(function (t) { return t.done; }).length;
    var progress = Math.round(done / total * 100);
    if (progress < 40) {
      tips.push('прогресс ' + progress + '%. попробуй правило: сначала 1 сложная + 2 короткие задачи в день.');
    } else {
      tips.push('хороший темп: ' + progress + '%. удерживай баланс и не перегружай один день.');
    }

    var cat = { work: 0, personal: 0, study: 0, health: 0 };
    for (var j = 0; j < activeTasks.length; j += 1) {
      cat[activeTasks[j].category] = (cat[activeTasks[j].category] || 0) + 1;
    }
    if (cat.health === 0) {
      tips.push('добавь хотя бы 1 задачу категории "здоровье" на неделю для устойчивого графика.');
    }

    while (tips.length < 3) {
      tips.push('группируй похожие задачи подряд: это уменьшает переключения контекста.');
    }

    return tips.slice(0, 4);
  }

  function startEdit(id) {
    var task = findTask(id);
    if (!task) return;

    state.editingId = id;
    state.editingSeriesId = task.seriesId || '';

    el.titleInput.value = task.title;
    el.dateInput.value = task.date;
    el.timeInput.value = task.time;
    el.durationInput.value = String(task.duration);
    el.priorityInput.value = task.priority;
    el.categoryInput.value = task.category;
    el.noteInput.value = task.note || '';

    if (task.seriesId) {
      var seriesTasks = getSeriesTasks(task.seriesId);
      var first = seriesTasks[0] || task;
      el.recurrenceInput.value = first.recurrence || 'custom';
      setRepeatCountValue(seriesTasks.length);
      el.repeatUntilInput.value = first.repeatUntil || '';
      setSelectedRepeatDays((first.repeatDays && first.repeatDays.length) ? first.repeatDays : [parseISODate(task.date).getDay()]);
      el.editScopeRow.classList.remove('hidden');
      el.editScopeSelect.value = 'single';
      applyEditScopeMode();
      updateRepeatSummary();
    } else {
      el.recurrenceInput.value = 'none';
      setRepeatCountValue(1);
      el.repeatUntilInput.value = '';
      setSelectedRepeatDays([parseISODate(task.date).getDay()]);
      el.editScopeRow.classList.add('hidden');
      el.recurrenceInput.disabled = true;
      el.repeatCountInput.disabled = true;
      el.repeatUntilInput.disabled = true;
      setRepeatDaysDisabled(true);
      el.repeatDaysBox.classList.add('hidden');
      updateRepeatSummary();
    }

    el.saveBtn.textContent = 'Сохранить';
    el.cancelEditBtn.classList.remove('hidden');
    el.titleInput.focus();
  }

  function resetForm() {
    state.editingId = null;
    state.editingSeriesId = '';

    el.taskForm.reset();
    el.dateInput.value = toISODate(new Date());
    el.timeInput.value = '09:00';
    el.durationInput.value = '60';
    el.priorityInput.value = 'medium';
    el.categoryInput.value = 'work';
    el.noteInput.value = '';
    el.recurrenceInput.value = 'none';
    setRepeatCountValue(1);
    el.repeatUntilInput.value = '';
    setSelectedRepeatDays([new Date().getDay()]);

    el.recurrenceInput.disabled = false;
    el.repeatCountInput.disabled = false;
    el.repeatUntilInput.disabled = true;
    setRepeatDaysDisabled(false);
    el.repeatDaysBox.classList.add('hidden');

    el.editScopeRow.classList.add('hidden');
    el.editScopeSelect.value = 'single';
    syncRepeatUntilMin();
    updateRepeatSummary();
    clearFeedback();

    el.saveBtn.textContent = 'Добавить';
    el.cancelEditBtn.classList.add('hidden');
  }

  function removeTask(id) {
    var task = findTask(id);
    if (!task) return;

    if (task.seriesId) {
      state.pendingRemoveTaskId = id;
      openConfirmModal(task);
      return;
    } else {
      pushUndo('удаление задачи');
      state.tasks = state.tasks.filter(function (t) { return t.id !== id; });
    }

    if (state.editingId === id || (state.editingSeriesId && task.seriesId === state.editingSeriesId)) {
      resetForm();
    }

    saveData();
    render();
  }

  function openConfirmModal(task) {
    state.pendingMoveTaskId = '';
    state.pendingMoveDate = '';
    el.confirmText.textContent = 'Задача "' + task.title + '" входит в серию. Удалить только этот повтор или всю серию?';
    el.confirmTitle.textContent = 'Удаление повтора';
    el.confirmSeriesBtn.textContent = 'Удалить всю серию';
    el.confirmSeriesBtn.className = 'danger';
    el.confirmSingleBtn.textContent = 'Только этот повтор';
    el.confirmModal.classList.remove('hidden');
  }

  function openMoveConfirmModal(task, targetDate) {
    state.pendingRemoveTaskId = '';
    state.pendingMoveTaskId = task.id;
    state.pendingMoveDate = targetDate;
    el.confirmTitle.textContent = 'Перенос повтора';
    el.confirmText.textContent = 'Задача "' + task.title + '" входит в серию. Перенести только этот повтор или всю серию?';
    el.confirmSeriesBtn.textContent = 'Перенести всю серию';
    el.confirmSeriesBtn.className = 'ghost';
    el.confirmSingleBtn.textContent = 'Только этот повтор';
    el.confirmModal.classList.remove('hidden');
  }

  function closeConfirmModal() {
    state.pendingRemoveTaskId = '';
    state.pendingMoveTaskId = '';
    state.pendingMoveDate = '';
    el.confirmModal.classList.add('hidden');
  }

  function confirmSeriesAction(mode) {
    if (state.pendingMoveTaskId) {
      confirmSeriesMove(mode);
      return;
    }
    confirmSeriesRemove(mode);
  }

  function confirmSeriesRemove(mode) {
    var id = state.pendingRemoveTaskId;
    if (!id) {
      closeConfirmModal();
      return;
    }
    var task = findTask(id);
    closeConfirmModal();
    if (!task) return;

    if (mode === 'series') {
      pushUndo('удаление серии');
      state.tasks = state.tasks.filter(function (t) { return t.seriesId !== task.seriesId; });
    } else {
      pushUndo('удаление повтора');
      state.tasks = state.tasks.filter(function (t) { return t.id !== id; });
    }

    if (state.editingId === id || (state.editingSeriesId && task.seriesId === state.editingSeriesId)) {
      resetForm();
    }
    saveData();
    render();
  }

  function confirmSeriesMove(mode) {
    var id = state.pendingMoveTaskId;
    var targetDate = state.pendingMoveDate;
    var task = findTask(id);
    closeConfirmModal();
    if (!task || !targetDate) return;

    if (mode === 'series') {
      moveSeriesToDate(task, targetDate);
    } else {
      moveSingleTaskToDate(task.id, targetDate);
    }
  }

  function moveTaskByDays(id, days) {
    var task = findTask(id);
    if (!task) return;
    requestTaskMove(task, toISODate(addDays(parseISODate(task.date), days)));
  }

  function moveTaskToToday(id) {
    var task = findTask(id);
    if (!task) return;
    requestTaskMove(task, toISODate(new Date()));
  }

  function moveTaskToDate(id, date) {
    var task = findTask(id);
    if (!task || !date) return;
    requestTaskMove(task, date);
  }

  function requestTaskMove(task, targetDate) {
    if (!targetDate || task.date === targetDate) return;
    if (task.seriesId) {
      openMoveConfirmModal(task, targetDate);
      return;
    }
    moveSingleTaskToDate(task.id, targetDate);
  }

  function moveSingleTaskToDate(id, targetDate) {
    var task = findTask(id);
    if (!task || !targetDate || task.date === targetDate) return;
    pushUndo('перенос задачи');
    task.date = targetDate;
    saveData();
    render();
  }

  function moveSeriesToDate(task, targetDate) {
    var deltaDays = Math.round((parseISODate(targetDate).getTime() - parseISODate(task.date).getTime()) / DAY_MS);
    if (!task.seriesId || !deltaDays) return;
    pushUndo('перенос серии');
    for (var i = 0; i < state.tasks.length; i += 1) {
      if (state.tasks[i].seriesId === task.seriesId) {
        state.tasks[i].date = toISODate(addDays(parseISODate(state.tasks[i].date), deltaDays));
      }
    }
    saveData();
    render();
  }

  function duplicateTask(id) {
    var task = findTask(id);
    if (!task) return;
    pushUndo('дублирование задачи');
    state.tasks.push({
      id: createId('task'),
      seriesId: '',
      recurrence: 'none',
      repeatDays: [],
      repeatUntil: '',
      title: task.title + ' (копия)',
      note: task.note || '',
      date: task.date,
      time: task.time,
      duration: task.duration,
      priority: task.priority,
      category: task.category,
      archived: false,
      done: false,
      createdAt: Date.now()
    });
    saveData();
    render();
  }

  function restoreTask(id) {
    var task = findTask(id);
    if (!task) return;
    pushUndo('восстановление из архива');
    task.archived = false;
    saveData();
    render();
  }

  function clearCompleted() {
    var done = state.tasks.filter(function (t) { return t.done && !t.archived; });
    if (!done.length) {
      showFeedback('Нет выполненных задач для архива.', 'success');
      return;
    }
    pushUndo('архивирование выполненных');
    for (var i = 0; i < state.tasks.length; i += 1) {
      if (state.tasks[i].done) {
        state.tasks[i].archived = true;
      }
    }
    saveData();
    render();
  }

  function clearAllTasks() {
    if (!window.confirm('Удалить все задачи? Действие можно отменить кнопкой "Отменить".')) {
      return;
    }
    pushUndo('очистка всех задач');
    state.tasks = [];
    resetForm();
    saveData();
    render();
  }

  function pushUndo(label) {
    state.undoStack.push({
      label: label,
      tasks: JSON.stringify(state.tasks)
    });
    if (state.undoStack.length > 10) {
      state.undoStack = state.undoStack.slice(state.undoStack.length - 10);
    }
    saveUndoStack();
    renderUndo();
  }

  function undoLastAction() {
    if (!state.undoStack.length) return;
    var last = state.undoStack.pop();
    try {
      state.tasks = sanitizeTasks(JSON.parse(last.tasks));
      saveData();
      saveUndoStack();
      resetForm();
      render();
      showFeedback('Отменено: ' + last.label + '.', 'success');
    } catch (e) {
      state.undoStack = [];
      saveUndoStack();
      renderUndo();
      showFeedback('Не удалось отменить последнее действие.');
    }
  }

  function renderUndo() {
    if (!el.undoBtn) return;
    var last = state.undoStack[state.undoStack.length - 1];
    el.undoBtn.disabled = !last;
    el.undoBtn.textContent = last ? 'Отменить: ' + last.label : 'Отменить';
  }

  function getFilteredTasks() {
    var todayStr = toISODate(new Date());
    return state.tasks
      .filter(function (task) {
        if (state.statusFilter === 'archived') {
          if (!task.archived) return false;
        } else {
          if (task.archived) return false;
          if (state.viewMode === 'today' && task.date !== todayStr && !isOverdue(task)) return false;
          if (state.statusFilter === 'open' && task.done) return false;
          if (state.statusFilter === 'done' && !task.done) return false;
        }
        if (state.categoryFilter !== 'all' && task.category !== state.categoryFilter) return false;
        if (state.search && (task.title + ' ' + (task.note || '')).toLowerCase().indexOf(state.search) === -1) return false;
        return true;
      })
      .sort(function (a, b) {
        return (a.date + ' ' + a.time + ' ' + a.title).localeCompare(b.date + ' ' + b.time + ' ' + b.title, 'ru');
      });
  }

  function getActiveTasks() {
    return state.tasks.filter(function (task) {
      return !task.archived;
    });
  }

  function getSeriesTasks(seriesId) {
    return state.tasks
      .filter(function (t) { return t.seriesId === seriesId; })
      .sort(function (a, b) { return (a.date + a.time).localeCompare(b.date + b.time); });
  }

  function setRepeatCountValue(count) {
    var value = String(Math.max(1, Number(count) || 1));
    var exists = false;
    for (var i = 0; i < el.repeatCountInput.options.length; i += 1) {
      if (el.repeatCountInput.options[i].value === value) {
        exists = true;
        break;
      }
    }
    if (!exists) {
      var opt = document.createElement('option');
      opt.value = value;
      opt.textContent = value + ' повторов';
      el.repeatCountInput.appendChild(opt);
    }
    el.repeatCountInput.value = value;
  }

  function setSelectedRepeatDays(days) {
    var map = {};
    for (var i = 0; i < days.length; i += 1) {
      map[String(days[i])] = true;
    }
    for (var j = 0; j < el.repeatDays.length; j += 1) {
      var day = el.repeatDays[j].getAttribute('data-day');
      setRepeatDayState(el.repeatDays[j], !!map[day]);
    }
  }

  function getSelectedRepeatDays() {
    var result = [];
    for (var i = 0; i < el.repeatDays.length; i += 1) {
      if (el.repeatDays[i].getAttribute('aria-pressed') === 'true') {
        result.push(Number(el.repeatDays[i].getAttribute('data-day')));
      }
    }
    return result;
  }

  function normalizeRepeatDays(days, baseDate) {
    var list = Array.isArray(days) ? days.slice() : [];
    if (!list.length) {
      list = [baseDate.getDay()];
    }

    var uniq = [];
    for (var i = 0; i < list.length; i += 1) {
      var n = Number(list[i]);
      if (n >= 0 && n <= 6 && !dayInArray(n, uniq)) {
        uniq.push(n);
      }
    }
    uniq.sort();
    return uniq;
  }

  function setRepeatDaysDisabled(disabled) {
    for (var i = 0; i < el.repeatDays.length; i += 1) {
      el.repeatDays[i].disabled = disabled;
    }
  }

  function setRepeatDayState(element, selected) {
    element.classList.toggle('is-selected', !!selected);
    element.setAttribute('aria-pressed', selected ? 'true' : 'false');
  }

  function syncRepeatUntilMin() {
    var min = el.dateInput.value || toISODate(new Date());
    el.repeatUntilInput.min = min;
    if (el.repeatUntilInput.value && el.repeatUntilInput.value < min) {
      el.repeatUntilInput.value = min;
    }
  }

  function updateRepeatSummary() {
    if (!el.repeatSummary) return;

    var recurrence = el.recurrenceInput.value;
    if (recurrence === 'none') {
      el.repeatSummary.classList.add('hidden');
      el.repeatSummary.textContent = '';
      return;
    }

    var date = el.dateInput.value || toISODate(new Date());
    var repeatCount = Math.max(1, Number(el.repeatCountInput.value) || 1);
    var repeatUntil = el.repeatUntilInput.value || '';
    var days = getSelectedRepeatDays();
    var plannedCount = estimateRepeatCount(date, repeatCount, repeatUntil, days);
    var endText = repeatUntil ? ' до ' + formatDate(repeatUntil) : '';

    el.repeatSummary.textContent = 'Будет создано: ' + plannedCount + ' задач, дни: ' + repeatDaysLabel(days) + endText + '.';
    el.repeatSummary.classList.remove('hidden');
  }

  function estimateRepeatCount(date, repeatCount, repeatUntil, days) {
    var baseDate = parseISODate(date);
    var untilDate = repeatUntil ? parseISODate(repeatUntil) : null;
    var cursor = new Date(baseDate);
    var added = 0;
    var safety = 0;

    while (safety < 2000) {
      safety += 1;
      if (untilDate && cursor > untilDate) break;
      if (!untilDate && added >= repeatCount) break;
      if (dayInArray(cursor.getDay(), days)) {
        added += 1;
      }
      cursor = addDays(cursor, 1);
    }

    return added;
  }

  function isOverdue(task) {
    return !task.done && task.date < toISODate(new Date());
  }

  function showFeedback(message, type) {
    if (!el.formFeedback) return;
    el.formFeedback.textContent = message;
    el.formFeedback.classList.remove('hidden', 'success');
    if (type === 'success') {
      el.formFeedback.classList.add('success');
    }
  }

  function clearFeedback() {
    if (!el.formFeedback) return;
    el.formFeedback.textContent = '';
    el.formFeedback.classList.add('hidden');
    el.formFeedback.classList.remove('success');
  }

  function dayInArray(day, arr) {
    for (var i = 0; i < arr.length; i += 1) {
      if (Number(arr[i]) === Number(day)) return true;
    }
    return false;
  }

  function repeatDaysLabel(days) {
    if (!days || !days.length) return 'нет';
    var names = { 1: 'пн', 2: 'вт', 3: 'ср', 4: 'чт', 5: 'пт', 6: 'сб', 0: 'вс' };
    var out = [];
    for (var i = 0; i < days.length; i += 1) {
      out.push(names[days[i]] || '?');
    }
    return out.join(', ');
  }

  function exportData() {
    var payload = {
      version: 2,
      exportedAt: new Date().toISOString(),
      tasks: state.tasks
    };

    var blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'planner-export-' + toISODate(new Date()) + '.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function exportWeeklyReport() {
    var start = startOfWeek(new Date());
    var end = addDays(start, 6);
    var weekTasks = state.tasks
      .filter(function (t) { return t.date >= toISODate(start) && t.date <= toISODate(end); })
      .sort(function (a, b) { return (a.date + a.time + a.title).localeCompare(b.date + b.time + b.title, 'ru'); });
    var done = weekTasks.filter(function (t) { return t.done; }).length;
    var archived = weekTasks.filter(function (t) { return t.archived; }).length;
    var overdue = weekTasks.filter(function (t) { return isOverdue(t); }).length;
    var minutes = weekTasks.reduce(function (sum, t) { return sum + Number(t.duration || 0); }, 0);
    var notes = weekTasks.filter(function (t) { return t.note; }).map(function (t) {
      return t.date + ' ' + t.time + ' - ' + t.title + ': ' + t.note;
    });
    var keywords = extractKeywords(notes.join(' '));
    var categorySummary = buildCategorySummary(weekTasks);
    var recommendation = buildWeeklyRecommendation(weekTasks, minutes, overdue, keywords);

    var rows = '';
    for (var i = 0; i < weekTasks.length; i += 1) {
      rows += '<tr><td>' + formatDate(weekTasks[i].date) + '</td><td>' + escapeHtml(weekTasks[i].time) + '</td><td>' +
        escapeHtml(weekTasks[i].title) + '</td><td>' + categoryLabel(weekTasks[i].category) + '</td><td>' +
        (weekTasks[i].done ? 'выполнено' : 'активно') + '</td><td>' + escapeHtml(weekTasks[i].note || '') + '</td></tr>';
    }

    var notesHtml = notes.length
      ? '<ul>' + notes.map(function (note) { return '<li>' + escapeHtml(note) + '</li>'; }).join('') + '</ul>'
      : '<p>Заметок за неделю пока нет.</p>';

    var html = '<!doctype html><html lang="ru"><head><meta charset="UTF-8"><title>Отчет недели - ' +
      escapeHtml(state.settings.name || DEFAULT_SETTINGS.name) + '</title><style>' +
      'body{font-family:Segoe UI,Tahoma,sans-serif;margin:28px;color:#24312b;background:#fffdf8}' +
      'h1{margin:0 0 6px} .muted{color:#66746b}.cards{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin:18px 0}' +
      '.card{border:1px solid #d9e2d3;border-radius:10px;padding:12px;background:#f8fbf3}' +
      'table{width:100%;border-collapse:collapse;margin-top:14px}th,td{border:1px solid #d9e2d3;padding:8px;text-align:left;vertical-align:top}' +
      'th{background:#edf5ec}@media(max-width:760px){.cards{grid-template-columns:1fr}body{margin:14px}}' +
      '</style></head><body><h1>Отчет недели</h1><p class="muted">' + formatDate(start) + ' - ' + formatDate(end) + '</p>' +
      '<div class="cards"><div class="card"><strong>' + weekTasks.length + '</strong><br>задач</div>' +
      '<div class="card"><strong>' + done + '</strong><br>выполнено</div>' +
      '<div class="card"><strong>' + (minutes / 60).toFixed(1) + ' ч</strong><br>нагрузка</div>' +
      '<div class="card"><strong>' + archived + '</strong><br>в архиве</div></div>' +
      '<h2>Разбор недели</h2><p><strong>Темы заметок:</strong> ' + escapeHtml(keywords.join(', ')) + '</p>' +
      '<p><strong>Категории:</strong> ' + escapeHtml(categorySummary) + '</p>' +
      '<p><strong>Просрочено:</strong> ' + overdue + '</p>' +
      '<p><strong>Рекомендация:</strong> ' + escapeHtml(recommendation) + '</p>' +
      '<h2>Заметки</h2>' + notesHtml +
      '<h2>Задачи недели</h2><table><thead><tr><th>Дата</th><th>Время</th><th>Задача</th><th>Категория</th><th>Статус</th><th>Заметка</th></tr></thead><tbody>' +
      rows + '</tbody></table></body></html>';

    downloadText('weekly-report-' + toISODate(start) + '.html', html, 'text/html');
  }

  function extractKeywords(text) {
    var stop = 'и в во на с со к ко по за от до для что как это или а но не да нет задачи задача неделю день'.split(' ');
    var stopMap = {};
    for (var s = 0; s < stop.length; s += 1) {
      stopMap[stop[s]] = true;
    }
    var counts = {};
    var words = String(text).toLowerCase().replace(/[^a-zа-яё0-9\s]/gi, ' ').split(/\s+/);
    for (var i = 0; i < words.length; i += 1) {
      if (words[i].length < 4 || stopMap[words[i]]) continue;
      counts[words[i]] = (counts[words[i]] || 0) + 1;
    }
    var keys = Object.keys(counts).sort(function (a, b) { return counts[b] - counts[a]; }).slice(0, 5);
    return keys.length ? keys : ['нет данных'];
  }

  function buildCategorySummary(tasks) {
    var byCategory = { work: 0, personal: 0, study: 0, health: 0 };
    for (var i = 0; i < tasks.length; i += 1) {
      byCategory[tasks[i].category] = (byCategory[tasks[i].category] || 0) + 1;
    }
    return 'работа: ' + byCategory.work +
      ', личное: ' + byCategory.personal +
      ', учеба: ' + byCategory.study +
      ', здоровье: ' + byCategory.health;
  }

  function buildWeeklyRecommendation(tasks, minutes, overdue, keywords) {
    if (!tasks.length) return 'На этой неделе задач нет. Можно заранее запланировать 3-5 ключевых дел.';
    if (overdue > 0) return 'Начни следующую неделю с закрытия просроченных задач, чтобы они не тянули внимание.';
    if (minutes > 40 * 60) return 'Нагрузка высокая. Стоит распределить часть задач по дням или сократить длительные блоки.';
    if (keywords.length && keywords[0] !== 'нет данных') return 'В заметках часто повторяется тема "' + keywords[0] + '". Проверь, не требует ли она отдельного блока времени.';
    return 'Темп выглядит устойчивым. На следующей неделе можно добавить больше конкретики в заметки для анализа.';
  }

  function downloadText(filename, text, type) {
    var blob = new Blob([text], { type: type });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function exportBackupBeforeImport() {
    if (!state.tasks.length) return;
    var payload = {
      version: 2,
      reason: 'backup-before-import',
      exportedAt: new Date().toISOString(),
      tasks: state.tasks
    };
    downloadText('backup-before-import-' + toISODate(new Date()) + '.json', JSON.stringify(payload, null, 2), 'application/json');
  }

  function mergeTasks(current, incoming) {
    var seen = {};
    var result = current.slice();
    for (var i = 0; i < result.length; i += 1) {
      seen[result[i].id] = true;
    }
    for (var j = 0; j < incoming.length; j += 1) {
      if (!seen[incoming[j].id]) {
        result.push(incoming[j]);
        seen[incoming[j].id] = true;
      }
    }
    return result;
  }

  function applyQuickTemplate(type) {
    var template = {
      title: 'Новая задача',
      category: 'work',
      duration: '60',
      priority: 'medium'
    };

    if (type === 'work') {
      template.title = 'Подготовить рабочую задачу';
      template.category = 'work';
      template.duration = '90';
      template.priority = 'high';
    } else if (type === 'health') {
      template.title = 'Тренировка / здоровье';
      template.category = 'health';
      template.duration = '60';
      template.priority = 'medium';
    } else if (type === 'study') {
      template.title = 'Учебный блок';
      template.category = 'study';
      template.duration = '90';
      template.priority = 'medium';
    }

    el.titleInput.value = template.title;
    el.categoryInput.value = template.category;
    el.durationInput.value = template.duration;
    el.priorityInput.value = template.priority;
    el.recurrenceInput.value = 'none';
    onRecurrenceChange();
    clearFeedback();
    el.titleInput.focus();
    el.titleInput.select();
  }

  function importData(event) {
    var file = event.target.files && event.target.files[0];
    if (!file) return;

    var reader = new FileReader();
    reader.onload = function (e) {
      try {
        var parsed = JSON.parse(e.target.result);
        var tasks = Array.isArray(parsed) ? parsed : parsed.tasks;
        if (!Array.isArray(tasks)) {
          throw new Error('invalid payload');
        }
        var cleanTasks = sanitizeTasks(tasks);
        var shouldMerge = false;

        if (state.tasks.length) {
          var replace = window.confirm('Импортировать файл?\nOK - заменить текущие задачи\nОтмена - объединить с текущими');
          if (replace) {
            exportBackupBeforeImport();
            pushUndo('импорт с заменой');
            state.tasks = cleanTasks;
          } else {
            var merge = window.confirm('Объединить задачи из файла с текущими?');
            if (!merge) {
              showFeedback('Импорт отменен.', 'success');
              return;
            }
            shouldMerge = true;
          }
        } else {
          pushUndo('импорт');
          state.tasks = cleanTasks;
        }

        if (shouldMerge) {
          pushUndo('импорт с объединением');
          state.tasks = mergeTasks(state.tasks, cleanTasks);
        }

        saveData();
        render();
        showFeedback('Импорт выполнен успешно.', 'success');
      } catch (err) {
        showFeedback('Ошибка импорта: файл не похож на JSON планировщика.');
      } finally {
        el.importInput.value = '';
      }
    };
    reader.readAsText(file);
  }

  function sanitizeTasks(tasks) {
    var clean = [];
    for (var i = 0; i < tasks.length; i += 1) {
      var t = tasks[i] || {};
      if (!t.title || !t.date || !t.time) continue;
      clean.push({
        id: String(t.id || createId('task')),
        seriesId: t.seriesId ? String(t.seriesId) : '',
        recurrence: t.recurrence || 'none',
        repeatDays: normalizeRepeatDays(t.repeatDays, parseISODate(String(t.date))),
        repeatUntil: (t.repeatUntil && typeof t.repeatUntil === 'string') ? t.repeatUntil : '',
        title: String(t.title).slice(0, 120),
        note: t.note ? String(t.note).slice(0, 500) : '',
        date: String(t.date),
        time: String(t.time),
        duration: Number(t.duration) > 0 ? Number(t.duration) : 60,
        priority: normalizePriority(t.priority),
        category: normalizeCategory(t.category),
        archived: !!t.archived,
        done: !!t.done,
        createdAt: Number(t.createdAt) || Date.now()
      });
    }
    return clean;
  }

  function saveData() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.tasks));
  }

  function autoSaveSettings() {
    saveSettingsFromUi(true);
  }

  function saveSettingsFromUi(silent) {
    state.settings = {
      name: (el.plannerNameInput.value || DEFAULT_SETTINGS.name).trim().slice(0, 40),
      workStart: el.workStartInput.value || DEFAULT_SETTINGS.workStart,
      workEnd: el.workEndInput.value || DEFAULT_SETTINGS.workEnd,
      dayLimit: Math.min(16, Math.max(1, Number(el.dayLimitInput.value) || DEFAULT_SETTINGS.dayLimit)),
      theme: el.themeSelect.value === 'clear' ? 'clear' : 'warm'
    };
    saveSettings();
    applySettingsToUi();
    renderFocus();
    if (!silent) {
      showFeedback('Настройки сохранены.', 'success');
    }
  }

  function applySettingsToUi() {
    var s = state.settings || DEFAULT_SETTINGS;
    el.appTitle.textContent = s.name || DEFAULT_SETTINGS.name;
    document.title = s.name || DEFAULT_SETTINGS.name;
    document.body.setAttribute('data-theme', s.theme || 'warm');
    el.plannerNameInput.value = s.name || DEFAULT_SETTINGS.name;
    el.workStartInput.value = s.workStart || DEFAULT_SETTINGS.workStart;
    el.workEndInput.value = s.workEnd || DEFAULT_SETTINGS.workEnd;
    el.dayLimitInput.value = String(s.dayLimit || DEFAULT_SETTINGS.dayLimit);
    el.themeSelect.value = s.theme || DEFAULT_SETTINGS.theme;
  }

  function saveSettings() {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(state.settings));
  }

  function saveUndoStack() {
    localStorage.setItem(UNDO_KEY, JSON.stringify(state.undoStack));
  }

  function loadUndoStack() {
    try {
      var raw = localStorage.getItem(UNDO_KEY);
      var parsed = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(parsed)) return [];
      return parsed
        .filter(function (item) { return item && typeof item.tasks === 'string'; })
        .slice(-10);
    } catch (e) {
      return [];
    }
  }

  function loadSettings() {
    try {
      var raw = localStorage.getItem(SETTINGS_KEY);
      var parsed = raw ? JSON.parse(raw) : {};
      var savedName = parsed.name ? String(parsed.name).slice(0, 40) : DEFAULT_SETTINGS.name;
      if (savedName === 'Ладный День') {
        savedName = DEFAULT_SETTINGS.name;
      }
      return {
        name: savedName,
        workStart: parsed.workStart || DEFAULT_SETTINGS.workStart,
        workEnd: parsed.workEnd || DEFAULT_SETTINGS.workEnd,
        dayLimit: Number(parsed.dayLimit) > 0 ? Number(parsed.dayLimit) : DEFAULT_SETTINGS.dayLimit,
        theme: parsed.theme === 'clear' ? 'clear' : DEFAULT_SETTINGS.theme
      };
    } catch (e) {
      return DEFAULT_SETTINGS;
    }
  }

  function loadData() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      var parsed = raw ? JSON.parse(raw) : [];
      return sanitizeTasks(Array.isArray(parsed) ? parsed : []);
    } catch (e) {
      return [];
    }
  }

  function findTask(id) {
    for (var i = 0; i < state.tasks.length; i += 1) {
      if (state.tasks[i].id === id) return state.tasks[i];
    }
    return null;
  }

  function createId(prefix) {
    if (typeof crypto !== 'undefined' && crypto && typeof crypto.randomUUID === 'function') {
      return prefix + '-' + crypto.randomUUID();
    }
    return prefix + '-' + Date.now() + '-' + Math.random().toString(16).slice(2, 10);
  }

  function startOfWeek(date) {
    var d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    var day = d.getDay();
    var diff = day === 0 ? -6 : 1 - day;
    return addDays(d, diff);
  }

  function startOfMonth(date) {
    return new Date(date.getFullYear(), date.getMonth(), 1);
  }

  function addMonths(date, amount) {
    return new Date(date.getFullYear(), date.getMonth() + amount, 1);
  }

  function addDays(date, amount) {
    return new Date(date.getTime() + amount * DAY_MS);
  }

  function parseISODate(text) {
    return new Date(text + 'T00:00:00');
  }

  function toISODate(date) {
    var y = date.getFullYear();
    var m = String(date.getMonth() + 1);
    var d = String(date.getDate());
    if (m.length < 2) m = '0' + m;
    if (d.length < 2) d = '0' + d;
    return y + '-' + m + '-' + d;
  }

  function formatDate(dateLike) {
    var text = typeof dateLike === 'string' ? dateLike : toISODate(dateLike);
    var date = parseISODate(text);
    return date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  function weekdayLabel(date) {
    return date.toLocaleDateString('ru-RU', { weekday: 'short' });
  }

  function priorityLabel(value) {
    if (value === 'high') return 'высокий';
    if (value === 'medium') return 'средний';
    return 'низкий';
  }

  function categoryLabel(value) {
    if (value === 'work') return 'работа';
    if (value === 'personal') return 'личное';
    if (value === 'study') return 'учеба';
    if (value === 'health') return 'здоровье';
    return value;
  }

  function normalizePriority(value) {
    if (value === 'low' || value === 'medium' || value === 'high') return value;
    return 'medium';
  }

  function normalizeCategory(value) {
    if (value === 'work' || value === 'personal' || value === 'study' || value === 'health') return value;
    return 'work';
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
})();
