(() => {
  "use strict";

  const data = window.PersonalTimetableMock;
  const state = { step: 1, grade: "", group: "", day: "mon", selected: new Set(), expandedSlots: new Set() };
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
  const conflicts = () => {
    const grouped = new Map();
    selectedCourses().forEach((course) => {
      const key = data.slotKey(course);
      grouped.set(key, [...(grouped.get(key) || []), course]);
    });
    return new Map([...grouped].filter(([, courses]) => courses.length > 1));
  };
  const orderedCourses = (courses) => [...courses].sort((left, right) => {
    const rank = (course) => course.courseType === "必修" ? 0 : state.selected.has(course.id) ? 1 : 2;
    return rank(left) - rank(right) || left.title.localeCompare(right.title, "ja");
  });

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
    state.selected.clear();
    required().forEach((course) => state.selected.add(course.id));
    updateNextButtons();
  });

  const renderTabs = () => {
    const root = document.querySelector("#week-strip");
    root.replaceChildren();
    data.days.forEach((day) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "day-tab";
      button.role = "tab";
      button.setAttribute("aria-selected", String(state.day === day.id));
      const count = new Set(selectedCourses().filter((course) => course.day === day.id).map((course) => course.id)).size;
      button.innerHTML = `${day.short}<span>${count ? `${count}科目` : "未選択"}</span>`;
      button.addEventListener("click", () => { state.day = day.id; renderCourseStep(); });
      root.append(button);
    });
  };

  const courseCard = (course, conflictKeys) => {
    const selected = state.selected.has(course.id);
    const mandatory = course.courseType === "必修" && course.grades.includes(state.grade);
    const article = document.createElement("article");
    article.className = `course-card${selected ? " is-selected" : ""}${mandatory ? " is-required" : ""}${selected && conflictKeys.has(data.slotKey(course)) ? " is-conflict" : ""}`;
    const top = document.createElement("div");
    top.className = "card-top";
    const badge = document.createElement("span");
    badge.className = "type-badge";
    badge.textContent = data.typeLabel(course.courseType);
    const stateLabel = document.createElement("span");
    stateLabel.className = "course-meta";
    stateLabel.textContent = mandatory ? "自動追加" : selected ? "選択済み" : "未選択";
    top.append(badge, stateLabel);
    const title = document.createElement("h4");
    title.textContent = course.title;
    const meta = document.createElement("p");
    meta.className = "course-meta";
    meta.textContent = `${course.instructor} / ${course.grades.join("・")}年${course.note ? ` / ${course.note}` : ""}`;
    const action = document.createElement("button");
    action.type = "button";
    action.className = "course-action";
    action.disabled = mandatory;
    action.dataset.courseId = course.id;
    action.textContent = mandatory ? "必修のため変更できません" : selected ? "− 選択を解除" : "+ この授業を選ぶ";
    article.append(top, title, meta, action);
    if (selected && conflictKeys.has(data.slotKey(course))) {
      const warning = document.createElement("p");
      warning.className = "card-warning";
      warning.textContent = "⚠ 同じ時限に別の授業があります";
      article.append(warning);
    }
    return article;
  };

  const renderDayBrowser = () => {
    const root = document.querySelector("#day-browser");
    root.replaceChildren();
    const day = data.days.find((item) => item.id === state.day);
    const titleRow = document.createElement("div");
    titleRow.className = "day-title-row";
    titleRow.innerHTML = `<h3>${day.label}</h3><span>時限ごとに1科目が目安です</span>`;
    root.append(titleRow);
    const conflictKeys = new Set(conflicts().keys());
    data.periods.forEach((period) => {
      const courses = orderedCourses(eligible().filter((course) => course.day === day.id && course.period === period.id));
      const slotKey = `${day.id}-${period.id}`;
      const isExpanded = state.expandedSlots.has(slotKey);
      const section = document.createElement("section");
      section.className = "period-section";
      const heading = document.createElement("div");
      heading.className = "period-title";
      heading.innerHTML = `<strong>${period.label}</strong><span>${period.time}${courses.length ? ` / ${courses.length}件` : ""}</span>`;
      const cards = document.createElement("div");
      cards.className = `course-cards${courses.length >= 6 ? " is-dense" : ""}${courses.length > 3 && !isExpanded ? " is-collapsed" : ""}`;
      if (courses.length) courses.forEach((course) => cards.append(courseCard(course, conflictKeys)));
      else { const empty = document.createElement("p"); empty.className = "empty-period"; empty.textContent = "この時限に候補はありません。"; cards.append(empty); }
      section.append(heading, cards);
      if (courses.length > 3) {
        const more = document.createElement("button");
        more.type = "button";
        more.className = "dense-toggle";
        more.dataset.expandSlot = slotKey;
        more.textContent = isExpanded ? "候補を3件に戻す" : `残り${courses.length - 3}件を表示`;
        section.append(more);
      }
      root.append(section);
    });
  };

  const renderMini = () => {
    const root = document.querySelector("#mini-schedule");
    root.replaceChildren();
    const conflictKeys = new Set(conflicts().keys());
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
          const item = document.createElement("div");
          item.className = `mini-item${conflictKeys.has(data.slotKey(course)) ? " is-conflict" : ""}`;
          item.innerHTML = `<span>${course.period}限</span><span>${course.title}</span>`;
          section.append(item);
        });
      }
      root.append(section);
    });
  };

  const renderCourseStep = () => {
    renderTabs();
    renderDayBrowser();
    renderMini();
    document.querySelector("#selected-count").textContent = String(selectedCourseCount());
    const conflictMap = conflicts();
    const banner = document.querySelector("#conflict-banner");
    banner.hidden = conflictMap.size === 0;
    if (conflictMap.size) banner.textContent = `⚠ ${conflictMap.size}つの時間帯で授業が重複しています。該当する曜日を開いて見直してください。`;
  };

  document.querySelector("#day-browser").addEventListener("click", (event) => {
    const expandButton = event.target.closest("[data-expand-slot]");
    if (expandButton) {
      const key = expandButton.dataset.expandSlot;
      if (state.expandedSlots.has(key)) state.expandedSlots.delete(key); else state.expandedSlots.add(key);
      renderCourseStep();
      return;
    }
    const button = event.target.closest("[data-course-id]");
    if (!button || button.disabled) return;
    const id = button.dataset.courseId;
    if (state.selected.has(id)) state.selected.delete(id); else state.selected.add(id);
    renderCourseStep();
  });
  const showConflict = () => {
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
    state.day = day;
    state.expandedSlots.add(key);
    renderCourseStep();
  };
  document.querySelectorAll("[data-show-conflict]").forEach((button) => button.addEventListener("click", showConflict));

  const renderReview = () => {
    document.querySelector("#profile-summary").textContent = `${state.grade}年生・${state.group} / ${selectedCourseCount()}科目・週間${selectedCourses().length}枠`;
    const warningRoot = document.querySelector("#review-warning");
    warningRoot.replaceChildren();
    if (conflicts().size) {
      const warning = document.createElement("div");
      warning.className = "review-warning";
      warning.textContent = "⚠ 時間割の重複が残っています。選択画面に戻って確認してください。";
      warningRoot.append(warning);
    }
    const root = document.querySelector("#review-schedule");
    root.replaceChildren();
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
          item.className = "review-item";
          const period = data.periods.find((entry) => entry.id === course.period);
          item.innerHTML = `<strong>${period.label}</strong><span>${period.time}</span><b>${course.title}</b><span>${data.typeLabel(course.courseType)}</span>`;
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
