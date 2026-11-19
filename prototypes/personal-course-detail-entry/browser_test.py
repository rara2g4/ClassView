"""Interaction and responsive checks for the course-detail entry prototype."""

import argparse
import re
from pathlib import Path

from playwright.sync_api import expect, sync_playwright


SELECTED_ID = "demo-visual-design"
AVAILABLE_ID = "demo-expanded-g1-01"


def assert_no_horizontal_overflow(page, label):
    assert page.evaluate("document.documentElement.scrollWidth <= innerWidth + 1"), label


def card(page, course_id):
    return page.locator(f'[data-course-id="{course_id}"]').first


def detail_button(page, course_id):
    return card(page, course_id).locator(
        ".prototype-course-card__detail, .prototype-course-card__title-button"
    )


def check_detail_does_not_select(page, course_id):
    select = card(page, course_id).locator(".prototype-course-card__select")
    before = select.get_attribute("aria-pressed")
    trigger = detail_button(page, course_id)
    trigger.click()
    expect(page.locator("#course-detail-dialog")).to_be_visible()
    expect(page.locator("#detail-title")).not_to_be_empty()
    assert select.get_attribute("aria-pressed") == before
    page.keyboard.press("Escape")
    expect(trigger).to_be_focused()
    assert select.get_attribute("aria-pressed") == before


def check_interactions(page, base_url):
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.goto(base_url, wait_until="networkidle")
    expect(page.locator("#candidate-area .prototype-course-card")).to_have_count(8)
    expect(page.locator('[data-course-id="demo-digital-foundations"]')).to_have_class(
        re.compile(r"\bis-required\b")
    )
    expect(page.locator('[data-course-id="demo-required-overlap"]')).to_have_class(
        re.compile(r"\bis-blocked\b")
    )
    assert_no_horizontal_overflow(page, "initial view")

    check_detail_does_not_select(page, SELECTED_ID)
    available = card(page, AVAILABLE_ID).locator(".prototype-course-card__select")
    expect(available).to_have_attribute("aria-pressed", "false")
    available.click()
    expect(available).to_have_attribute("aria-pressed", "true")
    expect(page.locator("#selected-summary")).to_have_text("4科目・7コマ")

    page.locator('[data-variant="b"]').click()
    expect(page.locator('[data-variant="b"]')).to_have_attribute("aria-selected", "true")
    b_detail = detail_button(page, SELECTED_ID)
    assert b_detail.bounding_box()["height"] >= 44
    check_detail_does_not_select(page, SELECTED_ID)

    page.locator('[data-variant="c"]').click()
    expect(page.locator('[data-variant="c"]')).to_have_attribute("aria-selected", "true")
    check_detail_does_not_select(page, SELECTED_ID)

    page.locator('[data-variant="c"]').focus()
    page.keyboard.press("ArrowRight")
    expect(page.locator('[data-variant="compare"]')).to_have_attribute("aria-selected", "true")
    expect(page.locator(".prototype-compare-column")).to_have_count(3)
    expect(page.locator("#candidate-area .prototype-course-card")).to_have_count(9)
    assert_no_horizontal_overflow(page, "comparison view")
    assert not errors, errors


def check_view(browser, base_url, width, height, screenshot_path):
    context = browser.new_context(viewport={"width": width, "height": height})
    page = context.new_page()
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    variant = "compare" if width == 1440 else "b"
    page.goto(f"{base_url}?variant={variant}", wait_until="networkidle")
    assert_no_horizontal_overflow(page, f"{width}px view")

    if width == 1440:
        expect(page.locator(".prototype-compare-column")).to_have_count(3)
    else:
        expect(page.locator("#candidate-area .prototype-course-card")).to_have_count(8)
        cards = page.locator("#candidate-area .prototype-course-card")
        first = cards.nth(0).bounding_box()
        second = cards.nth(1).bounding_box()
        assert second["y"] > first["y"], "mobile cards must be one column"
        assert detail_button(page, SELECTED_ID).bounding_box()["height"] >= 44

    page.screenshot(path=screenshot_path, full_page=True)
    assert not errors, errors
    context.close()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("url")
    parser.add_argument("--browser-path")
    parser.add_argument("--screenshots", type=Path, required=True)
    args = parser.parse_args()
    args.screenshots.mkdir(parents=True, exist_ok=True)

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(
            executable_path=args.browser_path,
            headless=True,
        )
        base_url = args.url.rstrip("/")
        interaction_page = browser.new_page(viewport={"width": 1440, "height": 1000})
        check_interactions(interaction_page, base_url)
        interaction_page.close()
        check_view(
            browser,
            base_url,
            1440,
            1000,
            args.screenshots / "desktop-comparison.png",
        )
        check_view(
            browser,
            base_url,
            390,
            844,
            args.screenshots / "mobile-b-detail.png",
        )
        browser.close()

    print("browser prototype checks: PASS")


if __name__ == "__main__":
    main()
