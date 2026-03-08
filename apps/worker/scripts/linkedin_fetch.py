#!/usr/bin/env python3
"""
Lookup a person's public profile using social-analyzer (OSINT).

Usage:
    python3 linkedin_fetch.py <name_or_handle> [--linkedin-url <url>]

No credentials required - uses public OSINT data only.

Outputs a JSON object to stdout on success:
    {
        "found": true,
        "name": "...",
        "headline": "...",
        "summary": "...",
        "platforms": [{"platform": "...", "url": "..."}]
    }

Exits with non-zero status on failure; error message goes to stderr.
"""

import json
import os
import re
import subprocess
import sys
import tempfile
from typing import Any


def extract_linkedin_handle(url: str) -> str | None:
    """Extract the LinkedIn username/handle from a URL."""
    match = re.search(r"linkedin\.com/in/([^/?#]+)", url, re.IGNORECASE)
    return match.group(1) if match else None


def extract_name_parts(name: str) -> dict[str, str]:
    """Extract first and last name from full name."""
    parts = name.strip().split()
    if len(parts) == 0:
        return {}
    elif len(parts) == 1:
        return {"first": parts[0]}
    else:
        return {"first": parts[0], "last": parts[-1]}


def run_social_analyzer(username: str) -> dict[str, Any] | None:
    """
    Run social-analyzer CLI tool to lookup a username.
    Returns parsed JSON output or None if the tool fails.
    """
    try:
        # Create a temporary output directory
        with tempfile.TemporaryDirectory() as tmpdir:
            output_file = os.path.join(tmpdir, "results.json")

            # Run social-analyzer
            # --username: the handle to search for
            # --metadata: include metadata in results
            # --silent: suppress interactive prompts
            # --output: output format (json)
            result = subprocess.run(
                [
                    "social-analyzer",
                    "--cli",
                    "--username", username,
                    "--metadata",
                    "--silent",
                    "--output", "json",
                    "--folder", tmpdir,
                ],
                capture_output=True,
                text=True,
                timeout=60,
            )

            # social-analyzer may return non-zero even on partial success
            # Check if output file was created
            if os.path.exists(output_file):
                with open(output_file, "r", encoding="utf-8") as f:
                    return json.load(f)

            # If no output file, check stdout
            if result.stdout.strip():
                try:
                    return json.loads(result.stdout)
                except json.JSONDecodeError:
                    pass

            return None

    except subprocess.TimeoutExpired:
        print(f"[social-analyzer] Timeout after 60s", file=sys.stderr)
        return None
    except FileNotFoundError:
        print(
            "Error: social-analyzer is not installed.\n"
            "Run: pip install social-analyzer",
            file=sys.stderr,
        )
        return None
    except Exception as e:
        print(f"[social-analyzer] Error: {e}", file=sys.stderr)
        return None


def format_results(data: dict[str, Any], original_name: str) -> dict[str, Any]:
    """
    Format social-analyzer output to match expected structure.

    Expected output:
    {
        "found": true/false,
        "name": "...",
        "headline": "...",
        "summary": "...",
        "platforms": [{"platform": "...", "url": "..."}]
    }
    """
    result: dict[str, Any] = {"found": False}

    if not data:
        return result

    # social-analyzer returns an array of results, one per username searched
    items = data if isinstance(data, list) else [data]

    platforms = []
    name = original_name
    summary_parts = []

    for item in items:
        # Extract name if available
        if "name" in item and item["name"]:
            name = item["name"]

        # Extract platform links
        if "sites" in item:
            sites = item["sites"]
            if isinstance(sites, list):
                for site in sites:
                    if isinstance(site, dict):
                        platform_name = site.get("name", "")
                        url = site.get("url", "")
                        if platform_name and url:
                            platforms.append({
                                "platform": platform_name,
                                "url": url
                            })

                            # Try to extract bio/description from LinkedIn
                            if "linkedin" in platform_name.lower():
                                if "bio" in site:
                                    summary_parts.append(site["bio"])
                                if "headline" in site:
                                    result["headline"] = site["headline"]

    # If we found any platforms, mark as found
    if platforms or summary_parts:
        result["found"] = True
        result["name"] = name
        result["platforms"] = platforms

        if summary_parts:
            result["summary"] = "\n".join(summary_parts)

    return result


def main() -> None:
    if len(sys.argv) < 2:
        print("Usage: python3 linkedin_fetch.py <name_or_handle> [--linkedin-url <url>]", file=sys.stderr)
        sys.exit(1)

    # Parse arguments
    name_or_handle = sys.argv[1]
    linkedin_url = None

    if "--linkedin-url" in sys.argv:
        idx = sys.argv.index("--linkedin-url")
        if idx + 1 < len(sys.argv):
            linkedin_url = sys.argv[idx + 1]

    # Determine username to search
    username = None

    # Try to extract from LinkedIn URL first
    if linkedin_url:
        username = extract_linkedin_handle(linkedin_url)

    # If no LinkedIn handle, try to use the name directly as a handle
    # (e.g., "wesleyquek" or the last name)
    if not username:
        # Try the input as-is first (might already be a handle)
        if " " not in name_or_handle.strip():
            username = name_or_handle.strip()
        else:
            # Extract last name as a potential username
            parts = extract_name_parts(name_or_handle)
            username = parts.get("last", parts.get("first", name_or_handle))

    if not username:
        print(json.dumps({"found": False, "error": "Could not determine username"}))
        sys.exit(0)

    # Run social-analyzer
    data = run_social_analyzer(username)

    # Format and output results
    result = format_results(data, name_or_handle)
    print(json.dumps(result))

    # Exit successfully even if not found (allows fallback to web search)
    sys.exit(0)


if __name__ == "__main__":
    main()
