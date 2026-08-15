(() => {
  "use strict";

  const WORKS_DATA_URL = new URL("./data/course-works.json", document.baseURI);
  const ALLOWED_IMAGE_PATH = /^assets\/works\/[a-z0-9]+(?:-[a-z0-9]+)*\/[a-z0-9]+(?:-[a-z0-9]+)*\/[a-f0-9]{32}\.(?:jpg|jpeg|png|webp)$/;

  const hasText = (value) =>
    typeof value === "string" && value.trim().length > 0;

  const element = (tagName, className, text) => {
    const node = document.createElement(tagName);
    if (className) node.className = className;
    if (hasText(text)) node.textContent = text.trim();
    return node;
  };

  const normalizeYear = (value) =>
    hasText(value) ? value.trim() : null;

  const safeExternalUrl = (value) => {
    if (!hasText(value)) return "";
    try {
      const url = new URL(value.trim());
      return ["http:", "https:"].includes(url.protocol) ? url.href : "";
    } catch (_error) {
      return "";
    }
  };

  const safeImageUrl = (value) => {
    if (!hasText(value)) return "";
    const path = value.trim();
    if (!ALLOWED_IMAGE_PATH.test(path) || path.includes("..") || path.includes("\\")) {
      return "";
    }
    return new URL(`./${path}`, document.baseURI).href;
  };

  const sortWorks = (works) => [...works].sort((left, right) => {
    const leftOrder = Number.isInteger(left?.order) ? left.order : 0;
    const rightOrder = Number.isInteger(right?.order) ? right.order : 0;
    if (leftOrder !== rightOrder) return leftOrder - rightOrder;
    return String(left?.id || "").localeCompare(String(right?.id || ""), "ja");
  });

  const loadForCourse = async (course) => {
    try {
      const response = await fetch(WORKS_DATA_URL, { cache: "no-store" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const documentData = await response.json();
      const works = Array.isArray(documentData.works) ? documentData.works : [];
      const academicYear = normalizeYear(course?.academicYear);
      return sortWorks(
        works.filter(
          (work) =>
            work &&
            work.courseId === course?.id &&
            normalizeYear(work.academicYear) === academicYear &&
            hasText(work.title) &&
            (safeImageUrl(work.image) || safeExternalUrl(work.url))
        )
      );
    } catch (error) {
      console.warn("制作物情報を読み込めなかったため、授業情報のみ表示します。", error);
      return [];
    }
  };

  let lightbox;
  let lightboxImage;
  let lightboxTitle;
  let lightboxTrigger;

  const closeLightbox = () => {
    if (lightbox?.open) lightbox.close();
  };

  const ensureLightbox = () => {
    if (lightbox) return lightbox;
    lightbox = element("dialog", "work-lightbox");
    lightbox.setAttribute("aria-labelledby", "work-lightbox-title");
    const panel = element("div", "work-lightbox__panel");
    const close = element("button", "work-lightbox__close", "閉じる");
    close.type = "button";
    close.addEventListener("click", closeLightbox);
    lightboxImage = element("img", "work-lightbox__image");
    lightboxTitle = element("h2", "work-lightbox__title");
    lightboxTitle.id = "work-lightbox-title";
    panel.append(close, lightboxImage, lightboxTitle);
    lightbox.append(panel);
    lightbox.addEventListener("click", (event) => {
      if (event.target === lightbox) closeLightbox();
    });
    lightbox.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeLightbox();
      }
    });
    lightbox.addEventListener("close", () => {
      lightboxImage.removeAttribute("src");
      lightboxTrigger?.focus();
      lightboxTrigger = null;
    });
    document.body.append(lightbox);
    return lightbox;
  };

  const openLightbox = (work, imageUrl, trigger) => {
    const dialog = ensureLightbox();
    lightboxTrigger = trigger;
    lightboxImage.src = imageUrl;
    lightboxImage.alt = hasText(work.alt) ? work.alt.trim() : work.title.trim();
    lightboxTitle.textContent = work.title.trim();
    dialog.showModal();
    dialog.querySelector(".work-lightbox__close")?.focus();
  };

  const createImage = (work, imageUrl) => {
    const media = element("div", "course-work__media");
    const image = element("img", "course-work__image");
    image.src = imageUrl;
    image.alt = hasText(work.alt) ? work.alt.trim() : work.title.trim();
    image.loading = "lazy";
    const fallback = element(
      "p",
      "course-work__image-fallback",
      "画像を表示できませんでした。"
    );
    fallback.hidden = true;
    image.addEventListener("error", () => {
      image.hidden = true;
      fallback.hidden = false;
      media.classList.add("is-broken");
    });
    media.append(image, fallback);
    return media;
  };

  const createSection = (works) => {
    if (!Array.isArray(works) || !works.length) return null;
    const section = element("section", "content-section course-works-section");
    section.append(element("h3", "", "実際の制作物"));
    const grid = element("div", "course-works-grid");

    works.forEach((work) => {
      const imageUrl = safeImageUrl(work.image);
      const externalUrl = safeExternalUrl(work.url);
      if (!imageUrl && !externalUrl) return;

      const article = element("article", "course-work");
      if (imageUrl) article.append(createImage(work, imageUrl));
      const body = element("div", "course-work__body");
      body.append(element("h4", "course-work__title", work.title));
      if (hasText(work.description)) {
        body.append(
          element("p", "course-work__description", work.description)
        );
      }
      const actions = element("div", "course-work__actions");
      if (imageUrl) {
        const zoom = element("button", "text-link course-work__zoom", "画像を大きく見る");
        zoom.type = "button";
        zoom.addEventListener("click", () => openLightbox(work, imageUrl, zoom));
        actions.append(zoom);
      }
      if (externalUrl) {
        const link = element(
          "a",
          "text-link course-work__external",
          hasText(work.linkLabel) ? work.linkLabel : "作品を見る"
        );
        link.href = externalUrl;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.append(element("span", "", "→"));
        actions.append(link);
      }
      body.append(actions);
      article.append(body);
      grid.append(article);
    });

    if (!grid.children.length) return null;
    section.append(grid);
    return section;
  };

  globalThis.ClassViewWorks = {
    createSection,
    loadForCourse,
    normalizeYear,
    safeExternalUrl,
    safeImageUrl,
  };
})();
