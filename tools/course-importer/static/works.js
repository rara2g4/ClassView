(() => {
  "use strict";

  const initial = window.CLASSVIEW_WORKS_CONTEXT || {};
  const state = {
    course: initial.course || {},
    source: initial.source || "published",
    works: Array.isArray(initial.works) ? initial.works : [],
    editingId: "",
    deletingId: "",
  };

  const $ = (selector) => document.querySelector(selector);
  const list = $("#works-list");
  const count = $("#works-count");
  const status = $("#works-status");
  const editor = $("#work-editor-section");
  const editorHeading = $("#work-editor-heading");
  const form = $("#work-form");
  const formStatus = $("#work-form-status");
  const saveButton = $("#work-save-button");
  const imageInput = $("#work-image");
  const currentImage = $("#current-work-image");
  const currentImagePreview = $("#current-work-image-preview");
  const removeImage = $("#work-remove-image");
  const deleteDialog = $("#work-delete-dialog");
  const deleteMessage = $("#work-delete-message");
  const deleteConfirm = $("#work-delete-confirm");

  const hasText = (value) => typeof value === "string" && value.trim().length > 0;

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
      payload = { error: "管理ツールから正しい応答を受け取れませんでした。" };
    }
    if (!response.ok) throw new Error(payload.error || `HTTP ${response.status}`);
    return payload;
  };

  const safeExternalUrl = (value) => {
    if (!hasText(value)) return "";
    try {
      const url = new URL(value);
      return ["http:", "https:"].includes(url.protocol) ? url.href : "";
    } catch (_error) {
      return "";
    }
  };

  const imageUrl = (work) =>
    work.image ? `/works/image/${encodeURIComponent(work.id)}?v=${encodeURIComponent(work.image)}` : "";

  const displayMode = (work) => {
    if (work.image && work.url) return "both";
    if (work.url) return "link";
    return "image";
  };

  const renderImage = (parent, work) => {
    if (!work.image) return;
    const wrapper = document.createElement("div");
    wrapper.className = "works-admin-card__image";
    const image = document.createElement("img");
    image.src = imageUrl(work);
    image.alt = hasText(work.alt) ? work.alt.trim() : work.title;
    image.loading = "lazy";
    const fallback = addText(wrapper, "p", "works-image-fallback", "画像を表示できませんでした。");
    fallback.hidden = true;
    image.addEventListener("error", () => {
      image.hidden = true;
      fallback.hidden = false;
    });
    wrapper.prepend(image);
    parent.append(wrapper);
  };

  const renderWorks = () => {
    list.replaceChildren();
    count.textContent = `${state.works.length}件`;
    if (!state.works.length) {
      addText(
        list,
        "p",
        "management-empty works-empty",
        "制作物はまだ登録されていません。登録がない授業では、公開ページの「実際の制作物」セクション全体が表示されません。",
      );
      return;
    }

    state.works.forEach((work, index) => {
      const article = document.createElement("article");
      article.className = "works-admin-card";
      renderImage(article, work);
      const body = document.createElement("div");
      body.className = "works-admin-card__body";
      addText(body, "h3", "", work.title);
      if (hasText(work.description)) {
        addText(body, "p", "works-admin-card__description", work.description.trim());
      }
      const externalUrl = safeExternalUrl(work.url);
      if (externalUrl) {
        const link = addText(body, "a", "text-link works-admin-card__external", work.linkLabel || "作品を見る");
        link.href = externalUrl;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.append(document.createTextNode(" →"));
      }

      const actions = document.createElement("div");
      actions.className = "works-admin-card__actions";
      [
        ["edit", "編集"],
        ["up", "↑ 上へ"],
        ["down", "↓ 下へ"],
        ["delete", "削除"],
      ].forEach(([action, label]) => {
        const button = addText(actions, "button", `management-action${action === "delete" ? " management-action--danger" : ""}`, label);
        button.type = "button";
        button.dataset.workAction = action;
        button.dataset.workId = work.id;
        if ((action === "up" && index === 0) || (action === "down" && index === state.works.length - 1)) {
          button.disabled = true;
        }
      });
      body.append(actions);
      article.append(body);
      list.append(article);
    });
  };

  const updateModeFields = () => {
    const mode = form.elements.displayMode.value;
    const showLink = mode !== "image";
    document.querySelectorAll(".work-link-fields").forEach((field) => {
      field.hidden = !showLink;
    });
    $("#work-url").required = showLink;
    $("#work-link-label").disabled = !showLink;
    const imageRequired = mode === "image" || mode === "both";
    const editing = state.works.find((work) => work.id === state.editingId);
    imageInput.required = imageRequired && !(editing?.image && !removeImage.checked);
  };

  const resetForm = () => {
    form.reset();
    state.editingId = "";
    $("#work-id").value = "";
    $("#work-link-label").value = "作品を見る";
    currentImage.hidden = true;
    currentImagePreview.removeAttribute("src");
    removeImage.checked = false;
    editorHeading.textContent = "制作物を追加";
    saveButton.textContent = "制作物を保存";
    setStatus(formStatus);
    updateModeFields();
  };

  const openAddForm = () => {
    resetForm();
    editor.hidden = false;
    editor.scrollIntoView({ behavior: "smooth", block: "start" });
    $("#work-title").focus();
  };

  const openEditForm = (work) => {
    resetForm();
    state.editingId = work.id;
    $("#work-id").value = work.id;
    form.elements.displayMode.value = displayMode(work);
    $("#work-title").value = work.title || "";
    $("#work-description").value = work.description || "";
    $("#work-url").value = work.url || "";
    $("#work-link-label").value = work.linkLabel || "作品を見る";
    $("#work-alt").value = work.alt || "";
    $("#work-permission").checked = false;
    if (work.image) {
      currentImage.hidden = false;
      currentImagePreview.src = imageUrl(work);
      currentImagePreview.alt = hasText(work.alt) ? work.alt.trim() : work.title;
    }
    editorHeading.textContent = "制作物を編集";
    saveButton.textContent = "変更を保存";
    updateModeFields();
    editor.hidden = false;
    editor.scrollIntoView({ behavior: "smooth", block: "start" });
    $("#work-title").focus();
  };

  const reloadWorks = async (message = "") => {
    const payload = await requestJson(`/api/works/course/${encodeURIComponent(state.course.id)}`);
    state.course = payload.course;
    state.source = payload.source;
    state.works = Array.isArray(payload.works) ? payload.works : [];
    renderWorks();
    if (message) setStatus(status, message, "success");
  };

  const saveWork = async (event) => {
    event.preventDefault();
    updateModeFields();
    if (!form.reportValidity()) return;
    saveButton.disabled = true;
    setStatus(formStatus, "画像と入力内容を確認し、バックアップを作成しています…");
    try {
      const formData = new FormData(form);
      const endpoint = state.editingId
        ? `/api/works/${encodeURIComponent(state.editingId)}/update`
        : `/api/works/course/${encodeURIComponent(state.course.id)}`;
      const result = await requestJson(endpoint, { method: "POST", body: formData });
      editor.hidden = true;
      resetForm();
      const warning = Array.isArray(result.warnings) && result.warnings.length
        ? ` ${result.warnings.join(" ")}`
        : "";
      await reloadWorks(`制作物をローカル保存しました。未公開の変更があります。${warning}`);
      $("#works-preview-heading").scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (error) {
      setStatus(formStatus, error.message, "error");
    } finally {
      saveButton.disabled = false;
    }
  };

  const moveWork = async (workId, direction) => {
    setStatus(status, "並び順を保存しています…");
    try {
      await requestJson(`/api/works/${encodeURIComponent(workId)}/move`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ direction }),
      });
      await reloadWorks("並び順を変更しました。未公開の変更があります。");
    } catch (error) {
      setStatus(status, error.message, "error");
    }
  };

  const openDeleteDialog = (work) => {
    state.deletingId = work.id;
    deleteMessage.textContent = `「${work.title}」を削除します。`;
    deleteDialog.showModal();
  };

  const deleteWork = async () => {
    if (!state.deletingId) return;
    deleteConfirm.disabled = true;
    try {
      await requestJson(`/api/works/${encodeURIComponent(state.deletingId)}/delete`, {
        method: "POST",
      });
      deleteDialog.close();
      editor.hidden = true;
      await reloadWorks("制作物を削除しました。バックアップを作成し、未公開の変更として保存しました。");
    } catch (error) {
      deleteMessage.textContent = error.message;
    } finally {
      deleteConfirm.disabled = false;
    }
  };

  $("#work-add-button").addEventListener("click", openAddForm);
  $("#work-form-cancel").addEventListener("click", () => {
    editor.hidden = true;
    resetForm();
  });
  form.addEventListener("submit", saveWork);
  form.addEventListener("change", (event) => {
    if (event.target.name === "displayMode" || event.target === removeImage) updateModeFields();
  });
  list.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-work-action]");
    if (!button) return;
    const work = state.works.find((item) => item.id === button.dataset.workId);
    if (!work) return;
    const action = button.dataset.workAction;
    if (action === "edit") openEditForm(work);
    else if (action === "delete") openDeleteDialog(work);
    else if (action === "up" || action === "down") moveWork(work.id, action);
  });
  deleteConfirm.addEventListener("click", deleteWork);
  deleteDialog.addEventListener("close", () => {
    state.deletingId = "";
  });

  renderWorks();
  updateModeFields();
})();
