(() => {
  "use strict";

  // 現在のHTMLファイルを基準に解決するため、GitHub Pagesの
  // リポジトリ名付きURL（/ClassView/）でも正しい場所を参照します。
  const COURSES_DATA_URL = new URL("./data/courses.json", document.baseURI);
  const listRoot = document.querySelector("#course-list");
  const resultCount = document.querySelector("#result-count");
  const keywordInput = document.querySelector("#keyword");
  const categoryFilter = document.querySelector("#category-filter");
  const styleFilter = document.querySelector("#style-filter");
  let courses = [];

  const hasText = (value) =>
    typeof value === "string" && value.trim().length > 0;

  const element = (tagName, className, text) => {
    const node = document.createElement(tagName);
    if (className) node.className = className;
    if (hasText(text)) node.textContent = text.trim();
    return node;
  };

  const normalizeText = (value) =>
    String(value ?? "")
      .normalize("NFKC")
      .toLocaleLowerCase("ja")
      .replace(/\s+/g, " ")
      .trim();

  const searchableText = (course) =>
    normalizeText(
      [
        course.title,
        course.summary,
        course.category,
        course.learningGoals,
        course.outcomes,
        ...(Array.isArray(course.topics) ? course.topics : []),
      ].join(" ")
    );

  const createOption = (value) => {
    const option = element("option", "", value);
    option.value = value;
    return option;
  };

  const populateFilter = (select, values) => {
    const uniqueValues = [...new Set(values.filter(hasText))].sort((a, b) =>
      a.localeCompare(b, "ja")
    );
    uniqueValues.forEach((value) => select.append(createOption(value)));
  };

  const createFact = (label, value) => {
    if (!hasText(value)) return null;
    const item = element("div", "course-card__fact");
    item.append(element("dt", "", label));
    item.append(element("dd", "", value));
    return item;
  };

  const createCourseCard = (course) => {
    const card = element("article", "course-card");
    card.append(element("p", "course-card__category", course.category));
    card.append(element("h3", "", course.title || "名称未設定の授業"));

    if (hasText(course.summary)) {
      card.append(element("p", "course-card__summary", course.summary));
    }

    const facts = [
      createFact("授業形式", course.classStyle),
      createFact("対象学年", course.grade),
    ].filter(Boolean);

    if (facts.length) {
      const list = element("dl", "course-card__facts");
      facts.forEach((fact) => list.append(fact));
      card.append(list);
    }

    const link = element("a", "course-card__link", "詳細を見る");
    link.href = `course.html?id=${encodeURIComponent(course.id)}`;
    link.setAttribute("aria-label", `${course.title || "授業"}の詳細を見る`);
    card.append(link);
    return card;
  };

  const renderCourses = (filteredCourses) => {
    resultCount.textContent = `${filteredCourses.length}件の授業を表示しています`;
    listRoot.setAttribute("aria-busy", "false");

    if (!filteredCourses.length) {
      const emptyState = element("div", "empty-state");
      emptyState.append(element("p", "empty-state__title", "条件に一致する授業がありません。"));
      emptyState.append(
        element("p", "", "検索語や絞り込み条件を変更してください。")
      );
      listRoot.replaceChildren(emptyState);
      return;
    }

    const fragment = document.createDocumentFragment();
    filteredCourses.forEach((course) => fragment.append(createCourseCard(course)));
    listRoot.replaceChildren(fragment);
  };

  const applyFilters = () => {
    const terms = normalizeText(keywordInput.value).split(" ").filter(Boolean);
    const category = categoryFilter.value;
    const classStyle = styleFilter.value;

    const filteredCourses = courses.filter((course) => {
      const text = searchableText(course);
      const matchesKeyword = terms.every((term) => text.includes(term));
      const matchesCategory = !category || course.category === category;
      const matchesStyle = !classStyle || course.classStyle === classStyle;
      return matchesKeyword && matchesCategory && matchesStyle;
    });

    renderCourses(filteredCourses);
  };

  const showLoadError = () => {
    resultCount.textContent = "授業を表示できませんでした";
    listRoot.setAttribute("aria-busy", "false");
    listRoot.replaceChildren(
      element(
        "p",
        "error-message",
        "授業情報を読み込めませんでした。時間をおいて再度お試しください。"
      )
    );
  };

  const loadCourses = async () => {
    try {
      const response = await fetch(COURSES_DATA_URL, { cache: "no-store" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      courses = Array.isArray(data.courses) ? data.courses : [];

      populateFilter(categoryFilter, courses.map((course) => course.category));
      populateFilter(styleFilter, courses.map((course) => course.classStyle));
      applyFilters();
    } catch (error) {
      console.error("授業一覧の読み込みに失敗しました。", error);
      showLoadError();
    }
  };

  keywordInput.addEventListener("input", applyFilters);
  keywordInput.addEventListener("search", applyFilters);
  keywordInput.addEventListener("change", applyFilters);
  categoryFilter.addEventListener("change", applyFilters);
  styleFilter.addEventListener("change", applyFilters);

  loadCourses();
})();
