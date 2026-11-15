"""Playwright checks and comparison screenshots for the timetable CSS style lab."""

import argparse
from pathlib import Path
from urllib.parse import urlencode

from playwright.sync_api import expect, sync_playwright


THEMES = "abcdefgh"
THEME_LABELS = {
    "a": "A Current refined",
    "b": "B Minimal",
    "c": "C Academic",
    "d": "D Technology",
    "e": "E Friendly",
    "f": "F Dense",
    "g": "G School",
    "h": "H Signal",
}
SCENARIOS = (
    ("pc-week", 1440, 1000, "week", "personal", "2026-11-02", "light"),
    ("pc-day", 1440, 1000, "day", "school", "2026-11-05", "light"),
    ("mobile", 390, 844, "day", "personal", "2026-11-02", "light"),
    ("dark", 1440, 1000, "week", "personal", "2026-11-02", "dark"),
)


def lab_url(base, **query):
    return f"{base}prototypes/timetable-style-lab/index.html?{urlencode(query)}"


def watch_errors(page, errors):
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.on(
        "console",
        lambda message: errors.append(message.text)
        if message.type == "error" and "Failed to load resource" not in message.text
        else None,
    )
    page.on(
        "response",
        lambda response: errors.append(f"HTTP {response.status}: {response.url}")
        if response.status >= 400 and not response.url.endswith("/favicon.ico")
        else None,
    )


def assert_layout(page, label):
    assert page.evaluate("document.documentElement.scrollWidth <= innerWidth + 1"), label
    assert page.locator(".lesson-card").count() > 0, label
    assert page.locator(".lesson-card__title").evaluate_all(
        "nodes => nodes.every(node => node.scrollWidth <= node.clientWidth + 1)"
    ), f"title overflow: {label}"


def check_theme_switch_preserves_dom(page, base):
    page.goto(lab_url(base, theme="a", view="week", mode="personal", date="2026-11-02", color="light"))
    expect(page.locator(".lesson-card").first).to_be_visible()
    initial_html = page.locator("#timetable-root").evaluate("node => node.innerHTML")
    initial_titles = page.locator(".lesson-card__title").all_text_contents()
    for theme in THEMES:
        page.locator(f'.theme-tab[data-theme="{theme}"]').click()
        expect(page.locator(f'.theme-tab[data-theme="{theme}"]')).to_have_attribute("aria-selected", "true")
        assert f"themes/{theme}-" in page.locator("#theme-stylesheet").get_attribute("href")
        assert page.locator("#timetable-root").evaluate("node => node.innerHTML") == initial_html
        assert page.locator(".lesson-card__title").all_text_contents() == initial_titles

    page.locator("#mode-school").click()
    page.locator("#view-day").click()
    page.locator("#date-next").click()
    before_switch = {
        "mode": page.locator("#mode-school").get_attribute("aria-pressed"),
        "view": page.locator("#view-day").get_attribute("aria-pressed"),
        "heading": page.locator("#timetable-heading").inner_text(),
        "titles": page.locator(".lesson-card__title").all_text_contents(),
    }
    page.locator('.theme-tab[data-theme="b"]').click()
    after_switch = {
        "mode": page.locator("#mode-school").get_attribute("aria-pressed"),
        "view": page.locator("#view-day").get_attribute("aria-pressed"),
        "heading": page.locator("#timetable-heading").inner_text(),
        "titles": page.locator(".lesson-card__title").all_text_contents(),
    }
    assert before_switch == after_switch

    page.locator("#color-mode-toggle").click()
    expect(page.locator("html")).to_have_attribute("data-color-mode", "dark")
    assert before_switch["titles"] == page.locator(".lesson-card__title").all_text_contents()

    detail = page.locator('a[href*="course.html?id="]').first
    expect(detail).to_be_visible()
    assert "demo=1" in detail.get_attribute("href")
    detail.press("Enter")
    expect(page.locator(".course-header h1")).to_be_visible()
    page.go_back()
    expect(page.locator("#timetable-root")).to_be_visible()


def capture(browser, base, output):
    control_context = browser.new_context(viewport={"width": 1440, "height": 1000})
    control_page = control_context.new_page()
    errors = []
    watch_errors(control_page, errors)
    check_theme_switch_preserves_dom(control_page, base)
    assert not errors, errors
    control_context.close()

    for theme in THEMES:
        for scenario, width, height, view, mode, date, color in SCENARIOS:
            context = browser.new_context(
                viewport={"width": width, "height": height},
                has_touch=width == 390,
                device_scale_factor=1,
                color_scheme="dark" if color == "dark" else "light",
            )
            page = context.new_page()
            errors = []
            watch_errors(page, errors)
            page.goto(lab_url(base, theme=theme, view=view, mode=mode, date=date, color=color, embed="1"))
            expect(page.locator(".lesson-card").first).to_be_visible()
            expect(page.locator("html")).to_have_attribute("data-color-mode", color)
            assert_layout(page, f"{theme}-{scenario}")
            page.screenshot(path=output / f"{theme}-{scenario}.png")
            assert not errors, (theme, scenario, errors)
            context.close()
        print(f"Captured theme {theme.upper()}", flush=True)


def check_compare(browser, base, output):
    context = browser.new_context(viewport={"width": 1440, "height": 1000})
    page = context.new_page()
    page.goto(lab_url(base, theme="a", view="week", mode="personal", date="2026-11-02", color="light"))
    page.locator("#compare-toggle").click()
    expect(page.locator("#compare-preview")).to_be_visible()
    expect(page.locator("#compare-preview iframe")).to_have_count(2)
    page.locator("#compare-left").select_option("c")
    page.locator("#compare-right").select_option("h")
    expect(page.locator("#compare-left-heading")).to_contain_text("アカデミック")
    expect(page.locator("#compare-right-heading")).to_contain_text("シグナル")
    assert "theme=c" in page.locator("#compare-left-frame").get_attribute("src")
    assert "theme=h" in page.locator("#compare-right-frame").get_attribute("src")
    page.screenshot(path=output / "side-by-side.png", full_page=True)
    context.close()


def make_contact_sheets(output):
    try:
        from PIL import Image, ImageDraw, ImageFont
    except ImportError:
        print("Pillow is unavailable; contact sheets skipped", flush=True)
        return

    font = ImageFont.load_default()
    for scenario in ("pc-week", "pc-day", "mobile", "dark"):
        files = [output / f"{theme}-{scenario}.png" for theme in THEMES]
        images = [Image.open(path).convert("RGB") for path in files]
        if scenario == "mobile":
            thumb_width, thumb_height, columns = 260, 562, 4
        else:
            thumb_width, thumb_height, columns = 520, 361, 2
        margin, caption = 24, 34
        rows = (len(images) + columns - 1) // columns
        sheet = Image.new(
            "RGB",
            (thumb_width * columns + margin * (columns + 1), (thumb_height + caption) * rows + margin * (rows + 1)),
            "#e9edf1",
        )
        draw = ImageDraw.Draw(sheet)
        for index, (theme, image) in enumerate(zip(THEMES, images)):
            image.thumbnail((thumb_width, thumb_height))
            x = margin + (index % columns) * (thumb_width + margin)
            y = margin + (index // columns) * (thumb_height + caption + margin)
            draw.text((x, y + 8), THEME_LABELS[theme], fill="#19232d", font=font)
            sheet.paste(image, (x, y + caption))
        sheet.save(output / f"comparison-{scenario}.png")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("url", help="Repository-root static server URL")
    parser.add_argument("--screenshots", type=Path, required=True)
    parser.add_argument("--browser-path")
    args = parser.parse_args()
    args.screenshots.mkdir(parents=True, exist_ok=True)
    base = args.url.rstrip("/") + "/"

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(executable_path=args.browser_path)
        capture(browser, base, args.screenshots)
        check_compare(browser, base, args.screenshots)
        browser.close()
    make_contact_sheets(args.screenshots)
    print("Timetable style lab browser checks passed", flush=True)
