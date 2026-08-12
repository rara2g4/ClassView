(() => {
  "use strict";

  const Editor = window.CourseEditor;
  const state = {
    preparationToken: "",
    validationToken: "",
    config: null,
    course: null,
    initialCourse: null,
    fieldMeta: {},
    proposalReviews: {},
    conversionMode: "support",
    inferredFields: [],
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
  const prepareForm = $("#prepare-form");
  const prepareButton = $("#prepare-button");
  const prepareStatus = $("#prepare-status");
  const preparedResult = $("#prepared-result");
  const preparedSummary = $("#prepared-summary");
  const viewPdf = $("#view-pdf");
  const downloadPdf = $("#download-pdf");
  const promptArea = $("#conversion-prompt");
  const copyPromptButton = $("#copy-prompt");
  const copyStatus = $("#copy-status");
  const jsonArea = $("#course-json");
  const validateButton = $("#validate-button");
  const validationStatus = $("#validation-status");
  const validationResult = $("#validation-result");
  const validationErrors = $("#validation-errors");
  const editorSection = $("#editor-section");
  const editorFields = $("#editor-fields");
  const previewContent = $("#preview-content");
  const generatedJson = $("#generated-json");
  const finalValidateButton = $("#final-validate-button");
  const finalValidationStatus = $("#final-validation-status");
  const finalValidationErrors = $("#final-validation-errors");
  const registerSection = $("#register-section");
  const registerButton = $("#register-button");
  const registerStatus = $("#register-status");
  const successResult = $("#success-result");
  const inferenceReview = $("#inference-review");
  const inferenceReviewList = $("#inference-review-list");
  const inferenceConfirmed = $("#inference-confirmed");
  const proposalSummary = $("#proposal-summary");
  const proposalSummaryCount = $("#proposal-summary-count");
  const proposalSummaryList = $("#proposal-summary-list");

  const hasText = (value) => typeof value === "string" && value.trim().length > 0;
  const nonEmptyItems = (value) => Array.isArray(value) ? value.filter(hasText) : [];

  const setStatus = (element, message = "", type = "") => {
    element.textContent = message;
    element.className = `status${type ? ` is-${type}` : ""}`;
  };

  const addText = (parent, tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    node.textContent = text;
    parent.append(node);
    return node;
  };

  const requestJson = async (url, options) => {
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

  const loadEditorConfig = async () => {
    try {
      state.config = await requestJson("/api/editor-config");
      const schemaFields = Object.keys(state.config.schema.properties || {});
      const unsupported = schemaFields.filter((field) => !ALL_FIELDS.includes(field));
      if (unsupported.length) {
        throw new Error(`フォームが未対応のSchema項目があります: ${unsupported.join(", ")}`);
      }
    } catch (error) {
      state.config = null;
      setStatus(validationStatus, error.message, "error");
      validateButton.disabled = true;
    }
  };
  const configReady = loadEditorConfig();

  const updateChecklist = (checklist) => {
    document.querySelectorAll("[data-check]").forEach((item) => {
      const passed = Boolean(checklist[item.dataset.check]);
      item.classList.toggle("is-pass", passed);
      item.classList.toggle("is-fail", !passed);
    });
  };

  const clearEditor = () => {
    state.course = null;
    state.initialCourse = null;
    state.fieldMeta = {};
    state.proposalReviews = {};
    state.inferredFields = [];
    state.validationToken = "";
    editorSection.hidden = true;
    registerSection.hidden = true;
    registerButton.disabled = true;
    inferenceConfirmed.checked = false;
    inferenceReview.hidden = true;
    proposalSummary.hidden = true;
    successResult.hidden = true;
  };

  const invalidateFinalValidation = (message = "フォームが変更されました。登録前に最終検証してください。") => {
    state.validationToken = "";
    registerButton.disabled = true;
    registerSection.hidden = true;
    successResult.hidden = true;
    setStatus(finalValidationStatus, message);
  };

  prepareForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    prepareButton.disabled = true;
    preparedResult.hidden = true;
    promptArea.value = "";
    copyPromptButton.disabled = true;
    state.preparationToken = "";
    clearEditor();
    validateButton.disabled = true;
    setStatus(prepareStatus, "PDFを確認し、指定ページを抽出しています…");
    try {
      const payload = await requestJson("/api/prepare", {
        method: "POST",
        body: new FormData(prepareForm),
      });
      state.preparationToken = payload.token;
      state.conversionMode = payload.conversionMode || "support";
      const extractedLabel = payload.extractedPageCount === 1
        ? `${payload.pageRange}ページ目`
        : `${payload.pageRange}ページ（${payload.extractedPageCount}ページ分）`;
      const modeLabel = state.conversionMode === "strict" ? "厳格変換" : "シラバス作成支援";
      preparedSummary.textContent = `${payload.pageCount}ページ中の${extractedLabel}を、授業ID「${payload.courseId}」の${modeLabel}用に抽出しました。`;
      viewPdf.href = payload.pdfViewUrl;
      downloadPdf.href = payload.pdfDownloadUrl;
      promptArea.value = payload.prompt;
      copyPromptButton.disabled = false;
      validateButton.disabled = !(state.config && jsonArea.value.trim());
      preparedResult.hidden = false;
      setStatus(prepareStatus, "抽出と指示文の準備が完了しました。", "success");
    } catch (error) {
      setStatus(prepareStatus, error.message, "error");
    } finally {
      prepareButton.disabled = false;
    }
  });

  copyPromptButton.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(promptArea.value);
      setStatus(copyStatus, "指示文をクリップボードへコピーしました。", "success");
    } catch (_error) {
      promptArea.focus();
      promptArea.select();
      setStatus(copyStatus, "コピーできませんでした。選択された文章を手動でコピーしてください。", "error");
    }
  });

  jsonArea.addEventListener("input", () => {
    validateButton.disabled = !(state.preparationToken && state.config && jsonArea.value.trim());
  });

  const fieldStateLabel = (status) => ({
    explicit: "シラバスから取得",
    inferred: "シラバスから推察",
    proposed: "AI下書き提案・未確認",
    proposedAccepted: "AI下書き提案・採用済み",
    proposedRejected: "AI下書き提案・使用しない",
    missing: "未入力",
    manual: "手動修正",
  }[status]);

  const fieldStateClass = (status) => `field-state field-state--${status}`;
  const currentFieldStatus = (field) => Editor.fieldStatus(
    field,
    state.course,
    state.initialCourse,
    state.fieldMeta,
    state.proposalReviews,
  );

  const createFieldHeader = (field, label, inputId) => {
    const header = document.createElement("div");
    header.className = "editor-field__header";
    const labelNode = addText(header, "label", "", label);
    labelNode.htmlFor = inputId;
    if ((state.config.schema.required || []).includes(field)) {
      const required = addText(labelNode, "span", "required-mark", "必須");
      required.setAttribute("aria-label", "必須項目");
    }
    const status = currentFieldStatus(field);
    const badge = addText(header, "span", fieldStateClass(status), fieldStateLabel(status));
    badge.dataset.statusField = field;
    return header;
  };

  const createError = (field) => {
    const error = document.createElement("p");
    error.className = "editor-field__error";
    error.dataset.fieldError = field;
    error.setAttribute("aria-live", "polite");
    return error;
  };

  const createInferenceReason = (field) => {
    const reason = document.createElement("p");
    reason.className = "inference-reason";
    reason.dataset.inferenceReason = field;
    const status = currentFieldStatus(field);
    const sourceType = state.fieldMeta?.[field]?.sourceType;
    const text = state.fieldMeta?.[field]?.reason;
    const shouldShow = sourceType === "proposed" || status === "inferred";
    reason.hidden = !shouldShow || !hasText(text);
    const prefix = sourceType === "proposed" ? "提案理由" : "推察根拠";
    reason.textContent = reason.hidden ? "" : `${prefix}：${text.trim()}`;
    return reason;
  };

  const createProposalActions = (field) => {
    if (state.fieldMeta?.[field]?.sourceType !== "proposed") return null;
    const area = document.createElement("div");
    area.className = "proposal-actions";
    area.dataset.proposalActions = field;
    const status = state.proposalReviews[field] || "pending";
    const statusLabels = {
      pending: "未確認です。内容と提案理由を確認してください。",
      accepted: "このまま採用として確認済みです。",
      edited: "管理者が修正した内容を採用します。",
      rejected: "この提案は使用せず、最終データから除外します。",
    };
    addText(area, "p", "proposal-actions__status", statusLabels[status]);
    const buttons = document.createElement("div");
    buttons.className = "proposal-actions__buttons";
    [
      ["accept", "このまま採用"],
      ["edit", "修正して採用"],
      ["reject", "使用しない"],
    ].forEach(([action, label]) => {
      const button = addText(buttons, "button", `proposal-button proposal-button--${action}`, label);
      button.type = "button";
      button.dataset.proposalAction = action;
      button.dataset.proposalField = field;
    });
    area.append(buttons);
    return area;
  };

  const appendSchemaHelp = (container, field) => {
    const description = state.config.schema.properties?.[field]?.description;
    if (description) addText(container, "p", "editor-field__help", description);
  };

  const renderScalarField = (field, label, control) => {
    const wrapper = document.createElement("div");
    wrapper.className = "editor-field";
    wrapper.dataset.editorGroup = field;
    const inputId = `editor-${field}`;
    wrapper.append(createFieldHeader(field, label, inputId));
    const input = document.createElement(control === "long" ? "textarea" : "input");
    input.id = inputId;
    input.dataset.editorField = field;
    input.value = state.course[field] ?? "";
    if (control === "long") input.rows = field === "learningGoals" ? 6 : 3;
    else input.type = "text";
    if (field === "id") {
      input.readOnly = true;
      input.setAttribute("aria-readonly", "true");
    }
    const suggestions = state.config.suggestions?.[field] || [];
    if (suggestions.length) {
      const listId = `suggestions-${field}`;
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
    wrapper.append(createInferenceReason(field));
    const proposalActions = createProposalActions(field);
    if (proposalActions) wrapper.append(proposalActions);
    appendSchemaHelp(wrapper, field);
    wrapper.append(createError(field));
    return wrapper;
  };

  const renderStringArray = (field, label) => {
    const wrapper = document.createElement("section");
    wrapper.className = "editor-field editor-array";
    wrapper.dataset.editorGroup = field;
    const headingId = `editor-${field}-heading`;
    const header = createFieldHeader(field, label, headingId);
    header.querySelector("label").id = headingId;
    header.querySelector("label").removeAttribute("for");
    wrapper.append(header);
    wrapper.append(createInferenceReason(field));
    const items = Array.isArray(state.course[field]) ? state.course[field] : [];
    if (!items.length) addText(wrapper, "p", "editor-empty", "項目はまだありません。");
    items.forEach((value, index) => {
      const row = document.createElement("div");
      row.className = "array-row";
      const input = document.createElement("input");
      input.type = "text";
      input.value = value;
      input.dataset.arrayField = field;
      input.dataset.index = String(index);
      input.setAttribute("aria-label", `${label} ${index + 1}`);
      const remove = addText(row, "button", "remove-button", "削除");
      remove.type = "button";
      remove.dataset.removeField = field;
      remove.dataset.index = String(index);
      row.append(input, remove);
      wrapper.append(row);
    });
    const add = addText(wrapper, "button", "add-button", "＋ 項目を追加");
    add.type = "button";
    add.dataset.addField = field;
    const proposalActions = createProposalActions(field);
    if (proposalActions) wrapper.append(proposalActions);
    appendSchemaHelp(wrapper, field);
    wrapper.append(createError(field));
    return wrapper;
  };

  const renderSchedule = () => {
    const wrapper = document.createElement("section");
    wrapper.className = "editor-field editor-array";
    wrapper.dataset.editorGroup = "schedule";
    const header = createFieldHeader("schedule", "授業回ごとの内容", "editor-schedule-heading");
    header.querySelector("label").id = "editor-schedule-heading";
    header.querySelector("label").removeAttribute("for");
    wrapper.append(header);
    wrapper.append(createInferenceReason("schedule"));
    const items = Array.isArray(state.course.schedule) ? state.course.schedule : [];
    if (!items.length) addText(wrapper, "p", "editor-empty", "授業回はまだありません。");
    items.forEach((item, index) => {
      const card = document.createElement("fieldset");
      card.className = "object-row";
      addText(card, "legend", "", `授業回 ${index + 1}`);
      [
        ["session", "授業回", "例: 1〜2"],
        ["title", "見出し・内容", ""],
        ["description", "詳しい説明", ""],
      ].forEach(([key, label, placeholder]) => {
        const field = document.createElement("div");
        field.className = "object-row__field";
        const id = `schedule-${index}-${key}`;
        const fieldLabel = addText(field, "label", "", label);
        fieldLabel.htmlFor = id;
        const input = key === "description" ? document.createElement("textarea") : document.createElement("input");
        input.id = id;
        if (key !== "description") input.type = "text";
        else input.rows = 2;
        input.value = item?.[key] ?? "";
        input.placeholder = placeholder;
        input.dataset.objectField = "schedule";
        input.dataset.index = String(index);
        input.dataset.key = key;
        field.append(input);
        card.append(field);
      });
      const remove = addText(card, "button", "remove-button", "この授業回を削除");
      remove.type = "button";
      remove.dataset.removeField = "schedule";
      remove.dataset.index = String(index);
      wrapper.append(card);
    });
    const add = addText(wrapper, "button", "add-button", "＋ 授業回を追加");
    add.type = "button";
    add.dataset.addField = "schedule";
    appendSchemaHelp(wrapper, "schedule");
    wrapper.append(createError("schedule"));
    return wrapper;
  };

  const renderImages = () => {
    const details = document.createElement("details");
    details.className = "editor-field editor-array editor-additional";
    details.dataset.editorGroup = "images";
    const summary = document.createElement("summary");
    summary.append(document.createTextNode("追加情報：授業風景・画像 "));
    const status = currentFieldStatus("images");
    const badge = addText(summary, "span", fieldStateClass(status), fieldStateLabel(status));
    badge.dataset.statusField = "images";
    details.append(summary);
    details.append(createInferenceReason("images"));
    const items = Array.isArray(state.course.images) ? state.course.images : [];
    if (!items.length) addText(details, "p", "editor-empty", "画像情報はまだありません。");
    items.forEach((item, index) => {
      const card = document.createElement("fieldset");
      card.className = "object-row";
      addText(card, "legend", "", `画像 ${index + 1}`);
      [["src", "画像パス・URL"], ["alt", "代替テキスト"], ["caption", "説明"]].forEach(([key, label]) => {
        const field = document.createElement("div");
        field.className = "object-row__field";
        const id = `image-${index}-${key}`;
        const fieldLabel = addText(field, "label", "", label);
        fieldLabel.htmlFor = id;
        const input = document.createElement("input");
        input.type = "text";
        input.id = id;
        input.value = item?.[key] ?? "";
        input.dataset.objectField = "images";
        input.dataset.index = String(index);
        input.dataset.key = key;
        field.append(input);
        card.append(field);
      });
      const remove = addText(card, "button", "remove-button", "この画像を削除");
      remove.type = "button";
      remove.dataset.removeField = "images";
      remove.dataset.index = String(index);
      details.append(card);
    });
    const add = addText(details, "button", "add-button", "＋ 画像を追加");
    add.type = "button";
    add.dataset.addField = "images";
    details.append(createError("images"));
    return details;
  };

  const renderEditorForm = () => {
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
    arrays.append(renderSchedule(), renderImages());
    fragment.append(arrays);
    editorFields.replaceChildren(fragment);
  };

  const proposedFields = () => ALL_FIELDS.filter(
    (field) => state.fieldMeta?.[field]?.sourceType === "proposed"
  );

  const renderProposalSummary = () => {
    const fields = proposedFields();
    proposalSummary.hidden = fields.length === 0;
    if (!fields.length) return;
    const pendingCount = fields.filter(
      (field) => (state.proposalReviews[field] || "pending") === "pending"
    ).length;
    proposalSummaryCount.textContent = pendingCount
      ? `AI下書き提案が${fields.length}件あり、そのうち${pendingCount}件が未確認です。`
      : `AI下書き提案${fields.length}件はすべて判断済みです。`;
    proposalSummaryList.replaceChildren();
    const labels = {
      pending: "未確認",
      accepted: "このまま採用",
      edited: "修正して採用",
      rejected: "使用しない",
    };
    fields.forEach((field) => {
      const status = state.proposalReviews[field] || "pending";
      addText(
        proposalSummaryList,
        "li",
        status === "pending" ? "is-pending" : "",
        `${FIELD_LABELS[field] || field} — ${labels[status]}`,
      );
    });
  };

  const updateFieldState = (field) => {
    const badge = document.querySelector(`[data-status-field="${field}"]`);
    if (!badge) return;
    const status = currentFieldStatus(field);
    badge.className = fieldStateClass(status);
    badge.textContent = fieldStateLabel(status);
  };

  const updateInferenceReason = (field) => {
    const node = document.querySelector(`[data-inference-reason="${field}"]`);
    if (!node) return;
    const status = currentFieldStatus(field);
    const sourceType = state.fieldMeta?.[field]?.sourceType;
    const reason = state.fieldMeta?.[field]?.reason;
    node.hidden = !hasText(reason) || (sourceType !== "proposed" && status !== "inferred");
    const prefix = sourceType === "proposed" ? "提案理由" : "推察根拠";
    node.textContent = node.hidden ? "" : `${prefix}：${reason.trim()}`;
  };

  const clearFieldError = (field) => {
    const node = document.querySelector(`[data-field-error="${field}"]`);
    if (node) node.textContent = "";
    document.querySelector(`[data-editor-group="${field}"]`)?.classList.remove("has-error");
  };

  const showFieldErrors = (details = []) => {
    document.querySelectorAll("[data-field-error]").forEach((node) => { node.textContent = ""; });
    document.querySelectorAll("[data-editor-group]").forEach((node) => node.classList.remove("has-error"));
    const grouped = new Map();
    details.forEach((detail) => {
      if (!detail.field) return;
      if (!grouped.has(detail.field)) grouped.set(detail.field, []);
      grouped.get(detail.field).push(detail.message);
    });
    grouped.forEach((messages, field) => {
      const node = document.querySelector(`[data-field-error="${field}"]`);
      if (node) node.textContent = messages.join(" ");
      document.querySelector(`[data-editor-group="${field}"]`)?.classList.add("has-error");
    });
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
    const values = nonEmptyItems(items);
    if (!values.length) return;
    const section = document.createElement("section");
    section.className = "preview-section";
    addText(section, "h5", "", heading);
    const list = document.createElement("ul");
    values.forEach((value) => addText(list, "li", "", value.trim()));
    section.append(list);
    parent.append(section);
  };

  const formatSessionLabel = (session, index) => {
    if (!hasText(session)) return `第${index + 1}回`;
    const value = session.trim();
    if (/^第.+回$/.test(value)) return value;
    const numericSession = value.match(/^(\d+)(?:\s*[〜～~-]\s*(\d+))?$/);
    if (!numericSession) return value;
    const [, start, end] = numericSession;
    return end ? `第${start}〜${end}回` : `第${start}回`;
  };

  const formatAcademicYear = (academicYear) => {
    if (!hasText(academicYear)) return "";
    const value = academicYear.trim();
    return value.endsWith("年度") ? value : `${value}年度`;
  };

  const renderPreview = (course) => {
    const pendingCount = proposedFields().filter(
      (field) => (state.proposalReviews[field] || "pending") === "pending"
    ).length;
    const notice = pendingCount
      ? addText(
        document.createDocumentFragment(),
        "p",
        "preview-proposal-notice",
        `未確認のAI提案を含むプレビューです（${pendingCount}件）。`,
      )
      : null;
    const article = document.createElement("article");
    article.className = "preview-course";
    addText(article, "h4", "", course.title || "授業名が未入力です");
    if (hasText(course.summary)) addText(article, "p", "preview-summary", course.summary.trim());
    const facts = [
      ["分野", course.category],
      ["対象学年", course.grade],
      ["年度", formatAcademicYear(course.academicYear)],
      ["講師", course.instructor],
      ["授業形式", course.classStyle],
      ["区分", course.courseType],
      ["前提知識", course.prerequisites],
    ].filter(([, value]) => hasText(value));
    if (facts.length) {
      const list = document.createElement("dl");
      list.className = "preview-facts";
      facts.forEach(([label, value]) => {
        const item = document.createElement("div");
        addText(item, "dt", "", label);
        addText(item, "dd", "", value.trim());
        list.append(item);
      });
      article.append(list);
    }
    addTextSection(article, "授業概要・到達目標", course.learningGoals);
    addTextSection(article, "授業の進め方", course.classFlow);
    addTextSection(article, "身につく知識・できるようになること", course.outcomes);
    addListSection(article, "主な学習内容", course.topics);
    addListSection(article, "使用するソフトウェアや教材", course.tools);
    addListSection(article, "課題や制作物の例", course.assignments);
    const schedule = Array.isArray(course.schedule) ? course.schedule.filter((item) => item && (hasText(item.title) || hasText(item.description))) : [];
    if (schedule.length) {
      const section = document.createElement("section");
      section.className = "preview-section";
      addText(section, "h5", "", "授業回ごとの内容");
      const list = document.createElement("ul");
      list.className = "preview-schedule";
      schedule.forEach((item, index) => {
        const row = document.createElement("li");
        addText(row, "span", "preview-schedule__session", formatSessionLabel(item.session, index));
        const content = document.createElement("div");
        content.className = "preview-schedule__content";
        if (hasText(item.title)) addText(content, "strong", "", item.title.trim());
        if (hasText(item.description)) addText(content, "p", "", item.description.trim());
        row.append(content);
        list.append(row);
      });
      section.append(list);
      article.append(section);
    }
    addTextSection(article, "向いている学生", course.suitableFor);
    const images = Array.isArray(course.images) ? course.images.filter((item) => item && hasText(item.src)) : [];
    if (images.length) addListSection(article, "授業風景の画像", images.map((item) => [item.alt, item.caption, item.src].filter(hasText).join(" — ")));
    previewContent.replaceChildren(...(notice ? [notice, article] : [article]));
  };

  const refreshDerivedViews = () => {
    const course = Editor.toCourseJson(state.course, state.config.template);
    generatedJson.value = JSON.stringify(course, null, 2);
    renderPreview(course);
    renderProposalSummary();
  };

  const markProposalEdited = (field) => {
    if (state.fieldMeta?.[field]?.sourceType !== "proposed") return;
    const sameAsProposal = JSON.stringify(state.course[field]) === JSON.stringify(state.initialCourse[field]);
    if (!sameAsProposal) state.proposalReviews[field] = "edited";
    else if (state.proposalReviews[field] === "edited" || state.proposalReviews[field] === "rejected") {
      state.proposalReviews[field] = "pending";
    }
  };

  const courseChanged = (field) => {
    markProposalEdited(field);
    updateFieldState(field);
    updateInferenceReason(field);
    clearFieldError(field);
    refreshDerivedViews();
    invalidateFinalValidation();
  };

  editorFields.addEventListener("input", (event) => {
    const target = event.target;
    if (target.dataset.editorField && target.dataset.editorField !== "id") {
      const field = target.dataset.editorField;
      state.course = Editor.updateScalar(state.course, field, target.value, state.config.template);
      courseChanged(field);
      return;
    }
    if (target.dataset.arrayField) {
      const field = target.dataset.arrayField;
      state.course = Editor.updateArrayItem(state.course, field, Number(target.dataset.index), target.value);
      courseChanged(field);
      return;
    }
    if (target.dataset.objectField) {
      const field = target.dataset.objectField;
      const next = Editor.clone(state.course);
      next[field][Number(target.dataset.index)][target.dataset.key] = target.value;
      state.course = next;
      courseChanged(field);
    }
  });

  editorFields.addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (!button) return;
    if (button.dataset.proposalAction) {
      const field = button.dataset.proposalField;
      const action = button.dataset.proposalAction;
      if (action === "accept") {
        state.course[field] = Editor.clone(state.initialCourse[field]);
        state.proposalReviews[field] = "accepted";
      } else if (action === "reject") {
        state.course[field] = Editor.clone(state.config.template[field]);
        state.proposalReviews[field] = "rejected";
      } else if (action === "edit") {
        if (state.proposalReviews[field] === "rejected") {
          state.course[field] = Editor.clone(state.initialCourse[field]);
        }
        state.proposalReviews[field] = "pending";
      }
      renderEditorForm();
      refreshDerivedViews();
      invalidateFinalValidation();
      if (action === "edit") {
        document.querySelector(`[data-editor-group="${field}"] input, [data-editor-group="${field}"] textarea`)?.focus();
      }
    } else if (button.dataset.addField) {
      const field = button.dataset.addField;
      const empty = field === "schedule" ? { session: "", title: "", description: "" }
        : field === "images" ? { src: "", alt: "", caption: "" } : "";
      state.course = Editor.addArrayItem(state.course, field, empty);
      markProposalEdited(field);
      renderEditorForm();
      refreshDerivedViews();
      invalidateFinalValidation();
      updateFieldState(field);
    } else if (button.dataset.removeField) {
      const field = button.dataset.removeField;
      state.course = Editor.removeArrayItem(state.course, field, Number(button.dataset.index));
      markProposalEdited(field);
      renderEditorForm();
      refreshDerivedViews();
      invalidateFinalValidation();
      updateFieldState(field);
    }
  });

  validateButton.addEventListener("click", async () => {
    validateButton.disabled = true;
    validationResult.hidden = true;
    setStatus(validationStatus, "JSONを検証しています…");
    try {
      await configReady;
      const payload = await requestJson("/api/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ preparationToken: state.preparationToken, jsonText: jsonArea.value }),
      });
      updateChecklist(payload.checklist);
      validationErrors.replaceChildren();
      (payload.errors || []).forEach((message) => addText(validationErrors, "li", "", message));
      validationResult.hidden = false;
      if (payload.valid) {
        state.course = Editor.normalizeCourse(payload.course, state.config.template);
        state.initialCourse = Editor.clone(state.course);
        state.fieldMeta = payload.fieldMeta || {};
        state.proposalReviews = payload.proposalReviews || {};
        state.conversionMode = payload.conversionMode || state.conversionMode;
        state.inferredFields = [];
        state.validationToken = "";
        renderEditorForm();
        refreshDerivedViews();
        editorSection.hidden = false;
        registerSection.hidden = true;
        setStatus(validationStatus, "JSONを取り込みました。フォームで内容を確認・補完してください。", "success");
        setStatus(finalValidationStatus, "編集内容はまだ最終検証されていません。");
        editorSection.scrollIntoView({ behavior: "smooth", block: "start" });
      } else {
        setStatus(validationStatus, "JSONを取り込めませんでした。表示された内容を確認してください。", "error");
      }
    } catch (error) {
      setStatus(validationStatus, error.message, "error");
    } finally {
      validateButton.disabled = !(state.preparationToken && state.config && jsonArea.value.trim());
    }
  });

  finalValidateButton.addEventListener("click", async () => {
    finalValidateButton.disabled = true;
    registerButton.disabled = true;
    registerSection.hidden = true;
    finalValidationErrors.replaceChildren();
    showFieldErrors([]);
    setStatus(finalValidationStatus, "編集内容を最終検証しています…");
    try {
      const course = Editor.toCourseJson(state.course, state.config.template);
      const manualFields = ALL_FIELDS.filter(
        (field) => currentFieldStatus(field) === "manual"
      );
      const payload = await requestJson("/api/validate-course", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          preparationToken: state.preparationToken,
          course,
          fieldMeta: state.fieldMeta,
          manualFields,
          proposalReviews: state.proposalReviews,
        }),
      });
      (payload.errors || []).forEach((message) => addText(finalValidationErrors, "li", "", message));
      showFieldErrors(payload.fieldErrors || []);
      if (payload.valid) {
        state.course = Editor.normalizeCourse(payload.course, state.config.template);
        state.validationToken = payload.validationToken;
        state.inferredFields = payload.inferredFields || [];
        state.proposalReviews = payload.proposalReviews || state.proposalReviews;
        generatedJson.value = JSON.stringify(payload.course, null, 2);
        registerSection.hidden = false;
        inferenceReviewList.replaceChildren();
        state.inferredFields.forEach((field) => {
          addText(inferenceReviewList, "li", "", FIELD_LABELS[field] || field);
        });
        inferenceConfirmed.checked = false;
        inferenceReview.hidden = state.inferredFields.length === 0;
        registerButton.disabled = state.inferredFields.length > 0;
        setStatus(finalValidationStatus, "最終検証に合格しました。ClassViewへ追加できます。", "success");
      } else {
        state.validationToken = "";
        setStatus(finalValidationStatus, "最終検証に合格しませんでした。入力項目を確認してください。", "error");
      }
    } catch (error) {
      setStatus(finalValidationStatus, error.message, "error");
    } finally {
      finalValidateButton.disabled = false;
    }
  });

  registerButton.addEventListener("click", async () => {
    registerButton.disabled = true;
    setStatus(registerStatus, "重複を再確認し、バックアップを作成して追加しています…");
    try {
      const course = Editor.toCourseJson(state.course, state.config.template);
      const payload = await requestJson("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          preparationToken: state.preparationToken,
          validationToken: state.validationToken,
          course,
          inferenceConfirmed: state.inferredFields.length === 0 || inferenceConfirmed.checked,
        }),
      });
      $("#success-title").textContent = payload.title;
      $("#success-id").textContent = payload.id;
      successResult.hidden = false;
      state.validationToken = "";
      setStatus(registerStatus, "保存しました。未公開の変更があります。", "success");
      successResult.scrollIntoView({ behavior: "smooth", block: "nearest" });
    } catch (error) {
      setStatus(registerStatus, error.message, "error");
      invalidateFinalValidation("登録前の再検証が必要です。");
    }
  });

  inferenceConfirmed.addEventListener("change", () => {
    registerButton.disabled = !state.validationToken || (
      state.inferredFields.length > 0 && !inferenceConfirmed.checked
    );
  });
})();
