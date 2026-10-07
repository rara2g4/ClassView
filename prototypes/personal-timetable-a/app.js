(() => {
  "use strict";

  const data = window.PersonalTimetableMock;
  const state = { step: 1, grade: "", group: "", selected: new Set(), openedDays: new Set(["mon"]), expandedSlots: new Set() };
  const gradeChoices = document.querySelector("#grade-choices");
  const groupChoices = document.querySelector("#group-choices");

  const gradeIsEligible = (course) => state.grade === "3"
    ? course.grades.some((grade) => ["1", "2", "3"].includes(grade))
    : course.grades.includes(state.grade);
  const eligible = () => data.courses.filter((course) => (
    gradeIsEligible(course) && (course.groups.includes("all") || course.groups.includes(state.group))
  ));
  const required = () => eligible().filter((course) => (
    course.courseType === "必修" && course.grades.includes(state.grade)
  ));
  const selectedCourses = () => eligible().filter((course) => state.selected.has(course.id));
  const selectedCourseCount = () => new Set(selectedCourses().map((course) => course.id)).size;
  const orderedCourses = (courses) => [...courses].sort((left, right) => {
    const rank = (course) => course.courseType === "必修" ? 0 : state.selected.has(course.id) ? 1 : 2;
    return rank(left) - rank(right) || left.title.localeCompare(right.title, "ja");
  });
  const slotCourses = (day, period, source = eligible()) => orderedCourses(
    source.filter((course) => course.day === day && course.period === period),
  );
  const conflicts = () => {
    const grouped = new Map();
    selectedCourses().forEach((course) => {
      const key = data.slotKey(course);
      grouped.set(key, [...(grouped.get(key) || []), course]);
    });
    return new Map([...grouped].filter(([, courses]) => courses.length > 1));
  };

  const makeChoice = (name, value, title, subtitle) => {
    const wrapper = document.createElement("div");
    wrapper.className = "choice-option";
    const input = document.createElement("input");
    input.type = "radio";
    input.name = name;
    input.id = `${name}-${value}`;
    input.value = value;
    const label = document.createElement("label");
    label.htmlFor = input.id;
    const strong = document.createElement("strong");
    strong.textContent = title;
    const small = document.createElement("small");
    small.textContent = subtitle;
    label.append(strong, small);
    wrapper.append(input, label);
    return wrapper;
  };

  ["1", "2", "3"].forEach((grade) => gradeChoices.append(makeChoice(
    "grade",
    grade,
    `${grade}年生`,
    grade === "3" ? "Excel全件・高密度対象" : "1つ選択",
  )));
  ["1組", "2組"].forEach((group) => groupChoices.append(makeChoice("group", group, group, "所属するクラス")));

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
    state.selected.clear();
    required().forEach((course) => state.selected.add(course.id));
    updateNextButtons();
  });

  const courseButton = (course, conflictKeys) => {
    const mandatory = course.courseType === "必修" && course.grades.includes(state.grade);
    const selected = state.selected.has(course.id);
    const button = document.createElement("button");
    button.type = "button";
    button.className = `course-choice${selected ? " is-selected" : ""}${mandatory ? " is-required" : ""}`;
    button.disabled = mandatory;
    button.dataset.courseId = course.id;
    button.setAttribute("aria-pressed", String(selected));
    const top = document.createElement("span");
    top.className = "course-choice__top";
    const badge = document.createElement("span");
    badge.className = "type-badge";
    badge.textContent = data.typeLabel(course.courseType);
    const status = document.createElement("span");
    status.className = "selection-state";
    status.textContent = mandatory ? "自動追加" : selected ? "✓ 選択済み" : "+ 選ぶ";
    top.append(badge, status);
    const title = document.createElement("span");
    title.className = "course-choice__title";
    title.textContent = course.title;
    const meta = document.createElement("span");
    meta.className = "course-choice__meta";
    meta.textContent = `${course.instructor} / ${course.grades.join("・")}年${course.note ? ` / ${course.note}` : ""}`;
    button.append(top, title, meta);
    if (conflictKeys.has(data.slotKey(course)) && selected) {
      const warning = document.createElement("span");
      warning.className = "slot-warning";
      warning.textContent = "⚠ 同じ時限に複数選択";
      button.append(warning);
    }
    return button;
  };

  const buildDesktop = () => {
    const conflictKeys = new Set(conflicts().keys());
    const wrapper = document.createElement("div");
    wrapper.className = "schedule-desktop";
    const table = document.createElement("table");
    table.className = "schedule-table";
    table.innerHTML = `<caption class="skip-link">履修候補の週間時間割</caption><thead><tr><th>時限</th>${data.days.map((day) => `<th scope="col">${day.label}</th>`).join("")}</tr></thead>`;
    const body = document.createElement("tbody");
    data.periods.forEach((period) => {
      const row = document.createElement("tr");
      const heading = document.createElement("th");
      heading.scope = "row";
      heading.className = "period-cell";
      heading.innerHTML = `<strong>${period.label}</strong><span>${period.time}</span>`;
      row.append(heading);
      data.days.forEach((day) => {
        const cell = document.createElement("td");
        const key = `${day.id}-${period.id}`;
        cell.className = `slot${conflictKeys.has(key) ? " is-conflict" : ""}`;
        const courses = slotCourses(day.id, period.id);
        if (courses.length) {
          if (courses.length >= 6) {
            const density = document.createElement("span");
            density.className = "density-label";
            density.textContent = `${courses.length}件の候補・スクロールできます`;
            cell.append(density);
          }
          const list = document.createElement("div");
          list.className = `slot-course-list${courses.length >= 6 ? " is-dense" : ""}`;
          courses.forEach((course) => list.append(courseButton(course, conflictKeys)));
          cell.append(list);
        }
        else { const empty = document.createElement("span"); empty.className = "slot-empty"; empty.textContent = "—"; cell.append(empty); }
        row.append(cell);
      });
      body.append(row);
    });
    table.append(body);
    wrapper.append(table);
    return wrapper;
  };

  const buildMobile = () => {
    const conflictKeys = new Set(conflicts().keys());
    const wrapper = document.createElement("div");
    wrapper.className = "schedule-mobile";
    data.days.forEach((day) => {
      const dayCourses = eligible().filter((course) => course.day === day.id);
      if (!dayCourses.length) return;
      const section = document.createElement("section");
      section.className = "mobile-day";
      const button = document.createElement("button");
      button.type = "button";
      button.className = "mobile-day__toggle";
      const isOpen = state.openedDays.has(day.id);
      button.setAttribute("aria-expanded", String(isOpen));
      button.innerHTML = `<span><span class="mobile-day__label">${day.label}</span><br><span class="mobile-day__count">${dayCourses.length}件の候補</span></span><span class="mobile-day__action">${isOpen ? "閉じる" : "開く"}</span>`;
      const panel = document.createElement("div");
      panel.className = "mobile-day__panel";
      panel.hidden = !isOpen;
      data.periods.forEach((period) => {
        const courses = slotCourses(day.id, period.id);
        if (!courses.length) return;
        const slotKey = `${day.id}-${period.id}`;
        const isExpanded = state.expandedSlots.has(slotKey);
        const shownCourses = courses.length > 3 && !isExpanded ? courses.slice(0, 3) : courses;
        const periodSection = document.createElement("section");
        periodSection.className = "mobile-period";
        periodSection.innerHTML = `<div class="mobile-period__heading"><h3>${period.label}</h3><span>${period.time} / ${courses.length}件</span></div>`;
        shownCourses.forEach((course) => periodSection.append(courseButton(course, conflictKeys)));
        if (courses.length > 3) {
          const more = document.createElement("button");
          more.type = "button";
          more.className = "more-button";
          more.dataset.expandSlot = slotKey;
          more.textContent = isExpanded ? "候補を3件に戻す" : `残り${courses.length - 3}件を表示`;
          periodSection.append(more);
        }
        panel.append(periodSection);
      });
      button.addEventListener("click", () => {
        if (state.openedDays.has(day.id)) state.openedDays.delete(day.id); else state.openedDays.add(day.id);
        renderSchedule();
      });
      section.append(button, panel);
      wrapper.append(section);
    });
    return wrapper;
  };

  const renderSchedule = () => {
    const root = document.querySelector("#schedule-a");
    root.replaceChildren(buildDesktop(), buildMobile());
    const count = selectedCourseCount();
    document.querySelector("#selected-count").textContent = String(count);
    const conflictMap = conflicts();
    const summary = document.querySelector("#conflict-summary");
    summary.hidden = conflictMap.size === 0;
    if (conflictMap.size) summary.textContent = `⚠ ${conflictMap.size}つの時限で授業が重複しています。どちらか一方を選んでください。`;
  };

  document.querySelector("#schedule-a").addEventListener("click", (event) => {
    const expandButton = event.target.closest("[data-expand-slot]");
    if (expandButton) {
      const key = expandButton.dataset.expandSlot;
      if (state.expandedSlots.has(key)) state.expandedSlots.delete(key); else state.expandedSlots.add(key);
      renderSchedule();
      return;
    }
    const button = event.target.closest("[data-course-id]");
    if (!button || button.disabled) return;
    const id = button.dataset.courseId;
    if (state.selected.has(id)) state.selected.delete(id); else state.selected.add(id);
    renderSchedule();
  });

  document.querySelector("#show-conflict").addEventListener("click", () => {
    const slots = new Map();
    eligible().forEach((course) => {
      const key = data.slotKey(course);
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
      : [...new Map(candidates.map((course) => [course.id, course])).values()]
        .filter((course) => course.courseType !== "必修")
        .slice(0, 2)
        .map((course) => course.id);
    selectedIds.forEach((id) => state.selected.add(id));
    const [day] = key.split("-");
    state.openedDays = new Set([day]);
    state.expandedSlots.add(key);
    renderSchedule();
  });

  const renderPreview = () => {
    document.querySelector("#profile-summary").textContent = `${state.grade}年生・${state.group} / ${selectedCourseCount()}科目・週間${selectedCourses().length}枠`;
    const conflictRoot = document.querySelector("#preview-conflicts");
    const conflictMap = conflicts();
    conflictRoot.replaceChildren();
    if (conflictMap.size) {
      const warning = document.createElement("div");
      warning.className = "conflict-summary";
      warning.textContent = "⚠ 重複が残っています。保存する前に選択を修正してください。";
      conflictRoot.append(warning);
    }
    const root = document.querySelector("#preview-a");
    root.replaceChildren();
    data.days.forEach((day) => {
      const courses = selectedCourses().filter((course) => course.day === day.id).sort((a, b) => a.period - b.period);
      if (!courses.length) return;
      const section = document.createElement("section");
      section.className = "preview-day";
      const heading = document.createElement("h3");
      heading.textContent = day.label;
      const list = document.createElement("div");
      list.className = "preview-list";
      courses.forEach((course) => {
        const item = document.createElement("article");
        item.className = "preview-item";
        const time = data.periods.find((period) => period.id === course.period);
        item.innerHTML = `<div><strong>${time.label}</strong><span>${time.time}</span></div><div><b>${course.title}</b><span>${data.typeLabel(course.courseType)} / ${course.instructor}</span></div>`;
        list.append(item);
      });
      section.append(heading, list);
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
    if (step === 3) renderSchedule();
    if (step === 4) renderPreview();
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  document.querySelectorAll("[data-next]").forEach((button) => button.addEventListener("click", () => showStep(state.step + 1)));
  document.querySelectorAll("[data-back]").forEach((button) => button.addEventListener("click", () => showStep(state.step - 1)));
  updateNextButtons();
})();
