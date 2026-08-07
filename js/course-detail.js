(() => {
  "use strict";

  // 現在のHTMLファイルを基準に解決するため、GitHub Pagesの
  // リポジトリ名付きURL（/ClassView/）でも正しい場所を参照します。
  const COURSES_DATA_URL = new URL("./data/courses.json", document.baseURI);
  const root = document.querySelector("#course");

  const hasText = (value) =>
    typeof value === "string" && value.trim().length > 0;

  const element = (tagName, className, text) => {
    const node = document.createElement(tagName);
    if (className) node.className = className;
    if (hasText(text)) node.textContent = text.trim();
    return node;
  };

  const createCourseHeader = (course) => {
    const header = element("header", "course-header");
    header.append(element("p", "course-header__eyebrow", "Course details"));
    header.append(element("h1", "", course.title || "授業詳細"));

    if (hasText(course.summary)) {
      header.append(element("p", "course-summary", course.summary));
    }

    const facts = [
      ["分野", course.category],
      ["対象学年", course.grade],
      ["授業形式", course.classStyle],
      ["区分", course.courseType],
      ["前提知識", course.prerequisites],
    ].filter(([, value]) => hasText(value));

    if (facts.length) {
      const list = element("dl", "course-facts");
      facts.forEach(([label, value]) => {
        const item = element("div", "course-facts__item");
        item.append(element("dt", "", label));
        item.append(element("dd", "", value));
        list.append(item);
      });
      header.append(list);
    }

    return header;
  };

  const createPrimaryInfo = (course) => {
    const items = [
      ["01", "この授業で学ぶこと", course.learningGoals],
      ["02", "授業の進め方", course.classFlow],
      ["03", "授業後にできるようになること", course.outcomes],
    ].filter(([, , value]) => hasText(value));

    if (!items.length) return null;

    const section = element("section", "primary-info");
    section.setAttribute("aria-label", "授業の主要情報");

    items.forEach(([number, heading, body]) => {
      const item = element("article", "primary-info__item");
      item.append(element("span", "primary-info__number", number));
      item.append(element("h2", "", heading));
      item.append(element("p", "", body));
      section.append(item);
    });

    return section;
  };

  const createListSection = (heading, items) => {
    const validItems = Array.isArray(items) ? items.filter(hasText) : [];
    if (!validItems.length) return null;

    const section = element("section", "content-section");
    section.append(element("h3", "", heading));
    const list = element("ul", "content-list");
    validItems.forEach((item) => list.append(element("li", "", item)));
    section.append(list);
    return section;
  };

  const createTextSection = (heading, body) => {
    if (!hasText(body)) return null;
    const section = element("section", "content-section");
    section.append(element("h3", "", heading));
    section.append(element("p", "", body));
    return section;
  };

  const createScheduleSection = (schedule) => {
    const validItems = Array.isArray(schedule)
      ? schedule.filter(
          (item) => item && (hasText(item.title) || hasText(item.description))
        )
      : [];
    if (!validItems.length) return null;

    const section = element("section", "content-section");
    section.append(element("h3", "", "授業回ごとの内容"));
    const list = element("ol", "schedule-list");

    validItems.forEach((item, index) => {
      const row = element("li");
      row.append(
        element("span", "schedule-list__session", item.session || `第${index + 1}回`)
      );
      const detail = element("p", "schedule-list__detail");
      if (hasText(item.title)) detail.append(element("strong", "", item.title));
      if (hasText(item.title) && hasText(item.description)) {
        detail.append(document.createTextNode(" — "));
      }
      if (hasText(item.description)) {
        detail.append(document.createTextNode(item.description.trim()));
      }
      row.append(detail);
      list.append(row);
    });

    section.append(list);
    return section;
  };

  const createImageSection = (images) => {
    const validImages = Array.isArray(images)
      ? images.filter((image) => image && hasText(image.src))
      : [];
    if (!validImages.length) return null;

    const section = element("section", "content-section");
    section.append(element("h3", "", "授業風景"));
    const grid = element("div", "image-grid");

    validImages.forEach((image) => {
      const figure = element("figure", "course-image");
      const img = element("img");
      img.src = image.src.trim();
      img.alt = hasText(image.alt) ? image.alt.trim() : "授業風景";
      img.loading = "lazy";
      figure.append(img);
      if (hasText(image.caption)) {
        figure.append(element("figcaption", "", image.caption));
      }
      grid.append(figure);
    });

    section.append(grid);
    return section;
  };

  const createSupplementaryInfo = (course) => {
    const sections = [
      createListSection("主な学習内容", course.topics),
      createListSection("使用するソフトウェアや教材", course.tools),
      createListSection("課題や制作物の例", course.assignments),
      createScheduleSection(course.schedule),
      createImageSection(course.images),
      createTextSection("向いている学生", course.suitableFor),
    ].filter(Boolean);

    if (!sections.length) return null;

    const wrapper = element("div", "supplementary");
    wrapper.append(element("h2", "supplementary__heading", "授業について詳しく"));
    sections.forEach((section) => wrapper.append(section));
    return wrapper;
  };

  const renderCourse = (course) => {
    const fragment = document.createDocumentFragment();
    fragment.append(createCourseHeader(course));

    const primary = createPrimaryInfo(course);
    if (primary) fragment.append(primary);

    const supplementary = createSupplementaryInfo(course);
    if (supplementary) fragment.append(supplementary);

    root.setAttribute("aria-busy", "false");
    root.replaceChildren(fragment);
    document.title = `${course.title || "授業詳細"} | ClassView`;
  };

  const createReturnLink = () => {
    const link = element("a", "text-link", "授業一覧へ戻る");
    link.href = "index.html";
    return link;
  };

  const renderNotFound = () => {
    const section = element("section", "not-found");
    section.append(element("p", "page-eyebrow", "Course not found"));
    section.append(element("h1", "", "授業が見つかりません"));
    section.append(
      element("p", "", "指定された授業は存在しないか、URLが正しくありません。")
    );
    section.append(createReturnLink());
    root.setAttribute("aria-busy", "false");
    root.replaceChildren(section);
    document.title = "授業が見つかりません | ClassView";
  };

  const renderLoadError = () => {
    const section = element("section", "not-found");
    section.append(element("h1", "", "授業情報を読み込めませんでした"));
    section.append(
      element("p", "error-message", "時間をおいて再度お試しください。")
    );
    section.append(createReturnLink());
    root.setAttribute("aria-busy", "false");
    root.replaceChildren(section);
  };

  const loadCourse = async () => {
    const courseId = new URLSearchParams(window.location.search).get("id");

    try {
      const response = await fetch(COURSES_DATA_URL, { cache: "no-store" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      const courses = Array.isArray(data.courses) ? data.courses : [];
      const course = courses.find((item) => item.id === courseId);

      if (!course) {
        renderNotFound();
        return;
      }

      renderCourse(course);
    } catch (error) {
      console.error("授業情報の読み込みに失敗しました。", error);
      renderLoadError();
    }
  };

  loadCourse();
})();
