(function () {
  const STORAGE_KEY = "weeklyHourlyPlanner.v1";
  const DAY_NAMES = ["пн", "вт", "ср", "чт", "пт", "сб", "вс"];
  const MONTH_NAMES = [
    "январь", "февраль", "март", "апрель", "май", "июнь",
    "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь"
  ];
  const START_HOUR = 9;
  const END_HOUR = 21;

  const DEFAULT_STORAGE_DATA = {
    schemaVersion: 1,
    tasks: [],
    recurringSeries: [],
    recurringExceptions: [],
    uiPrefs: {
      categoryFilter: "all",
      compactHeader: false,
      headerTheme: "soft"
    }
  };

  const now = new Date();
  const todayDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const state = {
    activeDate: new Date(todayDate),
    currentMonthView: new Date(todayDate.getFullYear(), todayDate.getMonth(), 1),
    tasks: [],
    recurringSeries: [],
    recurringExceptions: [],
    ui: {
      taskModalMode: "create",
      editingTaskId: null,
      editingSeriesId: null,
      mainDate: new Date(todayDate),
      viewMode: "day",
      categoryFilter: "all",
      compactHeader: false,
      headerTheme: "soft"
    }
  };

  const dragState = { payload: null, ghostEl: null };
  const recurringActionState = { task: null, type: null };

  const formatDate = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const formatTimeByHour = (hour) => `${String(hour).padStart(2, "0")}:00`;
  const parseHour = (time) => Number(String(time).split(":")[0]);
  const createId = (prefix) => `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  const getTaskDuration = (task) => {
    const raw = Number(task.durationHours);
    return Number.isFinite(raw) && raw > 0 ? raw : 1;
  };
  const isSameDate = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  const getDateOnly = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const getTodayDate = () => getDateOnly(new Date());
  const getTomorrowDate = () => {
    const t = getTodayDate();
    t.setDate(t.getDate() + 1);
    return t;
  };

  const getWeekStart = (date) => {
    const d = getDateOnly(date);
    const day = d.getDay();
    d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day));
    return d;
  };

  const getWeekEnd = (date) => {
    const d = getWeekStart(date);
    d.setDate(d.getDate() + 6);
    return d;
  };

  const getISOWeekNumber = (date) => {
    const d = getDateOnly(date);
    const day = d.getDay() || 7;
    d.setDate(d.getDate() + 4 - day);
    const y = new Date(d.getFullYear(), 0, 1);
    return Math.floor(Math.floor((d - y) / 86400000) / 7) + 1;
  };

  const getYearLabel = (date) => {
    const sy = getWeekStart(date).getFullYear();
    const ey = getWeekEnd(date).getFullYear();
    return sy === ey ? String(sy) : `${sy}-${ey}`;
  };

  function showNotification(message) {
    const el = document.getElementById("notification");
    if (!el) {
      return;
    }
    el.textContent = message;
    el.classList.add("is-visible");
  }

  function cloneDefaultStorageData() {
    return {
      schemaVersion: 1,
      tasks: [],
      recurringSeries: [],
      recurringExceptions: [],
      uiPrefs: {
        categoryFilter: "all",
        compactHeader: false,
        headerTheme: "soft"
      }
    };
  }

  function normalizeUiPrefs(prefs) {
    const raw = prefs && typeof prefs === "object" ? prefs : {};
    const categoryFilter = raw.categoryFilter === "personal" || raw.categoryFilter === "work" ? raw.categoryFilter : "all";
    const compactHeader = !!raw.compactHeader;
    const headerTheme = raw.headerTheme === "strict" ? "strict" : "soft";
    return { categoryFilter, compactHeader, headerTheme };
  }

  function saveToStorage() {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          schemaVersion: 1,
          tasks: state.tasks,
          recurringSeries: state.recurringSeries,
          recurringExceptions: state.recurringExceptions,
          uiPrefs: normalizeUiPrefs(state.ui)
        })
      );
      return true;
    } catch (_) {
      showNotification("ошибка хранения: данные не удалось сохранить");
      return false;
    }
  }

  function loadFromStorage() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        const empty = cloneDefaultStorageData();
        localStorage.setItem(STORAGE_KEY, JSON.stringify(empty));
        return empty;
      }

      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed.tasks) || !Array.isArray(parsed.recurringSeries) || !Array.isArray(parsed.recurringExceptions)) {
        throw new Error("invalid storage shape");
      }
      return parsed;
    } catch (_) {
      showNotification("ошибка данных: данные повреждены");
      return cloneDefaultStorageData();
    }
  }

  function getWeekDays(date) {
    const s = getWeekStart(date);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(s);
      d.setDate(s.getDate() + i);
      return d;
    });
  }

  function getTasksForDate(dateStr) {
    return state.tasks.filter((t) => t.date === dateStr);
  }

  function getTasksForWeek(date) {
    const ws = getWeekStart(date);
    const we = getWeekEnd(date);
    return state.tasks.filter((t) => {
      const d = new Date(`${t.date}T00:00:00`);
      return d >= ws && d <= we;
    });
  }

  function calculateProgress(tasks) {
    if (!tasks.length) {
      return 0;
    }
    return Math.round((tasks.filter((t) => t.status === "done").length / tasks.length) * 100);
  }

  function getTaskEffectiveStatus(task) {
    if (task.status === "done") {
      return "done";
    }
    const hour = Number(task.time.split(":")[0]);
    const durationHours = getTaskDuration(task);
    const end = new Date(`${task.date}T00:00:00`);
    end.setHours(hour + durationHours, 0, 0, 0);
    return Date.now() > end.getTime() ? "overdue" : (task.status || "planning");
  }

  function getException(seriesId, date) {
    return state.recurringExceptions.find((e) => e.seriesId === seriesId && e.date === date) || null;
  }

  function getSeriesById(seriesId) {
    return state.recurringSeries.find((series) => series.id === seriesId) || null;
  }

  function getDowFromDateStr(dateStr) {
    const d = new Date(`${dateStr}T00:00:00`);
    return (d.getDay() + 6) % 7;
  }

  function normalizeSeriesDays(series) {
    if (Array.isArray(series.daysOfWeek)) {
      return Array.from(new Set(series.daysOfWeek
        .map((d) => Number(d))
        .filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))).sort((a, b) => a - b);
    }
    if (Number.isInteger(series.dayOfWeek) && series.dayOfWeek >= 0 && series.dayOfWeek <= 6) {
      return [series.dayOfWeek];
    }
    return [];
  }

  function getSeriesDays(series) {
    return normalizeSeriesDays(series);
  }

  function getRecurringDaysInputs() {
    return Array.from(document.querySelectorAll("input[name='recurringDays']"));
  }

  function getSelectedRecurringDays() {
    return getRecurringDaysInputs()
      .filter((input) => input.checked)
      .map((input) => Number(input.value))
      .filter((d) => Number.isInteger(d) && d >= 0 && d <= 6)
      .sort((a, b) => a - b);
  }

  function setRecurringDaysSelection(days) {
    const daySet = new Set((days || []).map((d) => Number(d)));
    getRecurringDaysInputs().forEach((input) => {
      input.checked = daySet.has(Number(input.value));
    });
  }

  function setRecurringDaysEnabled(enabled) {
    const group = document.getElementById("taskRecurringDaysGroup");
    if (!group) {
      return;
    }
    group.disabled = !enabled;
  }

  function isDateWithinSeriesRange(series, date) {
    if (series.startDate && date < series.startDate) {
      return false;
    }
    if (series.untilDate && date > series.untilDate) {
      return false;
    }
    return true;
  }

  function getRecurringTaskForSlot(date, time) {
    const dateObj = new Date(`${date}T00:00:00`);
    const dow = (dateObj.getDay() + 6) % 7;
    const slotHour = parseHour(time);

    for (const series of state.recurringSeries) {
      const days = getSeriesDays(series);
      if (!days.includes(dow)) {
        continue;
      }
      if (!isDateWithinSeriesRange(series, date)) {
        continue;
      }
      const startHour = parseHour(series.time);
      const durationHours = getTaskDuration(series);
      const endHourExclusive = startHour + durationHours;
      if (slotHour < startHour || slotHour >= endHourExclusive) {
        continue;
      }
      const ex = getException(series.id, date);
      if (ex && ex.type === "deleted") {
        return null;
      }

      return {
        id: `series-${series.id}-${date}`,
        seriesId: series.id,
        isRecurringInstance: true,
        title: series.title,
        date,
        time,
        priority: series.priority || "medium",
        category: series.category || "personal",
        durationHours,
        status: ex && ex.type === "done" ? "done" : "planning"
      };
    }

    return null;
  }

  function isTaskCoveringSlot(task, time) {
    const slotHour = parseHour(time);
    const startHour = parseHour(task.time);
    const durationHours = getTaskDuration(task);
    const endHourExclusive = startHour + durationHours;
    return slotHour >= startHour && slotHour < endHourExclusive;
  }

  function canTaskFitInDay(startHour, durationHours) {
    return startHour >= START_HOUR && startHour <= END_HOUR && (startHour + durationHours - 1) <= END_HOUR;
  }

  function canPlaceTaskSpan(date, startTime, durationHours, excludeRef) {
    const startHour = parseHour(startTime);
    if (!canTaskFitInDay(startHour, durationHours)) {
      return false;
    }
    for (let hour = startHour; hour < startHour + durationHours; hour += 1) {
      const time = formatTimeByHour(hour);
      if (getSlotEntry(date, time, excludeRef)) {
        return false;
      }
    }
    return true;
  }

  function getSlotEntry(date, time, excludeRef, forDisplay) {
    const direct = state.tasks.find((t) => {
      if (t.date !== date) {
        return false;
      }
      if (excludeRef && excludeRef.kind === "task" && t.id === excludeRef.id) {
        return false;
      }
      return isTaskCoveringSlot(t, time);
    });
    if (direct) {
      if (forDisplay && !isCategoryVisible(direct.category)) {
        return null;
      }
      return { kind: "task", item: direct, isStart: parseHour(direct.time) === parseHour(time) };
    }

    const recurring = getRecurringTaskForSlot(date, time);
    if (recurring && (!excludeRef || !(excludeRef.kind === "series" && recurring.seriesId === excludeRef.id && recurring.date === excludeRef.date))) {
      if (forDisplay && !isCategoryVisible(recurring.category)) {
        return null;
      }
      return { kind: "series", item: recurring, isStart: parseHour(recurring.time) === parseHour(time) };
    }

    return null;
  }

  function getVisibleEntriesForDate(dateStr) {
    const entries = [];
    for (let h = START_HOUR; h <= END_HOUR; h += 1) {
      const time = `${String(h).padStart(2, "0")}:00`;
      const entry = getSlotEntry(dateStr, time, null, true);
      if (entry && entry.isStart) {
        entries.push({ time, ...entry });
      }
    }
    return entries;
  }

  function isCategoryVisible(category) {
    if (state.ui.categoryFilter === "all") {
      return true;
    }
    return (category || "personal") === state.ui.categoryFilter;
  }

  function filterTasksByCategory(tasks) {
    if (state.ui.categoryFilter === "all") {
      return tasks;
    }
    return tasks.filter((task) => (task.category || "personal") === state.ui.categoryFilter);
  }

  function collectVisibleEntriesForRange(startDate, endDate) {
    const entries = [];
    const cursor = new Date(startDate);
    while (cursor <= endDate) {
      const dateStr = formatDate(cursor);
      for (let h = START_HOUR; h <= END_HOUR; h += 1) {
        const time = `${String(h).padStart(2, "0")}:00`;
        const entry = getSlotEntry(dateStr, time, null, true);
        if (entry && entry.isStart) {
          entries.push(entry);
        }
      }
      cursor.setDate(cursor.getDate() + 1);
    }
    return entries;
  }

  function getHeaderCounters() {
    if (state.ui.viewMode === "week") {
      const weekStart = getWeekStart(state.activeDate);
      const weekEnd = getWeekEnd(state.activeDate);
      return collectVisibleEntriesForRange(weekStart, weekEnd);
    }

    if (state.ui.viewMode === "month") {
      const monthStart = new Date(state.currentMonthView.getFullYear(), state.currentMonthView.getMonth(), 1);
      const monthEnd = new Date(state.currentMonthView.getFullYear(), state.currentMonthView.getMonth() + 1, 0);
      return collectVisibleEntriesForRange(monthStart, monthEnd);
    }

    if (state.ui.viewMode === "year") {
      const year = state.ui.mainDate.getFullYear();
      const yearStart = new Date(year, 0, 1);
      const yearEnd = new Date(year, 11, 31);
      return collectVisibleEntriesForRange(yearStart, yearEnd);
    }

    return getVisibleEntriesForDate(formatDate(state.ui.mainDate)).map((entry) => entry);
  }

  function getExcludeRefFromPayload(payload) {
    if (!payload) {
      return null;
    }
    if (payload.kind === "task") {
      return { kind: "task", id: payload.id };
    }
    return { kind: "series", id: payload.id, date: payload.date };
  }

  function clearDropZoneHighlights() {
    document.querySelectorAll(".drop-zone-ready, .drop-zone-blocked, .drag-over").forEach((el) => {
      el.classList.remove("drop-zone-ready", "drop-zone-blocked", "drag-over");
    });
  }

  function highlightAvailableDropZones(payload) {
    clearDropZoneHighlights();
    if (!payload) {
      return;
    }

    const excludeRef = getExcludeRefFromPayload(payload);
    const mainDateStr = formatDate(state.ui.mainDate);
    const durationHours = payload.durationHours || 1;

    document.querySelectorAll("#mainDayGrid .hour-slot").forEach((slot) => {
      const time = slot.dataset.time;
      if (!time) {
        return;
      }
      const isFree = canPlaceTaskSpan(mainDateStr, time, durationHours, excludeRef);
      slot.classList.add(isFree ? "drop-zone-ready" : "drop-zone-blocked");
    });

    document.querySelectorAll("#weekStripBottom .day-btn").forEach((dayBtn) => {
      const date = dayBtn.dataset.date;
      if (!date) {
        return;
      }
      const isFree = canPlaceTaskSpan(date, payload.time, durationHours, excludeRef);
      dayBtn.classList.add(isFree ? "drop-zone-ready" : "drop-zone-blocked");
    });
  }

  function createDragGhost(task) {
    const ghost = document.createElement("div");
    ghost.className = "drag-ghost";
    ghost.textContent = `${task.time} - ${task.title}`;
    document.body.appendChild(ghost);
    dragState.ghostEl = ghost;
    return ghost;
  }

  function clearDragGhost() {
    if (dragState.ghostEl && dragState.ghostEl.parentNode) {
      dragState.ghostEl.parentNode.removeChild(dragState.ghostEl);
    }
    dragState.ghostEl = null;
  }

  function getMonthCategoryIndicator(dateStr) {
    const categories = new Set();

    state.tasks.forEach((task) => {
      if (task.date === dateStr) {
        if (isCategoryVisible(task.category)) {
          categories.add(task.category || "personal");
        }
      }
    });

    const dateObj = new Date(`${dateStr}T00:00:00`);
    const dow = (dateObj.getDay() + 6) % 7;

    state.recurringSeries.forEach((series) => {
      const days = getSeriesDays(series);
      if (!days.includes(dow)) {
        return;
      }
      if (!isDateWithinSeriesRange(series, dateStr)) {
        return;
      }
      const ex = getException(series.id, dateStr);
      if (ex && ex.type === "deleted") {
        return;
      }
      if (isCategoryVisible(series.category)) {
        categories.add(series.category || "personal");
      }
    });

    const hasPersonal = categories.has("personal");
    const hasWork = categories.has("work");
    if (hasPersonal && hasWork) {
      return "both";
    }
    if (hasWork) {
      return "work";
    }
    if (hasPersonal) {
      return "personal";
    }
    return null;
  }

  function renderHeader() {
    const mainDate = state.ui.mainDate;
    const setText = (id, value) => {
      const el = document.getElementById(id);
      if (el) {
        el.textContent = value;
      }
    };

    setText("yearLabel", getYearLabel(state.activeDate));
    setText("weekNumber", String(getISOWeekNumber(state.activeDate)));
    const dayEntries = getVisibleEntriesForDate(formatDate(mainDate));
    const weekEntries = collectVisibleEntriesForRange(getWeekStart(state.activeDate), getWeekEnd(state.activeDate));
    setText("dayProgressLabel", `${calculateProgress(dayEntries.map((entry) => entry.item))}%`);
    setText("weekProgressLabel", `${calculateProgress(weekEntries.map((entry) => entry.item))}%`);
    const counterEntries = getHeaderCounters();
    const doneCount = counterEntries.filter((entry) => getTaskEffectiveStatus(entry.item) === "done").length;
    setText("totalCountLabel", String(counterEntries.length));
    setText("doneCountLabel", String(doneCount));

    const modeMap = {
      day: "viewDayBtn",
      week: "viewWeekBtn",
      month: "viewMonthBtn",
      year: "viewYearBtn"
    };

    Object.values(modeMap).forEach((id) => {
      const btn = document.getElementById(id);
      if (btn) {
        btn.classList.remove("active");
      }
    });

    const activeBtn = document.getElementById(modeMap[state.ui.viewMode]);
    if (activeBtn) {
      activeBtn.classList.add("active");
    }

    const compactBtn = document.getElementById("compactHeaderBtn");
    if (compactBtn) {
      compactBtn.textContent = state.ui.compactHeader ? "обычно" : "компактно";
      compactBtn.setAttribute("aria-pressed", state.ui.compactHeader ? "true" : "false");
    }

    const themeBtn = document.getElementById("headerThemeBtn");
    if (themeBtn) {
      themeBtn.textContent = state.ui.headerTheme === "soft" ? "стиль: мягкий" : "стиль: строгий";
      themeBtn.setAttribute("aria-pressed", state.ui.headerTheme === "soft" ? "true" : "false");
    }
  }

  function renderMainDayTitle() {
    const target = document.getElementById("mainDayTitle");
    const date = state.ui.mainDate;
    target.textContent = `${DAY_NAMES[(date.getDay() + 6) % 7]}, ${formatDate(date)}`;

    const backBtn = document.getElementById("backToTodayBtn");
    if (isSameDate(state.ui.mainDate, getTodayDate())) {
      backBtn.disabled = true;
      backBtn.style.opacity = "0.6";
    } else {
      backBtn.disabled = false;
      backBtn.style.opacity = "1";
    }
  }

  function getDayStatusCounts(entries) {
    const counts = {
      inProgress: 0,
      done: 0,
      overdue: 0
    };

    entries.forEach((entry) => {
      const status = getTaskEffectiveStatus(entry.item);
      if (status === "in-progress") {
        counts.inProgress += 1;
      } else if (status === "done") {
        counts.done += 1;
      } else if (status === "overdue") {
        counts.overdue += 1;
      }
    });

    return counts;
  }

  function renderWeekStripBottom() {
    const c = document.getElementById("weekStripBottom");
    c.innerHTML = "";
    const today = getTodayDate();

    getWeekDays(state.activeDate).forEach((day, i) => {
      const dstr = formatDate(day);
      const dayEntries = getVisibleEntriesForDate(dstr);
      const p = calculateProgress(dayEntries.map((entry) => entry.item));
      const dayCounts = getDayStatusCounts(dayEntries);
      const b = document.createElement("button");
      b.type = "button";
      b.className = "day-btn";
      b.dataset.date = dstr;

      if (isSameDate(day, state.ui.mainDate)) {
        b.classList.add("active");
      }
      if (isSameDate(day, today)) {
        b.classList.add("today");
      }

      const nameEl = document.createElement("span");
      nameEl.className = "day-name";
      nameEl.textContent = DAY_NAMES[i];

      const dateEl = document.createElement("span");
      dateEl.className = "day-date";
      dateEl.textContent = `${String(day.getDate()).padStart(2, "0")}.${String(day.getMonth() + 1).padStart(2, "0")}`;

      const progressEl = document.createElement("span");
      progressEl.className = "day-progress";
      progressEl.textContent = `${p}%`;

      const countersEl = document.createElement("div");
      countersEl.className = "day-counters";
      const counterItems = [
        { cls: "in-progress", title: "в работе", short: "в", value: dayCounts.inProgress },
        { cls: "done", title: "сделано", short: "с", value: dayCounts.done },
        { cls: "overdue", title: "просрочено", short: "п", value: dayCounts.overdue }
      ];
      counterItems.forEach((counter) => {
        const marker = document.createElement("span");
        marker.className = `day-counter ${counter.cls}`;
        marker.title = counter.title;
        marker.textContent = `${counter.short}: ${counter.value}`;
        countersEl.appendChild(marker);
      });

      b.appendChild(nameEl);
      b.appendChild(dateEl);
      b.appendChild(progressEl);
      b.appendChild(countersEl);
      b.addEventListener("click", () => {
        state.ui.mainDate = getDateOnly(day);
        state.activeDate = getDateOnly(day);
        state.ui.viewMode = "day";
        renderApp();
      });

      b.addEventListener("dragover", (e) => {
        e.preventDefault();
        if (e.dataTransfer) {
          e.dataTransfer.dropEffect = "move";
        }
        b.classList.add("drag-over");
      });
      b.addEventListener("dragleave", () => b.classList.remove("drag-over"));
      b.addEventListener("drop", (e) => {
        e.preventDefault();
        b.classList.remove("drag-over");
        if (!dragState.payload) {
          const rawPayload = e.dataTransfer.getData("text/plain");
          if (rawPayload) {
            try {
              dragState.payload = JSON.parse(rawPayload);
            } catch (_) {
              dragState.payload = null;
            }
          }
        }
        if (dragState.payload) {
          moveDraggedTask(dstr, dragState.payload.time);
        }
      });

      c.appendChild(b);
    });
  }

  function applyRecurringAction(task, type, scope) {
    if (!task || !task.seriesId) {
      return false;
    }

    if (scope === "single") {
      state.recurringExceptions = state.recurringExceptions.filter(
        (e) => !(e.seriesId === task.seriesId && e.date === task.date)
      );
      state.recurringExceptions.push({ seriesId: task.seriesId, date: task.date, type });
      return true;
    }

    if (scope === "series") {
      if (type === "done") {
        const series = getSeriesById(task.seriesId);
        if (!series) {
          return false;
        }
        state.recurringExceptions = state.recurringExceptions.filter(
          (e) => !(e.seriesId === task.seriesId && e.date === task.date)
        );
        state.recurringExceptions.push({ seriesId: task.seriesId, date: task.date, type: "done" });
        if (!series.startDate || task.date < series.startDate) {
          series.startDate = task.date;
        }
        series.untilDate = task.date;
        return true;
      }
      state.recurringSeries = state.recurringSeries.filter((s) => s.id !== task.seriesId);
      state.recurringExceptions = state.recurringExceptions.filter((e) => e.seriesId !== task.seriesId);
      return true;
    }

    return false;
  }

  function openRecurringActionModal(task, type) {
    recurringActionState.task = task;
    recurringActionState.type = type;
    const modal = document.getElementById("recurringActionModal");
    const text = document.getElementById("recurringActionText");
    const hint = document.getElementById("recurringActionHint");
    if (text) {
      const actionLabel = type === "done" ? "выполнение" : "удаление";
      text.textContent = `применить ${actionLabel}: только к этому экземпляру или ко всей серии?`;
    }
    if (hint) {
      hint.hidden = type !== "done";
    }
    if (modal) {
      modal.classList.add("open");
      modal.setAttribute("aria-hidden", "false");
    }
  }

  function closeRecurringActionModal() {
    const modal = document.getElementById("recurringActionModal");
    if (modal) {
      modal.classList.remove("open");
      modal.setAttribute("aria-hidden", "true");
    }
    recurringActionState.task = null;
    recurringActionState.type = null;
  }

  function resolveRecurringAction(scope) {
    const task = recurringActionState.task;
    const type = recurringActionState.type;
    if (!task || !type) {
      closeRecurringActionModal();
      return;
    }

    const ok = applyRecurringAction(task, type, scope);
    closeRecurringActionModal();
    if (!ok) {
      showNotification("ошибка данных: не удалось применить действие");
      return;
    }

    saveToStorage();
    renderApp();
    showNotification("статус задачи: изменения применены");
  }

  function makeTaskCard(task, kind, options) {
    const config = options || {};
    const effective = getTaskEffectiveStatus(task);
    const card = document.createElement("div");
    card.className = `task-card priority-${task.priority || "medium"} task-category-${task.category || "personal"}`;

    if (effective === "done") {
      card.classList.add("is-done");
    }
    if (effective === "overdue") {
      card.classList.add("is-overdue");
    }

    if (!config.compact && effective !== "done") {
      card.draggable = true;
    }

    if (!config.compact) {
      card.tabIndex = 0;
      card.setAttribute("aria-label", `задача ${task.title}`);

      card.addEventListener("dragstart", (e) => {
        if (effective === "done") {
          showNotification("ошибка переноса: выполненную задачу нельзя перенести");
          e.preventDefault();
          return;
        }
        dragState.payload = {
          kind,
          id: kind === "task" ? task.id : task.seriesId,
          date: task.date,
          time: task.time,
          durationHours: getTaskDuration(task)
        };
        e.dataTransfer.effectAllowed = "move";
        const ghost = createDragGhost(task);
        e.dataTransfer.setDragImage(ghost, 16, 16);
        e.dataTransfer.setData("text/plain", JSON.stringify(dragState.payload));
        card.classList.add("is-dragging");
        highlightAvailableDropZones(dragState.payload);
      });

      card.addEventListener("dragend", () => {
        card.classList.remove("is-dragging");
        clearDropZoneHighlights();
        clearDragGhost();
      });

      card.addEventListener("keydown", (event) => {
        if (!event.altKey) {
          return;
        }
        const keyMap = {
          ArrowUp: { day: 0, hour: -1 },
          ArrowDown: { day: 0, hour: 1 },
          ArrowLeft: { day: -1, hour: 0 },
          ArrowRight: { day: 1, hour: 0 }
        };
        const target = keyMap[event.key];
        if (!target) {
          return;
        }
        event.preventDefault();
        moveTaskByKeyboard(task, kind, target.day, target.hour, effective);
      });
    }

    const titleRow = document.createElement("div");
    titleRow.className = "task-title-row";

    const categoryIcon = document.createElement("span");
    categoryIcon.className = `task-category-icon ${task.category === "work" ? "work" : "personal"}`;
    categoryIcon.textContent = task.category === "work" ? "\uD83D\uDCBC" : "\uD83C\uDFE0";
    titleRow.appendChild(categoryIcon);

    const titleBtn = document.createElement("button");
    titleBtn.type = "button";
    titleBtn.className = "task-title-btn";
    titleBtn.textContent = task.title;
    titleBtn.addEventListener("click", () => {
      if (kind === "task") {
        openTaskModal("edit", task);
      } else {
        const series = getSeriesById(task.seriesId);
        if (!series) {
          showNotification("ошибка данных: серия не найдена");
          return;
        }
        openTaskModal("edit-series", { ...series, instanceDate: task.date });
      }
    });
    titleRow.appendChild(titleBtn);

    const meta = document.createElement("div");
    meta.className = "task-meta";

    if (effective !== "done") {
      const st = document.createElement("span");
      st.className = "status-badge";
      st.textContent = effective === "planning" ? "планируется" : effective === "in-progress" ? "в работе" : "просрочено";
      meta.appendChild(st);
    }

    const actions = document.createElement("div");
    actions.className = "task-actions";

    const doneCheck = document.createElement("input");
    doneCheck.type = "checkbox";
    doneCheck.className = "done-check";
    doneCheck.checked = effective === "done";
    doneCheck.addEventListener("change", () => {
      if (kind === "series") {
        const actionType = doneCheck.checked ? "done" : "deleted";
        doneCheck.checked = !doneCheck.checked;
        openRecurringActionModal(task, actionType);
        return;
      } else {
        task.status = doneCheck.checked ? "done" : "planning";
      }
      saveToStorage();
      renderApp();
    });
    actions.appendChild(doneCheck);

    if (!config.compact && effective === "planning" && kind === "task") {
      const startBtn = document.createElement("button");
      startBtn.textContent = "начать";
      startBtn.addEventListener("click", () => {
        task.status = "in-progress";
        saveToStorage();
        renderApp();
      });
      actions.appendChild(startBtn);
    }

    if (!config.compact) {
      const doneBtn = document.createElement("button");
      doneBtn.textContent = effective === "done" ? "вернуть" : "готово";
      doneBtn.addEventListener("click", () => {
        if (kind === "series") {
          openRecurringActionModal(task, effective === "done" ? "deleted" : "done");
          return;
        } else {
          task.status = effective === "done" ? "planning" : "done";
        }
        saveToStorage();
        renderApp();
      });
      actions.appendChild(doneBtn);

      if (kind === "series") {
        const editBtn = document.createElement("button");
        editBtn.textContent = "изменить";
        editBtn.addEventListener("click", () => {
          const series = getSeriesById(task.seriesId);
          if (!series) {
            showNotification("ошибка данных: серия не найдена");
            return;
          }
          openTaskModal("edit-series", { ...series, instanceDate: task.date });
        });
        actions.appendChild(editBtn);

        const removeBtn = document.createElement("button");
        removeBtn.textContent = "удалить";
        removeBtn.addEventListener("click", () => {
          openRecurringActionModal(task, "deleted");
        });
        actions.appendChild(removeBtn);
      }

      if (kind === "task") {
        const editBtn = document.createElement("button");
        editBtn.textContent = "изменить";
        editBtn.addEventListener("click", () => openTaskModal("edit", task));
        actions.appendChild(editBtn);
      }
    }

    card.appendChild(titleRow);
    card.appendChild(meta);
    card.appendChild(actions);
    return card;
  }

  function renderDayGrid(date, containerId) {
    const c = document.getElementById(containerId);
    c.innerHTML = "";
    const dateStr = formatDate(date);
    const isMainGrid = containerId === "mainDayGrid";
    c.classList.toggle("main-day-grid", isMainGrid);

    for (let h = START_HOUR; h <= END_HOUR; h += 1) {
      const time = `${String(h).padStart(2, "0")}:00`;
      const slot = document.createElement("div");
      slot.className = "hour-slot";
      slot.dataset.time = time;

      if (isMainGrid) {
        slot.addEventListener("dragover", (e) => {
          e.preventDefault();
          if (e.dataTransfer) {
            e.dataTransfer.dropEffect = "move";
          }
          slot.classList.add("drag-over");
        });
        slot.addEventListener("dragleave", () => slot.classList.remove("drag-over"));
        slot.addEventListener("drop", (e) => {
          e.preventDefault();
          slot.classList.remove("drag-over");
          if (!dragState.payload) {
            const rawPayload = e.dataTransfer.getData("text/plain");
            if (rawPayload) {
              try {
                dragState.payload = JSON.parse(rawPayload);
              } catch (_) {
                dragState.payload = null;
              }
            }
          }
          moveDraggedTask(dateStr, time);
        });
      }

      const label = document.createElement("div");
      label.className = "hour-label";
      label.textContent = time;
      slot.appendChild(label);

      const content = document.createElement("div");
      content.className = "hour-content";
      slot.appendChild(content);

      const rawEntry = getSlotEntry(dateStr, time);
      const entry = getSlotEntry(dateStr, time, null, true);
      if (!entry) {
        if (rawEntry && state.ui.categoryFilter !== "all") {
          const hidden = document.createElement("span");
          hidden.className = "tomorrow-empty";
          hidden.textContent = "скрыто фильтром";
          content.appendChild(hidden);
        } else {
          const add = document.createElement("button");
          add.textContent = "+ задача";
          add.addEventListener("click", () => openTaskModal("create", { time, date: dateStr }));
          content.appendChild(add);
        }
      } else {
        if (entry.isStart) {
          const card = makeTaskCard(entry.item, entry.kind, containerId === "tomorrowMiniGrid" ? { compact: true } : null);
          if (isMainGrid) {
            const spanHours = getTaskDuration(entry.item);
            if (spanHours > 1) {
              card.classList.add("task-span-block");
              card.style.setProperty("--task-span", String(spanHours));
              slot.classList.add("slot-span-start");
            }
          }
          content.appendChild(card);
        } else {
          slot.classList.add("slot-covered");
          if (!isMainGrid) {
            const occupied = document.createElement("span");
            occupied.className = "slot-covered-marker";
            occupied.textContent = "занято";
            content.appendChild(occupied);
          }
        }
      }

      c.appendChild(slot);
    }
  }

  function syncMainGridRowStep() {
    const grid = document.getElementById("mainDayGrid");
    if (!grid || !grid.classList.contains("main-day-grid")) {
      return;
    }
    const firstSlot = grid.querySelector(".hour-slot");
    if (!firstSlot) {
      return;
    }
    const slotHeight = Math.round(firstSlot.getBoundingClientRect().height);
    if (slotHeight > 0) {
      grid.style.setProperty("--time-row-step", `${slotHeight}px`);
    }
  }

  function renderWeekOverview() {
    const c = document.getElementById("mainDayGrid");
    c.innerHTML = "";
    const wrapper = document.createElement("div");
    wrapper.className = "week-overview";

    getWeekDays(state.activeDate).forEach((day, i) => {
      const dateStr = formatDate(day);
      const entries = getVisibleEntriesForDate(dateStr);
      const card = document.createElement("div");
      card.className = "week-day-card";

      const title = document.createElement("h4");
      title.textContent = `${DAY_NAMES[i]} - ${String(day.getDate()).padStart(2, "0")}.${String(day.getMonth() + 1).padStart(2, "0")}`;

      const meta = document.createElement("div");
      meta.className = "week-day-meta";
      meta.textContent = `задач: ${entries.length}, прогресс: ${calculateProgress(entries.map((entry) => entry.item))}%`;

      const list = document.createElement("div");
      list.className = "week-day-list";
      entries.slice(0, 4).forEach((entry) => {
        const row = document.createElement("div");
        row.className = "week-day-item";
        row.textContent = `${entry.time} ${entry.item.title}`;
        list.appendChild(row);
      });

      if (!entries.length) {
        const row = document.createElement("div");
        row.className = "week-day-item";
        row.textContent = "задач нет";
        list.appendChild(row);
      }

      card.appendChild(title);
      card.appendChild(meta);
      card.appendChild(list);
      card.addEventListener("click", () => {
        state.ui.mainDate = getDateOnly(day);
        state.ui.viewMode = "day";
        renderApp();
      });
      wrapper.appendChild(card);
    });

    c.appendChild(wrapper);
  }

  function buildMonthGrid(baseDate, gridEl, options) {
    const config = options || { allowOtherMonth: true, onSelect: null };
    gridEl.innerHTML = "";

    const month = baseDate.getMonth();
    const start = getWeekStart(new Date(baseDate.getFullYear(), baseDate.getMonth(), 1));
    const monthEnd = new Date(baseDate.getFullYear(), baseDate.getMonth() + 1, 0);
    const end = getWeekEnd(monthEnd);

    const headWeek = document.createElement("div");
    headWeek.className = "month-head-cell weeknum-head";
    headWeek.textContent = "№п/п";
    gridEl.appendChild(headWeek);

    DAY_NAMES.forEach((dayName) => {
      const head = document.createElement("div");
      head.className = "month-head-cell";
      head.textContent = dayName;
      gridEl.appendChild(head);
    });

    for (let weekStart = new Date(start); weekStart <= end; weekStart.setDate(weekStart.getDate() + 7)) {
      const weekNumberCell = document.createElement("div");
      weekNumberCell.className = "month-weeknum";
      weekNumberCell.textContent = String(getISOWeekNumber(weekStart));
      gridEl.appendChild(weekNumberCell);

      for (let offset = 0; offset < 7; offset += 1) {
        const d = new Date(weekStart);
        d.setDate(weekStart.getDate() + offset);
        const ds = formatDate(d);

        const dayBtn = document.createElement("button");
        dayBtn.type = "button";
        dayBtn.className = "month-day";
        dayBtn.textContent = String(d.getDate());

        if (d.getMonth() !== month) {
          dayBtn.classList.add("other-month");
          if (!config.allowOtherMonth) {
            dayBtn.disabled = true;
          }
        }
        if (isSameDate(d, getTodayDate())) {
          dayBtn.classList.add("today");
        }
        if (isSameDate(d, state.ui.mainDate)) {
          dayBtn.classList.add("active");
        }

        const indicatorType = getMonthCategoryIndicator(ds);
        if (indicatorType) {
          const dot = document.createElement("span");
          dot.className = `dot ${indicatorType}`;
          dayBtn.appendChild(dot);
        }

        dayBtn.addEventListener("click", () => {
          if (config.onSelect) {
            config.onSelect(d);
          }
        });

        gridEl.appendChild(dayBtn);
      }
    }
  }

  function renderMonthOverview() {
    const c = document.getElementById("mainDayGrid");
    c.innerHTML = "";

    const head = document.createElement("div");
    head.className = "month-mode-head";

    const prevBtn = document.createElement("button");
    prevBtn.className = "month-nav-btn";
    prevBtn.textContent = "←";
    prevBtn.addEventListener("click", () => {
      state.currentMonthView = new Date(state.currentMonthView.getFullYear(), state.currentMonthView.getMonth() - 1, 1);
      renderApp();
    });

    const nextBtn = document.createElement("button");
    nextBtn.className = "month-nav-btn";
    nextBtn.textContent = "→";
    nextBtn.addEventListener("click", () => {
      state.currentMonthView = new Date(state.currentMonthView.getFullYear(), state.currentMonthView.getMonth() + 1, 1);
      renderApp();
    });

    const label = document.createElement("p");
    label.className = "month-mode-label";
    label.textContent = `${MONTH_NAMES[state.currentMonthView.getMonth()]} ${state.currentMonthView.getFullYear()}`;

    head.appendChild(prevBtn);
    head.appendChild(label);
    head.appendChild(nextBtn);

    const grid = document.createElement("div");
    grid.className = "month-grid";

    buildMonthGrid(state.currentMonthView, grid, {
      allowOtherMonth: true,
      onSelect: (d) => {
        state.ui.mainDate = getDateOnly(d);
        state.activeDate = getDateOnly(d);
        state.ui.viewMode = "day";
        renderApp();
      }
    });

    c.appendChild(head);
    c.appendChild(grid);
  }

  function renderYearOverview() {
    const c = document.getElementById("mainDayGrid");
    c.innerHTML = "";

    const wrapper = document.createElement("div");
    wrapper.className = "year-overview";
    const year = state.ui.mainDate.getFullYear();

    for (let month = 0; month < 12; month += 1) {
      const start = new Date(year, month, 1);
      const end = new Date(year, month + 1, 0);
      const startStr = formatDate(start);
      const endStr = formatDate(end);

      const monthTasks = filterTasksByCategory(state.tasks.filter((task) => task.date >= startStr && task.date <= endStr));

      const card = document.createElement("div");
      card.className = "year-month-card";
      const title = document.createElement("h4");
      title.textContent = MONTH_NAMES[month];
      const meta = document.createElement("div");
      meta.className = "year-month-meta";
      meta.textContent = `задач: ${monthTasks.length}`;

      card.appendChild(title);
      card.appendChild(meta);
      card.addEventListener("click", () => {
        state.currentMonthView = new Date(year, month, 1);
        state.ui.viewMode = "month";
        renderApp();
      });
      wrapper.appendChild(card);
    }

    c.appendChild(wrapper);
  }

  function renderMainContent() {
    if (state.ui.viewMode === "week") {
      renderWeekOverview();
      return;
    }
    if (state.ui.viewMode === "month") {
      renderMonthOverview();
      return;
    }
    if (state.ui.viewMode === "year") {
      renderYearOverview();
      return;
    }
    renderDayGrid(state.ui.mainDate, "mainDayGrid");
  }

  function renderTomorrowMiniPanel() {
    const tomorrow = getTomorrowDate();
    renderDayGrid(tomorrow, "tomorrowMiniGrid");
    document.querySelectorAll("#tomorrowMiniGrid .task-card").forEach((card) => {
      card.classList.add("compact-task");
    });
    document.querySelectorAll("#tomorrowMiniGrid .hour-slot").forEach((slot) => {
      slot.classList.add("tomorrow-slot");
      const label = slot.querySelector(".hour-label");
      if (label) {
        label.classList.add("tomorrow-time");
      }
    });
  }

  function moveTaskPayload(payload, targetDate, targetTime) {
    const p = payload;
    if (!p) {
      return false;
    }

    const excludeRef = { kind: p.kind, id: p.id, date: p.date };
    const durationHours = p.durationHours || 1;
    if (!canPlaceTaskSpan(targetDate, targetTime, durationHours, excludeRef)) {
      showNotification("ошибка переноса: слот занят");
      return false;
    }

    if (p.kind === "task") {
      const t = state.tasks.find((x) => x.id === p.id);
      if (!t) {
        return false;
      }
      if (t.status === "done") {
        showNotification("ошибка переноса: выполненную задачу нельзя перенести");
        return false;
      }

      const wasOverdue = getTaskEffectiveStatus(t) === "overdue";
      t.date = targetDate;
      t.time = targetTime;

      if (wasOverdue) {
        const targetDateTime = new Date(`${targetDate}T${targetTime}:00`);
        if (targetDateTime.getTime() > Date.now()) {
          t.status = "planning";
        }
      }
    } else {
      const series = state.recurringSeries.find((s) => s.id === p.id);
      if (!series) {
        return false;
      }
      series.time = targetTime;
      const d = new Date(`${targetDate}T00:00:00`);
      const movedDow = (d.getDay() + 6) % 7;
      series.dayOfWeek = movedDow;
      series.daysOfWeek = [movedDow];
    }

    saveToStorage();
    renderApp();
    return true;
  }

  function moveTaskByKeyboard(task, kind, deltaDays, deltaHours, effectiveStatus) {
    if (effectiveStatus === "done") {
      showNotification("ошибка переноса: выполненную задачу нельзя перенести");
      return;
    }

    const startHour = parseHour(task.time) + deltaHours;
    const durationHours = getTaskDuration(task);
    if (!canTaskFitInDay(startHour, durationHours)) {
      showNotification("ошибка переноса: длительность выходит за пределы дня");
      return;
    }

    const dateObj = new Date(`${task.date}T00:00:00`);
    dateObj.setDate(dateObj.getDate() + deltaDays);
    const targetDate = formatDate(dateObj);
    const targetTime = formatTimeByHour(startHour);
    const payload = {
      kind,
      id: kind === "task" ? task.id : task.seriesId,
      date: task.date,
      time: task.time,
      durationHours
    };

    moveTaskPayload(payload, targetDate, targetTime);
  }

  function moveDraggedTask(targetDate, targetTime) {
    const p = dragState.payload;
    dragState.payload = null;
    clearDropZoneHighlights();
    clearDragGhost();
    moveTaskPayload(p, targetDate, targetTime);
  }

  function updateMonthModalHead() {
    const monthDate = state.currentMonthView;
    document.getElementById("monthModalYear").textContent = String(monthDate.getFullYear());
    document.getElementById("monthModalLabel").textContent = MONTH_NAMES[monthDate.getMonth()];
  }

  function openMonthModal() {
    const modal = document.getElementById("monthModal");
    const grid = document.getElementById("monthGrid");

    updateMonthModalHead();
    buildMonthGrid(state.currentMonthView, grid, {
      allowOtherMonth: true,
      onSelect: (d) => {
        state.ui.mainDate = getDateOnly(d);
        state.activeDate = getDateOnly(d);
        closeMonthModal();
        state.ui.viewMode = "day";
        renderApp();
      }
    });

    modal.classList.add("open");
    modal.setAttribute("aria-hidden", "false");
  }

  function closeMonthModal() {
    const m = document.getElementById("monthModal");
    m.classList.remove("open");
    m.setAttribute("aria-hidden", "true");
  }

  function openTaskModal(mode, payload) {
    payload = payload || {};
    const m = document.getElementById("taskModal");
    const del = document.getElementById("deleteTaskBtn");
    const recurringInput = document.getElementById("taskRecurringInput");
    const recurringUntilInput = document.getElementById("taskRecurringUntilInput");
    const recurringDaysGroup = document.getElementById("taskRecurringDaysGroup");

    state.ui.taskModalMode = mode;
    state.ui.editingTaskId = mode === "edit" ? payload.id : null;
    state.ui.editingSeriesId = mode === "edit-series" ? payload.id : null;

    const titleInput = document.getElementById("taskTitleInput");
    const dateInput = document.getElementById("taskDateInput");
    const timeInput = document.getElementById("taskTimeInput");
    const durationInput = document.getElementById("taskDurationInput");
    const priorityInput = document.getElementById("taskPriorityInput");
    const categoryInput = document.getElementById("taskCategoryInput");

    if (mode === "edit-series") {
      titleInput.value = payload.title || "";
      dateInput.value = payload.instanceDate || payload.startDate || formatDate(state.ui.mainDate);
      timeInput.value = payload.time || formatTimeByHour(START_HOUR);
      durationInput.value = String(getTaskDuration(payload));
      priorityInput.value = payload.priority || "medium";
      categoryInput.value = payload.category || "personal";
      recurringInput.checked = true;
      recurringInput.disabled = true;
      recurringUntilInput.disabled = false;
      recurringUntilInput.min = dateInput.value;
      recurringUntilInput.value = payload.untilDate || dateInput.value;
      setRecurringDaysEnabled(true);
      const seriesDays = getSeriesDays(payload);
      setRecurringDaysSelection(seriesDays.length ? seriesDays : [getDowFromDateStr(dateInput.value)]);
      del.style.display = "inline-block";
    } else {
      titleInput.value = mode === "edit" ? payload.title : "";
      dateInput.value = mode === "edit" ? payload.date : (payload.date || formatDate(state.ui.mainDate));
      timeInput.value = mode === "edit" ? payload.time : payload.time;
      durationInput.value = String(mode === "edit" ? getTaskDuration(payload) : 1);
      priorityInput.value = mode === "edit" ? (payload.priority || "medium") : "medium";
      categoryInput.value = mode === "edit" ? (payload.category || "personal") : "personal";
      recurringInput.checked = false;
      recurringInput.disabled = mode === "edit";
      recurringUntilInput.value = "";
      recurringUntilInput.disabled = true;
      const fallbackDate = dateInput.value || formatDate(state.ui.mainDate);
      setRecurringDaysSelection([getDowFromDateStr(fallbackDate)]);
      setRecurringDaysEnabled(false);
      del.style.display = mode === "edit" ? "inline-block" : "none";
    }

    if (recurringInput.disabled && mode !== "edit-series") {
      recurringInput.checked = false;
    }
    if (recurringDaysGroup) {
      recurringDaysGroup.style.display = recurringInput.checked || mode === "edit-series" ? "grid" : "none";
    }

    m.classList.add("open");
    m.setAttribute("aria-hidden", "false");
  }

  function closeTaskModal() {
    const m = document.getElementById("taskModal");
    m.classList.remove("open");
    m.setAttribute("aria-hidden", "true");
    state.ui.editingTaskId = null;
    state.ui.editingSeriesId = null;
    const recurringInput = document.getElementById("taskRecurringInput");
    if (recurringInput) {
      recurringInput.disabled = false;
    }
    setRecurringDaysEnabled(false);
    const recurringDaysGroup = document.getElementById("taskRecurringDaysGroup");
    if (recurringDaysGroup) {
      recurringDaysGroup.style.display = "none";
    }
  }

  function handleTaskSubmit(e) {
    e.preventDefault();

    const title = document.getElementById("taskTitleInput").value.trim();
    const date = document.getElementById("taskDateInput").value;
    const time = document.getElementById("taskTimeInput").value;
    const durationHours = Number(document.getElementById("taskDurationInput").value || 1);
    const priority = document.getElementById("taskPriorityInput").value;
    const category = document.getElementById("taskCategoryInput").value;
    const recurring = document.getElementById("taskRecurringInput").checked;
    const recurringUntil = document.getElementById("taskRecurringUntilInput").value;
    const recurringDays = getSelectedRecurringDays();

    if (!title || title.length > 120) {
      showNotification("ошибка валидации: некорректное название");
      return;
    }
    if (!Number.isFinite(durationHours) || durationHours < 1) {
      showNotification("ошибка валидации: некорректная длительность");
      return;
    }
    if (!canTaskFitInDay(parseHour(time), durationHours)) {
      showNotification("ошибка валидации: длительность выходит за пределы дня");
      return;
    }

    if (state.ui.taskModalMode === "create") {
      if (!canPlaceTaskSpan(date, time, durationHours)) {
        showNotification("ошибка валидации: слот занят");
        return;
      }

      if (recurring) {
        if (!recurringUntil) {
          showNotification("ошибка валидации: укажите дату окончания повторяемости");
          return;
        }
        if (recurringUntil < date) {
          showNotification("ошибка валидации: дата окончания раньше даты задачи");
          return;
        }
        if (!recurringDays.length) {
          showNotification("ошибка валидации: выберите дни повторяемости");
          return;
        }

        state.recurringSeries.push({
          id: createId("series"),
          title,
          startDate: date,
          untilDate: recurringUntil,
          dayOfWeek: recurringDays[0],
          daysOfWeek: recurringDays,
          time,
          durationHours,
          priority,
          category
        });
      } else {
        state.tasks.push({
          id: createId("task"),
          title,
          date,
          time,
          durationHours,
          priority,
          category,
          status: "planning"
        });
      }
    } else if (state.ui.taskModalMode === "edit-series") {
      const series = getSeriesById(state.ui.editingSeriesId);
      if (!series) {
        showNotification("ошибка данных: серия не найдена");
        return;
      }

      if (!recurringUntil) {
        showNotification("ошибка валидации: укажите дату окончания повторяемости");
        return;
      }
      if (recurringUntil < date) {
        showNotification("ошибка валидации: дата окончания раньше даты задачи");
        return;
      }
      if (!recurringDays.length) {
        showNotification("ошибка валидации: выберите дни повторяемости");
        return;
      }

      if (!canPlaceTaskSpan(date, time, durationHours, { kind: "series", id: series.id, date })) {
        showNotification("ошибка валидации: слот занят");
        return;
      }

      series.title = title;
      series.time = time;
      series.durationHours = durationHours;
      series.priority = priority;
      series.category = category;
      series.dayOfWeek = recurringDays[0];
      series.daysOfWeek = recurringDays;
      series.startDate = date;
      series.untilDate = recurringUntil;
    } else {
      const task = state.tasks.find((t) => t.id === state.ui.editingTaskId);
      if (!task) {
        return;
      }

      if (!canPlaceTaskSpan(date, time, durationHours, { kind: "task", id: task.id })) {
        showNotification("ошибка валидации: слот занят");
        return;
      }

      task.title = title;
      task.date = date;
      task.time = time;
      task.durationHours = durationHours;
      task.priority = priority;
      task.category = category;
    }

    saveToStorage();
    closeTaskModal();
    renderApp();
    showNotification("статус задачи: задача сохранена");
  }

  function handleDeleteTask() {
    if (state.ui.taskModalMode === "edit-series") {
      const seriesId = state.ui.editingSeriesId;
      if (!seriesId) {
        return;
      }
      if (!window.confirm("удалить серию задач? это действие нельзя отменить.")) {
        return;
      }
      state.recurringSeries = state.recurringSeries.filter((series) => series.id !== seriesId);
      state.recurringExceptions = state.recurringExceptions.filter((exception) => exception.seriesId !== seriesId);
      saveToStorage();
      closeTaskModal();
      renderApp();
      showNotification("статус задачи: серия удалена");
      return;
    }

    const id = state.ui.editingTaskId;
    if (!id) {
      return;
    }

    if (!window.confirm("удалить задачу? это действие нельзя отменить.")) {
      return;
    }

    state.tasks = state.tasks.filter((t) => t.id !== id);
    saveToStorage();
    closeTaskModal();
    renderApp();
    showNotification("статус задачи: задача удалена");
  }

  function goToToday() {
    const today = getTodayDate();
    state.activeDate = new Date(today);
    state.ui.mainDate = new Date(today);
    state.currentMonthView = new Date(today.getFullYear(), today.getMonth(), 1);
    state.ui.viewMode = "day";
    renderApp();
  }

  function goToTomorrow() {
    const tomorrow = getTomorrowDate();
    state.activeDate = new Date(tomorrow);
    state.ui.mainDate = new Date(tomorrow);
    state.currentMonthView = new Date(tomorrow.getFullYear(), tomorrow.getMonth(), 1);
    state.ui.viewMode = "day";
    renderApp();
  }

  function shiftCurrentPeriod(step) {
    if (state.ui.viewMode === "week") {
      const delta = step * 7;
      const d = new Date(state.ui.mainDate);
      d.setDate(d.getDate() + delta);
      state.ui.mainDate = d;
      state.activeDate = new Date(d);
      return;
    }

    if (state.ui.viewMode === "month") {
      state.currentMonthView = new Date(state.currentMonthView.getFullYear(), state.currentMonthView.getMonth() + step, 1);
      const d = new Date(state.ui.mainDate);
      d.setMonth(d.getMonth() + step);
      state.ui.mainDate = d;
      state.activeDate = new Date(d);
      return;
    }

    if (state.ui.viewMode === "year") {
      state.currentMonthView = new Date(state.currentMonthView.getFullYear() + step, state.currentMonthView.getMonth(), 1);
      const d = new Date(state.ui.mainDate);
      d.setFullYear(d.getFullYear() + step);
      state.ui.mainDate = d;
      state.activeDate = new Date(d);
      return;
    }

    const d = new Date(state.ui.mainDate);
    d.setDate(d.getDate() + step);
    state.ui.mainDate = d;
    state.activeDate = new Date(d);
  }

  function renderApp() {
    const appShell = document.querySelector(".app-shell");
    if (appShell) {
      appShell.classList.toggle("header-compact", !!state.ui.compactHeader);
      appShell.classList.toggle("header-theme-soft", state.ui.headerTheme === "soft");
    }

    const layout = document.querySelector(".planner-layout");
    const hideTomorrowPanel = state.ui.viewMode !== "day" || !!state.ui.compactHeader;
    if (layout) {
      layout.classList.toggle("is-week-mode", state.ui.viewMode === "week");
      layout.classList.toggle("is-no-aside", hideTomorrowPanel);
    }
    const tomorrowPanel = document.querySelector(".tomorrow-panel");
    if (tomorrowPanel) {
      tomorrowPanel.classList.toggle("is-hidden", hideTomorrowPanel);
    }

    renderHeader();
    renderMainDayTitle();
    renderMainContent();
    if (!hideTomorrowPanel) {
      renderTomorrowMiniPanel();
    }
    renderWeekStripBottom();

    requestAnimationFrame(syncMainGridRowStep);
  }

  function bindViewModeButtons() {
    document.getElementById("viewDayBtn").addEventListener("click", () => {
      state.ui.viewMode = "day";
      renderApp();
    });
    document.getElementById("viewWeekBtn").addEventListener("click", () => {
      state.ui.viewMode = "week";
      renderApp();
    });
    document.getElementById("viewMonthBtn").addEventListener("click", () => {
      state.ui.viewMode = "month";
      state.currentMonthView = new Date(state.ui.mainDate.getFullYear(), state.ui.mainDate.getMonth(), 1);
      renderApp();
    });
    document.getElementById("viewYearBtn").addEventListener("click", () => {
      state.ui.viewMode = "year";
      renderApp();
    });
  }

  function bind() {
    const addClick = (id, handler) => {
      const el = document.getElementById(id);
      if (el) {
        el.addEventListener("click", handler);
      }
    };
    const addChange = (id, handler) => {
      const el = document.getElementById(id);
      if (el) {
        el.addEventListener("change", handler);
      }
    };

    addClick("prevWeekBtn", () => {
      const d = new Date(state.activeDate);
      d.setDate(d.getDate() - 7);
      state.activeDate = d;

      const md = new Date(state.ui.mainDate);
      md.setDate(md.getDate() - 7);
      state.ui.mainDate = md;
      renderApp();
    });

    addClick("nextWeekBtn", () => {
      const d = new Date(state.activeDate);
      d.setDate(d.getDate() + 7);
      state.activeDate = d;

      const md = new Date(state.ui.mainDate);
      md.setDate(md.getDate() + 7);
      state.ui.mainDate = md;
      renderApp();
    });

    addClick("todayBtn", goToToday);
    addClick("tomorrowBtn", goToTomorrow);
    addClick("backToTodayBtn", goToToday);
    addClick("prevPeriodBtn", () => {
      shiftCurrentPeriod(-1);
      renderApp();
    });
    addClick("nextPeriodBtn", () => {
      shiftCurrentPeriod(1);
      renderApp();
    });

    addClick("monthCalendarBtn", openMonthModal);
    addClick("monthPrevBtn", () => {
      state.currentMonthView = new Date(state.currentMonthView.getFullYear(), state.currentMonthView.getMonth() - 1, 1);
      openMonthModal();
    });
    addClick("monthNextBtn", () => {
      state.currentMonthView = new Date(state.currentMonthView.getFullYear(), state.currentMonthView.getMonth() + 1, 1);
      openMonthModal();
    });

    bindViewModeButtons();
    addChange("categoryFilterSelect", (event) => {
      state.ui.categoryFilter = event.target.value;
      saveToStorage();
      renderApp();
    });
    addClick("compactHeaderBtn", () => {
      state.ui.compactHeader = !state.ui.compactHeader;
      saveToStorage();
      renderApp();
    });
    addClick("headerThemeBtn", () => {
      state.ui.headerTheme = state.ui.headerTheme === "soft" ? "strict" : "soft";
      saveToStorage();
      renderApp();
    });
    const taskForm = document.getElementById("taskForm");
    if (taskForm) {
      taskForm.addEventListener("submit", handleTaskSubmit);
    }

    addChange("taskRecurringInput", (event) => {
      const recurringUntilInput = document.getElementById("taskRecurringUntilInput");
      const taskDateInput = document.getElementById("taskDateInput");
      const recurringDaysGroup = document.getElementById("taskRecurringDaysGroup");
      if (event.target.disabled) {
        return;
      }
      recurringUntilInput.disabled = !event.target.checked;
      setRecurringDaysEnabled(event.target.checked);
      if (recurringDaysGroup) {
        recurringDaysGroup.style.display = event.target.checked ? "grid" : "none";
      }
      if (event.target.checked) {
        recurringUntilInput.min = taskDateInput.value || formatDate(state.ui.mainDate);
        if (!recurringUntilInput.value) {
          recurringUntilInput.value = recurringUntilInput.min;
        }
        if (!getSelectedRecurringDays().length) {
          const baseDate = taskDateInput.value || formatDate(state.ui.mainDate);
          setRecurringDaysSelection([getDowFromDateStr(baseDate)]);
        }
      } else {
        recurringUntilInput.value = "";
      }
    });

    addChange("taskDateInput", (event) => {
      const recurringUntilInput = document.getElementById("taskRecurringUntilInput");
      const recurringInput = document.getElementById("taskRecurringInput");
      if (!recurringInput.checked) {
        return;
      }
      recurringUntilInput.min = event.target.value;
      if (recurringUntilInput.value && recurringUntilInput.value < event.target.value) {
        recurringUntilInput.value = event.target.value;
      }
      if (!getSelectedRecurringDays().length) {
        setRecurringDaysSelection([getDowFromDateStr(event.target.value)]);
      }
    });

    addClick("deleteTaskBtn", handleDeleteTask);
    addClick("cancelTaskBtn", closeTaskModal);
    const taskBackdrop = document.querySelector("[data-close-modal='task']");
    if (taskBackdrop) {
      taskBackdrop.addEventListener("click", closeTaskModal);
    }
    const monthBackdrop = document.querySelector("[data-close-modal='month']");
    if (monthBackdrop) {
      monthBackdrop.addEventListener("click", closeMonthModal);
    }
    const recurringBackdrop = document.querySelector("[data-close-modal='recurring-action']");
    if (recurringBackdrop) {
      recurringBackdrop.addEventListener("click", closeRecurringActionModal);
    }
    addClick("recurringOnlyBtn", () => resolveRecurringAction("single"));
    addClick("recurringSeriesBtn", () => resolveRecurringAction("series"));
    addClick("recurringCancelBtn", closeRecurringActionModal);

    const timeInput = document.getElementById("taskTimeInput");
    const durationInput = document.getElementById("taskDurationInput");
    for (let h = START_HOUR; h <= END_HOUR; h += 1) {
      const t = `${String(h).padStart(2, "0")}:00`;
      const o = document.createElement("option");
      o.value = t;
      o.textContent = t;
      timeInput.appendChild(o);
    }

    for (let hours = 1; hours <= END_HOUR - START_HOUR + 1; hours += 1) {
      const option = document.createElement("option");
      option.value = String(hours);
      option.textContent = `${hours} ч`;
      durationInput.appendChild(option);
    }

    const syncDurationLimitByTime = () => {
      const startHour = parseHour(timeInput.value || formatTimeByHour(START_HOUR));
      const maxDuration = END_HOUR - startHour + 1;
      const currentValue = Number(durationInput.value || 1);
      Array.from(durationInput.options).forEach((opt) => {
        const value = Number(opt.value);
        opt.disabled = value > maxDuration;
      });
      if (currentValue > maxDuration) {
        durationInput.value = String(maxDuration);
      }
    };

    timeInput.addEventListener("change", syncDurationLimitByTime);
    syncDurationLimitByTime();

    window.addEventListener("resize", () => {
      if (state.ui.viewMode === "day") {
        requestAnimationFrame(syncMainGridRowStep);
      }
    });
  }

  function init() {
    const loaded = loadFromStorage();
    const uiPrefs = normalizeUiPrefs(loaded.uiPrefs);

    state.tasks = (loaded.tasks || []).map((task) => ({
      ...task,
      id: task.id || createId("task"),
      status: task.status || "planning",
      priority: task.priority || "medium",
      category: task.category || "personal",
      durationHours: getTaskDuration(task)
    }));

    state.recurringSeries = (loaded.recurringSeries || []).map((series) => ({
      ...series,
      id: series.id || createId("series"),
      startDate: series.startDate || null,
      untilDate: series.untilDate || null,
      dayOfWeek: normalizeSeriesDays(series)[0] ?? 0,
      daysOfWeek: normalizeSeriesDays(series),
      priority: series.priority || "medium",
      category: series.category || "personal",
      durationHours: getTaskDuration(series)
    }));

    state.recurringExceptions = (loaded.recurringExceptions || []).filter((exception) => (
      exception
      && typeof exception.seriesId === "string"
      && typeof exception.date === "string"
      && (exception.type === "done" || exception.type === "deleted")
    ));
    state.ui.categoryFilter = uiPrefs.categoryFilter;
    state.ui.compactHeader = uiPrefs.compactHeader;
    state.ui.headerTheme = uiPrefs.headerTheme;

    saveToStorage();
    bind();
    document.getElementById("categoryFilterSelect").value = state.ui.categoryFilter;
    renderApp();

    console.log("самопроверка прогресса: пустой массив", calculateProgress([]));
    console.log("самопроверка dnd: dragover использует preventDefault");
    console.log("самопроверка series: виртуальные экземпляры не пишутся в tasks", state.tasks.length);
  }

  document.addEventListener("DOMContentLoaded", init);
})();


