"""Public-site browser checks. Run against a local static server or the preview Pages URL."""
import argparse
from itertools import product
from pathlib import Path
from urllib.parse import parse_qs, urlsplit

from playwright.sync_api import expect, sync_playwright


def preference(page, name, value):
    page.locator(f'#display-preferences input[name="{name}"][value="{value}"]').check()


def snapshot(page, folder, name):
    assert page.evaluate("document.documentElement.scrollWidth <= innerWidth"), name
    for dialog in page.locator("dialog[open]").all():
        assert dialog.evaluate("""d => {
          const r = d.getBoundingClientRect();
          return r.left >= 0 && r.right <= innerWidth + 1 && r.top >= 0 &&
            r.bottom <= innerHeight + 1 && d.scrollWidth <= d.clientWidth + 1;
        }"""), name
    if folder:
        page.screenshot(path=folder / f"{name}.png")


def check_preferences(page, base):
    page.goto(base + "courses.html")
    expect(page.locator(".course-card").first).to_be_visible()
    root = page.locator("html")
    expect(root).to_have_attribute("data-theme", "light")
    page.emulate_media(color_scheme="dark")
    expect(root).to_have_attribute("data-theme", "dark")
    page.locator("#display-preferences-button").press("Enter")
    heights, fonts = {}, {}
    for theme, density, size in product(("light", "dark", "system"), ("compact", "standard", "roomy"), ("small", "standard", "large")):
        for name, value in [("theme", theme), ("density", density), ("textSize", size)]:
            preference(page, name, value)
        expect(root).to_have_attribute("data-theme", "dark" if theme == "system" else theme)
        expect(root).to_have_attribute("data-density", density)
        expect(root).to_have_attribute("data-text-size", size)
        card = page.locator(".course-card").first
        heights[density, size] = card.bounding_box()["height"]
        fonts[size] = card.locator("h3").evaluate("el => parseFloat(getComputedStyle(el).fontSize)")
        snapshot(page, None, "settings")
    assert heights["compact", "standard"] < heights["standard", "standard"] < heights["roomy", "standard"]
    assert fonts["small"] < fonts["standard"] < fonts["large"]
    preference(page, "theme", "dark")
    page.emulate_media(color_scheme="light")
    expect(root).to_have_attribute("data-theme", "dark")
    page.keyboard.press("Escape")
    expect(page.locator("#display-preferences-button")).to_be_focused()
    page.reload()
    expect(root).to_have_attribute("data-text-size", "large")
    expect(root).to_have_attribute("data-density", "roomy")
    expect(root).to_have_attribute("data-theme", "dark")


def check_calendar(page, base, width, theme, folder):
    page.goto(base + "timetable.html?demo=1&date=2026-11-02")
    trigger = page.locator("#calendar-button")
    expect(trigger).to_be_enabled()
    requests = []
    page.on("request", lambda request: requests.append(request.url))
    if width == 390:
        trigger.tap()
    else:
        trigger.press("Enter")
    expect(page.locator('[data-date="2026-11-02"]')).to_be_focused()
    assert page.locator(".calendar-days .has-entries").count() > 0
    snapshot(page, folder, f"{width}-{theme}-calendar")
    page.keyboard.press("Escape")
    expect(trigger).to_be_focused()
    trigger.click()
    page.locator("[data-month-prev]").click()
    expect(page.locator("#calendar-month")).to_have_text("2026年10月")
    page.locator("[data-month-next]").click()
    assert not any(".json" in url for url in requests), requests
    page.keyboard.press("ArrowRight")
    page.keyboard.press("Enter")
    heading = page.locator("#timetable-date-heading")
    expect(heading).to_contain_text("11月3日")
    assert "date=2026-11-03" in page.url
    page.locator("#week-view-button").click()
    expect(heading).to_contain_text("11月2日")
    trigger.click()
    page.locator("[data-month-next]").click()
    page.locator('[data-date="2026-12-13"]').click()
    expect(heading).to_contain_text("12月7日")
    expect(page.locator("#timetable-content")).to_contain_text("この週の時間割は登録されていません")
    assert parse_qs(urlsplit(page.url).query) == {"demo": ["1"], "view": ["week"], "date": ["2026-12-13"]}
    page.go_back()
    expect(heading).to_contain_text("11月2日")
    expect(page.locator("#week-view-button")).to_have_attribute("aria-pressed", "true")
    if width == 390:
        toggle = page.locator(".timetable-mobile-day__toggle").first
        toggle.click()
        expect(toggle).to_have_attribute("aria-expanded", "true")
    page.locator("#timetable-date-heading").evaluate("el => el.scrollIntoView()")
    snapshot(page, folder, f"{width}-{theme}-week")
    page.go_back()
    expect(heading).to_contain_text("11月3日")
    expect(page.locator("#day-view-button")).to_have_attribute("aria-pressed", "true")
    page.go_forward()
    expect(page.locator("#week-view-button")).to_have_attribute("aria-pressed", "true")
    trigger.click()
    page.locator("[data-calendar-today]").click()
    today = page.evaluate("new Date().toLocaleDateString('sv-SE')")
    assert parse_qs(urlsplit(page.url).query)["date"] == [today]


def check_wizard(page, width, theme, folder):
    page.locator("#personal-settings-button").click()
    page.locator("#personal-grade-choices label").first.click()
    page.locator("#personal-wizard-next").click()
    page.locator("#personal-homeroom-choices label").first.click()
    page.locator("#personal-wizard-next").click()
    cols = page.locator(".personal-wizard-candidates").evaluate("el => getComputedStyle(el).gridTemplateColumns.split(' ').length")
    assert cols == (1 if width == 390 else 2)
    assert page.locator(".personal-weekly-item").count() > 0
    for tab in page.locator("#personal-period-tabs button").all():
        tab.click()
        if page.locator(".personal-wizard-card.is-available").count() >= 2:
            break
    cards = page.locator(".personal-wizard-card.is-available")
    course = cards.first.get_attribute("data-course-id")
    alternative = cards.nth(1).get_attribute("data-course-id")
    first = page.locator(f'[data-course-id="{course}"].personal-wizard-card')
    first_select = first.locator(".personal-wizard-card__select")
    first_title = first.locator(".personal-wizard-card__title")
    first_select.click()
    expect(first_select).to_have_attribute("aria-pressed", "true")
    first_select.click()
    expect(first_select).to_have_attribute("aria-pressed", "false")
    first_select.click()
    expect(first_select).to_have_attribute("aria-pressed", "true")

    key = "classview.demo.personalTimetable.profile"
    assert page.evaluate("key => localStorage.getItem(key)", key) is None
    selected_day = page.locator('#personal-day-tabs [aria-selected="true"]').get_attribute("id")
    selected_period = page.locator('#personal-period-tabs [aria-selected="true"]').get_attribute("id")
    dialog_scroll = page.locator("#personal-wizard-dialog").evaluate(
        "el => { el.scrollTop = Math.min(120, el.scrollHeight - el.clientHeight); return el.scrollTop; }"
    )
    first_title.click()
    expect(page.locator(".course-header h1")).to_be_visible()
    assert parse_qs(urlsplit(page.url).query)["demo"] == ["1"]
    expect(page.locator(".course-header__eyebrow")).to_contain_text("デモデータ")
    snapshot(page, folder, f"{width}-{theme}-wizard-detail")
    assert page.evaluate("key => localStorage.getItem(key)", key) is None
    personal_return = page.locator('[data-course-return="personal"]')
    assert personal_return.count() == 1, page.url
    personal_return.click()
    expect(page.locator("#personal-wizard-dialog")).to_be_visible()
    expect(page.locator('[data-personal-step="3"]')).to_be_visible()
    expect(page.locator(f"#{selected_day}")).to_have_attribute("aria-selected", "true")
    expect(page.locator(f"#{selected_period}")).to_have_attribute("aria-selected", "true")
    expect(first_select).to_have_attribute("aria-pressed", "true")
    expect(first_title).to_be_focused()
    assert page.evaluate("sessionStorage.getItem('classview.demo.personalTimetable.wizardDraft.v1')") is None
    assert page.evaluate("sessionStorage.getItem('classview.personalTimetable.wizardDraft.v1')") is None
    if dialog_scroll:
        page.wait_for_function(
            "target => Math.abs(document.querySelector('#personal-wizard-dialog').scrollTop - target) <= 2",
            arg=dialog_scroll,
        )

    first_title.click()
    expect(page.locator(".course-header h1")).to_be_visible()
    page.go_back()
    expect(page.locator("#personal-wizard-dialog")).to_be_visible()
    expect(first_select).to_have_attribute("aria-pressed", "true")
    assert page.evaluate("key => localStorage.getItem(key)", key) is None

    snapshot(page, folder, f"{width}-{theme}-wizard")
    page.locator(f'[data-course-id="{alternative}"] .personal-wizard-card__select').click()
    expect(page.locator("#personal-conflict-replace")).to_be_visible()
    snapshot(page, folder, f"{width}-{theme}-conflict")
    page.locator("#personal-conflict-replace").click()
    expect(first_select).to_have_attribute("aria-pressed", "false")
    page.locator("#personal-wizard-next").click()
    assert page.evaluate("key => localStorage.getItem(key)", key) is None
    page.locator("#personal-wizard-save").click()
    expect(page.locator("#personal-mode-button")).to_have_attribute("aria-pressed", "true")
    page.reload()
    expect(page.locator("#personal-mode-button")).to_have_attribute("aria-pressed", "true")
    profile = page.evaluate("key => JSON.parse(localStorage.getItem(key))", key)
    assert profile["manualSelectedCourseIds"] == [alternative]
    original = page.evaluate("key => localStorage.getItem(key)", key)
    page.locator("#personal-settings-button").click()
    page.locator("#personal-wizard-next").click()
    page.locator("#personal-wizard-next").click()
    for tab in page.locator("#personal-period-tabs button").all():
        tab.click()
        if page.locator(".personal-wizard-card.is-available").count():
            break
    page.locator(".personal-wizard-card.is-available .personal-wizard-card__select").first.click()
    page.locator('#personal-wizard-dialog [data-personal-close]').first.click()
    assert page.evaluate("key => localStorage.getItem(key)", key) == original
    page.locator("#display-preferences-button").click()
    preference(page, "density", "compact")
    page.keyboard.press("Escape")
    assert page.evaluate("key => localStorage.getItem(key)", key) == original
    page.locator("#school-mode-button").click()
    expect(page.locator("#school-mode-button")).to_have_attribute("aria-pressed", "true")


def check_view(browser, base, width, theme, folder):
    ctx = browser.new_context(viewport={"width": width, "height": 844 if width == 390 else 900},
                              has_touch=width == 390, color_scheme="light")
    page = ctx.new_page()
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.on("console", lambda msg: errors.append(msg.text) if msg.type == "error" else None)
    check_preferences(page, base)
    page.locator("#display-preferences-button").click()
    preference(page, "theme", theme)
    snapshot(page, folder, f"{width}-{theme}-settings")
    page.keyboard.press("Escape")
    page.locator("#keyword").fill("Web")
    expect(page.locator(".course-card").first).to_be_visible()
    snapshot(page, folder, f"{width}-{theme}-catalog")
    assert page.locator(".course-card").count() < 57
    page.locator(".course-card__title-link").first.click()
    expect(page.locator(".course-header h1")).to_be_visible()
    expect(page.locator("html")).to_have_attribute("data-theme", theme)
    snapshot(page, folder, f"{width}-{theme}-detail")
    check_calendar(page, base, width, theme, folder)
    page.goto(base + "?demo=1&date=2026-11-02")
    expect(page.locator(".timetable-entry").first).to_be_visible()
    page.locator("#timetable-date-heading").evaluate("el => el.scrollIntoView()")
    snapshot(page, folder, f"{width}-{theme}-day")
    check_wizard(page, width, theme, folder)
    page.goto(base + "?demo=0&date=2025-04-21")
    expect(page.locator(".timetable-entry").first).to_be_visible()
    expect(page.locator("#demo-mode-banner")).to_be_hidden()
    expect(page.locator("html")).to_have_attribute("data-theme", theme)
    assert page.evaluate("localStorage.getItem('classview.personalTimetable.profile')") is None
    page.locator("#calendar-button").click()
    page.locator('[data-date="2025-04-30"]').click()
    expect(page.locator("#timetable-content")).to_contain_text("この日の時間割は登録されていません")
    assert not errors, errors
    ctx.close()
    print(f"Passed {width}px / {theme}", flush=True)


def check_fallback(browser, base):
    for script in [
        "Object.defineProperty(window, 'localStorage', {get() { throw new Error('disabled'); }})",
        "localStorage.setItem('classview.displayPreferences', '{bad')",
        """localStorage.setItem('classview.displayPreferences', '{"theme":"purple","density":{},"textSize":42}')""",
    ]:
        ctx = browser.new_context(color_scheme="light")
        ctx.add_init_script(script)
        page = ctx.new_page()
        page.goto(base)
        expect(page.locator(".timetable-entry").first).to_be_visible()
        root = page.locator("html")
        for name, value in [("theme", "light"), ("density", "standard"), ("text-size", "standard")]:
            expect(root).to_have_attribute("data-" + name, value)
        page.locator("#display-preferences-button").click()
        preference(page, "theme", "dark")
        expect(root).to_have_attribute("data-theme", "dark")
        ctx.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("url")
    parser.add_argument("--browser-path")
    parser.add_argument("--screenshots", type=Path)
    args = parser.parse_args()
    if args.screenshots:
        args.screenshots.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as pw:
        browser = pw.chromium.launch(executable_path=args.browser_path)
        base = args.url.rstrip("/") + "/"
        check_fallback(browser, base)
        for width, theme in product((1440, 390), ("light", "dark")):
            check_view(browser, base, width, theme, args.screenshots)
        browser.close()
