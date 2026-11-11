((global) => {
  "use strict";

  const attach = ({ selectedDate, selectDate, datesWithEntries }) => {
    const { addDays, daysInMonth, formatDateKey, fromDate, parseCalendarDate, toLocalDate } = global.ClassViewTimetable;
    const trigger = document.querySelector("#calendar-button");
    const dialog = document.querySelector("#timetable-calendar");
    const heading = dialog.querySelector("#calendar-month");
    const grid = dialog.querySelector(".calendar-days");
    const previous = dialog.querySelector("[data-month-prev]");
    const next = dialog.querySelector("[data-month-next]");
    let cursor;

    const moveMonth = (offset) => {
      const date = toLocalDate({ ...cursor, day: 1 });
      date.setMonth(date.getMonth() + offset);
      const parts = fromDate(date);
      parts.day = Math.min(cursor.day, daysInMonth(parts.year, parts.month));
      return parts;
    };
    const valid = (parts) => Boolean(parseCalendarDate(formatDateKey(parts)));
    const focusDay = () => grid.querySelector('[tabindex="0"]').focus();
    const render = () => {
      heading.textContent = `${cursor.year}年${cursor.month}月`;
      previous.disabled = !valid(moveMonth(-1));
      next.disabled = !valid(moveMonth(1));
      const start = (toLocalDate({ ...cursor, day: 1 }).getDay() + 6) % 7;
      const selected = formatDateKey(selectedDate());
      const today = formatDateKey(fromDate(new Date()));
      const days = document.createDocumentFragment();
      for (let day = 1; day <= daysInMonth(cursor.year, cursor.month); day++) {
        const key = formatDateKey({ ...cursor, day });
        const button = document.createElement("button");
        button.type = "button";
        button.dataset.date = key;
        button.textContent = String(day);
        button.tabIndex = day === cursor.day ? 0 : -1;
        if (day === 1) button.style.gridColumnStart = start + 1;
        const hasEntries = datesWithEntries.has(key);
        button.classList.toggle("has-entries", hasEntries);
        button.setAttribute("aria-label", heading.textContent + day + "日" + (hasEntries ? "、時間割あり" : ""));
        button.setAttribute("aria-pressed", String(key === selected));
        if (key === today) button.setAttribute("aria-current", "date");
        days.append(button);
      }
      grid.replaceChildren(days);
    };
    const changeCursor = (parts, focus) => {
      if (!valid(parts)) return;
      cursor = parts;
      render();
      if (focus) focusDay();
    };
    const choose = (parts) => {
      dialog.close();
      selectDate(parts);
    };
    trigger.addEventListener("click", () => {
      cursor = selectedDate();
      render();
      dialog.showModal();
      focusDay();
    });
    previous.addEventListener("click", () => changeCursor(moveMonth(-1), true));
    next.addEventListener("click", () => changeCursor(moveMonth(1), true));
    grid.addEventListener("click", (event) => {
      const date = parseCalendarDate(event.target.dataset.date);
      if (date) choose(date);
    });
    grid.addEventListener("keydown", (event) => {
      const offsets = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
      let target;
      if (Object.hasOwn(offsets, event.key)) target = addDays(cursor, offsets[event.key]);
      else if (["PageUp", "PageDown"].includes(event.key)) target = moveMonth(event.key === "PageUp" ? -1 : 1);
      else if (event.key === "Home") target = { ...cursor, day: 1 };
      else if (event.key === "End") target = { ...cursor, day: daysInMonth(cursor.year, cursor.month) };
      else return;
      event.preventDefault();
      changeCursor(target, true);
    });
    dialog.querySelector("[data-calendar-today]").addEventListener("click", () => choose(fromDate(new Date())));
    dialog.querySelector("[data-calendar-close]").addEventListener("click", () => dialog.close());
    window.addEventListener("popstate", () => {
      if (dialog.open) dialog.close();
    });
    trigger.disabled = false;
  };
  global.ClassViewCalendar = { attach };
})(globalThis);
