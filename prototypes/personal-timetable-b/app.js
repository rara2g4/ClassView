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
    miniExpanded: false,
    inspector: defaultInspector,
  };
  const gradeChoices = document.querySelector("#grade-choices");
  const groupChoices = document.querySelector("#group-choices");
  const dayBrowser = document.querySelector("#day-browser");
  const miniTimetable = document.querySelector(".mini-timetable");

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
      button.setAttribute("aria-label", `${day.label}${selectedCount ? `、${selectedCount}科目選択済み` : ""}${hasConflict ? "、競合あり" : ""}`);
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
      button.setAttribute("aria-label", `${period.label}${selectedCount ? `、${selectedCount}科目選択済み` : ""}${hasConflict ? "、競合あり" : ""}`);
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
    const overlaps = model.conflictsForCourse(eligible(), course.id, state.selected);
    if (mandatory && overlaps.length) return { key: "conflict", label: "必修・重複", symbol: "!", selected, mandatory, overlaps };
    if (mandatory) return { key: "required", label: "必修・自動", symbol: "必", selected, mandatory, overlaps };
    if (selected && overlaps.length) return { key: "conflict", label: "重複あり", symbol: "!", selected, mandatory, overlaps };
    if (selected) return { key: "selected", label: "選択済み", symbol: "✓", selected, mandatory, overlaps };
    if (overlaps.length) return { key: "blocked", label: "競合あり", symbol: "!", selected, mandatory, overlaps };
    return { key: "available", label: "未選択", symbol: "○", selected, mandatory, overlaps };
  };

  const courseCard = (course) => {
    const status = cardStatus(course);
    const button = document.createElement("button");
    button.type = "button";
    button.className = `course-card is-${status.key}${status.mandatory ? " is-required-course" : ""}`;
    button.dataset.courseId = course.id;
    button.dataset.slotKey = model.slotKey(course);
    button.setAttribute("aria-pressed", String(status.selected));
    button.setAttribute("aria-disabled", String(status.mandatory || status.key === "blocked"));

    const occupancyText = compactOccupancy(course.id);
    const conflictText = formatConflictDetails(status.overlaps);
    let actionText = "押すと選択できます";
    if (status.mandatory && status.overlaps.length) actionText = `必修として自動選択されていますが、${conflictText}と重複しています`;
    else if (status.mandatory) actionText = "必修として自動選択されており変更できません";
    else if (status.key === "blocked") actionText = `${conflictText}と重なるため選択できません`;
    else if (status.selected) actionText = "選択済みです。押すと解除できます";
    else if (status.key === "conflict") actionText = `${conflictText}と重複しています。押すと解除できます`;
    button.setAttribute("aria-label", `${course.title}。${occupancyText}。${course.instructor}。${actionText}`);
    button.dataset.inspectorTitle = status.mandatory
      ? `${course.title}は必修です`
      : status.overlaps.length
        ? `${course.title}の時間競合`
        : course.title;
    button.dataset.inspectorMessage = status.overlaps.length
      ? `${conflictText}と重なります。${status.mandatory ? "必修のため解除できません。時間割データの確認が必要です。" : status.selected ? "この授業を解除すると重複を解消できます。" : "競合する授業を解除してから選択してください。"}`
      : `${occupancyText}を占有します。講師: ${course.instructor}。対象: ${course.grades.join("・")}年。区分: ${data.typeLabel(course.courseType)}。${status.mandatory ? "学年・組に一致する必修として自動追加されています。" : status.selected ? "選択済み。カードを押すとすべての時限から解除します。" : "カードを押すとすべての時限へ反映します。"}`;
    button.dataset.inspectorTone = status.overlaps.length ? "warning" : status.selected ? "selected" : "neutral";

    const titleRow = document.createElement("span");
    titleRow.className = "card-title-row";
    const title = document.createElement("span");
    title.className = "course-title";
    title.textContent = course.title;
    const mark = document.createElement("span");
    mark.className = "selection-mark";
    mark.setAttribute("aria-hidden", "true");
    mark.textContent = status.symbol;
    titleRow.append(title, mark);
    const occupancy = document.createElement("span");
    occupancy.className = "course-occupancy";
    occupancy.textContent = occupancyText;
    button.append(titleRow, occupancy);
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

    const previous = model.moveSlot({ days: data.days, periods: data.periods, day: state.day, period: state.period, offset: -1 });
    const next = model.moveSlot({ days: data.days, periods: data.periods, day: state.day, period: state.period, offset: 1 });
    const previousButton = document.querySelector("#previous-slot");
    const nextButton = document.querySelector("#next-slot");
    previousButton.disabled = !previous;
    nextButton.disabled = !next;
    previousButton.setAttribute("aria-label", previous ? `${formatSlot(previous.day, previous.period)}へ移動` : "前の時限はありません");
    nextButton.setAttribute("aria-label", next ? `${formatSlot(next.day, next.period)}へ移動` : "次の時限はありません");
    document.querySelector("#slot-position").textContent = `${day.short}曜 ${period.label} / 全20コマ`;
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
    banner.textContent = `⚠ ${entries.length}つの時間帯で重複しています。${summary}${entries.length > 2 ? " ほか" : ""}`;
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
      inspectCard(button);
      return;
    }
    state.selected = result.selectedIds;
    const labels = compactOccupancy(id);
    const course = courseFor(id);
    state.inspector = {
      title: `${recordTitle(id)}を${result.reason === "selected" ? "選択しました" : "解除しました"}`,
      message: `${labels}${result.reason === "selected" ? "へ選択状態を反映しました。" : "から選択状態を解除しました。"} 講師: ${course.instructor}。対象: ${course.grades.join("・")}年。区分: ${data.typeLabel(course.courseType)}。`,
      tone: result.reason === "selected" ? "selected" : "neutral",
    };
    renderCourseStep({ focusCourseId: id, focusSlotKey: slotKey });
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

  const moveFocusedSlot = (offset) => {
    const next = model.moveSlot({ days: data.days, periods: data.periods, day: state.day, period: state.period, offset });
    if (!next) return;
    state.day = next.day;
    state.period = next.period;
    state.inspector = defaultInspector;
    renderCourseStep();
    dayBrowser.focus({ preventScroll: true });
  };
  document.querySelector("#previous-slot").addEventListener("click", () => moveFocusedSlot(-1));
  document.querySelector("#next-slot").addEventListener("click", () => moveFocusedSlot(1));

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
