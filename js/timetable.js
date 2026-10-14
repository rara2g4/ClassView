((global) => {
  "use strict";

  const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
  const KIND_LABELS = {
    special: "特別授業",
    event: "行事",
    exam: "試験",
    holiday: "休暇",
    other: "その他",
  };
  const DAY_NAMES = ["日", "月", "火", "水", "木", "金", "土"];

  const pad = (value) => String(value).padStart(2, "0");

  const daysInMonth = (year, month) =>
    new Date(year, month, 0, 12).getDate();

  const parseCalendarDate = (value) => {
    if (typeof value !== "string") return null;
    const match = value.match(DATE_PATTERN);
    if (!match) return null;

    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    if (
      year < 2000 ||
      year > 2099 ||
      month < 1 ||
      month > 12 ||
      day < 1 ||
      day > daysInMonth(year, month)
    ) {
      return null;
    }
    return { year, month, day };
  };

  const fromDate = (date) => ({
    year: date.getFullYear(),
    month: date.getMonth() + 1,
    day: date.getDate(),
  });

  const toLocalDate = ({ year, month, day }) =>
    new Date(year, month - 1, day, 12, 0, 0, 0);

  const formatDateKey = ({ year, month, day }) =>
    `${year}-${pad(month)}-${pad(day)}`;

  const monthKey = ({ year, month }) => `${year}-${pad(month)}`;

  const addDays = (dateParts, amount) => {
    const date = toLocalDate(dateParts);
    date.setDate(date.getDate() + amount);
    return fromDate(date);
  };

  const startOfWeek = (dateParts) => {
    const date = toLocalDate(dateParts);
    const offset = (date.getDay() + 6) % 7;
    return addDays(dateParts, -offset);
  };

  const formatGrades = (grades, gradeRaw = "") => {
    if (typeof gradeRaw === "string" && gradeRaw.trim() === "全学年") {
      return "全学年";
    }
    const values = Array.isArray(grades)
      ? [...new Set(grades.filter((value) => Number.isInteger(value) && value >= 1 && value <= 3))].sort()
      : [];
    if (values.length === 3) return "全学年";
    return values.length ? `${values.join("・")}年` : "";
  };

  const kindLabel = (kind) => KIND_LABELS[kind] || "";

  const weekDayCount = (entriesByDate, weekStart) => {
    const weekendHasEntries = [5, 6].some((offset) => {
      const entries = entriesByDate.get(formatDateKey(addDays(weekStart, offset)));
      return Array.isArray(entries) && entries.length > 0;
    });
    return weekendHasEntries ? 7 : 5;
  };

  const joinTextValues = (values, separator = "、") =>
    Array.isArray(values)
      ? values.filter((value) => typeof value === "string" && value.trim()).join(separator)
      : "";

  const compactEntryData = (entry = {}) => {
    const audience = [
      formatGrades(entry.grades, entry.gradeRaw),
      joinTextValues(entry.groupTags, "・"),
    ].filter(Boolean).join(" / ");
    const room = joinTextValues(entry.rooms);
    return {
      title: typeof entry.subjectName === "string" && entry.subjectName.trim()
        ? entry.subjectName
        : "時間割項目",
      kind: kindLabel(entry.kind),
      audience,
      room,
      instructor: joinTextValues(entry.instructors),
      meta: [audience, room].filter(Boolean).join(" · "),
      courseId: typeof entry.courseId === "string" && entry.courseId
        ? entry.courseId
        : null,
    };
  };

  const toggleExpandedDateKeys = (dateKeys, targetKey) => {
    const next = new Set(Array.isArray(dateKeys) ? dateKeys : []);
    if (next.has(targetKey)) next.delete(targetKey);
    else next.add(targetKey);
    return [...next];
  };

  const expandedDateKeysForWeek = (
    currentWeekKey,
    expandedDateKeys,
    nextWeekKey,
    visibleDateKeys,
  ) => {
    if (!nextWeekKey || currentWeekKey !== nextWeekKey) return [];
    const visibleKeys = new Set(Array.isArray(visibleDateKeys) ? visibleDateKeys : []);
    return Array.isArray(expandedDateKeys)
      ? expandedDateKeys.filter((dateKey) => visibleKeys.has(dateKey))
      : [];
  };

  const courseDetailUrl = (courseId) =>
    typeof courseId === "string" && courseId
      ? `course.html?id=${encodeURIComponent(courseId)}`
      : "";

  const api = {
    addDays,
    compactEntryData,
    courseDetailUrl,
    expandedDateKeysForWeek,
    formatDateKey,
    formatGrades,
    kindLabel,
    monthKey,
    parseCalendarDate,
    startOfWeek,
    toggleExpandedDateKeys,
    weekDayCount,
  };
  global.ClassViewTimetable = api;

  if (typeof document === "undefined") return;

  const DATA_ROOT = new URL("./data/timetable/", document.baseURI);
  const manifestUrl = new URL("manifest.json", DATA_ROOT);
  const periodsUrl = new URL("periods.json", DATA_ROOT);
  const coursesUrl = new URL("./data/courses.json", document.baseURI);
  const siteVersionUrl = new URL("./data/site-version.json", document.baseURI);
  const personal = global.ClassViewPersonalTimetable;
  const personalUi = global.ClassViewPersonalTimetableUi;
  const contentRoot = document.querySelector("#timetable-content");
  const dateHeading = document.querySelector("#timetable-date-heading");
  const updatedAt = document.querySelector("#timetable-updated-at");
  const dayButton = document.querySelector("#day-view-button");
  const weekButton = document.querySelector("#week-view-button");
  const previousButton = document.querySelector("#previous-date-button");
  const todayButton = document.querySelector("#today-button");
  const nextButton = document.querySelector("#next-date-button");
  const pageRoot = document.querySelector(".timetable-page");
  const personalModeButton = document.querySelector("#personal-mode-button");
  const schoolModeButton = document.querySelector("#school-mode-button");
  const personalSettingsButton = document.querySelector("#personal-settings-button");
  const personalProfileSummary = document.querySelector("#personal-profile-summary");
  const personalStatus = document.querySelector("#personal-timetable-status");
  const personalSelector = document.querySelector("#personal-course-selector");
  const personalGrid = document.querySelector("#personal-course-grid");
  const conflictSummary = document.querySelector("#personal-conflict-summary");
  const desktopFilters = document.querySelector("#personal-desktop-filters");
  const mobileFilters = document.querySelector("#personal-mobile-filters");
  const filterButton = document.querySelector("#personal-filter-button");
  const filterDialog = document.querySelector("#personal-filter-dialog");
  const filterForm = document.querySelector("#personal-filter-form");
  const filterReset = document.querySelector("#personal-filter-reset");
  const setupDialog = document.querySelector("#personal-setup-dialog");
  const setupForm = document.querySelector("#personal-setup-form");
  const gradeInput = document.querySelector("#personal-grade-input");
  const homeroomInput = document.querySelector("#personal-homeroom-input");
  const termInput = document.querySelector("#personal-term-input");
  const termField = document.querySelector("#personal-term-field");
  const setupError = document.querySelector("#personal-setup-error");

  const state = {
    mode: "day",
    selectedDate: null,
    manifest: null,
    periods: null,
    monthCache: new Map(),
    mobileWeekKey: "",
    mobileExpandedDateKeys: [],
    courses: [],
    allEntries: [],
    siteVersion: null,
    profileStorage: null,
    profileLoad: { status: "unset", profile: null },
    displayMode: "school",
    gradeFilter: personal?.ALL_FILTER || "all",
    categoryFilter: personal?.ALL_FILTER || "all",
    personalModel: null,
    activeCandidateSlot: "",
    interactionMessage: "",
  };

  const resetMobileWeekExpansion = () => {
    state.mobileWeekKey = "";
    state.mobileExpandedDateKeys = [];
  };

  const element = (tagName, className = "", text = "") => {
    const node = document.createElement(tagName);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  };

  const arrayText = joinTextValues;

  const fetchJson = async (url) => {
    const response = await fetch(url, { cache: "no-cache" });
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${url}`);
    return response.json();
  };

  const validateBaseData = (manifest, periods) => {
    if (!manifest || !Array.isArray(manifest.months)) {
      throw new Error("Invalid timetable manifest");
    }
    if (!periods || !periods.periods || typeof periods.periods !== "object") {
      throw new Error("Invalid timetable periods");
    }
  };

  const loadMonth = async (key) => {
    if (!state.manifest.months.includes(key)) return null;
    if (!state.monthCache.has(key)) {
      state.monthCache.set(
        key,
        fetchJson(new URL(`${key}.json?v=${encodeURIComponent(state.manifest.version)}`, DATA_ROOT)).then((document) => {
          if (!document || document.yearMonth !== key || typeof document.days !== "object") {
            throw new Error(`Invalid monthly timetable: ${key}`);
          }
          return document;
        }),
      );
    }
    return state.monthCache.get(key);
  };

  const filterEntries = (entries) => {
    if (state.displayMode !== "personal") return entries;
    if (!state.personalModel?.active) return [];
    return entries.filter((entry) => personal.entryVisibility(
      entry,
      state.personalModel.profile,
      state.personalModel.enrollment.effectiveCourseIds,
    ).visible);
  };

  const getEntriesForDate = async (dateParts) => {
    const document = await loadMonth(monthKey(dateParts));
    if (!document) return [];
    const entries = document.days[formatDateKey(dateParts)];
    return filterEntries(Array.isArray(entries) ? entries : []);
  };

  const formatLongDate = (dateParts) =>
    new Intl.DateTimeFormat("ja-JP", {
      year: "numeric",
      month: "long",
      day: "numeric",
      weekday: "long",
    }).format(toLocalDate(dateParts));

  const formatShortDate = (dateParts) => {
    const date = toLocalDate(dateParts);
    return `${dateParts.month}/${dateParts.day} ${DAY_NAMES[date.getDay()]}`;
  };

  const createBadge = (label, modifier) => {
    const badge = element("span", `timetable-entry__badge ${modifier}`, label);
    return badge;
  };

  const createEntry = (entry, compact = false) => {
    const item = element("article", compact ? "timetable-entry timetable-entry--compact" : "timetable-entry");
    const labels = element("div", "timetable-entry__labels");
    const typeLabel = kindLabel(entry.kind);
    if (typeLabel) labels.append(createBadge(typeLabel, "timetable-entry__badge--kind"));
    if (entry.status === "tentative") {
      labels.append(createBadge("予定", "timetable-entry__badge--tentative"));
    }
    if (labels.childElementCount) item.append(labels);

    const title = element(compact ? "p" : "h4", "timetable-entry__title");
    const detailUrl = courseDetailUrl(entry.courseId);
    if (detailUrl) {
      const link = element("a", "timetable-entry__link", entry.subjectName || "授業");
      link.href = detailUrl;
      link.setAttribute("aria-label", `${entry.subjectName || "授業"}の授業詳細を見る`);
      title.append(link);
    } else {
      title.textContent = entry.subjectName || "時間割項目";
    }
    item.append(title);

    const facts = [
      ["対象", [formatGrades(entry.grades, entry.gradeRaw), arrayText(entry.groupTags, "・")].filter(Boolean).join(" / ")],
      ["講師", arrayText(entry.instructors)],
      ["教室", arrayText(entry.rooms)],
    ].filter(([, value]) => value);
    if (facts.length) {
      const list = element("dl", "timetable-entry__facts");
      facts.forEach(([label, value]) => {
        const row = element("div", "timetable-entry__fact");
        row.append(element("dt", "", label), element("dd", "", value));
        list.append(row);
      });
      item.append(list);
    }
    return item;
  };

  const createMobileWeekEntry = (entry) => {
    const data = compactEntryData(entry);
    const item = element("article", "timetable-mobile-entry");
    const detailUrl = courseDetailUrl(data.courseId);
    const compact = element(
      detailUrl ? "a" : "div",
      `timetable-mobile-entry__compact${detailUrl ? " timetable-mobile-entry__compact--link" : ""}`,
    );
    if (detailUrl) {
      compact.href = detailUrl;
      compact.setAttribute("aria-label", `${data.title}の授業詳細を見る`);
    }
    const heading = element("span", "timetable-mobile-entry__heading");
    const labels = element("span", "timetable-mobile-entry__labels");
    if (data.kind) {
      labels.append(createBadge(data.kind, "timetable-entry__badge--kind"));
    }
    const title = element("span", "timetable-mobile-entry__title", data.title);
    heading.append(labels, title);
    compact.append(heading);
    if (data.meta) {
      compact.append(element("span", "timetable-mobile-entry__meta", data.meta));
    }
    if (detailUrl) {
      const arrow = element("span", "timetable-mobile-entry__arrow", "→");
      arrow.setAttribute("aria-hidden", "true");
      compact.append(arrow);
    }
    item.append(compact);
    return item;
  };

  const sortedPeriodKeys = (entries = []) => {
    const keys = new Set(Object.keys(state.periods.periods));
    entries.forEach((entry) => keys.add(String(entry.period)));
    return [...keys].sort((left, right) => Number(left) - Number(right));
  };

  const periodLabel = (key) => {
    const period = state.periods.periods[key];
    return period ? `${period.start} - ${period.end}` : "時刻情報なし";
  };

  const createPeriodHeader = (key, headingLevel = "h3") => {
    const header = element("div", "timetable-period__heading");
    header.append(element("span", "timetable-period__number", key.padStart(2, "0")));
    const text = element(headingLevel, "timetable-period__label", `${key}限`);
    text.append(element("span", "timetable-period__time", periodLabel(key)));
    header.append(text);
    return header;
  };

  const emptyState = (message) => {
    const stateNode = element("div", "empty-state timetable-empty-state");
    stateNode.append(element("p", "empty-state__title", message));
    return stateNode;
  };

  const currentDataVersion = () => ({
    site: state.siteVersion,
    timetable: state.manifest?.version || null,
  });

  const homeroomLabel = (id) => state.manifest?.homerooms?.find(
    (item) => item.id === id,
  )?.label || id;

  const refreshPersonalModel = () => {
    if (!personal || !personalUi || !state.manifest || !state.selectedDate) return;
    state.personalModel = personalUi.buildModel({
      manifest: state.manifest,
      dateKey: formatDateKey(state.selectedDate),
      courses: state.courses,
      entries: state.allEntries,
      profileLoad: state.profileLoad,
      gradeFilter: state.gradeFilter,
      categoryFilter: state.categoryFilter,
      dataVersion: currentDataVersion(),
    });
  };

  const conflictText = (conflict) => {
    const other = conflict.title || conflict.courseId;
    const slots = (conflict.slots || []).map(
      (slot) => `${DAY_NAMES[slot.weekday]}曜${slot.period}限`,
    ).join("・");
    return `${other}（${slots}）`;
  };

  const saveCurrentProfile = (manualSelectedCourseIds) => {
    const profile = state.personalModel?.profile;
    if (!profile) return false;
    const created = personal.createProfile({
      ...profile,
      manualSelectedCourseIds,
      dataVersion: currentDataVersion(),
    });
    if (!created.ok) return false;
    const saved = personal.saveProfile(state.profileStorage, created.profile);
    if (!saved.saved) {
      state.profileLoad = { status: "unavailable", profile: null, error: saved.error };
      state.displayMode = "school";
      state.interactionMessage = "このブラウザへ設定を保存できなかったため、学校全体表示へ戻しました。";
      return false;
    }
    state.profileLoad = { status: "ready", profile: created.profile, error: null };
    return true;
  };

  const candidateButton = (courseId, entry) => {
    const course = state.courses.find((item) => item.id === courseId) || {};
    const enrollmentItem = state.personalModel.enrollment.items.find(
      (item) => item.courseId === courseId,
    );
    const candidate = state.personalModel.conflicts.candidateStates.find(
      (item) => item.courseId === courseId,
    );
    const type = personalUi.courseTypePresentation(course.courseType);
    const scopeUnknown = !Array.isArray(entry.grades) || entry.grades.length === 0 ||
      entry.homeroomIds === null || !Array.isArray(entry.homeroomIds);
    const required = Boolean(enrollmentItem?.required);
    const selected = Boolean(candidate?.selected);
    const blocked = !selected && (!candidate?.selectable || scopeUnknown);
    const button = element(
      "button",
      `personal-candidate${selected ? " personal-candidate--selected" : ""}` +
        `${required ? " personal-candidate--required" : ""}` +
        `${blocked ? " personal-candidate--blocked" : ""}`,
    );
    button.type = "button";
    button.dataset.courseId = courseId;
    button.setAttribute("aria-pressed", String(selected));
    if (blocked) button.setAttribute("aria-disabled", "true");
    const heading = element("span", "personal-candidate__heading");
    heading.append(element("span", "personal-candidate__title", course.title || entry.subjectName || courseId));
    if (type.code) heading.append(element("span", `personal-candidate__type personal-candidate__type--${type.kind}`, type.code));
    button.append(heading);
    let detail = "選択する";
    if (required) detail = "必修・解除できません";
    else if (selected) detail = "選択中・押すと解除";
    else if (scopeUnknown) detail = "対象学年または組が未確認";
    else if (candidate?.conflicts?.length) {
      detail = `重複：${candidate.conflicts.map(conflictText).join("、")}`;
    }
    button.append(element("span", "personal-candidate__detail", detail));
    button.setAttribute("aria-label", `${course.title || entry.subjectName || courseId}、${detail}`);
    button.addEventListener("click", () => {
      if (scopeUnknown && !selected) {
        state.interactionMessage = `${course.title || courseId}は対象学年または所属組が未確認のため選択できません。`;
        renderPersonalUi();
        return;
      }
      const update = personalUi.updateManualSelection(state.personalModel, courseId);
      if (!update.changed) {
        state.interactionMessage = update.reason === "required-course"
          ? "必修授業は解除できません。"
          : `時間割が重複するため選択できません：${candidate?.conflicts?.map(conflictText).join("、") || "重複あり"}`;
        renderPersonalUi();
        return;
      }
      if (saveCurrentProfile(update.courseIds)) {
        state.interactionMessage = update.reason === "selected" ? "授業を選択しました。" : "授業の選択を解除しました。";
      }
      void render();
    });
    return button;
  };

  const candidateSlots = () => {
    const visible = new Set(state.personalModel.filteredCourseIds);
    const slots = new Map();
    state.personalModel.periodEntries.forEach((entry) => {
      if (entry?.kind !== "class" || !visible.has(entry.courseId)) return;
      const slot = personal.slotFromEntry(entry);
      if (!slot) return;
      const key = `${slot.weekday}:${slot.period}`;
      if (!slots.has(key)) slots.set(key, new Map());
      if (!slots.get(key).has(entry.courseId)) slots.get(key).set(entry.courseId, entry);
    });
    return slots;
  };

  const renderCandidateGrid = () => {
    const slots = candidateSlots();
    const periodKeys = [...new Set([
      ...Object.keys(state.periods.periods).map(Number),
      ...[...slots.keys()].map((key) => Number(key.split(":")[1])),
    ])].sort((left, right) => left - right);
    const weekdayCount = [...slots.keys()].some((key) => Number(key.split(":")[0]) > 5) ? 7 : 5;
    const desktop = element("div", "personal-candidate-week personal-candidate-week--desktop");
    desktop.style.setProperty("--personal-days", String(weekdayCount));
    desktop.append(element("div", "personal-candidate-week__corner", "時限"));
    for (let weekday = 1; weekday <= weekdayCount; weekday += 1) {
      desktop.append(element("div", "personal-candidate-week__day", `${DAY_NAMES[weekday]}曜日`));
    }
    periodKeys.forEach((period) => {
      desktop.append(element("div", "personal-candidate-week__period", `${period}限`));
      for (let weekday = 1; weekday <= weekdayCount; weekday += 1) {
        const cell = element("div", "personal-candidate-week__cell");
        const entries = [...(slots.get(`${weekday}:${period}`)?.entries() || [])];
        if (entries.length) entries.forEach(([courseId, entry]) => cell.append(candidateButton(courseId, entry)));
        else cell.append(element("span", "personal-candidate-week__empty", "—"));
        desktop.append(cell);
      }
    });

    const mobile = element("div", "personal-candidate-mobile");
    const selected = state.personalModel.enrollment.items;
    const selectedBox = element("div", "personal-selected-courses");
    selectedBox.append(element("h3", "", `選択中 ${selected.length}件`));
    const chips = element("div", "personal-selected-courses__chips");
    selected.forEach((item) => {
      const course = state.courses.find((value) => value.id === item.courseId);
      chips.append(element("span", "personal-selected-course", `${item.required ? "🔒 " : ""}${course?.title || item.courseId}`));
    });
    if (!selected.length) chips.append(element("span", "personal-selected-courses__empty", "まだ選択していません"));
    selectedBox.append(chips);
    mobile.append(selectedBox);

    const map = element("div", "personal-mobile-map");
    const availableKeys = [];
    periodKeys.forEach((period) => {
      for (let weekday = 1; weekday <= weekdayCount; weekday += 1) {
        const key = `${weekday}:${period}`;
        const count = slots.get(key)?.size || 0;
        if (!count) continue;
        availableKeys.push(key);
        const slotButton = element("button", "personal-mobile-map__slot", `${DAY_NAMES[weekday]} ${period}限 · ${count}件`);
        slotButton.type = "button";
        slotButton.dataset.slot = key;
        slotButton.setAttribute("aria-pressed", String(state.activeCandidateSlot === key));
        slotButton.addEventListener("click", () => {
          state.activeCandidateSlot = key;
          renderCandidateGrid();
        });
        map.append(slotButton);
      }
    });
    if (!availableKeys.includes(state.activeCandidateSlot)) state.activeCandidateSlot = availableKeys[0] || "";
    mobile.append(map);
    const focus = element("section", "personal-mobile-focus");
    if (state.activeCandidateSlot) {
      const [weekday, period] = state.activeCandidateSlot.split(":").map(Number);
      focus.append(element("h3", "", `${DAY_NAMES[weekday]}曜日 ${period}限の候補`));
      [...(slots.get(state.activeCandidateSlot)?.entries() || [])].forEach(
        ([courseId, entry]) => focus.append(candidateButton(courseId, entry)),
      );
    } else {
      focus.append(element("p", "", "現在の絞り込みに該当する授業候補はありません。"));
    }
    mobile.append(focus);
    personalGrid.replaceChildren(desktop, mobile);
  };

  const createFilterControls = (target, prefix) => {
    const gradeLabel = element("label", "personal-filter-control", "学年");
    const grade = element("select");
    grade.id = `${prefix}-grade-filter`;
    [["all", "すべて"], ["1", "1年"], ["2", "2年"], ["3", "3年"]].forEach(([value, label]) => {
      const option = element("option", "", label);
      option.value = value;
      grade.append(option);
    });
    grade.value = String(state.gradeFilter);
    gradeLabel.append(grade);
    const categoryLabel = element("label", "personal-filter-control", "分野");
    const category = element("select");
    category.id = `${prefix}-category-filter`;
    const all = element("option", "", "すべて");
    all.value = "all";
    category.append(all);
    personal.OFFICIAL_CATEGORIES.forEach((value) => {
      const option = element("option", "", value);
      option.value = value;
      category.append(option);
    });
    category.value = state.categoryFilter;
    categoryLabel.append(category);
    target.replaceChildren(gradeLabel, categoryLabel);
    return { grade, category };
  };

  const renderFilters = () => {
    const desktop = createFilterControls(desktopFilters, "desktop");
    const mobile = createFilterControls(mobileFilters, "mobile");
    const apply = (controls) => {
      state.gradeFilter = controls.grade.value === "all" ? "all" : Number(controls.grade.value);
      state.categoryFilter = controls.category.value;
      state.interactionMessage = "";
      refreshPersonalModel();
      renderPersonalUi();
    };
    desktop.grade.addEventListener("change", () => apply(desktop));
    desktop.category.addEventListener("change", () => apply(desktop));
    filterForm.onsubmit = (event) => {
      event.preventDefault();
      apply(mobile);
      filterDialog.close();
    };
    filterButton.textContent = `絞り込み：${personalUi.filterSummary({ grade: state.gradeFilter, category: state.categoryFilter })}`;
  };

  const renderPersonalUi = () => {
    refreshPersonalModel();
    const model = state.personalModel;
    const profile = model?.profile;
    const isPersonal = state.displayMode === "personal";
    personalModeButton.setAttribute("aria-pressed", String(isPersonal));
    schoolModeButton.setAttribute("aria-pressed", String(!isPersonal));
    personalSettingsButton.textContent = profile ? "設定を変更" : "自分の時間割を設定";
    personalProfileSummary.textContent = profile
      ? `${profile.grade}年 / ${homeroomLabel(profile.homeroomId)} / ${profile.term === "first" ? "前期" : "後期"}`
      : "学年と所属組を設定すると、自分に必要な授業へ絞り込めます。";

    let statusMessage = state.interactionMessage;
    if (!statusMessage && model?.profileStatus === "unavailable") {
      statusMessage = "ブラウザ保存を利用できないため、学校全体の時間割を表示しています。";
    } else if (!statusMessage && ["malformed", "unsupported", "needs-reconfiguration"].includes(model?.profileStatus)) {
      statusMessage = "保存済みの設定を現在の形式で利用できません。学校全体表示のまま、学年と所属組を再設定してください。";
    } else if (!statusMessage && model?.reason === "term-unresolved") {
      statusMessage = "表示日の期間を解決できません。以前の履修は適用せず、学校全体表示へ切り替えて確認できます。";
    } else if (!statusMessage && model?.reason === "period-reconfiguration-required") {
      statusMessage = "年度または期間が変わっています。以前の履修は適用していません。設定を更新してください。";
    } else if (!statusMessage && model?.active) {
      const stale = model.enrollment.staleManualSelectedCourseIds.length;
      const unresolved = model.conflicts.scopeDiagnostics.unknownScopedEntries.length;
      statusMessage = `${model.enrollment.effectiveCourseIds.length}授業を表示中。` +
        `${stale ? ` 以前選択した${stale}授業が現在のデータにありません。` : ""}` +
        `${unresolved ? ` 対象学年・組が未確認の時間割項目が${unresolved}件あります。` : ""}`;
    } else if (!statusMessage) {
      statusMessage = "学校全体の時間割を表示しています。初回設定は任意です。";
    }
    personalStatus.textContent = statusMessage;
    personalSelector.hidden = !(isPersonal && model?.active);
    if (!personalSelector.hidden) {
      renderFilters();
      const requiredErrors = model.conflicts.requiredConflicts;
      const conflicts = model.conflicts.enrollmentConflicts;
      if (requiredErrors.length) {
        conflictSummary.className = "personal-conflict-summary personal-conflict-summary--error";
        conflictSummary.textContent = `必修授業同士の重複が${requiredErrors.length}件あります。学校側で時間割データの確認が必要です。`;
      } else if (conflicts.length) {
        conflictSummary.className = "personal-conflict-summary personal-conflict-summary--warning";
        conflictSummary.textContent = `選択中の授業に${conflicts.length}件の重複があります。重複元の選択授業を解除してください。`;
      } else {
        conflictSummary.className = "personal-conflict-summary";
        conflictSummary.textContent = "候補を選ぶ前に、重複する曜日・時限を確認できます。";
      }
      renderCandidateGrid();
    }
  };

  const renderDay = async () => {
    const entries = await getEntriesForDate(state.selectedDate);
    dateHeading.textContent = formatLongDate(state.selectedDate);
    document.title = `${formatLongDate(state.selectedDate)}の時間割 | ClassView`;
    if (!entries.length) {
      contentRoot.replaceChildren(emptyState("この日の時間割は登録されていません。"));
      return;
    }

    const schedule = element("div", "timetable-day-schedule");
    sortedPeriodKeys(entries).forEach((key) => {
      const periodEntries = entries.filter((entry) => String(entry.period) === key);
      const section = element("section", "timetable-period");
      section.append(createPeriodHeader(key));
      const list = element("div", "timetable-period__entries");
      if (periodEntries.length) {
        periodEntries.forEach((entry) => list.append(createEntry(entry)));
      } else {
        list.append(element("p", "timetable-period__empty", "この時限の登録はありません。"));
      }
      section.append(list);
      schedule.append(section);
    });
    contentRoot.replaceChildren(schedule);
  };

  const loadWeek = async () => {
    const weekStart = startOfWeek(state.selectedDate);
    const dates = Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));
    await Promise.all([...new Set(dates.map(monthKey))].map(loadMonth));
    const entriesByDate = new Map();
    await Promise.all(
      dates.map(async (dateParts) => {
        entriesByDate.set(formatDateKey(dateParts), await getEntriesForDate(dateParts));
      }),
    );
    return { weekStart, dates, entriesByDate };
  };

  const renderWeekTable = (dates, entriesByDate, periodKeys) => {
    const wrapper = element("div", "timetable-week-desktop");
    const tableWrapper = element("div", "timetable-week-table-wrapper");
    const table = element("table", "timetable-week-table");
    table.append(element("caption", "visually-hidden", "学校全体の週間時間割"));
    const head = element("thead");
    const headRow = element("tr");
    headRow.append(element("th", "timetable-week-table__period-heading", "時限"));
    dates.forEach((dateParts) => {
      const cell = element("th", "", formatShortDate(dateParts));
      cell.scope = "col";
      headRow.append(cell);
    });
    head.append(headRow);
    table.append(head);

    const body = element("tbody");
    periodKeys.forEach((key) => {
      const row = element("tr");
      const period = element("th", "timetable-week-table__period");
      period.scope = "row";
      period.append(element("strong", "", `${key}限`), element("span", "", periodLabel(key)));
      row.append(period);
      dates.forEach((dateParts) => {
        const cell = element("td");
        const entries = (entriesByDate.get(formatDateKey(dateParts)) || []).filter(
          (entry) => String(entry.period) === key,
        );
        if (entries.length) entries.forEach((entry) => cell.append(createEntry(entry, true)));
        else cell.append(element("span", "timetable-week-table__empty", "—"));
        row.append(cell);
      });
      body.append(row);
    });
    table.append(body);
    tableWrapper.append(table);
    wrapper.append(tableWrapper);
    return wrapper;
  };

  const renderWeekMobile = (dates, entriesByDate, periodKeys) => {
    const wrapper = element("div", "timetable-week-mobile");
    const weekKey = dates.length ? formatDateKey(dates[0]) : "";
    const visibleDateKeys = dates.map(formatDateKey);
    state.mobileExpandedDateKeys = expandedDateKeysForWeek(
      state.mobileWeekKey,
      state.mobileExpandedDateKeys,
      weekKey,
      visibleDateKeys,
    );
    state.mobileWeekKey = weekKey;
    dates.forEach((dateParts) => {
      const dateKey = formatDateKey(dateParts);
      const dayEntries = entriesByDate.get(dateKey) || [];
      const panelId = `timetable-mobile-day-${dateKey}`;
      const isExpanded = state.mobileExpandedDateKeys.includes(dateKey);
      const day = element("section", "timetable-mobile-day");
      const heading = element("h3", "timetable-mobile-day__heading");
      const button = element("button", "timetable-mobile-day__toggle");
      button.type = "button";
      button.setAttribute("aria-expanded", String(isExpanded));
      button.setAttribute("aria-controls", panelId);
      const headingText = element("span", "timetable-mobile-day__heading-text");
      headingText.append(
        element(
          "span",
          "timetable-mobile-day__date",
          `${dateParts.month}/${dateParts.day} ${DAY_NAMES[toLocalDate(dateParts).getDay()]}曜日`,
        ),
        element("span", "timetable-mobile-day__count", `${dayEntries.length}件`),
      );
      const action = element(
        "span",
        "timetable-mobile-day__action",
        isExpanded ? "折りたたむ" : "開く",
      );
      action.setAttribute("aria-hidden", "true");
      button.append(headingText, action);
      heading.append(button);
      day.append(heading);

      const panel = element("div", "timetable-mobile-day__panel");
      panel.id = panelId;
      panel.hidden = !isExpanded;
      if (!dayEntries.length) {
        panel.append(element("p", "timetable-mobile-day__empty", "この日の登録はありません。"));
      } else {
        periodKeys.forEach((key) => {
          const entries = dayEntries.filter((entry) => String(entry.period) === key);
          if (!entries.length) return;
          const period = element("section", "timetable-mobile-period");
          period.append(createPeriodHeader(key, "h4"));
          const list = element("div", "timetable-mobile-period__entries");
          entries.forEach((entry) => list.append(createMobileWeekEntry(entry)));
          period.append(list);
          panel.append(period);
        });
      }
      button.addEventListener("click", () => {
        state.mobileExpandedDateKeys = toggleExpandedDateKeys(
          state.mobileExpandedDateKeys,
          dateKey,
        );
        const nextExpanded = state.mobileExpandedDateKeys.includes(dateKey);
        button.setAttribute("aria-expanded", String(nextExpanded));
        panel.hidden = !nextExpanded;
        action.textContent = nextExpanded ? "折りたたむ" : "開く";
      });
      day.append(panel);
      wrapper.append(day);
    });
    return wrapper;
  };

  const renderWeek = async () => {
    const { weekStart, dates, entriesByDate } = await loadWeek();
    const visibleDates = dates.slice(0, weekDayCount(entriesByDate, weekStart));
    const allEntries = visibleDates.flatMap((dateParts) => entriesByDate.get(formatDateKey(dateParts)) || []);
    const weekEnd = visibleDates.at(-1);
    dateHeading.textContent = `${formatLongDate(weekStart)} 〜 ${formatLongDate(weekEnd)}`;
    document.title = `${formatDateKey(weekStart)}の週の時間割 | ClassView`;
    if (!allEntries.length) {
      contentRoot.replaceChildren(emptyState("この週の時間割は登録されていません。"));
      return;
    }
    const periodKeys = sortedPeriodKeys(allEntries);
    contentRoot.replaceChildren(
      renderWeekTable(visibleDates, entriesByDate, periodKeys),
      renderWeekMobile(visibleDates, entriesByDate, periodKeys),
    );
  };

  const setLoading = () => {
    contentRoot.setAttribute("aria-busy", "true");
    contentRoot.replaceChildren(element("p", "loading", "時間割を読み込んでいます…"));
  };

  const renderError = () => {
    dateHeading.textContent = "時間割";
    contentRoot.replaceChildren(
      element("p", "error-message", "時間割データを読み込めませんでした。時間をおいて再度お試しください。"),
    );
  };

  const render = async () => {
    renderPersonalUi();
    setLoading();
    try {
      if (state.mode === "day") await renderDay();
      else await renderWeek();
    } catch (error) {
      console.error("時間割の表示に失敗しました。", error);
      renderError();
    } finally {
      contentRoot.setAttribute("aria-busy", "false");
    }
  };

  const updateNavigationLabels = () => {
    const isDay = state.mode === "day";
    pageRoot?.classList.toggle("timetable-page--week", !isDay);
    previousButton.textContent = isDay ? "← 前の日" : "← 前の週";
    todayButton.textContent = isDay ? "今日" : "今週";
    nextButton.textContent = isDay ? "次の日 →" : "次の週 →";
    dayButton.setAttribute("aria-pressed", String(isDay));
    weekButton.setAttribute("aria-pressed", String(!isDay));
  };

  const updateUrl = (replace = false) => {
    const url = new URL(window.location.href);
    url.searchParams.set("date", formatDateKey(state.selectedDate));
    if (state.mode === "week") url.searchParams.set("view", "week");
    else url.searchParams.delete("view");
    window.history[replace ? "replaceState" : "pushState"]({}, "", url);
  };

  const selectDate = (dateParts, { replace = false, updateHistory = true } = {}) => {
    if (
      state.mode === "week" &&
      state.selectedDate &&
      formatDateKey(startOfWeek(state.selectedDate)) !== formatDateKey(startOfWeek(dateParts))
    ) {
      resetMobileWeekExpansion();
    }
    state.selectedDate = dateParts;
    if (updateHistory) updateUrl(replace);
    void render();
  };

  const showUpdatedAt = () => {
    if (typeof state.manifest.updatedAt !== "string") return;
    const timestamp = new Date(state.manifest.updatedAt);
    if (Number.isNaN(timestamp.getTime())) return;
    updatedAt.textContent = `時間割データ更新：${new Intl.DateTimeFormat("ja-JP", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(timestamp)}`;
    updatedAt.hidden = false;
  };

  const initialDate = () => {
    const params = new URLSearchParams(window.location.search);
    const parsed = parseCalendarDate(params.get("date"));
    return parsed || fromDate(new Date());
  };

  const initialMode = () => {
    const params = new URLSearchParams(window.location.search);
    return params.get("view") === "week" ? "week" : "day";
  };

  dayButton.addEventListener("click", () => {
    if (state.mode === "day") return;
    state.mode = "day";
    updateNavigationLabels();
    updateUrl(true);
    void render();
  });
  weekButton.addEventListener("click", () => {
    if (state.mode === "week") return;
    state.mode = "week";
    resetMobileWeekExpansion();
    updateNavigationLabels();
    updateUrl(true);
    void render();
  });
  previousButton.addEventListener("click", () =>
    selectDate(addDays(state.selectedDate, state.mode === "day" ? -1 : -7)),
  );
  nextButton.addEventListener("click", () =>
    selectDate(addDays(state.selectedDate, state.mode === "day" ? 1 : 7)),
  );
  todayButton.addEventListener("click", () => selectDate(fromDate(new Date())));

  const updateHomeroomOptions = (selectedId = "") => {
    const grade = Number(gradeInput.value);
    const options = (state.manifest?.homerooms || []).filter((item) => item.grade === grade);
    const prompt = element("option", "", options.length ? "選択してください" : "この学年の所属組は未登録です");
    prompt.value = "";
    homeroomInput.replaceChildren(prompt);
    options.forEach((item) => {
      const option = element("option", "", item.label);
      option.value = item.id;
      homeroomInput.append(option);
    });
    homeroomInput.value = options.some((item) => item.id === selectedId) ? selectedId : "";
  };

  const openSetup = () => {
    const profile = state.personalModel?.profile;
    const period = personal.periodContextForDate(formatDateKey(state.selectedDate), state.manifest);
    gradeInput.value = profile ? String(profile.grade) : "";
    updateHomeroomOptions(profile?.homeroomId || "");
    termField.hidden = period.valid;
    termInput.required = !period.valid;
    termInput.value = period.valid ? period.currentPeriod.term : profile?.term || "";
    setupError.hidden = true;
    setupDialog.showModal();
    gradeInput.focus();
  };

  gradeInput.addEventListener("change", () => updateHomeroomOptions());
  personalSettingsButton.addEventListener("click", openSetup);
  personalModeButton.addEventListener("click", () => {
    if (!state.personalModel?.profile) {
      openSetup();
      return;
    }
    state.displayMode = "personal";
    state.interactionMessage = "";
    void render();
  });
  schoolModeButton.addEventListener("click", () => {
    state.displayMode = "school";
    state.interactionMessage = "";
    void render();
  });
  filterButton.addEventListener("click", () => {
    renderFilters();
    filterDialog.showModal();
    mobileFilters.querySelector("select")?.focus();
  });
  filterReset.addEventListener("click", () => {
    state.gradeFilter = "all";
    state.categoryFilter = "all";
    renderFilters();
    mobileFilters.querySelector("select").value = "all";
    mobileFilters.querySelectorAll("select")[1].value = "all";
  });
  document.querySelectorAll("[data-dialog-close]").forEach((button) => {
    button.addEventListener("click", () => button.closest("dialog")?.close());
  });
  setupForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const period = personal.periodContextForDate(formatDateKey(state.selectedDate), state.manifest);
    const term = period.valid ? period.currentPeriod.term : termInput.value;
    const identity = {
      academicYear: state.manifest.academicYear,
      term,
      grade: Number(gradeInput.value),
      homeroomId: homeroomInput.value,
    };
    const created = personal.createProfile({
      ...identity,
      manualSelectedCourseIds: personalUi.manualSelectionsForSettings(
        state.personalModel?.profile,
        identity,
      ),
      dataVersion: currentDataVersion(),
    });
    if (!created.ok) {
      setupError.textContent = "学年・所属組・期間を確認してください。";
      setupError.hidden = false;
      return;
    }
    const saved = personal.saveProfile(state.profileStorage, created.profile);
    if (!saved.saved) {
      setupError.textContent = "このブラウザへ設定を保存できませんでした。学校全体表示は引き続き利用できます。";
      setupError.hidden = false;
      state.profileLoad = { status: "unavailable", profile: null, error: saved.error };
      state.displayMode = "school";
      return;
    }
    state.profileLoad = { status: "ready", profile: created.profile, error: null };
    state.displayMode = "personal";
    state.interactionMessage = period.valid
      ? "設定を保存しました。"
      : "設定を保存しました。期間境界が未設定のため、個人時間割にはまだ適用していません。";
    setupDialog.close();
    void render();
  });
  window.addEventListener("popstate", () => {
    const nextSelectedDate = initialDate();
    const nextMode = initialMode();
    const weekChanged =
      state.selectedDate &&
      formatDateKey(startOfWeek(state.selectedDate)) !==
        formatDateKey(startOfWeek(nextSelectedDate));
    if (state.mode !== nextMode || (nextMode === "week" && weekChanged)) {
      resetMobileWeekExpansion();
    }
    state.selectedDate = nextSelectedDate;
    state.mode = nextMode;
    updateNavigationLabels();
    void render();
  });

  const initialize = async () => {
    state.selectedDate = initialDate();
    state.mode = initialMode();
    updateNavigationLabels();
    updateUrl(true);
    try {
      if (!personal || !personalUi) throw new Error("Personal timetable modules are unavailable");
      const manifest = await fetchJson(manifestUrl);
      if (typeof manifest?.version !== "string" || !manifest.version) {
        throw new Error("Invalid timetable manifest version");
      }
      const [periods, courseDocument, siteVersionDocument] = await Promise.all([
        fetchJson(new URL(`periods.json?v=${encodeURIComponent(manifest.version)}`, DATA_ROOT)),
        fetchJson(coursesUrl),
        fetchJson(siteVersionUrl).catch(() => ({ version: null })),
      ]);
      validateBaseData(manifest, periods);
      state.manifest = manifest;
      state.periods = periods;
      state.courses = Array.isArray(courseDocument?.courses) ? courseDocument.courses : [];
      state.siteVersion = typeof siteVersionDocument?.version === "string" ? siteVersionDocument.version : null;
      const monthlyDocuments = await Promise.all(manifest.months.map(loadMonth));
      state.allEntries = monthlyDocuments.flatMap((monthly) =>
        personal.flattenTimetableDays(monthly?.days),
      );
      const storageResult = personal.resolveBrowserStorage(global);
      state.profileStorage = storageResult.storage;
      state.profileLoad = storageResult.status === "ready"
        ? personal.loadProfile(storageResult.storage, { homerooms: manifest.homerooms })
        : { status: "unavailable", profile: null, error: storageResult.error };
      if (state.profileLoad.status === "migrated") {
        const migrationSave = personal.saveProfile(state.profileStorage, state.profileLoad.profile);
        state.profileLoad = migrationSave.saved
          ? { status: "ready", profile: state.profileLoad.profile, error: null }
          : { status: "unavailable", profile: null, error: migrationSave.error };
      }
      state.displayMode = personalUi.initialDisplayMode(state.profileLoad);
      showUpdatedAt();
      await render();
    } catch (error) {
      console.error("時間割データの読み込みに失敗しました。", error);
      renderError();
      contentRoot.setAttribute("aria-busy", "false");
    }
  };

  void initialize();
})(globalThis);
