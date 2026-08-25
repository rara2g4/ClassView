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

  const initialExpandedDateKey = (dates, selectedDate, todayDate) => {
    const dateKeys = Array.isArray(dates) ? dates.map(formatDateKey) : [];
    const selectedKey = selectedDate ? formatDateKey(selectedDate) : "";
    if (dateKeys.includes(selectedKey)) return selectedKey;
    const todayKey = todayDate ? formatDateKey(todayDate) : "";
    if (dateKeys.includes(todayKey)) return todayKey;
    return dateKeys[0] || "";
  };

  const toggleExpandedDateKeys = (dateKeys, targetKey) => {
    const next = new Set(Array.isArray(dateKeys) ? dateKeys : []);
    if (next.has(targetKey)) next.delete(targetKey);
    else next.add(targetKey);
    return [...next];
  };

  const api = {
    addDays,
    compactEntryData,
    formatDateKey,
    formatGrades,
    initialExpandedDateKey,
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
  const contentRoot = document.querySelector("#timetable-content");
  const dateHeading = document.querySelector("#timetable-date-heading");
  const updatedAt = document.querySelector("#timetable-updated-at");
  const dayButton = document.querySelector("#day-view-button");
  const weekButton = document.querySelector("#week-view-button");
  const previousButton = document.querySelector("#previous-date-button");
  const todayButton = document.querySelector("#today-button");
  const nextButton = document.querySelector("#next-date-button");
  const pageRoot = document.querySelector(".timetable-page");

  const state = {
    mode: "day",
    selectedDate: null,
    manifest: null,
    periods: null,
    monthCache: new Map(),
  };

  const element = (tagName, className = "", text = "") => {
    const node = document.createElement(tagName);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  };

  const arrayText = joinTextValues;

  const fetchJson = async (url) => {
    const response = await fetch(url, { cache: "no-store" });
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
        fetchJson(new URL(`${key}.json`, DATA_ROOT)).then((document) => {
          if (!document || document.yearMonth !== key || typeof document.days !== "object") {
            throw new Error(`Invalid monthly timetable: ${key}`);
          }
          return document;
        }),
      );
    }
    return state.monthCache.get(key);
  };

  const filterEntries = (entries) => entries;

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
    if (typeof entry.courseId === "string" && entry.courseId) {
      const link = element("a", "timetable-entry__link", entry.subjectName || "授業");
      link.href = `course.html?id=${encodeURIComponent(entry.courseId)}`;
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
    const details = element("details", "timetable-mobile-entry__details");
    const summary = element("summary", "timetable-mobile-entry__summary");
    const heading = element("span", "timetable-mobile-entry__heading");
    const labels = element("span", "timetable-mobile-entry__labels");
    if (data.kind) {
      labels.append(createBadge(data.kind, "timetable-entry__badge--kind"));
    }
    heading.append(labels, element("span", "timetable-mobile-entry__title", data.title));
    summary.append(heading);
    if (data.meta) {
      summary.append(element("span", "timetable-mobile-entry__meta", data.meta));
    }
    details.append(summary);

    const expanded = element("div", "timetable-mobile-entry__expanded");
    const facts = [
      ["対象", data.audience],
      ["講師", data.instructor],
      ["教室", data.room],
    ].filter(([, value]) => value);
    if (facts.length) {
      const list = element("dl", "timetable-mobile-entry__facts");
      facts.forEach(([label, value]) => {
        const row = element("div", "timetable-mobile-entry__fact");
        row.append(element("dt", "", label), element("dd", "", value));
        list.append(row);
      });
      expanded.append(list);
    }
    if (data.courseId) {
      const link = element("a", "timetable-mobile-entry__link", "授業詳細を見る");
      link.href = `course.html?id=${encodeURIComponent(data.courseId)}`;
      link.setAttribute("aria-label", `${data.title}の授業詳細を見る`);
      expanded.append(link);
    }
    details.append(expanded);
    item.append(details);
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
    const initiallyExpanded = initialExpandedDateKey(
      dates,
      state.selectedDate,
      fromDate(new Date()),
    );
    let expandedDateKeys = initiallyExpanded ? [initiallyExpanded] : [];
    dates.forEach((dateParts) => {
      const dateKey = formatDateKey(dateParts);
      const dayEntries = entriesByDate.get(dateKey) || [];
      const panelId = `timetable-mobile-day-${dateKey}`;
      const isExpanded = dateKey === initiallyExpanded;
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
        expandedDateKeys = toggleExpandedDateKeys(expandedDateKeys, dateKey);
        const nextExpanded = expandedDateKeys.includes(dateKey);
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
    window.history[replace ? "replaceState" : "pushState"]({}, "", url);
  };

  const selectDate = (dateParts, { replace = false, updateHistory = true } = {}) => {
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

  dayButton.addEventListener("click", () => {
    if (state.mode === "day") return;
    state.mode = "day";
    updateNavigationLabels();
    void render();
  });
  weekButton.addEventListener("click", () => {
    if (state.mode === "week") return;
    state.mode = "week";
    updateNavigationLabels();
    void render();
  });
  previousButton.addEventListener("click", () =>
    selectDate(addDays(state.selectedDate, state.mode === "day" ? -1 : -7)),
  );
  nextButton.addEventListener("click", () =>
    selectDate(addDays(state.selectedDate, state.mode === "day" ? 1 : 7)),
  );
  todayButton.addEventListener("click", () => selectDate(fromDate(new Date())));
  window.addEventListener("popstate", () => {
    state.selectedDate = initialDate();
    void render();
  });

  const initialize = async () => {
    state.selectedDate = initialDate();
    updateNavigationLabels();
    updateUrl(true);
    try {
      const [manifest, periods] = await Promise.all([
        fetchJson(manifestUrl),
        fetchJson(periodsUrl),
      ]);
      validateBaseData(manifest, periods);
      state.manifest = manifest;
      state.periods = periods;
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
