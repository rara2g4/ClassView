(() => {
  "use strict";

  const FEEDBACK_FORM_CONFIG = Object.freeze({
    enabled: true,
    baseUrl:
      "https://docs.google.com/forms/d/e/1FAIpQLSeEjSeDZo3s8NgfSNeBCyKaSRrK5cQbooYaQuCKb3g_BRbfZQ/viewform",
    fields: Object.freeze({
      courseId: "entry.1710189700",
      courseTitle: "entry.1032820196",
      academicYear: "entry.681559836",
    }),
  });

  const hasText = (value) =>
    typeof value === "string" && value.trim().length > 0;

  const createFeedbackUrl = (course, config = FEEDBACK_FORM_CONFIG) => {
    if (!config?.enabled || !hasText(config.baseUrl)) return null;
    if (!course || !hasText(course.id) || !hasText(course.title)) return null;

    try {
      const url = new URL(config.baseUrl.trim());
      url.searchParams.set("usp", "pp_url");
      url.searchParams.set(config.fields.courseId, course.id.trim());
      url.searchParams.set(config.fields.courseTitle, course.title.trim());

      if (hasText(course.academicYear)) {
        url.searchParams.set(
          config.fields.academicYear,
          course.academicYear.trim()
        );
      }

      return url.toString();
    } catch (error) {
      console.error("受講者フィードバックURLを生成できませんでした。", error);
      return null;
    }
  };

  const api = Object.freeze({
    config: FEEDBACK_FORM_CONFIG,
    createFeedbackUrl,
  });

  globalThis.ClassViewFeedback = api;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})();
