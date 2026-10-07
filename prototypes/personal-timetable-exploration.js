(() => {
  "use strict";

  const data = window.PersonalTimetableMock;
  const variant = document.body.dataset.variant;
  const slotOrder = data.periods.flatMap((period) => data.days.map((day) => `${day.id}-${period.id}`));
  const state = {
    grade: "3",
    group: "1組",
    day: "tue",
    activeSlot: data.stressSlotKey,
    selected: new Set(),
  };

  const node = (tag, className, text) => {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  };

  const gradeEligible = (course) => state.grade === "3"
    ? course.grades.some((grade) => ["1", "2", "3"].includes(grade))
    : course.grades.includes(state.grade);
  const eligible = () => data.courses.filter((course) => (
    gradeEligible(course) && (course.groups.includes("all") || course.groups.includes(state.group))
  ));
  const coursesAt = (slotKey) => eligible().filter((course) => data.slotKey(course) === slotKey);
  const isRequired = (course) => course.courseType === "必修" && course.grades.includes(state.grade);
  const selectedEntries = () => eligible().filter((course) => state.selected.has(course.id));
  const selectedIds = () => [...new Set(selectedEntries().map((course) => course.id))];
  const selectedAt = (slotKey) => coursesAt(slotKey).filter((course) => state.selected.has(course.id));
  const conflicts = () => new Set(slotOrder.filter((slotKey) => selectedAt(slotKey).length > 1));
  const typeClass = (course) => course.courseType === "必修"
    ? "required"
    : course.courseType === "選択必修"
      ? "selective-required"
      : course.courseType === "選択"
        ? "elective"
        : "unknown";
  const typeShort = (course) => course.courseType === "必修"
    ? "必"
    : course.courseType === "選択必修"
      ? "選必"
      : course.courseType === "選択"
        ? "選"
        : "?";
  const typeBadge = (course, short = false) => node(
    "span",
    `type-badge type-badge--${typeClass(course)}`,
    short ? typeShort(course) : data.typeLabel(course.courseType),
  );
  const dayFor = (slotKey) => data.days.find((day) => day.id === slotKey.split("-")[0]);
  const periodFor = (slotKey) => data.periods.find((period) => period.id === Number(slotKey.split("-")[1]));
  const slotLabel = (slotKey) => `${dayFor(slotKey).label} ${periodFor(slotKey).label}`;
  const courseMeta = (course) => `${course.instructor} / ${course.grades.join("・")}年${course.note ? ` / ${course.note}` : ""}`;

  const resetRequired = () => {
    state.selected = new Set(eligible().filter(isRequired).map((course) => course.id));
  };
  const showStress = () => {
    resetRequired();
    data.stressSelectedCourseIds.forEach((id) => state.selected.add(id));
    state.activeSlot = data.stressSlotKey;
    state.day = dayFor(data.stressSlotKey).id;
    render();
  };
  const toggleCourse = (id) => {
    const course = eligible().find((entry) => entry.id === id);
    if (!course || isRequired(course)) return;
    if (state.selected.has(id)) state.selected.delete(id); else state.selected.add(id);
    render();
  };

  const renderChrome = () => {
    document.querySelector("#selected-count").textContent = String(selectedIds().length);
    document.querySelector("#selected-slots").textContent = String(selectedEntries().length);
    const conflict = conflicts();
    const banner = document.querySelector("#conflict-banner");
    banner.hidden = conflict.size === 0;
    banner.textContent = conflict.size
      ? `⚠ ${conflict.size}つの時限で授業が重複しています。オレンジ色のコマを確認してください。`
      : "";
  };

  const cCourse = (course, slotConflict, mobile = false) => {
    const selected = state.selected.has(course.id);
    const required = isRequired(course);
    const button = node("button", `c-course${selected ? " is-selected" : ""}${required ? " is-required" : ""}`);
    button.type = "button";
    button.disabled = required;
    button.dataset.courseId = course.id;
    button.setAttribute("aria-pressed", String(selected));
    button.title = `${course.title} / ${data.typeLabel(course.courseType)} / ${courseMeta(course)}${slotConflict && selected ? " / 時間割重複" : ""}`;
    button.append(typeBadge(course, true), node("span", "course-title", course.title));
    if (mobile) button.setAttribute("aria-label", button.title);
    return button;
  };

  const dayTabs = (className) => {
    const tabs = node("div", `mobile-day-tabs ${className || ""}`);
    tabs.setAttribute("role", "tablist");
    tabs.setAttribute("aria-label", "曜日を選ぶ");
    data.days.forEach((day) => {
      const button = node("button", "mobile-day-tab", day.short);
      button.type = "button";
      button.dataset.day = day.id;
      button.setAttribute("role", "tab");
      button.setAttribute("aria-selected", String(state.day === day.id));
      tabs.append(button);
    });
    return tabs;
  };

  const renderC = (root) => {
    const conflict = conflicts();
    const desktop = node("section", "c-desktop");
    desktop.setAttribute("aria-label", "高密度週間グリッド");
    const grid = node("div", "c-grid");
    grid.append(node("div", "c-corner"));
    data.days.forEach((day) => grid.append(node("div", "c-day", day.label)));
    data.periods.forEach((period) => {
      const periodCell = node("div", "c-period");
      periodCell.append(node("strong", "", period.label), node("span", "", period.time));
      grid.append(periodCell);
      data.days.forEach((day) => {
        const key = `${day.id}-${period.id}`;
        const courses = coursesAt(key);
        const cell = node("div", `c-cell${conflict.has(key) ? " is-conflict" : ""}`);
        const meta = node("div", "c-cell__meta");
        meta.append(node("span", "", `${courses.length}候補`), node("span", "", `${selectedAt(key).length}選択`));
        const list = node("div", "c-courses");
        courses.forEach((course) => list.append(cCourse(course, conflict.has(key))));
        cell.append(meta, list);
        grid.append(cell);
      });
    });
    desktop.append(grid);

    const mobile = node("section", "c-mobile");
    mobile.append(dayTabs());
    data.periods.forEach((period) => {
      const key = `${state.day}-${period.id}`;
      const courses = coursesAt(key);
      const section = node("section", "c-mobile-period");
      const heading = node("div", "c-mobile-period__heading");
      heading.append(node("strong", "", period.label), node("span", "", `${period.time} / ${courses.length}候補`));
      const list = node("div", "c-mobile-courses");
      courses.forEach((course) => list.append(cCourse(course, conflict.has(key), true)));
      section.append(heading, list);
      mobile.append(section);
    });
    root.append(desktop, mobile);
  };

  const overviewSlot = (key, mobile = false) => {
    const courses = coursesAt(key);
    const selected = selectedAt(key);
    const conflict = selected.length > 1;
    const button = node("button", mobile ? "d-period-button" : "d-slot");
    button.type = "button";
    button.dataset.slotKey = key;
    button.classList.toggle("is-active", state.activeSlot === key);
    button.classList.toggle("is-conflict", conflict);
    if (mobile) {
      button.append(node("strong", "", periodFor(key).label), node("span", "", `${courses.length}候補 / ${selected.length}選択`));
    } else {
      const top = node("span", "d-slot__top");
      top.append(node("span", "", conflict ? "⚠ 重複" : selected.length ? "選択中" : ""), node("span", "d-slot__count", `${courses.length}件`));
      const selection = node("span", "d-slot__selection");
      selected.slice(0, 2).forEach((course) => selection.append(node("strong", "", course.title)));
      if (!selected.length) selection.append(node("span", "", "未選択"));
      if (selected.length > 2) selection.append(node("span", "", `ほか${selected.length - 2}件`));
      button.append(top, selection);
    }
    button.setAttribute("aria-label", `${slotLabel(key)}、${courses.length}候補、${selected.length}選択`);
    return button;
  };

  const dPanel = () => {
    const courses = coursesAt(state.activeSlot);
    const panel = node("aside", "d-panel");
    const header = node("header", "d-panel__header");
    header.append(node("h2", "", slotLabel(state.activeSlot)), node("p", "", `${periodFor(state.activeSlot).time} / ${courses.length}候補`));
    const list = node("div", "d-course-list");
    courses.forEach((course) => {
      const selected = state.selected.has(course.id);
      const required = isRequired(course);
      const button = node("button", `d-course${selected ? " is-selected" : ""}${required ? " is-required" : ""}`);
      button.type = "button";
      button.disabled = required;
      button.dataset.courseId = course.id;
      const label = node("span");
      label.append(typeBadge(course), node("strong", "", course.title));
      const status = node("span", "d-course__state", required ? "自動追加" : selected ? "選択済み" : "選ぶ");
      button.append(label, status, node("span", "d-course__meta", courseMeta(course)));
      list.append(button);
    });
    panel.append(header, list);
    return panel;
  };

  const renderD = (root) => {
    const layout = node("div", "d-layout");
    const desktop = node("section", "d-overview-grid");
    desktop.append(node("div", "d-head"));
    data.days.forEach((day) => desktop.append(node("div", "d-head", day.label)));
    data.periods.forEach((period) => {
      desktop.append(node("div", "d-period", period.label));
      data.days.forEach((day) => desktop.append(overviewSlot(`${day.id}-${period.id}`)));
    });
    const mobile = node("section", "d-mobile-nav");
    mobile.append(dayTabs());
    const periods = node("div", "d-period-buttons");
    data.periods.forEach((period) => periods.append(overviewSlot(`${state.day}-${period.id}`, true)));
    mobile.append(periods);
    const overview = node("div");
    overview.append(desktop, mobile);
    layout.append(overview, dPanel());
    root.append(layout);
  };

  const renderMap = () => {
    const conflict = conflicts();
    const map = node("div", "e-map");
    map.append(node("div", "e-map__day"));
    data.days.forEach((day) => map.append(node("div", "e-map__day", day.short)));
    data.periods.forEach((period) => {
      map.append(node("div", "e-map__period", String(period.id)));
      data.days.forEach((day) => {
        const key = `${day.id}-${period.id}`;
        const selected = selectedAt(key);
        const button = node("button", "e-map__slot");
        button.type = "button";
        button.dataset.slotKey = key;
        button.classList.toggle("is-active", state.activeSlot === key);
        button.classList.toggle("is-selected", selected.length > 0);
        button.classList.toggle("is-conflict", conflict.has(key));
        button.append(node("strong", "", String(coursesAt(key).length)), node("span", "", selected.length ? `${selected.length}選択` : "候補"));
        button.setAttribute("aria-label", `${slotLabel(key)}、${coursesAt(key).length}候補、${selected.length}選択`);
        map.append(button);
      });
    });
    return map;
  };

  const renderE = (root) => {
    const layout = node("div", "e-layout");
    const mapWrap = node("aside", "e-map-wrap");
    const mapHeading = node("div", "e-map-heading");
    mapHeading.append(node("h2", "", "週間mini-map"), node("span", "", "数字＝候補数"));
    mapWrap.append(mapHeading, renderMap());
    const tray = node("section", "e-selection-tray");
    tray.append(node("h3", "", `選択中 ${selectedIds().length}科目 / 週間${selectedEntries().length}枠`));
    const chips = node("div", "e-selection-list");
    const unique = new Map(selectedEntries().map((course) => [course.id, course]));
    unique.forEach((course) => chips.append(node("span", "e-selection-chip", course.title)));
    tray.append(chips);
    mapWrap.append(tray);

    const focus = node("section", "e-focus");
    const header = node("header", "e-focus__header");
    const title = node("div", "e-focus__title");
    const index = slotOrder.indexOf(state.activeSlot);
    title.append(node("h2", "", slotLabel(state.activeSlot)), node("p", "", `${periodFor(state.activeSlot).time} / ${coursesAt(state.activeSlot).length}候補 / ${index + 1} of ${slotOrder.length}`));
    const nav = node("div", "e-nav");
    const previous = node("button", "", "←");
    previous.type = "button";
    previous.dataset.stepSlot = "-1";
    previous.setAttribute("aria-label", "前のコマ");
    const next = node("button", "", "→");
    next.type = "button";
    next.dataset.stepSlot = "1";
    next.setAttribute("aria-label", "次のコマ");
    nav.append(previous, next);
    header.append(title, nav);
    const grid = node("div", "e-course-grid");
    coursesAt(state.activeSlot).forEach((course) => {
      const selected = state.selected.has(course.id);
      const required = isRequired(course);
      const button = node("button", `e-course${selected ? " is-selected" : ""}${required ? " is-required" : ""}`);
      button.type = "button";
      button.disabled = required;
      button.dataset.courseId = course.id;
      const top = node("span", "e-course__top");
      top.append(typeBadge(course), node("span", "e-course__state", required ? "自動追加" : selected ? "選択済み" : "選ぶ"));
      button.append(top, node("strong", "", course.title), node("small", "", courseMeta(course)));
      grid.append(button);
    });
    focus.append(header, grid);
    layout.append(mapWrap, focus);
    root.append(layout);
  };

  const render = () => {
    renderChrome();
    const root = document.querySelector("#prototype-root");
    root.replaceChildren();
    if (variant === "c") renderC(root);
    if (variant === "d") renderD(root);
    if (variant === "e") renderE(root);
  };

  document.querySelector("#grade-select").addEventListener("change", (event) => {
    state.grade = event.target.value;
    resetRequired();
    render();
  });
  document.querySelector("#group-select").addEventListener("change", (event) => {
    state.group = event.target.value;
    resetRequired();
    render();
  });
  document.querySelector("#stress-demo").addEventListener("click", showStress);
  document.querySelector("#clear-selection").addEventListener("click", () => { resetRequired(); render(); });
  document.querySelector("#prototype-root").addEventListener("click", (event) => {
    const course = event.target.closest("[data-course-id]");
    if (course) { toggleCourse(course.dataset.courseId); return; }
    const day = event.target.closest("[data-day]");
    if (day) { state.day = day.dataset.day; render(); return; }
    const slot = event.target.closest("[data-slot-key]");
    if (slot) {
      state.activeSlot = slot.dataset.slotKey;
      state.day = dayFor(state.activeSlot).id;
      render();
      return;
    }
    const step = event.target.closest("[data-step-slot]");
    if (step) {
      const index = slotOrder.indexOf(state.activeSlot);
      state.activeSlot = slotOrder[(index + Number(step.dataset.stepSlot) + slotOrder.length) % slotOrder.length];
      state.day = dayFor(state.activeSlot).id;
      render();
    }
  });

  resetRequired();
  showStress();
})();
