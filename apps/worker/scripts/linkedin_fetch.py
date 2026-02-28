#!/usr/bin/env python3
"""
Fetch a LinkedIn profile using the linkedin_scraper library.

Usage:
    python3 linkedin_fetch.py <linkedin_url>

Required env vars:
    LINKEDIN_USER (or LINKEDIN_EMAIL) — LinkedIn account email
    LINKEDIN_PASSWORD                 — LinkedIn account password

Optional env vars:
    LINKEDIN_SESSION_PATH — path to persist the auth session
                            (default: /tmp/linkedin_session.json)

Outputs a JSON object to stdout on success.
Exits with non-zero status on failure; error message goes to stderr.
"""

import asyncio
import json
import os
import sys
from typing import Any

try:
    from linkedin_scraper import BrowserManager, PersonScraper, login_with_credentials
except ImportError:
    print(
        "Error: linkedin_scraper is not installed.\n"
        "Run: pip install linkedin-scraper && python3 -m playwright install chromium",
        file=sys.stderr,
    )
    sys.exit(1)

SESSION_PATH: str = os.getenv("LINKEDIN_SESSION_PATH", "/tmp/linkedin_session.json")


def _safe_str(value: Any) -> str | None:
    if value is None:
        return None
    s = str(value).strip()
    return s if s else None


def format_person(person: Any) -> dict:
    result: dict[str, Any] = {}

    if name := _safe_str(getattr(person, "name", None)):
        result["name"] = name
    if headline := _safe_str(getattr(person, "headline", None)):
        result["headline"] = headline
    if about := _safe_str(getattr(person, "about", None)):
        result["about"] = about
    if location := _safe_str(getattr(person, "location", None)):
        result["location"] = location

    # Experiences — most recent 5
    experiences: list = getattr(person, "experiences", None) or []
    if experiences:
        exp_list = []
        for exp in experiences[:5]:
            entry: dict[str, str] = {}
            for title_attr in ("position_title", "title", "role"):
                if val := _safe_str(getattr(exp, title_attr, None)):
                    entry["title"] = val
                    break
            for company_attr in ("institution_name", "company", "organisation"):
                if val := _safe_str(getattr(exp, company_attr, None)):
                    entry["company"] = val
                    break
            if val := _safe_str(getattr(exp, "date_range", None)):
                entry["date_range"] = val
            if val := _safe_str(getattr(exp, "description", None)):
                entry["description"] = val[:300]
            if entry:
                exp_list.append(entry)
        if exp_list:
            result["experiences"] = exp_list

    # Educations — most recent 2
    educations: list = getattr(person, "educations", None) or []
    if educations:
        edu_list = []
        for edu in educations[:2]:
            entry = {}
            for school_attr in ("institution_name", "school", "university"):
                if val := _safe_str(getattr(edu, school_attr, None)):
                    entry["institution"] = val
                    break
            if val := _safe_str(getattr(edu, "degree", None)):
                entry["degree"] = val
            if entry:
                edu_list.append(entry)
        if edu_list:
            result["educations"] = edu_list

    # Skills — top 15
    skills: list = getattr(person, "skills", None) or []
    if skills:
        result["skills"] = [str(s) for s in skills[:15]]

    return result


async def scrape(url: str) -> dict:
    email = os.getenv("LINKEDIN_USER") or os.getenv("LINKEDIN_EMAIL")
    password = os.getenv("LINKEDIN_PASSWORD")

    if not email or not password:
        raise ValueError(
            "LINKEDIN_USER and LINKEDIN_PASSWORD environment variables are required"
        )

    async with BrowserManager(headless=True) as browser:
        logged_in = False

        # Try resuming an existing session first
        if os.path.exists(SESSION_PATH):
            try:
                await browser.load_session(SESSION_PATH)
                logged_in = True
            except Exception as e:
                print(
                    f"[linkedin_fetch] Session load failed, will re-login: {e}",
                    file=sys.stderr,
                )

        if not logged_in:
            await login_with_credentials(
                browser.page, username=email, password=password
            )
            try:
                await browser.save_session(SESSION_PATH)
            except Exception:
                pass  # Non-fatal — we can re-login next time

        scraper_obj = PersonScraper(browser.page)

        try:
            person = await scraper_obj.scrape(url)
        except Exception as scrape_err:
            if logged_in:
                # Cached session may have expired — re-login and retry once
                print(
                    "[linkedin_fetch] Scrape failed with cached session, re-logging in…",
                    file=sys.stderr,
                )
                await login_with_credentials(
                    browser.page, username=email, password=password
                )
                try:
                    await browser.save_session(SESSION_PATH)
                except Exception:
                    pass
                person = await scraper_obj.scrape(url)
            else:
                raise scrape_err

        return format_person(person)


def main() -> None:
    if len(sys.argv) < 2:
        print("Usage: python3 linkedin_fetch.py <linkedin_url>", file=sys.stderr)
        sys.exit(1)

    url = sys.argv[1]

    try:
        result = asyncio.run(scrape(url))
        print(json.dumps(result))
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
