#!/usr/bin/env python3

# Copyright (c) 2026 Rational Dynamics LLC

from __future__ import annotations

import argparse
import datetime as dt
import json
import pathlib
import re
import subprocess
import sys
from typing import Any

import yaml


SCRIPT_PATH = pathlib.Path(__file__).resolve()
ROOT = SCRIPT_PATH.parents[2]
RUNS_DIR = ROOT / ".harness" / "runs"
LEDGERS_DIR = ROOT / ".harness" / "ledgers"
CONTRACTS_DIR = ROOT / ".harness" / "contracts"
PRODUCT_FEEDBACK_DIR = ROOT / ".harness" / "product-feedback"
LEDGER_INDEX_PATH = LEDGERS_DIR / "INDEX.json"
DOC_SYNC_STATE_PATH = LEDGERS_DIR / "DOC_SYNC_STATE.json"
CONFIG_PATH = ROOT / ".harness" / "pipeline.yaml"

GRADE_BANDS: list[tuple[int, str]] = [
    (93, "A"), (90, "A-"), (87, "B+"), (83, "B"), (80, "B-"),
    (77, "C+"), (73, "C"), (70, "C-"), (60, "D"), (0, "F"),
]
FLOOR_CATEGORIES = {"correctness", "reliability_operational_safety", "security_data_safety"}
DELIVERY_LIKE_MODES = {"delivery", "maintenance", "restructure"}


def grade_from_score(score: float) -> str:
    for threshold, grade in GRADE_BANDS:
        if score >= threshold:
            return grade
    return "F"


def load_config() -> dict[str, Any]:
    if not CONFIG_PATH.exists():
        raise FileNotFoundError(f"Missing config: {CONFIG_PATH}")
    with CONFIG_PATH.open("r", encoding="utf-8") as f:
        return yaml.safe_load(f)


def utc_run_id() -> str:
    return dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%SZ")


def ensure_runs_dir() -> None:
    RUNS_DIR.mkdir(parents=True, exist_ok=True)


def ensure_support_dirs() -> None:
    CONTRACTS_DIR.mkdir(parents=True, exist_ok=True)
    PRODUCT_FEEDBACK_DIR.mkdir(parents=True, exist_ok=True)


def ensure_ledgers_dir() -> None:
    LEDGERS_DIR.mkdir(parents=True, exist_ok=True)
    if not LEDGER_INDEX_PATH.exists():
        write_json(LEDGER_INDEX_PATH, [])
    if not DOC_SYNC_STATE_PATH.exists():
        write_json(DOC_SYNC_STATE_PATH, {
            "last_synced_run_id": None,
            "last_synced_at": None,
            "updated_at": None,
        })


def write_text(path: pathlib.Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")


def write_json(path: pathlib.Path, data: Any) -> None:
    write_text(path, json.dumps(data, indent=2) + "\n")


def read_json(path: pathlib.Path, default: Any = None) -> Any:
    if not path.exists():
        return default
    return json.loads(path.read_text(encoding="utf-8"))


def run_shell(cmd: str) -> dict[str, Any]:
    proc = subprocess.run(
        cmd,
        shell=True,
        cwd=ROOT,
        capture_output=True,
        text=True,
    )
    return {
        "cmd": cmd,
        "exit_code": proc.returncode,
        "stdout_tail": proc.stdout[-8000:],
        "stderr_tail": proc.stderr[-8000:],
        "ran_at": dt.datetime.now(dt.timezone.utc).isoformat(),
    }


def _shell_stdout_full(cmd: str) -> str:
    proc = subprocess.run(
        cmd,
        shell=True,
        cwd=ROOT,
        capture_output=True,
        text=True,
    )
    return proc.stdout or ""


def _plan_stub(mode: str) -> str:
    if mode == "product_feedback":
        return (
            "# Plan\n\n"
            f"Mode: {mode}\n\n"
            "## Initial plan\n"
            "- Identify the workflow or candidate build to evaluate\n"
            "- Refresh customer persona context if needed\n"
            "- Run design and customer-perspective critique\n"
            "- Synthesize domain / market / workflow recommendations\n"
            "- Convert selected items into a development contract\n"
        )
    return (
        "# Plan\n\n"
        f"Mode: {mode}\n\n"
        "## Initial plan\n"
        "- Restate requirements\n"
        "- Identify relevant files\n"
        "- Implement narrowly\n"
        "- Review\n"
        "- QA\n"
        "- Verify\n"
    )


def _run_ledger_stub() -> str:
    return (
        "# Run Ledger\n\n"
        "## Outcome\n"
        "- Task: pending\n"
        "- Result: pending\n"
        "- Scope: pending\n\n"
        "## Key Decisions\n"
        "- pending\n\n"
        "## Verification Learnings\n"
        "- pending\n\n"
        "## Product / Stakeholder Learnings\n"
        "- pending\n\n"
        "## Durable Repo Guidance\n"
        "- pending\n\n"
        "## Deferred / Follow-up\n"
        "- pending\n"
    )


def _delivery_stubs(run_dir: pathlib.Path) -> None:
    write_text(
        run_dir / "REVIEW_NOTES.md",
        "## Blockers\n- \n\n## Important\n- \n\n## Nits\n- \n\n## Verdict\nCHANGES_REQUESTED\n",
    )
    write_text(
        run_dir / "QA_REPORT.md",
        "# QA Report\n\n"
        "## Requirement Trace\n| Requirement | Evidence | Status | Notes |\n| --- | --- | --- | --- |\n\n"
        "## Manual Validation\n- Run Command(s): pending\n- Areas Tested: pending\n- Observations: pending\n- State Verification: pending\n- Limitations: pending\n\n"
        "## Failures\n- \n\n## Verdict\nFAIL\n",
    )
    write_text(
        run_dir / "BUILD_VERIFICATION.md",
        "# Build Verification\n\n## Status\nPENDING\n\n## Notes\n- \n",
    )
    write_text(
        run_dir / "BREAKER_REPORT.md",
        "# Breaker Report\n\n"
        "## Attack Surface\n- pending\n\n"
        "## Break Attempts\n- pending\n\n"
        "## False Confidence Signals\n- pending\n\n"
        "## Findings\n- pending\n\n"
        "## Contractable Follow-On Items\n- pending\n\n"
        "## Verdict\nCONCERNS\n",
    )
    ensure_regression_stub(run_dir)


def _product_feedback_stubs(run_dir: pathlib.Path) -> None:
    persona_path = PRODUCT_FEEDBACK_DIR / "CUSTOMER_PERSONA_SPEC.md"
    if persona_path.exists():
        write_text(run_dir / "CUSTOMER_PERSONA_SPEC.md", persona_path.read_text(encoding="utf-8"))
    else:
        write_text(
            run_dir / "CUSTOMER_PERSONA_SPEC.md",
            "# Customer Persona Spec\n\n## Status\nPending refresh.\n",
        )
    write_text(
        run_dir / "CUSTOMER_PERSONA_FEEDBACK.md",
        "# Customer Persona Feedback\n\n## Workflow Coverage\n- pending\n\n## Feedback Items\n- pending\n\n## Verdict\nPENDING\n",
    )
    write_text(
        run_dir / "DESIGN_RECOMMENDATIONS.md",
        "# Design Recommendations\n\n## Findings\n- pending\n",
    )
    write_text(
        run_dir / "SME_RECOMMENDATIONS.md",
        "# SME Recommendations\n\n## Executive Summary\n- pending\n\n## Recommendations\n- pending\n",
    )
    write_text(
        run_dir / "DEVELOPMENT_CONTRACT.md",
        "# Development Contract\n\nPending production by the Development Contract Producer.\n",
    )


def create_run(
    task: str,
    mode: str,
    *,
    task_source: str,
    parent_run: str | None,
    source_kind: str | None,
    source_artifact: str | None,
) -> pathlib.Path:
    ensure_runs_dir()
    ensure_support_dirs()
    run_dir = RUNS_DIR / utc_run_id()
    run_dir.mkdir(parents=True, exist_ok=False)
    (RUNS_DIR / "current").unlink(missing_ok=True)
    try:
        (RUNS_DIR / "current").symlink_to(run_dir.name)
    except OSError:
        pass

    write_text(run_dir / "TASK.md", task.strip() + "\n")
    write_text(run_dir / "PLAN.md", _plan_stub(mode))
    write_text(run_dir / "RUN_LEDGER.md", _run_ledger_stub())
    write_json(
        run_dir / "RUN_META.json",
        {
            "run_id": run_dir.name,
            "mode": mode,
            "created_at": dt.datetime.now(dt.timezone.utc).isoformat(),
            "task_source": task_source,
            "parent_run": parent_run,
            "source_kind": source_kind,
            "source_artifact": source_artifact,
        },
    )
    write_json(run_dir / "TEST_REPORT.json", {"commands": [], "last_intent": None})
    write_json(run_dir / "RETRY_LOG.jsonl", [])

    if mode in DELIVERY_LIKE_MODES:
        _delivery_stubs(run_dir)
    if mode == "product_feedback":
        _product_feedback_stubs(run_dir)

    return run_dir


def run_intent(config: dict[str, Any], intent: str) -> list[dict[str, Any]]:
    commands = config.get("commands", {}).get(intent, [])
    return [run_shell(cmd) for cmd in commands]


def capture_diff(run_dir: pathlib.Path) -> None:
    full_diff = _shell_stdout_full("git diff")
    write_text(run_dir / "PATCH.diff", full_diff)

    names = run_shell("git diff --name-only")
    files = [line.strip() for line in names["stdout_tail"].splitlines() if line.strip()]

    numstat = run_shell("git diff --numstat")
    added = 0
    deleted = 0
    file_stats: list[dict[str, Any]] = []
    for line in numstat["stdout_tail"].splitlines():
        parts = line.split("\t")
        if len(parts) != 3:
            continue
        a, d, path = parts
        try:
            ai = 0 if a == "-" else int(a)
            di = 0 if d == "-" else int(d)
        except ValueError:
            continue
        added += ai
        deleted += di
        file_stats.append({"path": path, "added": ai, "deleted": di})

    write_json(
        run_dir / "DIFF_STATS.json",
        {
            "files_changed": len(files),
            "files": files,
            "added": added,
            "deleted": deleted,
            "per_file": file_stats,
        },
    )


def parse_markdown_verdict(path: pathlib.Path, patterns: list[str], default: str = "UNKNOWN") -> str:
    if not path.exists():
        return default
    text = path.read_text(encoding="utf-8")
    for pattern in patterns:
        match = re.search(pattern, text, flags=re.IGNORECASE | re.MULTILINE)
        if match:
            return match.group(1).upper()
    return default


def test_summary(report_path: pathlib.Path) -> dict[str, Any]:
    report = read_json(report_path, {"commands": []})
    commands = report.get("commands", [])
    total = len(commands)
    failing = [c for c in commands if c.get("exit_code") != 0]
    return {
        "total": total,
        "failing": len(failing),
        "failing_commands": failing[-5:],
        "all_passed": total > 0 and not failing,
        "ran_any": total > 0,
        "applicable": report.get("applicable", True),
    }


def validate_policy(run_dir: pathlib.Path, config: dict[str, Any]) -> dict[str, Any]:
    capture_diff(run_dir)
    diff_stats = read_json(run_dir / "DIFF_STATS.json", {})
    policies = config.get("policies", {})
    violations: list[str] = []

    files = diff_stats.get("files", [])
    files_changed = diff_stats.get("files_changed", 0)
    diff_lines = diff_stats.get("added", 0) + diff_stats.get("deleted", 0)

    max_files = policies.get("max_files_changed")
    if isinstance(max_files, int) and files_changed > max_files:
        violations.append(f"files_changed_exceeds_limit:{files_changed}>{max_files}")

    max_lines = policies.get("max_diff_lines")
    if isinstance(max_lines, int) and diff_lines > max_lines:
        violations.append(f"diff_lines_exceeds_limit:{diff_lines}>{max_lines}")

    forbidden = policies.get("forbid_paths", [])
    for file in files:
        for prefix in forbidden:
            if file.startswith(prefix) or prefix in file:
                violations.append(f"forbidden_path:{file}")

    report = {
        "ok": not violations,
        "files_changed": files_changed,
        "diff_lines": diff_lines,
        "violations": violations,
        "checked_at": dt.datetime.now(dt.timezone.utc).isoformat(),
    }
    write_json(run_dir / "POLICY_REPORT.json", report)
    return report


def evaluate(run_dir: pathlib.Path, config: dict[str, Any]) -> dict[str, Any]:
    gates = config.get("gates", {})
    threshold = int(gates.get("eval_threshold", 80))
    conditional_threshold = int(gates.get("eval_conditional_threshold", 70))
    require_no_high = bool(gates.get("require_no_high_regressions", True))

    tests = test_summary(run_dir / "TEST_REPORT.json")
    policy = read_json(run_dir / "POLICY_REPORT.json", {"ok": True, "violations": []})
    regression = read_json(run_dir / "REGRESSION_REPORT.json", {"severity": "UNKNOWN", "regressions_found": False})
    qa_verdict = parse_markdown_verdict(run_dir / "QA_REPORT.md", [r"## Verdict\s+([A-Z_]+)", r"^Verdict:\s*([A-Z_]+)$"])
    build_status = parse_markdown_verdict(run_dir / "BUILD_VERIFICATION.md", [r"## Status\s+([A-Z_]+)", r"^Status:\s*([A-Z_]+)$"])
    review_verdict = parse_markdown_verdict(run_dir / "REVIEW_NOTES.md", [r"## Verdict\s+([A-Z_]+)", r"^Verdict:\s*([A-Z_]+)$"])
    breaker_verdict = parse_breaker_verdict(run_dir / "BREAKER_REPORT.md")

    breaker_text = (run_dir / "BREAKER_REPORT.md").read_text(encoding="utf-8") if (run_dir / "BREAKER_REPORT.md").exists() else ""
    breaker_blockers = len(re.findall(r"Severity:\s*BLOCKER", breaker_text, flags=re.IGNORECASE))
    breaker_importants = len(re.findall(r"Severity:\s*IMPORTANT", breaker_text, flags=re.IGNORECASE))

    score = 100
    findings: list[str] = []

    if not tests["ran_any"]:
        if tests["applicable"]:
            score -= 20
            findings.append("no_test_evidence")
        else:
            findings.append("tests_not_applicable")
    elif not tests["all_passed"]:
        score -= 35
        findings.append("test_failures_present")

    if not policy.get("ok", True):
        score -= 20
        findings.append("policy_violations_present")

    if qa_verdict not in {"PASS", "APPROVE", "UNKNOWN"}:
        score -= 15
        findings.append(f"qa_not_pass:{qa_verdict}")

    if build_status not in {"PASS", "SUCCESS", "UNKNOWN"}:
        score -= 15
        findings.append(f"build_not_pass:{build_status}")

    if review_verdict in {"CHANGES_REQUESTED", "FAIL"}:
        score -= 10
        findings.append(f"review_not_approved:{review_verdict}")

    if breaker_blockers > 0:
        score -= min(30, 15 * breaker_blockers)
        findings.append(f"breaker_blockers_present:{breaker_blockers}")
    elif breaker_importants > 0:
        score -= min(12, 6 * breaker_importants)
        findings.append(f"breaker_importants_present:{breaker_importants}")
    elif breaker_verdict not in {"PASS", "UNKNOWN"}:
        score -= 5
        findings.append(f"breaker_not_pass:{breaker_verdict}")

    severity = str(regression.get("severity", "UNKNOWN")).upper()
    if severity == "HIGH":
        score -= 15
        findings.append("high_regression_risk")
    elif severity == "CRITICAL":
        score -= 25
        findings.append("critical_regression_risk")
    elif regression.get("regressions_found"):
        score -= 8
        findings.append("non_blocking_regression_risk")

    score = max(score, 0)

    existing_eval = read_json(run_dir / "EVAL_REPORT.json", {})
    categories: dict[str, Any] = existing_eval.get("categories") or {}
    floor_breaches: list[str] = []
    for cat in FLOOR_CATEGORIES:
        cat_data = categories.get(cat, {})
        cat_score = cat_data.get("score") if isinstance(cat_data, dict) else None
        if cat_score is not None:
            if cat_score < 60:
                score = min(score, 73)
            if cat_score < 40:
                floor_breaches.append(f"{cat}:below_40")
                findings.append(f"hard_floor_breach:{cat}")
            elif cat_score < 60:
                floor_breaches.append(f"{cat}:below_60")

    grade = grade_from_score(score)
    hard_block = {"test_failures_present", "critical_regression_risk", "policy_violations_present"}
    if require_no_high:
        hard_block.add("high_regression_risk")
    has_hard_block = any(item in hard_block or item.startswith("breaker_blockers_present:") for item in findings)
    has_floor_fail = any("below_40" in b for b in floor_breaches)
    verdict = "PASS" if score >= threshold and not has_hard_block and not has_floor_fail else "FAIL"
    if verdict == "FAIL" and not has_hard_block and not has_floor_fail and score >= conditional_threshold:
        verdict = "CONDITIONAL"

    report: dict[str, Any] = {
        "score": score,
        "grade": grade,
        "threshold": threshold,
        "grade_threshold": "B-",
        "verdict": verdict,
        "dimensions": {
            "tests": "PASS" if tests["all_passed"] else ("N/A" if not tests["applicable"] else ("MISSING" if not tests["ran_any"] else "FAIL")),
            "policy": "PASS" if policy.get("ok", True) else "FAIL",
            "qa": qa_verdict,
            "build": build_status,
            "review": review_verdict,
            "breaker": breaker_verdict,
            "regression": severity,
        },
        "hard_floor_breaches": floor_breaches,
        "findings": findings,
        "evaluated_at": dt.datetime.now(dt.timezone.utc).isoformat(),
    }
    if categories:
        report["categories"] = categories
    write_json(run_dir / "EVAL_REPORT.json", report)
    return report


def prepare_retry(run_dir: pathlib.Path, config: dict[str, Any], reason: str | None) -> dict[str, Any]:
    retry_log = read_json(run_dir / "RETRY_LOG.jsonl", [])
    gates = config.get("gates", {})
    max_retry_rounds = int(gates.get("max_retry_rounds", 2))
    next_round = len(retry_log) + 1

    if next_round > max_retry_rounds:
        return {
            "prepared": False,
            "max_rounds": max_retry_rounds,
            "rounds_recorded": len(retry_log),
            "next_would_be_round": next_round,
            "reason": "max_retry_rounds_exhausted",
        }

    eval_report = read_json(run_dir / "EVAL_REPORT.json", {})
    policy_report = read_json(run_dir / "POLICY_REPORT.json", {})
    diff_stats = read_json(run_dir / "DIFF_STATS.json", {})
    tests = test_summary(run_dir / "TEST_REPORT.json")

    failure_lines = []
    if reason:
        failure_lines.append(f"- Operator reason: {reason}")
    if eval_report:
        grade = eval_report.get("grade", "")
        grade_str = f" — {grade}" if grade else ""
        failure_lines.append(f"- Eval verdict: {eval_report.get('verdict')}{grade_str} ({eval_report.get('score')}/{eval_report.get('threshold')})")
        for finding in eval_report.get("findings", []):
            failure_lines.append(f"  - finding: {finding}")
    if policy_report and not policy_report.get("ok", True):
        for violation in policy_report.get("violations", []):
            failure_lines.append(f"  - policy violation: {violation}")
    for cmd in tests.get("failing_commands", []):
        failure_lines.append(f"  - failing command: {cmd.get('cmd')} (exit {cmd.get('exit_code')})")

    changed_files = diff_stats.get("files", [])
    changed_block = "\n".join(f"- {path}" for path in changed_files) if changed_files else "- none detected"

    retry_task = (
        "# Retry Task\n\n"
        f"Retry round: {next_round} / {max_retry_rounds}\n\n"
        "## Why retry is needed\n"
        + ("\n".join(failure_lines) if failure_lines else "- gate failure observed\n")
        + "\n\n## Constraints\n"
        "- Keep remediation targeted.\n"
        "- Do not broaden scope.\n"
        "- Update SECOND_PASS_PLAN.md before editing.\n"
        "- Prefer the smallest coherent patch that addresses the cited failures.\n"
    )

    second_pass = (
        "# Second Pass Plan\n\n"
        f"Retry round: {next_round}\n\n"
        "## Observed diff\n"
        f"{changed_block}\n\n"
        "## Failure-focused objectives\n"
        "- Identify the smallest set of causes behind the current failures.\n"
        "- Convert each cause into one targeted remediation step.\n"
        "- Re-run only the verification steps needed to regain confidence.\n\n"
        "## Remediation steps\n"
        "1. ...\n"
        "2. ...\n"
        "3. ...\n"
    )

    write_text(run_dir / "RETRY_TASK.md", retry_task)
    write_text(run_dir / "SECOND_PASS_PLAN.md", second_pass)
    retry_log.append({
        "round": next_round,
        "reason": reason or "gate_failure",
        "prepared_at": dt.datetime.now(dt.timezone.utc).isoformat(),
    })
    write_json(run_dir / "RETRY_LOG.jsonl", retry_log)

    return {"round": next_round, "max_rounds": max_retry_rounds, "prepared": True}


def run_mode_from_plan(run_dir: pathlib.Path) -> str | None:
    plan_path = run_dir / "PLAN.md"
    if not plan_path.exists():
        return None
    text = plan_path.read_text(encoding="utf-8")
    match = re.search(r"^Mode:\s*(\w+)", text, flags=re.MULTILINE)
    return match.group(1) if match else None


def parse_breaker_verdict(path: pathlib.Path) -> str:
    return parse_markdown_verdict(path, [r"## Verdict\s+([A-Z_]+)", r"^Verdict:\s*([A-Z_]+)$"], default="UNKNOWN")


def publish_ledger(run_dir: pathlib.Path) -> dict[str, Any]:
    ensure_ledgers_dir()
    ledger_path = run_dir / "RUN_LEDGER.md"
    if not ledger_path.exists():
        raise FileNotFoundError(f"Missing ledger: {ledger_path}")

    run_id = run_dir.name
    published_at = dt.datetime.now(dt.timezone.utc).isoformat()
    task_text = (run_dir / "TASK.md").read_text(encoding="utf-8").strip() if (run_dir / "TASK.md").exists() else ""
    diff_stats = read_json(run_dir / "DIFF_STATS.json", {})
    eval_report = read_json(run_dir / "EVAL_REPORT.json", {})
    regression = read_json(run_dir / "REGRESSION_REPORT.json", {})
    qa_verdict = parse_markdown_verdict(run_dir / "QA_REPORT.md", [r"## Verdict\s+([A-Z_]+)", r"^Verdict:\s*([A-Z_]+)$"])
    build_status = parse_markdown_verdict(run_dir / "BUILD_VERIFICATION.md", [r"## Status\s+([A-Z_]+)", r"^Status:\s*([A-Z_]+)$"])
    breaker_verdict = parse_breaker_verdict(run_dir / "BREAKER_REPORT.md")

    published_path = LEDGERS_DIR / f"{run_id}.md"
    frontmatter = [
        "---",
        f"run_id: {run_id}",
        f"mode: {run_mode_from_plan(run_dir) or 'unknown'}",
        f"published_at: {published_at}",
        f"qa_verdict: {qa_verdict}",
        f"build_status: {build_status}",
        f"breaker_verdict: {breaker_verdict}",
        f"eval_verdict: {eval_report.get('verdict', 'UNKNOWN')}",
        f"eval_score: {eval_report.get('score', 'UNKNOWN')}",
        f"regression_severity: {str(regression.get('severity', 'UNKNOWN')).upper()}",
        "---",
        "",
    ]
    published_path.write_text("\n".join(frontmatter) + ledger_path.read_text(encoding="utf-8"), encoding="utf-8")

    index = read_json(LEDGER_INDEX_PATH, [])
    index = [entry for entry in index if entry.get("run_id") != run_id]
    index.append({
        "run_id": run_id,
        "mode": run_mode_from_plan(run_dir) or "unknown",
        "task_excerpt": task_text[:160],
        "published_at": published_at,
        "path": str(published_path.relative_to(ROOT)),
        "files_changed": diff_stats.get("files_changed"),
        "eval_score": eval_report.get("score"),
        "eval_verdict": eval_report.get("verdict"),
        "qa_verdict": qa_verdict,
        "build_status": build_status,
        "breaker_verdict": breaker_verdict,
        "regression_severity": str(regression.get("severity", "UNKNOWN")).upper(),
    })
    index.sort(key=lambda e: str(e.get("published_at", "")))
    write_json(LEDGER_INDEX_PATH, index)

    return {
        "published": True,
        "run_id": run_id,
        "path": str(published_path),
        "published_at": published_at,
    }


def pending_ledgers(since_run_id: str | None = None) -> dict[str, Any]:
    ensure_ledgers_dir()
    index = read_json(LEDGER_INDEX_PATH, [])
    state = read_json(DOC_SYNC_STATE_PATH, {})

    cutoff_time = state.get("last_synced_at")
    if since_run_id:
        for entry in index:
            if entry.get("run_id") == since_run_id:
                cutoff_time = entry.get("published_at")
                break

    if cutoff_time:
        pending = [entry for entry in index if str(entry.get("published_at", "")) > str(cutoff_time)]
    else:
        pending = index

    return {
        "last_synced_run_id": state.get("last_synced_run_id"),
        "last_synced_at": state.get("last_synced_at"),
        "pending_count": len(pending),
        "ledgers": pending,
    }


def mark_doc_sync(up_to_run: str) -> dict[str, Any]:
    ensure_ledgers_dir()
    index = read_json(LEDGER_INDEX_PATH, [])
    match = next((entry for entry in index if entry.get("run_id") == up_to_run), None)
    if match is None:
        raise ValueError(f"Unknown run id: {up_to_run}")

    state = {
        "last_synced_run_id": up_to_run,
        "last_synced_at": match.get("published_at"),
        "updated_at": dt.datetime.now(dt.timezone.utc).isoformat(),
    }
    write_json(DOC_SYNC_STATE_PATH, state)
    return state


def record_follow_on(run_dir: pathlib.Path, new_run_dir: pathlib.Path, reason: str, source_artifact: str | None) -> dict[str, Any]:
    payload = {
        "source_run_id": run_dir.name,
        "follow_on_run_id": new_run_dir.name,
        "reason": reason,
        "source_artifact": source_artifact,
        "recorded_at": dt.datetime.now(dt.timezone.utc).isoformat(),
    }
    write_json(run_dir / "FOLLOW_ON_RUN.json", payload)
    return payload


def ensure_regression_stub(run_dir: pathlib.Path) -> None:
    path = run_dir / "REGRESSION_REPORT.json"
    if not path.exists():
        write_json(path, {
            "regressions_found": False,
            "severity": "UNKNOWN",
            "areas": [],
            "notes": ["Populate via Delivery Regression Detector agent."],
        })


def _task_text_from_args(task: str | None, task_file: str | None) -> tuple[str, str]:
    if task_file:
        path = pathlib.Path(task_file)
        return path.read_text(encoding="utf-8"), str(path)
    assert task is not None
    return task, "inline"


def main() -> int:
    parser = argparse.ArgumentParser(description="Repo-local agentic harness helper")
    subparsers = parser.add_subparsers(dest="command", required=True)

    start_parser = subparsers.add_parser("start", help="Create a new run")
    start_parser.add_argument("--mode", choices=["delivery", "maintenance", "restructure", "product_feedback"], default="delivery")
    task_group = start_parser.add_mutually_exclusive_group(required=True)
    task_group.add_argument("--task", help="Task description")
    task_group.add_argument("--task-file", help="Path to file whose contents should seed TASK.md")
    start_parser.add_argument("--parent-run", required=False, help="Optional parent run id")
    start_parser.add_argument("--source-kind", required=False, help="Optional source kind, e.g. breaker_follow_on or stakeholder_feedback")
    start_parser.add_argument("--source-artifact", required=False, help="Optional source artifact path")

    run_parser = subparsers.add_parser("run", help="Run a configured intent and update TEST_REPORT.json")
    run_parser.add_argument("--run-dir", required=True, help="Path to existing run directory")
    run_parser.add_argument("--intent", choices=["format", "lint", "test", "build", "db"], required=True)

    diff_parser = subparsers.add_parser("diff", help="Capture git diff into PATCH.diff and DIFF_STATS.json")
    diff_parser.add_argument("--run-dir", required=True, help="Path to existing run directory")

    validate_parser = subparsers.add_parser("validate", help="Run policy validation against current diff")
    validate_parser.add_argument("--run-dir", required=True, help="Path to existing run directory")

    evaluate_parser = subparsers.add_parser("evaluate", help="Produce EVAL_REPORT.json from available artifacts")
    evaluate_parser.add_argument("--run-dir", required=True, help="Path to existing run directory")

    retry_parser = subparsers.add_parser("prepare-retry", help="Create remediation artifacts for a bounded retry")
    retry_parser.add_argument("--run-dir", required=True, help="Path to existing run directory")
    retry_parser.add_argument("--reason", required=False, help="Optional reason for the retry")

    publish_ledger_parser = subparsers.add_parser("publish-ledger", help="Publish RUN_LEDGER.md into .harness/ledgers")
    publish_ledger_parser.add_argument("--run-dir", required=True, help="Path to existing run directory")

    pending_ledgers_parser = subparsers.add_parser("pending-ledgers", help="List published ledgers pending doc sync")
    pending_ledgers_parser.add_argument("--since-run-id", required=False, help="Optional run id override for the sync boundary")

    mark_doc_sync_parser = subparsers.add_parser("mark-doc-sync", help="Advance doc sync state to a published ledger")
    mark_doc_sync_parser.add_argument("--up-to-run", required=True, help="Latest published run id included in the doc sync")

    follow_on_parser = subparsers.add_parser("record-follow-on", help="Record that a run spawned a follow-on run")
    follow_on_parser.add_argument("--run-dir", required=True, help="Path to the source run directory")
    follow_on_parser.add_argument("--new-run-dir", required=True, help="Path to the newly created follow-on run directory")
    follow_on_parser.add_argument("--reason", required=True, help="Why the follow-on run was created")
    follow_on_parser.add_argument("--source-artifact", required=False, help="Source artifact path that caused the follow-on")

    args = parser.parse_args()
    config = load_config()

    if args.command == "start":
        ensure_ledgers_dir()
        ensure_support_dirs()
        task_text, task_source = _task_text_from_args(args.task, args.task_file)
        run_dir = create_run(
            task=task_text,
            mode=args.mode,
            task_source=task_source,
            parent_run=args.parent_run,
            source_kind=args.source_kind,
            source_artifact=args.source_artifact,
        )
        if args.mode in DELIVERY_LIKE_MODES:
            ensure_regression_stub(run_dir)
        print(str(run_dir))
        return 0

    if args.command == "pending-ledgers":
        print(json.dumps(pending_ledgers(args.since_run_id), indent=2))
        return 0

    if args.command == "mark-doc-sync":
        try:
            print(json.dumps(mark_doc_sync(args.up_to_run), indent=2))
        except ValueError as exc:
            print(str(exc), file=sys.stderr)
            return 1
        return 0

    if args.command == "record-follow-on":
        run_dir = pathlib.Path(args.run_dir)
        new_run_dir = pathlib.Path(args.new_run_dir)
        if not run_dir.exists() or not new_run_dir.exists():
            print("Run directory does not exist", file=sys.stderr)
            return 1
        print(json.dumps(record_follow_on(run_dir, new_run_dir, args.reason, args.source_artifact), indent=2))
        return 0

    run_dir = pathlib.Path(args.run_dir)
    if not run_dir.exists():
        print(f"Run directory does not exist: {run_dir}", file=sys.stderr)
        return 1

    if args.command == "run":
        results = run_intent(config, args.intent)
        for row in results:
            row["intent"] = args.intent
        report_path = run_dir / "TEST_REPORT.json"
        existing = read_json(report_path, {"commands": [], "last_intent": None})
        existing.setdefault("commands", [])
        intent = args.intent
        last_intent = existing.get("last_intent")
        existing["commands"] = [
            c
            for c in existing["commands"]
            if not (
                c.get("intent") == intent
                or (c.get("intent") is None and last_intent == intent)
            )
        ]
        existing["commands"].extend(results)
        existing["last_intent"] = args.intent
        write_json(report_path, existing)
        capture_diff(run_dir)
        print(str(report_path))
        return 0

    if args.command == "diff":
        capture_diff(run_dir)
        print(str(run_dir / "PATCH.diff"))
        return 0

    if args.command == "validate":
        report = validate_policy(run_dir, config)
        print(json.dumps(report, indent=2))
        return 0

    if args.command == "evaluate":
        ensure_regression_stub(run_dir)
        report = evaluate(run_dir, config)
        print(json.dumps(report, indent=2))
        return 0

    if args.command == "prepare-retry":
        report = prepare_retry(run_dir, config, args.reason)
        print(json.dumps(report, indent=2))
        return 0

    if args.command == "publish-ledger":
        report = publish_ledger(run_dir)
        print(json.dumps(report, indent=2))
        return 0

    return 1


if __name__ == "__main__":
    raise SystemExit(main())
