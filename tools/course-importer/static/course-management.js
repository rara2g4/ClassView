(() => {
  "use strict";

  const Editor = window.CourseEditor;
  const state = {
    config: null,
    catalog: { published: [], archived: [] },
    tab: "published",
    mode: "",
    source: "",
    originalId: "",
    expectedHash: "",
    course: null,
    originalCourse: null,
    pendingOperation: null,
  };

  const SCALAR_GROUPS = [
    {
      heading: "基本情報",
      fields: [
        ["id", "授業ID", "short"],
        ["title", "授業名", "short"],
        ["summary", "一覧用概要", "long"],
        ["category", "分野", "short"],
        ["grade", "対象学年", "short"],
        ["academicYear", "年度", "short"],
        ["instructor", "講師名", "short"],
        ["courseType", "区分", "short"],
        ["classStyle", "授業形式", "short"],
        ["prerequisites", "前提知識", "long"],
      ],
    },
    {
      heading: "授業の内容",
      fields: [
        ["learningGoals", "授業概要・到達目標", "long"],
        ["classFlow", "授業の進め方", "long"],
        ["outcomes", "身につく知識・できるようになること", "long"],
        ["suitableFor", "向いている学生", "long"],
      ],
    },
  ];
  const STRING_ARRAY_FIELDS = [
    ["topics", "主な学習内容"],
    ["tools", "使用するソフトウェアや教材"],
    ["assignments", "課題・制作物"],
  ];
  const ALL_FIELDS = [
    ...SCALAR_GROUPS.flatMap((group) => group.fields.map(([field]) => field)),
    ...STRING_ARRAY_FIELDS.map(([field]) => field),
    "schedule",
    "images",
  ];
  const FIELD_LABELS = Object.fromEntries([
    ...SCALAR_GROUPS.flatMap((group) => group.fields.map(([field, label]) => [field, label])),
    ...STRING_ARRAY_FIELDS.map(([field, label]) => [field, label]),
    ["schedule", "授業回ごとの内容"],
    ["images", "授業風景・画像"],
  ]);

  const $ = (selector) => document.querySelector(selector);
  const list = $("#management-list");
  const searchInput = $("#management-search");
  const listHeading = $("#course-list-heading");
  const resultCount = $("#management-result-count");
  const managementStatus = $("#management-status");
  const editorSection = $("#management-editor-section");
  const editorHeading = $("#management-editor-heading");
  const editorDescription = $("#management-editor-description");
  const formIntro = $("#management-form-intro");
  const editorFields = $("#management-editor-fields");
  const previewContent = $("#management-preview-content");
  const diffSection = $("#management-diff");
  const diffSummary = $("#management-diff-summary");
  const diffList = $("#management-diff-list");
  const rolloverNotice = $("#rollover-notice");
  const saveButton = $("#management-save-button");
  const saveStatus = $("#management-save-status");
  const cancelButton = $("#management-editor-cancel");
  const confirmDialog = $("#management-confirm-dialog");
  const dialogHeading = $("#management-dialog-heading");
  const dialogMessage = $("#management-dialog-message");
  const dialogCourse = $("#management-dialog-course");
  const dialogWarning = $("#management-dialog-warning");
  const dialogConfirm = $("#management-dialog-confirm");

  const hasText = (value) => typeof value === "string" && value.trim().length > 0;
  const normalize = (value) => String(value ?? "").normalize("NFKC").toLocaleLowerCase("ja");
  const clone = (value) => Editor.clone(value);

  const addText = (parent, tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    node.textContent = String(text ?? "");
    parent.append(node);
    return node;
  };

  const setStatus = (element, message = "", type = "") => {
    element.textContent = message;
    element.className = `status${type ? ` is-${type}` : ""}`;
  };

  const requestJson = async (url, options = {}) => {
    const response = await fetch(url, options);
    let payload;
    try {
      payload = await response.json();
    } catch (_error) {
      payload = { error: "サーバーから正しい応答を受け取れませんでした。" };
    }
    if (!response.ok) throw new Error(payload.error || `HTTP ${response.status}`);
    return payload;
  };

  const formatAcademicYear = (value) => {
    if (!hasText(value)) return "年度未設定";
    const text = value.trim();
    return text.endsWith("年度") ? text : `${text}年度`;
  };

  const courseSearchText = (course) => normalize([
    course.title,
    course.id,
    course.academicYear,
    course.instructor,
    course.category,
  ].filter(Boolean).join(" "));

  const renderCatalog = () => {
    const courses = state.catalog[state.tab] || [];
    const query = normalize(searchInput.value.trim());
    const visible = query
      ? courses.filter((course) => courseSearchText(course).includes(query))
      : courses;

    $("#published-count").textContent = state.catalog.published.length;
    $("#archived-count").textContent = state.catalog.archived.length;
    listHeading.textContent = state.tab === "published" ? "公開中の授業" : "アーカイブ済み授業";
    resultCount.textContent = `${visible.length}件を表示しています`;
    list.replaceChildren();

    if (!visible.length) {
      addText(
        list,
        "p",
        "management-empty",
        query ? "条件に一致する授業がありません。" : "授業はまだありません。",
      );
      return;
    }

    visible.forEach((course) => {
      const article = document.createElement("article");
      article.className = "management-card";
      const main = document.createElement("div");
      main.className = "management-card__main";
      addText(main, "h3", "", course.title || "授業名未設定");
      const facts = document.createElement("dl");
      facts.className = "management-card__facts";
      [
        ["年度", formatAcademicYear(course.academicYear)],
        ["講師", hasText(course.instructor) ? course.instructor.trim() : "未設定"],
        ["ID", course.id],
      ].forEach(([label, value]) => {
        const row = document.createElement("div");
        addText(row, "dt", "", label);
        addText(row, "dd", label === "ID" ? "management-card__id" : "", value);
        facts.append(row);
      });
      main.append(facts);

      const actions = document.createElement("div");
      actions.className = "management-card__actions";
      const actionDefinitions = state.tab === "published"
        ? [
          ["edit", "編集", "management-action"],
          ["rollover", "次年度へ引き継ぐ", "management-action"],
          ["archive", "アーカイブ", "management-action management-action--muted"],
        ]
        : [
          ["view", "内容を見る", "management-action"],
          ["restore", "公開授業へ戻す", "management-action"],
          ["delete", "完全削除", "management-action management-action--danger"],
        ];
      actionDefinitions.forEach(([action, label, className]) => {
        const button = addText(actions, "button", className, label);
        button.type = "button";
        button.dataset.managementAction = action;
        button.dataset.courseId = course.id;
        button.dataset.courseHash = course.hash;
      });
      article.append(main, actions);
      list.append(article);
    });
  };

  const loadCatalog = async (successMessage = "") => {
    setStatus(managementStatus, "授業情報を読み込んでいます…");
    try {
      state.catalog = await requestJson("/api/manage/courses");
      renderCatalog();
      setStatus(managementStatus, successMessage, successMessage ? "success" : "");
    } catch (error) {
      list.replaceChildren();
      addText(list, "p", "management-empty", "授業情報を読み込めませんでした。");
      setStatus(managementStatus, error.message, "error");
    }
  };

  const appendSchemaHelp = (container, field) => {
    const description = state.config.schema.properties?.[field]?.description;
    if (description) addText(container, "p", "editor-field__help", description);
  };

  const fieldHeader = (field, label, id) => {
    const header = document.createElement("div");
    header.className = "editor-field__header";
    const labelNode = addText(header, "label", "", label);
    labelNode.htmlFor = id;
    if ((state.config.schema.required || []).includes(field)) {
      const mark = addText(labelNode, "span", "required-mark", "必須");
      mark.setAttribute("aria-label", "必須項目");
    }
    return header;
  };

  const isViewMode = () => state.mode === "view";

  const renderScalarField = (field, label, control) => {
    const wrapper = document.createElement("div");
    wrapper.className = "editor-field";
    const id = `management-${field}`;
    wrapper.append(fieldHeader(field, label, id));
    const input = document.createElement(control === "long" ? "textarea" : "input");
    input.id = id;
    input.dataset.managementField = field;
    input.value = state.course[field] ?? "";
    if (control === "long") input.rows = field === "learningGoals" ? 6 : 3;
    else input.type = "text";
    const readOnly = isViewMode() || (field === "id" && state.mode !== "rollover");
    input.readOnly = readOnly;
    if (readOnly) input.setAttribute("aria-readonly", "true");
    if (field === "id" && state.mode === "rollover") {
      input.pattern = window.CLASSVIEW_ID_PATTERN || "";
      input.autocomplete = "off";
      input.spellcheck = false;
    }
    const suggestions = state.config.suggestions?.[field] || [];
    if (suggestions.length && !readOnly) {
      const listId = `management-suggestions-${field}`;
      input.setAttribute("list", listId);
      const datalist = document.createElement("datalist");
      datalist.id = listId;
      suggestions.forEach((value) => {
        const option = document.createElement("option");
        option.value = value;
        datalist.append(option);
      });
      wrapper.append(input, datalist);
    } else {
      wrapper.append(input);
    }
    appendSchemaHelp(wrapper, field);
    return wrapper;
  };

  const renderStringArray = (field, label) => {
    const wrapper = document.createElement("section");
    wrapper.className = "editor-field editor-array";
    const heading = addText(wrapper, "h5", "management-array-heading", label);
    heading.id = `management-${field}-heading`;
    const items = Array.isArray(state.course[field]) ? state.course[field] : [];
    if (!items.length) addText(wrapper, "p", "editor-empty", "項目はありません。");
    items.forEach((value, index) => {
      const row = document.createElement("div");
      row.className = "array-row";
      const input = document.createElement("input");
      input.type = "text";
      input.value = value;
      input.readOnly = isViewMode();
      input.dataset.managementArrayField = field;
      input.dataset.index = String(index);
      input.setAttribute("aria-label", `${label} ${index + 1}`);
      row.append(input);
      if (!isViewMode()) {
        const remove = addText(row, "button", "remove-button", "削除");
        remove.type = "button";
        remove.dataset.managementRemove = field;
        remove.dataset.index = String(index);
      }
      wrapper.append(row);
    });
    if (!isViewMode()) {
      const add = addText(wrapper, "button", "add-button", "＋ 項目を追加");
      add.type = "button";
      add.dataset.managementAdd = field;
    }
    appendSchemaHelp(wrapper, field);
    return wrapper;
  };

  const renderObjectArray = (field, label, definitions) => {
    const wrapper = document.createElement("section");
    wrapper.className = "editor-field editor-array";
    addText(wrapper, "h5", "management-array-heading", label);
    const items = Array.isArray(state.course[field]) ? state.course[field] : [];
    if (!items.length) addText(wrapper, "p", "editor-empty", "項目はありません。");
    items.forEach((item, index) => {
      const card = document.createElement("fieldset");
      card.className = "object-row";
      addText(card, "legend", "", `${label} ${index + 1}`);
      definitions.forEach(([key, fieldLabel, long]) => {
        const fieldWrapper = document.createElement("div");
        fieldWrapper.className = "object-row__field";
        const id = `management-${field}-${index}-${key}`;
        const labelNode = addText(fieldWrapper, "label", "", fieldLabel);
        labelNode.htmlFor = id;
        const input = long ? document.createElement("textarea") : document.createElement("input");
        input.id = id;
        if (!long) input.type = "text";
        else input.rows = 2;
        input.value = item?.[key] ?? "";
        input.readOnly = isViewMode();
        input.dataset.managementObjectField = field;
        input.dataset.index = String(index);
        input.dataset.key = key;
        fieldWrapper.append(input);
        card.append(fieldWrapper);
      });
      if (!isViewMode()) {
        const remove = addText(card, "button", "remove-button", `${label}を削除`);
        remove.type = "button";
        remove.dataset.managementRemove = field;
        remove.dataset.index = String(index);
      }
      wrapper.append(card);
    });
    if (!isViewMode()) {
      const add = addText(wrapper, "button", "add-button", `＋ ${label}を追加`);
      add.type = "button";
      add.dataset.managementAdd = field;
    }
    appendSchemaHelp(wrapper, field);
    return wrapper;
  };

  const renderEditor = () => {
    const fragment = document.createDocumentFragment();
    SCALAR_GROUPS.forEach((group) => {
      const section = document.createElement("section");
      section.className = "editor-group";
      addText(section, "h4", "", group.heading);
      group.fields.forEach(([field, label, control]) => {
        section.append(renderScalarField(field, label, control));
      });
      fragment.append(section);
    });
    const arrays = document.createElement("section");
    arrays.className = "editor-group";
    addText(arrays, "h4", "", "一覧・授業回");
    STRING_ARRAY_FIELDS.forEach(([field, label]) => arrays.append(renderStringArray(field, label)));
    arrays.append(
      renderObjectArray("schedule", "授業回", [
        ["session", "授業回", false],
        ["title", "見出し・内容", false],
        ["description", "詳しい説明", true],
      ]),
      renderObjectArray("images", "画像", [
        ["src", "画像パス・URL", false],
        ["alt", "代替テキスト", false],
        ["caption", "説明", false],
      ]),
    );
    fragment.append(arrays);
    editorFields.replaceChildren(fragment);
  };

  const addTextSection = (parent, heading, body) => {
    if (!hasText(body)) return;
    const section = document.createElement("section");
    section.className = "preview-section";
    addText(section, "h5", "", heading);
    addText(section, "p", "", body.trim());
    parent.append(section);
  };

  const addListSection = (parent, heading, items) => {
    const values = Array.isArray(items) ? items.filter(hasText) : [];
    if (!values.length) return;
    const section = document.createElement("section");
    section.className = "preview-section";
    addText(section, "h5", "", heading);
    const itemList = document.createElement("ul");
    values.forEach((value) => addText(itemList, "li", "", value.trim()));
    section.append(itemList);
    parent.append(section);
  };

  const formatSessionLabel = (session, index) => {
    if (!hasText(session)) return `第${index + 1}回`;
    const value = session.trim();
    if (/^第.+回$/.test(value)) return value;
    const match = value.match(/^(\d+)(?:\s*[〜～~-]\s*(\d+))?$/);
    if (!match) return value;
    return match[2] ? `第${match[1]}〜${match[2]}回` : `第${match[1]}回`;
  };

  const renderPreview = () => {
    const course = Editor.toCourseJson(state.course, state.config.template);
    const article = document.createElement("article");
    article.className = "preview-course";
    addText(article, "h4", "", course.title || "授業名が未入力です");
    if (hasText(course.summary)) addText(article, "p", "preview-summary", course.summary.trim());
    const facts = [
      ["分野", course.category],
      ["対象学年", course.grade],
      ["年度", hasText(course.academicYear) ? formatAcademicYear(course.academicYear) : ""],
      ["講師", course.instructor],
      ["授業形式", course.classStyle],
      ["区分", course.courseType],
      ["前提知識", course.prerequisites],
    ].filter(([, value]) => hasText(value));
    if (facts.length) {
      const factList = document.createElement("dl");
      factList.className = "preview-facts";
      facts.forEach(([label, value]) => {
        const row = document.createElement("div");
        addText(row, "dt", "", label);
        addText(row, "dd", "", value.trim());
        factList.append(row);
      });
      article.append(factList);
    }
    addTextSection(article, "授業概要・到達目標", course.learningGoals);
    addTextSection(article, "授業の進め方", course.classFlow);
    addTextSection(article, "身につく知識・できるようになること", course.outcomes);
    addListSection(article, "主な学習内容", course.topics);
    addListSection(article, "使用するソフトウェアや教材", course.tools);
    addListSection(article, "課題や制作物の例", course.assignments);
    const schedule = Array.isArray(course.schedule)
      ? course.schedule.filter((item) => item && (hasText(item.title) || hasText(item.description)))
      : [];
    if (schedule.length) {
      const section = document.createElement("section");
      section.className = "preview-section";
      addText(section, "h5", "", "授業回ごとの内容");
      const scheduleList = document.createElement("ul");
      scheduleList.className = "preview-schedule";
      schedule.forEach((item, index) => {
        const row = document.createElement("li");
        addText(row, "span", "preview-schedule__session", formatSessionLabel(item.session, index));
        const content = document.createElement("div");
        content.className = "preview-schedule__content";
        if (hasText(item.title)) addText(content, "strong", "", item.title.trim());
        if (hasText(item.description)) addText(content, "p", "", item.description.trim());
        row.append(content);
        scheduleList.append(row);
      });
      section.append(scheduleList);
      article.append(section);
    }
    addTextSection(article, "向いている学生", course.suitableFor);
    previewContent.replaceChildren(article);
  };

  const shortValue = (value) => {
    if (value === null || value === undefined || value === "") return "未入力";
    const text = Array.isArray(value) ? `${value.length}項目` : String(value);
    return text.length > 42 ? `${text.slice(0, 42)}…` : text;
  };

  const renderDiff = () => {
    if (isViewMode()) {
      diffSection.hidden = true;
      return;
    }
    diffSection.hidden = false;
    const current = Editor.toCourseJson(state.course, state.config.template);
    const changed = ALL_FIELDS.filter(
      (field) => JSON.stringify(current[field]) !== JSON.stringify(state.originalCourse[field]),
    );
    diffList.replaceChildren();
    if (!changed.length) {
      diffSummary.textContent = "変更はありません。";
      return;
    }
    diffSummary.textContent = `${changed.length}項目に変更があります。`;
    changed.forEach((field) => {
      const oldValue = state.originalCourse[field];
      const newValue = current[field];
      const item = document.createElement("li");
      const label = FIELD_LABELS[field] || field;
      if (Array.isArray(oldValue) || Array.isArray(newValue)) {
        const oldItems = Array.isArray(oldValue) ? oldValue : [];
        const newItems = Array.isArray(newValue) ? newValue : [];
        const total = Math.max(oldItems.length, newItems.length);
        let changedCount = 0;
        for (let index = 0; index < total; index += 1) {
          if (JSON.stringify(oldItems[index]) !== JSON.stringify(newItems[index])) changedCount += 1;
        }
        item.textContent = `${label}：${changedCount}項目変更（${oldItems.length}件 → ${newItems.length}件）`;
      } else {
        item.textContent = `${label}：${shortValue(oldValue)} → ${shortValue(newValue)}`;
      }
      diffList.append(item);
    });
  };

  const refreshEditorViews = () => {
    renderPreview();
    renderDiff();
    setStatus(saveStatus);
  };

  const openEditor = (mode, payload, source = "published") => {
    state.mode = mode;
    state.source = source;
    state.course = Editor.normalizeCourse(payload.course, state.config.template);
    state.originalCourse = Editor.normalizeCourse(
      payload.original || payload.course,
      state.config.template
    );
    state.originalId = (payload.original || payload.course).id;
    state.expectedHash = payload.originalHash || payload.hash;
    rolloverNotice.hidden = mode !== "rollover";
    saveButton.hidden = mode === "view";
    if (mode === "edit") {
      editorHeading.textContent = "既存授業を編集";
      editorDescription.textContent = "対象IDの授業を置換します。IDは変更できません。";
      formIntro.textContent = "年度の継続更新には編集ではなく「次年度へ引き継ぐ」を使用してください。";
      saveButton.textContent = "変更を保存";
    } else if (mode === "rollover") {
      editorHeading.textContent = "次年度版を作成";
      editorDescription.textContent = "前年度版のコピーを、新しいIDを持つ別授業として追加します。";
      formIntro.textContent = "新年度ID、年度、講師、変更された授業内容を確認してください。";
      saveButton.textContent = "新年度版を追加";
    } else {
      editorHeading.textContent = "アーカイブ授業の内容";
      editorDescription.textContent = "アーカイブに保存されている内容を読み取り専用で表示しています。";
      formIntro.textContent = "編集する場合は、先に公開授業へ戻してください。";
    }
    renderEditor();
    refreshEditorViews();
    editorSection.hidden = false;
    editorSection.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const fetchManagedCourse = async (source, courseId, mode) => {
    setStatus(managementStatus, "授業情報を開いています…");
    try {
      const payload = await requestJson(
        `/api/manage/courses/${source}/${encodeURIComponent(courseId)}`,
      );
      openEditor(mode, payload, source);
      setStatus(managementStatus);
    } catch (error) {
      setStatus(managementStatus, error.message, "error");
    }
  };

  const startRollover = async (courseId) => {
    setStatus(managementStatus, "次年度版の下書きを準備しています…");
    try {
      const payload = await requestJson(
        `/api/manage/courses/${encodeURIComponent(courseId)}/rollover-draft`,
        { method: "POST" },
      );
      openEditor("rollover", payload, "published");
      if (!payload.yearSuggested) {
        setStatus(
          saveStatus,
          "年度を自動判定できませんでした。新しい授業IDと年度を入力してください。",
          "error",
        );
      }
      setStatus(managementStatus);
    } catch (error) {
      setStatus(managementStatus, error.message, "error");
    }
  };

  const dialogCourseDetails = (course) => {
    dialogCourse.replaceChildren();
    [
      ["授業名", course.title || "未設定"],
      ["年度", formatAcademicYear(course.academicYear)],
      ["講師", hasText(course.instructor) ? course.instructor.trim() : "未設定"],
      ["ID", course.id],
    ].forEach(([label, value]) => {
      const term = addText(dialogCourse, "dt", "", label);
      const description = addText(dialogCourse, "dd", "", value);
      term.dataset.dialogLabel = label;
      description.dataset.dialogValue = label;
    });
  };

  const openConfirmation = (action, course) => {
    const definitions = {
      archive: {
        heading: "授業をアーカイブしますか？",
        message: "公開ClassViewからは表示されなくなりますが、授業データはアーカイブに保存されます。",
        warning: "必要になった場合は、アーカイブ一覧から復元できます。",
        button: "アーカイブ",
        danger: false,
      },
      restore: {
        heading: "公開授業へ戻しますか？",
        message: "この授業をアーカイブから公開中の授業へ移動します。",
        warning: "公開中に同じIDがある場合は復元できません。",
        button: "公開授業へ戻す",
        danger: false,
      },
      delete: {
        heading: "授業を完全に削除しますか？",
        message: "この授業をClassViewの管理データから削除します。",
        warning: "この操作は画面から元に戻せません。削除前のバックアップは自動作成されます。",
        button: "完全に削除",
        danger: true,
      },
    };
    const definition = definitions[action];
    state.pendingOperation = { action, course };
    dialogHeading.textContent = definition.heading;
    dialogMessage.textContent = definition.message;
    dialogWarning.textContent = definition.warning;
    dialogConfirm.textContent = definition.button;
    dialogConfirm.className = definition.danger ? "button button--danger" : "button";
    dialogCourseDetails(course);
    confirmDialog.showModal();
  };

  const executeConfirmedOperation = async () => {
    if (!state.pendingOperation) return;
    const { action, course } = state.pendingOperation;
    dialogConfirm.disabled = true;
    try {
      const endpoints = {
        archive: `/api/manage/courses/${encodeURIComponent(course.id)}/archive`,
        restore: `/api/manage/archived/${encodeURIComponent(course.id)}/restore`,
        delete: `/api/manage/archived/${encodeURIComponent(course.id)}/delete`,
      };
      const result = await requestJson(endpoints[action], {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expectedHash: course.hash }),
      });
      confirmDialog.close();
      state.pendingOperation = null;
      editorSection.hidden = true;
      const messages = {
        archive: "授業をアーカイブしました。",
        restore: "授業を公開中へ戻しました。",
        delete: "アーカイブ授業を完全に削除しました。",
      };
      await loadCatalog(`${messages[action]} バックアップを作成しました。未公開の変更があります。`);
    } catch (error) {
      dialogWarning.textContent = error.message;
      dialogWarning.classList.add("is-error");
    } finally {
      dialogConfirm.disabled = false;
    }
  };

  const saveManagedCourse = async () => {
    const course = Editor.toCourseJson(state.course, state.config.template);
    if (state.mode === "rollover") {
      const pattern = new RegExp(window.CLASSVIEW_ID_PATTERN || "^[a-z0-9]+(?:-[a-z0-9]+)*$");
      if (!pattern.test(course.id || "")) {
        setStatus(saveStatus, "新年度版の授業IDを正しい形式で入力してください。", "error");
        return;
      }
    }
    saveButton.disabled = true;
    setStatus(saveStatus, "Schemaと現在の授業データを再確認し、バックアップを作成しています…");
    try {
      const endpoint = state.mode === "rollover"
        ? `/api/manage/courses/${encodeURIComponent(state.originalId)}/rollover`
        : `/api/manage/courses/${encodeURIComponent(state.originalId)}/update`;
      const result = await requestJson(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ course, expectedHash: state.expectedHash }),
      });
      const message = state.mode === "rollover"
        ? `${result.course.title}の新年度版を追加しました。前年度版は変更されていません。`
        : `${result.course.title}を更新しました。`;
      editorSection.hidden = true;
      await loadCatalog(`${message} バックアップを作成しました。未公開の変更があります。`);
    } catch (error) {
      setStatus(saveStatus, error.message, "error");
    } finally {
      saveButton.disabled = false;
    }
  };

  editorFields.addEventListener("input", (event) => {
    const target = event.target;
    if (target.dataset.managementField) {
      state.course[target.dataset.managementField] = target.value;
    } else if (target.dataset.managementArrayField) {
      state.course[target.dataset.managementArrayField][Number(target.dataset.index)] = target.value;
    } else if (target.dataset.managementObjectField) {
      state.course[target.dataset.managementObjectField][Number(target.dataset.index)][target.dataset.key] = target.value;
    } else {
      return;
    }
    refreshEditorViews();
  });

  editorFields.addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (!button) return;
    if (button.dataset.managementAdd) {
      const field = button.dataset.managementAdd;
      const empty = field === "schedule"
        ? { session: "", title: "", description: "" }
        : field === "images"
          ? { src: "", alt: "", caption: "" }
          : "";
      state.course = Editor.addArrayItem(state.course, field, empty);
    } else if (button.dataset.managementRemove) {
      state.course = Editor.removeArrayItem(
        state.course,
        button.dataset.managementRemove,
        Number(button.dataset.index),
      );
    } else {
      return;
    }
    renderEditor();
    refreshEditorViews();
  });

  list.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-management-action]");
    if (!button) return;
    const courseId = button.dataset.courseId;
    const courseHash = button.dataset.courseHash;
    const summary = (state.catalog[state.tab] || []).find((course) => course.id === courseId);
    if (!summary) return;
    const course = { ...summary, hash: courseHash };
    const action = button.dataset.managementAction;
    if (action === "edit") fetchManagedCourse("published", courseId, "edit");
    else if (action === "view") fetchManagedCourse("archived", courseId, "view");
    else if (action === "rollover") startRollover(courseId);
    else openConfirmation(action, course);
  });

  document.querySelectorAll("[data-management-tab]").forEach((tab) => {
    tab.addEventListener("click", () => {
      state.tab = tab.dataset.managementTab;
      document.querySelectorAll("[data-management-tab]").forEach((item) => {
        const active = item === tab;
        item.classList.toggle("is-active", active);
        item.setAttribute("aria-selected", String(active));
      });
      editorSection.hidden = true;
      setStatus(saveStatus);
      renderCatalog();
    });
  });

  searchInput.addEventListener("input", renderCatalog);
  cancelButton.addEventListener("click", () => {
    editorSection.hidden = true;
    setStatus(saveStatus);
    $("#course-list-heading").scrollIntoView({ behavior: "smooth", block: "start" });
  });
  saveButton.addEventListener("click", saveManagedCourse);
  dialogConfirm.addEventListener("click", executeConfirmedOperation);
  confirmDialog.addEventListener("close", () => {
    state.pendingOperation = null;
    dialogWarning.classList.remove("is-error");
  });

  const initialize = async () => {
    try {
      state.config = await requestJson("/api/editor-config");
      const unsupported = Object.keys(state.config.schema.properties || {}).filter(
        (field) => !ALL_FIELDS.includes(field),
      );
      if (unsupported.length) {
        throw new Error(`管理フォームが未対応のSchema項目があります: ${unsupported.join(", ")}`);
      }
      await loadCatalog();
    } catch (error) {
      setStatus(managementStatus, error.message, "error");
    }
  };

  initialize();
})();
