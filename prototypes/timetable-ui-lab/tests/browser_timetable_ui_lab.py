"""Playwright checks and screenshots for the isolated timetable UI lab."""

import argparse
from pathlib import Path
from urllib.parse import urlencode

from playwright.sync_api import expect, sync_playwright


CONCEPTS = "ABCDEFGH"
SCENARIOS = (
    ("pc-week", 1440, 1000, "week", "personal", "2026-11-02"),
    ("pc-day", 1440, 1000, "day", "school", "2026-11-05"),
    ("mobile", 390, 844, "day", "personal", "2026-11-02"),
    ("dense", 1440, 1000, "week", "school", "2026-11-02"),
)


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


def lab_url(base, **query):
    return f"{base}prototypes/timetable-ui-lab/index.html?{urlencode(query)}"


def assert_viewport(page, label):
    assert page.evaluate("document.documentElement.scrollWidth <= innerWidth + 1"), label
    assert page.locator(".prototype").count() == 1, label
    assert page.locator(".course-card, .dense-row:not(.dense-row--head)").count() > 0, label


def check_interactions(page, base, concept):
    page.goto(lab_url(base, concept=concept, view="week", mode="school", date="2026-11-02"))
    expect(page.locator("#prototype-status")).to_contain_text("学校全体")
    page.locator("#mode-personal").click()
    expect(page.locator("#mode-personal")).to_have_attribute("aria-pressed", "true")
    expect(page.locator("#prototype-status")).to_contain_text("保存済み個人時間割")
    page.locator("#view-day").click()
    expect(page.locator("#view-day")).to_have_attribute("aria-pressed", "true")
    before = page.url
    page.locator("#date-next").click()
    assert page.url != before
    page.locator("#date-previous").click()
    page.locator("#date-reset").click()
    assert "date=2026-11-02" in page.url

    detail = page.locator('a[href*="course.html?id="]').first
    expect(detail).to_be_visible()
    href = detail.get_attribute("href")
    assert "demo=1" in href, href
    detail.press("Enter")
    expect(page.locator(".course-header h1")).to_be_visible()
    assert "demo=1" in page.url
    page.go_back()
    expect(page.locator(".prototype")).to_be_visible()


def capture_scenarios(browser, base, output):
    for concept in CONCEPTS:
        check_context = browser.new_context(viewport={"width": 1440, "height": 1000})
        check_page = check_context.new_page()
        errors = []
        watch_errors(check_page, errors)
        check_interactions(check_page, base, concept)
        assert not errors, (concept, errors)
        check_context.close()

        for scenario, width, height, view, mode, date in SCENARIOS:
            context = browser.new_context(
                viewport={"width": width, "height": height},
                has_touch=width == 390,
                device_scale_factor=1,
            )
            page = context.new_page()
            errors = []
            watch_errors(page, errors)
            page.goto(lab_url(base, concept=concept, view=view, mode=mode, date=date))
            expect(page.locator(".prototype")).to_be_visible()
            assert_viewport(page, f"{concept}-{scenario}")
            page.screenshot(path=output / f"{concept.lower()}-{scenario}.png")
            assert not errors, (concept, scenario, errors)
            context.close()
        print(f"Captured and checked concept {concept}", flush=True)


def check_comparison(browser, base, output):
    context = browser.new_context(viewport={"width": 1440, "height": 1000})
    page = context.new_page()
    page.goto(lab_url(base, concept="A", view="week", mode="personal", date="2026-11-02"))
    page.locator("#comparison-toggle").click()
    expect(page.locator("#comparison-panel")).to_be_visible()
    expect(page.locator("#comparison-grid iframe")).to_have_count(8)
    page.screenshot(path=output / "comparison-overview.png", full_page=True)
    context.close()


def make_contact_sheet(output):
    try:
        from PIL import Image, ImageDraw, ImageFont
    except ImportError:
        print("Pillow is unavailable; contact sheet skipped", flush=True)
        return

    files = [output / f"{concept.lower()}-pc-week.png" for concept in CONCEPTS]
    images = [Image.open(path).convert("RGB") for path in files]
    thumb_width = 440
    thumb_height = 306
    margin = 24
    caption = 36
    sheet = Image.new("RGB", (thumb_width * 2 + margin * 3, (thumb_height + caption) * 4 + margin * 5), "#eef1f4")
    draw = ImageDraw.Draw(sheet)
    font = ImageFont.load_default()
    for index, (concept, image) in enumerate(zip(CONCEPTS, images)):
        image.thumbnail((thumb_width, thumb_height))
        x = margin + (index % 2) * (thumb_width + margin)
        y = margin + (index // 2) * (thumb_height + caption + margin)
        sheet.paste(image, (x, y + caption))
        draw.text((x, y + 8), f"{concept}: weekly / personal", fill="#17202a", font=font)
    sheet.save(output / "comparison-contact-sheet.png")


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
        capture_scenarios(browser, base, args.screenshots)
        check_comparison(browser, base, args.screenshots)
        browser.close()
    make_contact_sheet(args.screenshots)
    print("Timetable UI lab browser checks passed", flush=True)
