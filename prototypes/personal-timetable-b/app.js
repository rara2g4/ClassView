(() => {
  "use strict";

  const data = window.PersonalTimetableMock;
  const model = window.PersonalTimetableBModel;
  if (!data || !model) throw new Error("Personal timetable B prototype dependencies are unavailable.");

  const defaultInspector = {
    title: "カード全体で選択できます",
    message: "同じ授業が複数時限にある場合も、選択状態はすべての時限へ反映されます。",
    tone: "neutral",
  };
  const state = {
    step: 1,
    grade: "",
    group: "",
    day: "mon",
    period: 1,
    selected: new Set(),
    miniExpanded: true,
    inspector: defaultInspector,
    pendingSwap: null,
  };
  const gradeChoices = document.querySelector("#grade-choices");
  const groupChoices = document.querySelector("#group-choices");
  const dayBrowser = document.querySelector("#day-browser");
  const miniTimetable = document.querySelector(".mini-timetable");
  const conflictDialog = document.querySelector("#conflict-dialog");

  const gradeIsEligible = (course) => state.grade === "3"
    ? course.grades.some((grade) => ["1", "2", "3"].includes(grade))
    : course.grades.includes(state.grade);
  const eligible = () => data.courses.filter((course) => (
    gradeIsEligible(course) && (course.groups.includes("all") || course.groups.includes(state.group))
  ));
  const requiredIds = () => model.requiredCourseIds(eligible(), state.grade);
  const selectedCourses = () => eligible().filter((course) => state.selected.has(course.id));
  const selectedCourseCount = () => model.uniqueCourseIds(selectedCourses()).length;
  const conflictEntries = () => model.conflictEntries(eligible(), state.selected);
  const dayFor = (dayId) => data.days.find((day) => day.id === dayId);
  const periodFor = (periodId) => data.periods.find((period) => period.id === Number(periodId));
  const formatSlot = (dayId, periodId) => `${dayFor(dayId)?.label || dayId}${periodFor(periodId)?.label || `${periodId}限`}`;
  const courseFor = (courseId) => eligible().find((course) => course.id === courseId);
  const recordTitle = (courseId) => eligible().find((course) => course.id === courseId)?.title || courseId;
  const occupiedSlots = (courseId) => model.recordsForCourse(eligible(), courseId)
    .sort((left, right) => (
      data.days.findIndex((day) => day.id === left.day) - data.days.findIndex((day) => day.id === right.day)
      || left.period - right.period
    ));
  const compactOccupancy = (courseId) => {
    const byDay = new Map();
    occupiedSlots(courseId).forEach((record) => {
      byDay.set(record.day, [...(byDay.get(record.day) || []), record.period]);
    });
    return [...byDay.entries()].map(([dayId, periods]) => {
      const sorted = [...new Set(periods)].sort((left, right) => left - right);
      const periodText = sorted.length > 1 && sorted.every((value, index) => index === 0 || value === sorted[index - 1] + 1)
        ? `${sorted[0]}〜${sorted[sorted.length - 1]}限`
        : `${sorted.join("・")}限`;
      return `${dayFor(dayId)?.short || dayId}曜${periodText}`;
    }).join(" / ");
  };
  const creditLabel = (course) => Number.isFinite(course.credits) ? `${course.credits}単位` : "単位数未確認";
  const formatConflictDetails = (details) => details.map((detail) => {
    const names = detail.courseIds.map(recordTitle).join("・");
    return `${formatSlot(detail.day, detail.period)}で「${names}」`;
  }).join("、");
  const stableCourseOrder = (courses) => {
    const required = requiredIds();
    const rank = (course) => required.has(course.id) ? 0 : 1;
    return [...courses].sort((left, right) => (
      rank(left) - rank(right)
      || left.title.localeCompare(right.title, "ja")
      || left.entryId.localeCompare(right.entryId, "ja")
    ));
  };

  const choice = (name, value, label) => {
    const wrapper = document.createElement("div");
    wrapper.className = "select-card";
    const input = document.createElement("input");
    input.type = "radio";
    input.name = name;
    input.value = value;
    input.id = `b-${name}-${value}`;
    const text = document.createElement("label");
    text.htmlFor = input.id;
    text.textContent = label;
    wrapper.append(input, text);
    return wrapper;
  };
  ["1", "2", "3"].forEach((grade) => gradeChoices.append(choice(
    "grade",
    grade,
    grade === "3" ? "3年生（Excel全件・高密度）" : `${grade}年生`,
  )));
  ["1組", "2組"].forEach((group) => groupChoices.append(choice("group", group, group)));

  const updateNextButtons = () => {
    document.querySelector('[data-step="1"] [data-next]').disabled = !state.grade;
    document.querySelector('[data-step="2"] [data-next]').disabled = !state.group;
  };
  gradeChoices.addEventListener("change", (event) => {
    state.grade = event.target.value;
    state.group = "";
    state.selected.clear();
    groupChoices.querySelectorAll("input").forEach((input) => { input.checked = false; });
    updateNextButtons();
  });
  groupChoices.addEventListener("change", (event) => {
    state.group = event.target.value;
    state.selected = requiredIds();
    state.inspector = defaultInspector;
    updateNextButtons();
  });

  const selectDay = (dayId, { focusTab = false } = {}) => {
    state.day = dayId;
    state.inspector = defaultInspector;
    renderCourseStep();
    if (focusTab) document.querySelector(`#day-tab-${dayId}`)?.focus({ preventScroll: true });
  };

  const selectPeriod = (periodId, { focusTab = false } = {}) => {
    state.period = Number(periodId);
    state.inspector = defaultInspector;
    renderCourseStep();
    if (focusTab) document.querySelector(`#period-tab-${periodId}`)?.focus({ preventScroll: true });
  };

  const renderTabs = () => {
    const root = document.querySelector("#week-strip");
    root.replaceChildren();
    data.days.forEach((day, index) => {
      const button = document.createElement("button");
      button.type = "button";
      const selectedCount = new Set(selectedCourses().filter((course) => course.day === day.id).map((course) => course.id)).size;
      const hasConflict = conflictEntries().some((entry) => entry.day === day.id);
      button.className = `day-tab${selectedCount ? " has-selection" : ""}${hasConflict ? " has-conflict" : ""}`;
      button.id = `day-tab-${day.id}`;
      button.role = "tab";
      button.tabIndex = state.day === day.id ? 0 : -1;
      button.setAttribute("aria-selected", String(state.day === day.id));
      button.setAttribute("aria-controls", "day-browser");
      button.setAttribute("aria-label", `${day.label}${selectedCount ? `、${selectedCount}科目選択済み` : ""}${hasConflict ? "、要確認の重複あり" : ""}`);
      button.innerHTML = `<span class="tab-label">${day.short}</span><span class="tab-indicator" aria-hidden="true"></span>`;
      button.addEventListener("click", () => selectDay(day.id));
      button.addEventListener("keydown", (event) => {
        const keyOffsets = { ArrowLeft: -1, ArrowRight: 1 };
        if (!(event.key in keyOffsets) && !["Home", "End"].includes(event.key)) return;
        event.preventDefault();
        let nextIndex = index;
        if (event.key === "Home") nextIndex = 0;
        else if (event.key === "End") nextIndex = data.days.length - 1;
        else nextIndex = (index + keyOffsets[event.key] + data.days.length) % data.days.length;
        selectDay(data.days[nextIndex].id, { focusTab: true });
      });
      root.append(button);
    });
  };

  const renderPeriods = () => {
    const root = document.querySelector("#period-strip");
    root.replaceChildren();
    data.periods.forEach((period, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.id = `period-tab-${period.id}`;
      button.role = "tab";
      button.tabIndex = state.period === period.id ? 0 : -1;
      const selectedCount = new Set(selectedCourses().filter((course) => course.day === state.day && course.period === period.id).map((course) => course.id)).size;
      const hasConflict = conflictEntries().some((entry) => entry.day === state.day && entry.period === period.id);
      button.className = `period-tab${selectedCount ? " has-selection" : ""}${hasConflict ? " has-conflict" : ""}`;
      button.setAttribute("aria-selected", String(state.period === period.id));
      button.setAttribute("aria-controls", "day-browser");
      button.setAttribute("aria-label", `${period.label}${selectedCount ? `、${selectedCount}科目選択済み` : ""}${hasConflict ? "、要確認の重複あり" : ""}`);
      button.innerHTML = `<span class="tab-label">${period.label}</span><span class="tab-indicator" aria-hidden="true"></span>`;
      button.addEventListener("click", () => selectPeriod(period.id));
      button.addEventListener("keydown", (event) => {
        const keyOffsets = { ArrowLeft: -1, ArrowRight: 1 };
        if (!(event.key in keyOffsets) && !["Home", "End"].includes(event.key)) return;
        event.preventDefault();
        let nextIndex = index;
        if (event.key === "Home") nextIndex = 0;
        else if (event.key === "End") nextIndex = data.periods.length - 1;
        else nextIndex = (index + keyOffsets[event.key] + data.periods.length) % data.periods.length;
        selectPeriod(data.periods[nextIndex].id, { focusTab: true });
      });
      root.append(button);
    });
  };

  const cardStatus = (course) => {
    const selected = state.selected.has(course.id);
    const mandatory = requiredIds().has(course.id);
    const analysis = model.conflictAnalysis({
      records: eligible(),
      selectedIds: state.selected,
      requiredIds: requiredIds(),
      courseId: course.id,
    });
    const overlaps = analysis.conflicts;
    if (mandatory && overlaps.length) return { key: "data-error", label: "要確認", symbol: "!", selected, mandatory, overlaps, analysis };
    if (mandatory) return { key: "required", label: "必修・自動", symbol: "必", selected, mandatory, overlaps, analysis };
    if (selected && overlaps.length) return { key: "data-error", label: "要確認", symbol: "!", selected, mandatory, overlaps, analysis };
    if (selected) return { key: "selected", label: "選択済み", symbol: "✓", selected, mandatory, overlaps, analysis };
    if (overlaps.length) return { key: "blocked", label: "時間重複で選択不可", symbol: "", selected, mandatory, overlaps, analysis };
    return { key: "available", label: "未選択", symbol: "○", selected, mandatory, overlaps, analysis };
  };

  const courseCard = (course) => {
    const status = cardStatus(course);
    const button = document.createElement("button");
    button.type = "button";
    button.className = `course-card is-${status.key}${status.mandatory ? " is-required-course" : ""}`;
    button.dataset.courseId = course.id;
    button.dataset.slotKey = model.slotKey(course);
    button.setAttribute("aria-pressed", String(status.selected));
    button.setAttribute("aria-disabled", String(status.mandatory));
    if (status.key === "blocked") button.setAttribute("aria-haspopup", "dialog");

    const occupancyText = compactOccupancy(course.id);
    const conflictText = formatConflictDetails(status.overlaps);
    let actionText = "押すと選択できます";
    if (status.mandatory && status.overlaps.length) actionText = `必修として自動選択されていますが、${conflictText}と重複しています`;
    else if (status.mandatory) actionText = "必修として自動選択されており変更できません";
    else if (status.key === "blocked") actionText = `${conflictText}と重なるため現在は選択できません。押すと理由と入れ替え方法を確認できます`;
    else if (status.selected) actionText = "選択済みです。押すと解除できます";
    else if (status.key === "conflict") actionText = `${conflictText}と重複しています。押すと解除できます`;
    const creditsText = creditLabel(course);
    button.setAttribute("aria-label", `${course.title}。${occupancyText}。講師 ${course.instructor}。${creditsText}。${actionText}`);
    button.dataset.inspectorTitle = status.mandatory
      ? `${course.title}は必修です`
      : status.overlaps.length
        ? `${course.title}の選択制約`
        : course.title;
    button.dataset.inspectorMessage = status.overlaps.length
      ? `${conflictText}と重なります。${status.mandatory ? "必修のため解除できません。時間割データの確認が必要です。" : status.selected ? "選択済み同士の重複です。解除して重複を解消してください。" : status.analysis.requiredConflictIds.length ? "必修授業は解除できないため、この授業は選択できません。" : "カードを押すと、競合相手を確認して入れ替えられます。"}`
      : `${occupancyText}を占有します。講師: ${course.instructor}。${creditsText}。対象: ${course.grades.join("・")}年。区分: ${data.typeLabel(course.courseType)}。${status.mandatory ? "学年・組に一致する必修として自動追加されています。" : status.selected ? "選択済み。カードを押すとすべての時限から解除します。" : "カードを押すとすべての時限へ反映します。"}`;
    button.dataset.inspectorTone = status.key === "data-error" ? "warning" : status.key === "blocked" ? "constraint" : status.selected ? "selected" : "neutral";

    const titleRow = document.createElement("span");
    titleRow.className = "card-title-row";
    const title = document.createElement("span");
    title.className = "course-title";
    title.textContent = course.title;
    const mark = document.createElement("span");
    mark.className = "selection-mark";
    mark.setAttribute("aria-hidden", "true");
    if (status.key === "blocked") {
      const lock = document.createElement("span");
      lock.className = "lock-glyph";
      mark.append(lock);
    } else {
      mark.textContent = status.symbol;
    }
    titleRow.append(title, mark);
    const details = document.createElement("span");
    details.className = "course-details";
    details.textContent = `${occupancyText} / 講師: ${course.instructor} / ${creditsText}`;
    button.append(titleRow, details);
    return button;
  };

  const renderDayBrowser = () => {
    dayBrowser.replaceChildren();
    dayBrowser.tabIndex = -1;
    dayBrowser.setAttribute("aria-labelledby", `day-tab-${state.day} period-tab-${state.period}`);
    const day = dayFor(state.day);
    const period = periodFor(state.period);
    const courses = stableCourseOrder(model.recordsForSlot(eligible(), day.id, period.id));
    const titleRow = document.createElement("div");
    titleRow.className = "day-title-row";
    titleRow.innerHTML = `<h3>${day.label}・${period.label}</h3><span>${courses.length}件の候補</span>`;
    dayBrowser.append(titleRow);
    const cards = document.createElement("div");
    cards.id = `course-cards-${day.id}-${period.id}`;
    cards.className = "course-cards";
    if (courses.length) courses.forEach((course) => cards.append(courseCard(course)));
    else {
      const empty = document.createElement("p");
      empty.className = "empty-period";
      empty.textContent = "この曜日・時限に候補はありません。";
      cards.append(empty);
    }
    dayBrowser.append(cards);
  };

  const renderMini = () => {
    const root = document.querySelector("#mini-schedule");
    root.replaceChildren();
    const conflictKeys = new Set(conflictEntries().map((entry) => entry.slotKey));
    data.days.forEach((day) => {
      const section = document.createElement("section");
      section.className = "mini-day";
      const heading = document.createElement("h4");
      heading.textContent = day.label;
      section.append(heading);
      const courses = selectedCourses().filter((course) => course.day === day.id).sort((a, b) => a.period - b.period);
      if (!courses.length) {
        const empty = document.createElement("span");
        empty.className = "mini-empty";
        empty.textContent = "まだ選択していません";
        section.append(empty);
      } else {
        courses.forEach((course) => {
          const item = document.createElement("button");
          item.type = "button";
          item.className = `mini-item${conflictKeys.has(model.slotKey(course)) ? " is-conflict" : ""}`;
          item.dataset.miniDay = day.id;
          item.dataset.miniPeriod = String(course.period);
          item.setAttribute("aria-label", `${day.label}${course.period}限の${course.title}を候補一覧で確認`);
          item.innerHTML = `<span>${course.period}限</span><span>${course.title}</span>`;
          section.append(item);
        });
      }
      root.append(section);
    });
    document.querySelector("#mini-summary-count").textContent = `${selectedCourseCount()}科目・${selectedCourses().length}コマ`;
    miniTimetable.classList.toggle("is-expanded", state.miniExpanded);
    const toggle = document.querySelector("#mini-toggle");
    toggle.setAttribute("aria-expanded", String(state.miniExpanded));
    toggle.textContent = state.miniExpanded ? "週間サマリーを閉じる" : "週間サマリーを開く";
  };

  const renderInspector = () => {
    const root = document.querySelector("#course-inspector");
    root.className = `course-inspector is-${state.inspector.tone}`;
    root.replaceChildren();
    const title = document.createElement("strong");
    title.textContent = state.inspector.title;
    const message = document.createElement("span");
    message.textContent = state.inspector.message;
    root.append(title, message);
  };

  const renderConflictBanner = () => {
    const banner = document.querySelector("#conflict-banner");
    const entries = conflictEntries();
    banner.classList.toggle("has-conflict", entries.length > 0);
    if (!entries.length) {
      banner.textContent = "現在、選択中の授業に時間の重複はありません。";
      return;
    }
    const summary = entries.slice(0, 2).map((entry) => {
      const names = entry.courseIds.map(recordTitle).join("・");
      return `${formatSlot(entry.day, entry.period)}：${names}`;
    }).join(" / ");
    banner.textContent = `⚠ 選択済み授業同士の重複が${entries.length}つあります。${summary}${entries.length > 2 ? " ほか" : ""}。時間割データまたは選択状態を確認してください。`;
  };

  const renderCourseStep = ({ focusCourseId = "", focusSlotKey = "" } = {}) => {
    renderTabs();
    renderPeriods();
    renderDayBrowser();
    renderMini();
    renderInspector();
    renderConflictBanner();
    document.querySelector("#selected-count").textContent = String(selectedCourseCount());
    if (focusCourseId && focusSlotKey) {
      dayBrowser.querySelector(`[data-course-id="${focusCourseId}"][data-slot-key="${focusSlotKey}"]`)?.focus({ preventScroll: true });
    }
  };

  const inspectCard = (card) => {
    if (!card) return;
    state.inspector = {
      title: card.dataset.inspectorTitle,
      message: card.dataset.inspectorMessage,
      tone: card.dataset.inspectorTone,
    };
    renderInspector();
  };

  const closeConflictDialog = () => {
    if (conflictDialog.open) conflictDialog.close();
  };

  const renderConflictDialog = (courseId, returnTarget) => {
    const analysis = model.conflictAnalysis({
      records: eligible(),
      selectedIds: state.selected,
      requiredIds: requiredIds(),
      courseId,
    });
    if (!analysis.conflicts.length) return false;

    state.pendingSwap = { courseId, slotKey: returnTarget.dataset.slotKey, returnTarget };
    const targetTitle = recordTitle(courseId);
    const dialogTitle = document.querySelector("#conflict-dialog-title");
    const description = document.querySelector("#conflict-dialog-description");
    const list = document.querySelector("#conflict-dialog-list");
    const note = document.querySelector("#conflict-dialog-note");
    const replaceButton = document.querySelector("#conflict-dialog-replace");
    list.replaceChildren();

    analysis.conflictingCourseIds.forEach((conflictingId) => {
      const item = document.createElement("div");
      item.className = "conflict-dialog-item";
      const title = document.createElement("strong");
      title.textContent = recordTitle(conflictingId);
      const slots = analysis.conflicts
        .filter((entry) => entry.courseIds.includes(conflictingId))
        .map((entry) => formatSlot(entry.day, entry.period));
      const detail = document.createElement("span");
      const status = analysis.requiredConflictIds.includes(conflictingId) ? "必修・解除不可" : "選択中";
      detail.textContent = `${[...new Set(slots)].join("・")} / ${status}`;
      item.append(title, detail);
      list.append(item);
    });

    if (analysis.requiredConflictIds.length) {
      dialogTitle.textContent = "必修授業と重複しています";
      description.textContent = `「${targetTitle}」は、次の必修授業と時間が重複しています。`;
      note.textContent = "必修授業は解除できないため、この授業への入れ替えはできません。";
      replaceButton.hidden = true;
    } else {
      dialogTitle.textContent = "授業を入れ替えますか？";
      const countText = analysis.manualConflictIds.length > 1 ? `${analysis.manualConflictIds.length}科目` : "次の授業";
      description.textContent = `「${targetTitle}」を選ぶには、現在選択中の${countText}を解除する必要があります。`;
      note.textContent = "「授業を入れ替える」を押した場合だけ、表示中の授業をまとめて解除し、この授業を選択します。";
      replaceButton.hidden = false;
    }
    return true;
  };

  const openConflictDialog = (courseId, returnTarget) => {
    if (!renderConflictDialog(courseId, returnTarget)) return;
    conflictDialog.showModal();
    document.querySelector("#conflict-dialog-cancel").focus();
  };

  dayBrowser.addEventListener("focusin", (event) => inspectCard(event.target.closest("[data-course-id]")));
  dayBrowser.addEventListener("mouseover", (event) => {
    const card = event.target.closest("[data-course-id]");
    if (card && !card.contains(event.relatedTarget)) inspectCard(card);
  });
  dayBrowser.addEventListener("click", (event) => {
    const button = event.target.closest("[data-course-id]");
    if (!button) return;
    const id = button.dataset.courseId;
    const slotKey = button.dataset.slotKey;
    const result = model.toggleCourse({ records: eligible(), selectedIds: state.selected, requiredIds: requiredIds(), courseId: id });
    if (!result.changed) {
      if (result.reason === "conflict") openConflictDialog(id, button);
      inspectCard(button);
      return;
    }
    state.selected = result.selectedIds;
    const labels = compactOccupancy(id);
    const course = courseFor(id);
    state.inspector = {
      title: `${recordTitle(id)}を${result.reason === "selected" ? "選択しました" : "解除しました"}`,
      message: `${labels}${result.reason === "selected" ? "へ選択状態を反映しました。" : "から選択状態を解除しました。"} 講師: ${course.instructor}。${creditLabel(course)}。対象: ${course.grades.join("・")}年。区分: ${data.typeLabel(course.courseType)}。`,
      tone: result.reason === "selected" ? "selected" : "neutral",
    };
    renderCourseStep({ focusCourseId: id, focusSlotKey: slotKey });
  });

  document.querySelector("#conflict-dialog-cancel").addEventListener("click", closeConflictDialog);
  document.querySelector("#conflict-dialog-replace").addEventListener("click", () => {
    const pending = state.pendingSwap;
    if (!pending) return;
    const result = model.replaceCourse({
      records: eligible(),
      selectedIds: state.selected,
      requiredIds: requiredIds(),
      courseId: pending.courseId,
    });
    if (!result.changed) {
      renderConflictDialog(pending.courseId, pending.returnTarget);
      return;
    }
    state.selected = result.selectedIds;
    const removedNames = result.removedCourseIds.map(recordTitle).join("・");
    const targetTitle = recordTitle(pending.courseId);
    const focusCourseId = pending.courseId;
    const focusSlotKey = pending.slotKey;
    state.inspector = {
      title: `${targetTitle}へ入れ替えました`,
      message: `${removedNames}を解除し、${compactOccupancy(focusCourseId)}へ選択状態を反映しました。`,
      tone: "selected",
    };
    conflictDialog.close();
    renderCourseStep({ focusCourseId, focusSlotKey });
  });
  conflictDialog.addEventListener("close", () => {
    const returnTarget = state.pendingSwap?.returnTarget;
    state.pendingSwap = null;
    if (returnTarget?.isConnected) returnTarget.focus({ preventScroll: true });
  });

  document.querySelector("#mini-toggle").addEventListener("click", () => {
    state.miniExpanded = !state.miniExpanded;
    renderMini();
    document.querySelector("#mini-toggle").focus({ preventScroll: true });
  });
  document.querySelector("#mini-schedule").addEventListener("click", (event) => {
    const item = event.target.closest("[data-mini-day]");
    if (!item) return;
    state.day = item.dataset.miniDay;
    state.period = Number(item.dataset.miniPeriod);
    state.inspector = defaultInspector;
    renderCourseStep();
    dayBrowser.scrollIntoView({ behavior: "smooth", block: "start" });
  });

  const showConflict = () => {
    const slots = new Map();
    eligible().forEach((course) => {
      const key = model.slotKey(course);
      slots.set(key, [...(slots.get(key) || []), course]);
    });
    const preferred = slots.get(data.stressSlotKey);
    const [key, candidates] = preferred
      ? [data.stressSlotKey, preferred]
      : [...slots].sort((left, right) => right[1].length - left[1].length)[0];
    const candidateIds = new Set(candidates.map((course) => course.id));
    const preferredIds = data.stressSelectedCourseIds.filter((id) => candidateIds.has(id));
    const selectedIds = preferredIds.length >= 2
      ? preferredIds
      : model.uniqueCourseIds(candidates).filter((id) => !requiredIds().has(id)).slice(0, 2);
    selectedIds.forEach((id) => state.selected.add(id));
    const [day, periodRaw] = key.split("-");
    state.day = day;
    state.period = Number(periodRaw);
    state.inspector = {
      title: "競合表示の確認用状態です",
      message: "この操作だけはUX確認のため重複選択を作っています。実際のカード操作では、競合理由を確認してから選択を見直せます。",
      tone: "warning",
    };
    renderCourseStep();
  };
  document.querySelectorAll("[data-show-conflict]").forEach((button) => button.addEventListener("click", showConflict));

  const renderReview = () => {
    document.querySelector("#profile-summary").textContent = `${state.grade}年生・${state.group} / ${selectedCourseCount()}科目・週間${selectedCourses().length}コマ`;
    const warningRoot = document.querySelector("#review-warning");
    warningRoot.replaceChildren();
    const entries = conflictEntries();
    if (entries.length) {
      const warning = document.createElement("div");
      warning.className = "review-warning";
      warning.textContent = `⚠ 重複が残っています。${entries.map((entry) => `${formatSlot(entry.day, entry.period)}：${entry.courseIds.map(recordTitle).join("・")}`).join(" / ")}`;
      warningRoot.append(warning);
    }
    const root = document.querySelector("#review-schedule");
    root.replaceChildren();
    const required = requiredIds();
    const conflictKeys = new Set(entries.map((entry) => entry.slotKey));
    data.days.forEach((day) => {
      const section = document.createElement("section");
      section.className = "review-day";
      const heading = document.createElement("h3");
      heading.textContent = day.label;
      section.append(heading);
      const courses = selectedCourses().filter((course) => course.day === day.id).sort((a, b) => a.period - b.period);
      if (!courses.length) {
        const empty = document.createElement("div");
        empty.className = "review-item";
        empty.innerHTML = "<span>授業なし</span>";
        section.append(empty);
      } else {
        courses.forEach((course) => {
          const item = document.createElement("article");
          item.className = `review-item${conflictKeys.has(model.slotKey(course)) ? " is-conflict" : ""}`;
          const period = periodFor(course.period);
          const status = required.has(course.id) ? "必修・自動" : "選択済み";
          item.innerHTML = `<strong>${period.label}</strong><span>${period.time}</span><b>${course.title}</b><span>${status}</span>`;
          section.append(item);
        });
      }
      root.append(section);
    });
  };

  const showStep = (step) => {
    state.step = step;
    document.querySelectorAll("[data-step]").forEach((panel) => { panel.hidden = Number(panel.dataset.step) !== step; });
    document.querySelectorAll("[data-step-indicator]").forEach((item) => {
      const number = Number(item.dataset.stepIndicator);
      item.classList.toggle("is-current", number === step);
      item.classList.toggle("is-complete", number < step);
    });
    if (step === 3) renderCourseStep();
    if (step === 4) renderReview();
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  document.querySelectorAll("[data-next]").forEach((button) => button.addEventListener("click", () => showStep(state.step + 1)));
  document.querySelectorAll("[data-back]").forEach((button) => button.addEventListener("click", () => showStep(state.step - 1)));
  updateNextButtons();
})();
