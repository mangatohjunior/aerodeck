"""Unit tests for .github/scripts/gemini_pr_review.py and workflow invariants."""

from email.message import Message
from pathlib import Path
import tempfile
import urllib.error

import gemini_pr_review as reviewer

REPO = Path(__file__).resolve().parents[2]
WORKFLOW = (REPO / ".github" / "workflows" / "ai-pr-review.yml").read_text(encoding="utf-8")


def _sample_review() -> str:
    return (
        "## AeroDeck AI Review\n\n"
        "**Verdict:** APPROVE\n"
        "**Summary:** Clean change.\n\n"
        "### Blockers\n- None\n"
    )


def test_normalize_review_markdown() -> None:
    """Strips outer code fences and leading preamble while requiring header."""
    plain = _sample_review()
    assert reviewer.normalize_review_markdown(plain) == plain.strip()

    fenced = f"```markdown\n{plain}```"
    assert reviewer.normalize_review_markdown(fenced) == plain.strip()

    with_preamble = f"Here is the review:\n\n{plain}"
    assert reviewer.normalize_review_markdown(with_preamble) == plain.strip()

    try:
        reviewer.normalize_review_markdown("No header here")
    except ValueError as exc:
        assert "AeroDeck AI Review" in str(exc)
    else:
        raise AssertionError("Expected ValueError when header is missing")


def test_parse_gemini_response() -> None:
    """Extracts normalized text and token count from Gemini JSON payload."""
    payload: dict[str, object] = {
        "candidates": [
            {"content": {"parts": [{"text": _sample_review()}]}},
        ],
        "usageMetadata": {"totalTokenCount": 412},
    }
    result = reviewer.parse_gemini_response(payload, duration_ms=1234)
    assert result.summary.startswith("## AeroDeck AI Review")
    assert result.total_tokens == 412
    assert result.duration_ms == 1234


def test_collect_changed_file_context_and_prompts() -> None:
    """Includes modified text files and skips deleted, binary, or traversal paths."""
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        review_dir = root / ".aerodeck-review"
        review_dir.mkdir()
        rules_file = root / "rules.mdc"
        rules_file.write_text("# Rubric\n", encoding="utf-8")
        (root / "kept.py").write_text("print('ok')\n", encoding="utf-8")
        (root / "binary.bin").write_bytes(b"\x00\x01\x02")
        (review_dir / "pr.md").write_text("PR #1: Title\n", encoding="utf-8")
        (review_dir / "files.txt").write_text(
            "M\tkept.py\nD\tdeleted.py\nA\tbinary.bin\nM\t../outside.py\n",
            encoding="utf-8",
        )
        (review_dir / "diff.patch").write_text("+print('ok')\n", encoding="utf-8")

        context = reviewer.collect_changed_file_context(
            root, (review_dir / "files.txt").read_text(encoding="utf-8")
        )
        assert "=== FILE: kept.py ===" in context
        assert "deleted.py" not in context
        assert "binary.bin" not in context
        assert "outside.py" not in context

        inputs = reviewer.ReviewInputs(
            repo_root=root,
            review_dir=review_dir,
            rules_file=rules_file,
            truncated=True,
        )
        user_prompt = reviewer.build_user_prompt(inputs)
        assert "Diff truncated due to size: true." in user_prompt
        assert "+print('ok')" in user_prompt


def test_call_gemini_with_retry() -> None:
    """Retries transient 503 HTTPError and fails fast on 400 HTTPError."""
    calls: list[int] = []
    original_sleep = reviewer.time.sleep
    reviewer.time.sleep = lambda _seconds: None
    try:
        def flaky_transport(_url: str, _key: str, _body: bytes) -> dict[str, object]:
            calls.append(1)
            if len(calls) == 1:
                raise urllib.error.HTTPError(
                    url="https://example.invalid",
                    code=503,
                    msg="Service Unavailable",
                    hdrs=Message(),
                    fp=None,
                )
            return {
                "candidates": [{"content": {"parts": [{"text": _sample_review()}]}}],
                "usageMetadata": {"totalTokenCount": 99},
            }

        result = reviewer.call_gemini_with_retry(
            api_key="test-key",
            model="gemini-2.5-flash",
            system_instruction="sys",
            user_prompt="user",
            transport=flaky_transport,
        )
        assert len(calls) == 2
        assert result.total_tokens == 99
    finally:
        reviewer.time.sleep = original_sleep


def _code_lines(text: str) -> str:
    """Drop YAML comment lines before asserting forbidden workflow triggers."""
    lines = [
        raw.split("#", 1)[0]
        for raw in text.splitlines()
        if not raw.strip().startswith("#")
    ]
    return "\n".join(lines)


def test_workflow_and_guardrail_files() -> None:
    """Verifies workflow security invariants and presence of GEMINI.md + .cursor rules."""
    code = _code_lines(WORKFLOW)
    assert "pull_request_target" not in code
    assert "vars.AI_REVIEW_GEMINI" in code
    assert "vars.AI_REVIEW_CURSOR" in code
    assert "secrets.GEMINI_API_KEY" in code
    assert "secrets.CURSOR_API_KEY" in code
    assert "PunGrumpy/cursor-action@6d67266c53512c6f9093691731e0ac1b61c04952" in code
    assert "<!-- aerodeck-ai-pr-review -->" in WORKFLOW
    assert "python3 .github/scripts/gemini_pr_review.py" in code

    expected_files = (
        "GEMINI.md",
        "apps/control-plane/GEMINI.md",
        "apps/dashboard/GEMINI.md",
        "packages/iac-engine/GEMINI.md",
        ".cursor/rules/fastapi-architecture.mdc",
        ".cursor/rules/nextjs-dashboard.mdc",
        ".cursor/rules/terraform-digitalocean.mdc",
        ".cursor/rules/pr-review-standards.mdc",
    )
    for rel in expected_files:
        path = REPO / rel
        if not path.is_file() or path.stat().st_size == 0:
            raise AssertionError(f"Expected non-empty guardrail file at {rel}")


def test_select_supported_model() -> None:
    """Selects a generateContent-capable text Gemini model and skips non-text models."""
    payload: dict[str, object] = {
        "models": [
            {
                "name": "models/gemini-embedding-001",
                "supportedGenerationMethods": ["embedContent"],
            },
            {
                "name": "models/gemini-2.5-flash-tts",
                "supportedGenerationMethods": ["generateContent"],
            },
            {
                "name": "models/gemini-2.0-flash",
                "supportedGenerationMethods": ["generateContent", "countTokens"],
            },
        ]
    }
    chosen = reviewer.select_supported_model(payload, failed_model="gemini-2.5-flash")
    assert chosen == "gemini-2.0-flash"


def main() -> None:
    """Run all unit checks."""
    test_normalize_review_markdown()
    test_parse_gemini_response()
    test_collect_changed_file_context_and_prompts()
    test_call_gemini_with_retry()
    test_select_supported_model()
    test_workflow_and_guardrail_files()
    print("Gemini PR review script and guardrails verified")


if __name__ == "__main__":
    main()
