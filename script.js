(function () {
  const STORAGE_KEY = "weeklyHourlyPlanner.v1";
  const DAY_NAMES = ["пн", "вт", "ср", "чт", "пт", "сб", "вс"];
  const DEFAULT_STORAGE_DATA = { schemaVersion: 1, tasks: [], recurringSeries: [], recurringExceptions: [] };

  const now = new Date();
  const state = {
    activeDate: new Date(now.getFullYear(), now.getMonth(), now.getDate()),
    currentMonthView: new Date(now.getFullYear(), now.getMonth(), 1),
    tasks: [], recurringSeries: [], recurringExceptions: [],
    ui: { taskModalMode: "create", editingTaskId: null }
  };

  const dragState = { payload: null };

  const formatDate = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const isSameDate = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  const getWeekStart = (date) => { const d = new Date(date.getFullYear(), date.getMonth(), date.getDate()); const day = d.getDay(); d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day)); return d; };
  const getWeekEnd = (date) => { const d = getWeekStart(date); d.setDate(d.getDate() + 6); return d; };
  const getISOWeekNumber = (date) => { const d = new Date(date.getFullYear(), date.getMonth(), date.getDate()); const day = d.getDay() || 7; d.setDate(d.getDate() + 4 - day); const y = new Date(d.getFullYear(), 0, 1); return Math.floor(Math.floor((d - y) / 86400000) / 7) + 1; };
  const getYearLabel = (date) => { const sy = getWeekStart(date).getFullYear(); const ey = getWeekEnd(date).getFullYear(); return sy === ey ? String(sy) : `${sy}-${ey}`; };

  function showNotification(message) { const el = document.getElementById("notification"); if (!el) return; el.textContent = message; el.classList.add("is-visible"); }
  function saveToStorage() { try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ schemaVersion: 1, tasks: state.tasks, recurringSeries: state.recurringSeries, recurringExceptions: state.recurringExceptions })); return true; } catch (_) { showNotification("ошибка хранения: данные не удалось сохранить"); return false; } }
  function loadFromStorage() { try { const raw = localStorage.getItem(STORAGE_KEY); if (!raw) { localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT_STORAGE_DATA)); return { ...DEFAULT_STORAGE_DATA }; } const parsed = JSON.parse(raw); if (!Array.isArray(parsed.tasks) || !Array.isArray(parsed.recurringSeries) || !Array.isArray(parsed.recurringExceptions)) throw new Error(); return parsed; } catch (_) { showNotification("ошибка данных: данные повреждены"); return { ...DEFAULT_STORAGE_DATA }; } }

  function getWeekDays(date) { const s = getWeekStart(date); return Array.from({ length: 7 }, (_, i) => { const d = new Date(s); d.setDate(s.getDate() + i); return d; }); }
  function getTasksForDate(dateStr) { return state.tasks.filter((t) => t.date === dateStr); }
  function getTasksForWeek(date) { const ws = getWeekStart(date); const we = getWeekEnd(date); return state.tasks.filter((t) => { const d = new Date(`${t.date}T00:00:00`); return d >= ws && d <= we; }); }
  function calculateProgress(tasks) { if (!tasks.length) return 0; return Math.round((tasks.filter((t) => t.status === "done").length / tasks.length) * 100); }

  function getTaskEffectiveStatus(task) {
    if (task.status === "done") return "done";
    const hour = Number(task.time.split(":")[0]);
    const end = new Date(`${task.date}T00:00:00`); end.setHours(hour + 1, 0, 0, 0);
    return Date.now() > end.getTime() ? "overdue" : (task.status || "planning");
  }

  function getException(seriesId, date) { return state.recurringExceptions.find((e) => e.seriesId === seriesId && e.date === date) || null; }
  function getRecurringTaskForSlot(date, time) {
    const dateObj = new Date(`${date}T00:00:00`); const dow = (dateObj.getDay() + 6) % 7;
    for (const series of state.recurringSeries) {
      if (series.dayOfWeek !== dow || series.time !== time) continue;
      const ex = getException(series.id, date);
      if (ex && ex.type === "deleted") return null;
      return { id: `series-${series.id}-${date}`, seriesId: series.id, isRecurringInstance: true, title: series.title, date, time, priority: series.priority, status: ex && ex.type === "done" ? "done" : "planning" };
    }
    return null;
  }

  function getSlotEntry(date, time, excludeRef) {
    const direct = state.tasks.find((t) => t.date === date && t.time === time && (!excludeRef || !(excludeRef.kind === "task" && t.id === excludeRef.id)));
    if (direct) return { kind: "task", item: direct };
    const recurring = getRecurringTaskForSlot(date, time);
    if (recurring && (!excludeRef || !(excludeRef.kind === "series" && recurring.seriesId === excludeRef.id && recurring.date === excludeRef.date))) return { kind: "series", item: recurring };
    return null;
  }

  function renderHeader() {
    document.getElementById("yearLabel").textContent = getYearLabel(state.activeDate);
    document.getElementById("weekNumber").textContent = String(getISOWeekNumber(state.activeDate));
    document.getElementById("dayProgressLabel").textContent = `${calculateProgress(getTasksForDate(formatDate(state.activeDate)))}%`;
    document.getElementById("weekProgressLabel").textContent = `${calculateProgress(getTasksForWeek(state.activeDate))}%`;
  }

  function renderWeekDays() {
    const c = document.getElementById("weekDays"); c.innerHTML = ""; const today = new Date();
    getWeekDays(state.activeDate).forEach((day, i) => {
      const dstr = formatDate(day); const p = calculateProgress(getTasksForDate(dstr));
      const b = document.createElement("button"); b.type = "button"; b.className = "day-btn"; b.dataset.date = dstr;
      if (isSameDate(day, state.activeDate)) b.classList.add("active"); if (isSameDate(day, today)) b.classList.add("today");
      b.innerHTML = `<span class="day-name">${DAY_NAMES[i]}</span><span class="day-date">${String(day.getDate()).padStart(2, "0")}.${String(day.getMonth() + 1).padStart(2, "0")}</span><span class="day-progress">${p}%</span>`;
      b.addEventListener("click", () => { state.activeDate = new Date(day.getFullYear(), day.getMonth(), day.getDate()); renderApp(); });
      b.addEventListener("dragover", (e) => { e.preventDefault(); b.classList.add("drag-over") });
      b.addEventListener("dragleave", () => b.classList.remove("drag-over"));
      b.addEventListener("drop", (e) => {
        e.preventDefault(); b.classList.remove("drag-over");
        if (!dragState.payload) return;
        moveDraggedTask(dstr, dragState.payload.time);
      });
      c.appendChild(b);
    });
  }

  function applyRecurringCompletion(task, type) {
    const action = window.prompt("действие для серии: только этот экземпляр или всю серию", "только этот экземпляр");
    if (!action) return false;
    if (action.toLowerCase().includes("только")) {
      state.recurringExceptions = state.recurringExceptions.filter((e) => !(e.seriesId === task.seriesId && e.date === task.date));
      state.recurringExceptions.push({ seriesId: task.seriesId, date: task.date, type });
      return true;
    }
    if (action.toLowerCase().includes("всю")) {
      if (type === "deleted") state.recurringSeries = state.recurringSeries.filter((s) => s.id !== task.seriesId);
      if (type === "done") state.recurringSeries = state.recurringSeries.filter((s) => s.id !== task.seriesId);
      return true;
    }
    return false;
  }

  function makeTaskCard(task, kind) {
    const effective = getTaskEffectiveStatus(task);
    const card = document.createElement("div"); card.className = `task-card priority-${task.priority || "medium"}`;
    if (effective === "done") card.classList.add("is-done"); if (effective === "overdue") card.classList.add("is-overdue");
    if (effective !== "done") card.draggable = true;
    card.addEventListener("dragstart", (e) => {
      if (effective === "done") { showNotification("ошибка переноса: выполненную задачу нельзя перенести"); e.preventDefault(); return; }
      dragState.payload = { kind, id: kind === "task" ? task.id : task.seriesId, date: task.date, time: task.time };
      e.dataTransfer.setData("text/plain", JSON.stringify(dragState.payload));
    });

    const titleBtn = document.createElement("button"); titleBtn.type = "button"; titleBtn.className = "task-title-btn"; titleBtn.textContent = task.title;
    titleBtn.addEventListener("click", () => kind === "task" ? openTaskModal("edit", task) : showNotification("серия: редактирование через создание новой задачи"));

    const meta = document.createElement("div"); meta.className = "task-meta";
    if (effective !== "done") { const st = document.createElement("span"); st.className = "status-badge"; st.textContent = effective === "planning" ? "планируется" : effective === "in-progress" ? "в работе" : "просрочено"; meta.appendChild(st); }
    const pr = document.createElement("span"); pr.className = "priority-badge"; pr.textContent = `приоритет: ${task.priority || "medium"}`; meta.appendChild(pr);

    const actions = document.createElement("div"); actions.className = "task-actions";
    if (effective === "planning") { const startBtn = document.createElement("button"); startBtn.textContent = "начать"; startBtn.addEventListener("click", () => { if (kind === "task") { task.status = "in-progress"; saveToStorage(); renderApp(); } }); actions.appendChild(startBtn); }
    const doneBtn = document.createElement("button"); doneBtn.textContent = effective === "done" ? "вернуть" : "готово";
    doneBtn.addEventListener("click", () => {
      if (kind === "series") {
        const ok = applyRecurringCompletion(task, effective === "done" ? "deleted" : "done");
        if (!ok) return;
      } else {
        task.status = effective === "done" ? "planning" : "done";
      }
      saveToStorage(); renderApp();
    });
    actions.appendChild(doneBtn);

    if (kind === "task") { const editBtn = document.createElement("button"); editBtn.textContent = "изменить"; editBtn.addEventListener("click", () => openTaskModal("edit", task)); actions.appendChild(editBtn); }

    card.appendChild(titleBtn); card.appendChild(meta); card.appendChild(actions);
    return card;
  }

  function renderHourGrid() {
    const c = document.getElementById("hourGrid"); c.innerHTML = ""; const dateStr = formatDate(state.activeDate);
    for (let h = 7; h <= 23; h += 1) {
      const time = `${String(h).padStart(2, "0")}:00`;
      const slot = document.createElement("div"); slot.className = "hour-slot"; slot.dataset.time = time;
      slot.addEventListener("dragover", (e) => { e.preventDefault(); slot.classList.add("drag-over"); });
      slot.addEventListener("dragleave", () => slot.classList.remove("drag-over"));
      slot.addEventListener("drop", (e) => { e.preventDefault(); slot.classList.remove("drag-over"); moveDraggedTask(dateStr, time); });
      const label = document.createElement("div"); label.className = "hour-label"; label.textContent = time; slot.appendChild(label);

      const entry = getSlotEntry(dateStr, time);
      if (!entry) { const add = document.createElement("button"); add.textContent = "+ задача"; add.addEventListener("click", () => openTaskModal("create", { time })); slot.appendChild(add); }
      else slot.appendChild(makeTaskCard(entry.item, entry.kind));
      c.appendChild(slot);
    }
  }

  function moveDraggedTask(targetDate, targetTime) {
    const p = dragState.payload; dragState.payload = null; if (!p) return;
    if (getSlotEntry(targetDate, targetTime, { kind: p.kind, id: p.id, date: p.date })) { showNotification("ошибка переноса: слот занят"); return; }
    if (p.kind === "task") {
      const t = state.tasks.find((x) => x.id === p.id); if (!t) return;
      if (t.status === "done") { showNotification("ошибка переноса: выполненную задачу нельзя перенести"); return; }
      const wasOverdue = getTaskEffectiveStatus(t) === "overdue";
      t.date = targetDate; t.time = targetTime;
      if (wasOverdue) { const targetDateTime = new Date(`${targetDate}T${targetTime}:00`); if (targetDateTime.getTime() > Date.now()) t.status = "planning"; }
    } else {
      const series = state.recurringSeries.find((s) => s.id === p.id); if (!series) return;
      series.time = targetTime;
      const d = new Date(`${targetDate}T00:00:00`); series.dayOfWeek = (d.getDay() + 6) % 7;
    }
    saveToStorage(); renderApp();
  }

  function openMonthModal() {
    const modal = document.getElementById("monthModal"); const grid = document.getElementById("monthGrid");
    grid.innerHTML = "";
    const base = new Date(state.activeDate.getFullYear(), state.activeDate.getMonth(), 1);
    const month = base.getMonth();
    for (let i = 0; i < 42; i += 1) {
      const d = new Date(base); d.setDate(1 - ((base.getDay() + 6) % 7) + i);
      if (d.getMonth() !== month) continue;
      const ds = formatDate(d);
      const dayBtn = document.createElement("button"); dayBtn.type = "button"; dayBtn.className = "month-day"; dayBtn.textContent = String(d.getDate());
      if (isSameDate(d, new Date())) dayBtn.classList.add("today");
      if (isSameDate(d, state.activeDate)) dayBtn.classList.add("active");
      const hasNormal = state.tasks.some((t) => t.date === ds);
      const hasSeries = state.recurringSeries.some((s) => s.dayOfWeek === ((d.getDay() + 6) % 7) && !getException(s.id, ds));
      if (hasNormal || hasSeries) { const dot = document.createElement("span"); dot.className = "dot"; dayBtn.appendChild(dot); }
      dayBtn.addEventListener("click", () => { state.activeDate = new Date(d.getFullYear(), d.getMonth(), d.getDate()); closeMonthModal(); renderApp(); });
      grid.appendChild(dayBtn);
    }
    modal.classList.add("open"); modal.setAttribute("aria-hidden", "false");
  }

  function closeMonthModal() { const m = document.getElementById("monthModal"); m.classList.remove("open"); m.setAttribute("aria-hidden", "true"); }

  function openTaskModal(mode, payload) {
    const m = document.getElementById("taskModal"); const del = document.getElementById("deleteTaskBtn");
    state.ui.taskModalMode = mode; state.ui.editingTaskId = mode === "edit" ? payload.id : null;
    document.getElementById("taskTitleInput").value = mode === "edit" ? payload.title : "";
    document.getElementById("taskDateInput").value = mode === "edit" ? payload.date : formatDate(state.activeDate);
    document.getElementById("taskTimeInput").value = mode === "edit" ? payload.time : payload.time;
    document.getElementById("taskPriorityInput").value = mode === "edit" ? (payload.priority || "medium") : "medium";
    document.getElementById("taskRecurringInput").checked = mode === "edit" ? false : false;
    del.style.display = mode === "edit" ? "inline-block" : "none";
    m.classList.add("open"); m.setAttribute("aria-hidden", "false");
  }
  function closeTaskModal() { const m = document.getElementById("taskModal"); m.classList.remove("open"); m.setAttribute("aria-hidden", "true"); state.ui.editingTaskId = null; }

  function handleTaskSubmit(e) {
    e.preventDefault();
    const title = document.getElementById("taskTitleInput").value.trim();
    const date = document.getElementById("taskDateInput").value;
    const time = document.getElementById("taskTimeInput").value;
    const priority = document.getElementById("taskPriorityInput").value;
    const recurring = document.getElementById("taskRecurringInput").checked;
    if (!title || title.length > 120) return showNotification("ошибка валидации: некорректное название");

    if (state.ui.taskModalMode === "create") {
      if (getSlotEntry(date, time)) return showNotification("ошибка валидации: слот занят");
      if (recurring) {
        const d = new Date(`${date}T00:00:00`);
        state.recurringSeries.push({ id: `series-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`, title, dayOfWeek: (d.getDay() + 6) % 7, time, priority });
      } else {
        state.tasks.push({ id: `task-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`, title, date, time, priority, status: "planning" });
      }
    } else {
      const task = state.tasks.find((t) => t.id === state.ui.editingTaskId); if (!task) return;
      if (getSlotEntry(date, time, { kind: "task", id: task.id })) return showNotification("ошибка валидации: слот занят");
      task.title = title; task.date = date; task.time = time; task.priority = priority;
    }
    saveToStorage(); closeTaskModal(); renderApp(); showNotification("статус задачи: задача сохранена");
  }

  function handleDeleteTask() {
    const id = state.ui.editingTaskId; if (!id) return;
    if (!window.confirm("удалить задачу? это действие нельзя отменить.")) return;
    state.tasks = state.tasks.filter((t) => t.id !== id);
    saveToStorage(); closeTaskModal(); renderApp(); showNotification("статус задачи: задача удалена");
  }

  function renderApp() { renderHeader(); renderWeekDays(); renderHourGrid(); }

  function bind() {
    document.getElementById("prevWeekBtn").addEventListener("click", () => { const d = new Date(state.activeDate); d.setDate(d.getDate() - 7); state.activeDate = d; renderApp(); });
    document.getElementById("nextWeekBtn").addEventListener("click", () => { const d = new Date(state.activeDate); d.setDate(d.getDate() + 7); state.activeDate = d; renderApp(); });
    document.getElementById("todayBtn").addEventListener("click", () => { const t = new Date(); state.activeDate = new Date(t.getFullYear(), t.getMonth(), t.getDate()); renderApp(); });
    document.getElementById("monthCalendarBtn").addEventListener("click", openMonthModal);
    document.getElementById("taskForm").addEventListener("submit", handleTaskSubmit);
    document.getElementById("deleteTaskBtn").addEventListener("click", handleDeleteTask);
    document.getElementById("cancelTaskBtn").addEventListener("click", closeTaskModal);
    document.querySelector("[data-close-modal='task']").addEventListener("click", closeTaskModal);
    document.querySelector("[data-close-modal='month']").addEventListener("click", closeMonthModal);
    const timeInput = document.getElementById("taskTimeInput");
    for (let h = 7; h <= 23; h += 1) { const t = `${String(h).padStart(2, "0")}:00`; const o = document.createElement("option"); o.value = t; o.textContent = t; timeInput.appendChild(o); }
  }

  function init() {
    const loaded = loadFromStorage();
    state.tasks = loaded.tasks.map((t) => ({ ...t, status: t.status || "planning" }));
    state.recurringSeries = loaded.recurringSeries || [];
    state.recurringExceptions = loaded.recurringExceptions || [];
    saveToStorage();
    bind();
    renderApp();
    console.log("самопроверка dnd: dragover использует preventDefault");
    console.log("самопроверка series: виртуальные экземпляры не пишутся в tasks", state.tasks.length);
  }

  document.addEventListener("DOMContentLoaded", init);
})();
