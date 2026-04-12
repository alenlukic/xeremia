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

try:
    import yaml
except Exception:
    yaml = None

ROOT = pathlib.Path(__file__).resolve().parents[2]
HARNESS = ROOT / '.harness'
RUNS_DIR = HARNESS / 'runs'
LEDGERS_DIR = HARNESS / 'ledgers'
CONTRACTS_DIR = HARNESS / 'contracts'
PF_DIR = HARNESS / 'product-feedback'
STATE_MACHINE_FILE = HARNESS / 'state_machine' / 'STATE_MACHINE.yaml'
SCHEDULES_FILE = HARNESS / 'schedules' / 'SCHEDULES.yaml'
SCHEDULE_STATE_FILE = HARNESS / 'schedules' / 'STATE.json'
CONFIG_PATH = HARNESS / 'pipeline.yaml'
LEDGER_INDEX_PATH = LEDGERS_DIR / 'INDEX.json'

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


def now_iso() -> str:
    return dt.datetime.now(dt.timezone.utc).isoformat()


def load_yaml(path: pathlib.Path) -> dict[str, Any]:
    if not path.exists() or yaml is None:
        return {}
    return yaml.safe_load(path.read_text(encoding='utf-8')) or {}


def load_config() -> dict[str, Any]:
    return load_yaml(CONFIG_PATH)


def read_json(path: pathlib.Path, default: Any) -> Any:
    if not path.exists():
        return default
    return json.loads(path.read_text(encoding='utf-8'))


def write_json(path: pathlib.Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2, sort_keys=False) + '\n', encoding='utf-8')


def write_text(path: pathlib.Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding='utf-8')


def slugify(text: str) -> str:
    return re.sub(r'[^a-zA-Z0-9._-]+', '-', text).strip('-').lower()[:80] or 'task'


def resolve_run_dir(raw: str) -> pathlib.Path:
    """Resolve a run directory argument to its canonical path under RUNS_DIR.

    Accepts a full path, a relative path containing '.harness/runs', or a bare
    run ID.  Falls back to RUNS_DIR / raw when the literal path doesn't exist.
    """
    p = pathlib.Path(raw)
    if p.is_absolute() and p.exists():
        return p
    if p.exists():
        return p.resolve()
    candidate = RUNS_DIR / p.name
    if candidate.exists():
        return candidate
    return RUNS_DIR / raw


def run_shell(cmd: str) -> dict[str, Any]:
    proc = subprocess.run(cmd, shell=True, cwd=ROOT, text=True, capture_output=True)
    return {
        'cmd': cmd,
        'exit_code': proc.returncode,
        'stdout_tail': proc.stdout[-4000:],
        'stderr_tail': proc.stderr[-4000:],
        'ran_at': now_iso(),
    }


def _shell_stdout_full(cmd: str) -> str:
    proc = subprocess.run(cmd, shell=True, cwd=ROOT, text=True, capture_output=True)
    return proc.stdout


def ledger_template(task: str, mode: str) -> str:
    return f"""---
ledger_schema_version: 2
tags: []
recommendation_ids: []
---

# Run Ledger

## Outcome
- Task: {task}
- Mode: {mode}
- Result: UNKNOWN
- Scope:
- Key files changed:
- Follow-on runs:

## Key decisions
- 

## Verification and breaker
- Tests/build:
- Breaker stack summary:
- Verification gaps:

## Bad-state signals
- 

## Token efficiency notes
- Approx context size:
- Optimizations used:

## Durable learnings
- 

## Deferred or follow-up
- 
"""


def create_run(task: str, mode: str) -> pathlib.Path:
    timestamp = dt.datetime.now(dt.timezone.utc).strftime('%Y%m%dT%H%M%SZ')
    run_id = f'{timestamp}-{mode}-{slugify(task)[:32]}'
    run_dir = RUNS_DIR / run_id
    run_dir.mkdir(parents=True, exist_ok=False)
    write_text(run_dir / 'TASK.md', f'# Task\n\n{task}\n')
    write_text(run_dir / 'PLAN.md', '# Plan\n\n## Goals\n- \n\n## Acceptance criteria\n- \n\n## Non-goals\n- \n')
    write_text(run_dir / 'PATCH.diff', '')
    write_json(run_dir / 'DIFF_STATS.json', {'files_changed': 0, 'files': [], 'added': 0, 'deleted': 0, 'per_file': []})
    write_json(run_dir / 'TEST_REPORT.json', {'commands': [], 'last_intent': None, 'applicable': True})
    write_json(run_dir / 'POLICY_REPORT.json', {'ok': True, 'violations': []})
    write_json(run_dir / 'EVAL_REPORT.json', {'score': 0, 'verdict': 'UNKNOWN'})
    write_json(run_dir / 'REGRESSION_REPORT.json', {'regressions_found': False, 'severity': 'UNKNOWN', 'areas': []})
    write_json(run_dir / 'RETRY_LOG.jsonl', [])
    write_json(run_dir / 'RUN_META.json', {'run_id': run_id, 'mode': mode, 'task': task, 'created_at': now_iso(), 'follow_ons': []})
    write_text(run_dir / 'REVIEW_NOTES.md', '# Review Notes\n\n## Verdict\nCHANGES_REQUESTED\n')
    write_text(run_dir / 'QA_REPORT.md', '# QA Report\n\n## Verdict\nFAIL\n')
    write_text(run_dir / 'BUILD_VERIFICATION.md', '# Build Verification\n\n## Status\nPENDING\n')
    write_text(run_dir / 'BREAKER_REPORT.md', '# Breaker Report\n\n## Overall verdict\nNONE\n')
    write_text(run_dir / 'BREAKER_SPEC_REPORT.md', '# Breaker Spec Report\n\n- pending\n')
    write_text(run_dir / 'BREAKER_TEST_REPORT.md', '# Breaker Test Report\n\n- pending\n')
    write_text(run_dir / 'BREAKER_SECURITY_REPORT.md', '# Breaker Security Report\n\n- pending\n')
    write_json(run_dir / 'BAD_STATE_REPORT.json', {'status': 'UNKNOWN', 'signals': []})
    write_text(run_dir / 'BAD_STATE_REPORT.md', '# Bad State Report\n\n- pending\n')
    write_text(run_dir / 'RUN_LEDGER.md', ledger_template(task, mode))
    write_json(run_dir / 'CONTEXT_MANIFEST.json', {'estimated_tokens': 0, 'items': []})
    if mode == 'product_feedback':
        for name in [
            'DESIGN_RECOMMENDATIONS.md', 'CUSTOMER_PERSONA_FEEDBACK.md', 'PRODUCT_SME_RECOMMENDATIONS.md',
            'TECHNICAL_SME_RECOMMENDATIONS.md', 'RECOMMENDATION_REGISTRY_SYNC.md', 'DEVELOPMENT_CONTRACT.md'
        ]:
            write_text(run_dir / name, f'# {name.replace("_", " ").replace(".md", "")}\n\n')
    return run_dir


def run_intent(config: dict[str, Any], intent: str) -> list[dict[str, Any]]:
    commands = config.get('commands', {}).get(intent, [])
    return [run_shell(cmd) for cmd in commands]


def capture_diff(run_dir: pathlib.Path) -> None:
    full_diff = _shell_stdout_full('git diff')
    write_text(run_dir / 'PATCH.diff', full_diff)
    names = run_shell('git diff --name-only')
    files = [line.strip() for line in names['stdout_tail'].splitlines() if line.strip()]
    numstat = run_shell('git diff --numstat')
    added = deleted = 0
    per_file = []
    for line in numstat['stdout_tail'].splitlines():
        parts = line.split('\t')
        if len(parts) != 3:
            continue
        a, d, path = parts
        try:
            ai = 0 if a == '-' else int(a)
            di = 0 if d == '-' else int(d)
        except ValueError:
            continue
        added += ai
        deleted += di
        per_file.append({'path': path, 'added': ai, 'deleted': di})
    write_json(run_dir / 'DIFF_STATS.json', {'files_changed': len(files), 'files': files, 'added': added, 'deleted': deleted, 'per_file': per_file})


def parse_markdown_verdict(path: pathlib.Path, patterns: list[str], default: str = 'UNKNOWN') -> str:
    if not path.exists():
        return default
    text = path.read_text(encoding='utf-8')
    for pattern in patterns:
        match = re.search(pattern, text, flags=re.IGNORECASE | re.MULTILINE)
        if match:
            return match.group(1).upper()
    return default


def parse_breaker_verdict(path: pathlib.Path) -> str:
    return parse_markdown_verdict(path, [r"## Verdict\s+([A-Z_]+)", r"^Verdict:\s*([A-Z_]+)$"], default="UNKNOWN")


def test_summary(report_path: pathlib.Path) -> dict[str, Any]:
    report = read_json(report_path, {'commands': []})
    commands = report.get('commands', [])
    failing = [c for c in commands if c.get('exit_code') != 0]
    return {'total': len(commands), 'failing': len(failing), 'failing_commands': failing[-5:], 'all_passed': len(commands) > 0 and not failing, 'ran_any': len(commands) > 0, 'applicable': report.get('applicable', True)}


def validate_policy(run_dir: pathlib.Path, config: dict[str, Any]) -> dict[str, Any]:
    capture_diff(run_dir)
    diff_stats = read_json(run_dir / 'DIFF_STATS.json', {})
    policies = config.get('policies', {})
    violations = []
    files = diff_stats.get('files', [])
    files_changed = diff_stats.get('files_changed', 0)
    diff_lines = diff_stats.get('added', 0) + diff_stats.get('deleted', 0)
    max_files = policies.get('max_files_changed')
    if isinstance(max_files, int) and files_changed > max_files:
        violations.append(f'files_changed_exceeds_limit:{files_changed}>{max_files}')
    max_lines = policies.get('max_diff_lines')
    if isinstance(max_lines, int) and diff_lines > max_lines:
        violations.append(f'diff_lines_exceeds_limit:{diff_lines}>{max_lines}')
    for file in files:
        for prefix in policies.get('forbid_paths', []):
            if file.startswith(prefix) or prefix in file:
                violations.append(f'forbidden_path:{file}')
    report = {'ok': not violations, 'files_changed': files_changed, 'diff_lines': diff_lines, 'violations': violations, 'checked_at': now_iso()}
    write_json(run_dir / 'POLICY_REPORT.json', report)
    return report


def context_manifest(run_dir: pathlib.Path, write_file: bool = True) -> dict[str, Any]:
    items = []
    est = 0
    for path in sorted(run_dir.glob('*')):
        if not path.is_file():
            continue
        size = path.stat().st_size
        tokens = max(1, size // 4)
        items.append({'file': path.name, 'bytes': size, 'estimated_tokens': tokens})
        est += tokens
    manifest = {'estimated_tokens': est, 'items': items, 'generated_at': now_iso()}
    if write_file:
        write_json(run_dir / 'CONTEXT_MANIFEST.json', manifest)
    return manifest


def bad_state_check(run_dir: pathlib.Path, config: dict[str, Any]) -> dict[str, Any]:
    diff_stats = read_json(run_dir / 'DIFF_STATS.json', {})
    retry_log = read_json(run_dir / 'RETRY_LOG.jsonl', [])
    test_report = read_json(run_dir / 'TEST_REPORT.json', {'commands': []})
    context = context_manifest(run_dir, write_file=False)
    signals = []
    severity = 'LOW'
    if len(retry_log) >= int(config.get('gates', {}).get('max_retry_rounds', 2)):
        signals.append('retry_cap_reached'); severity = 'MEDIUM'
    if diff_stats.get('files_changed', 0) > int(config.get('policies', {}).get('max_files_changed', 9999)):
        signals.append('scope_blowup'); severity = 'HIGH'
    if not test_report.get('commands'):
        signals.append('no_test_evidence')
    soft_cap = int(config.get('gates', {}).get('soft_context_token_cap', 24000))
    if context.get('estimated_tokens', 0) > soft_cap:
        signals.append('context_pressure'); severity = 'MEDIUM' if severity == 'LOW' else severity
    status = 'CLEAR' if not signals else ('HIGH' if severity == 'HIGH' else 'WARN')
    report = {'status': status, 'signals': signals, 'checked_at': now_iso(), 'estimated_tokens': context.get('estimated_tokens', 0)}
    write_json(run_dir / 'BAD_STATE_REPORT.json', report)
    md = '# Bad State Report\n\n' + ('\n'.join(f'- {s}' for s in signals) if signals else '- clear') + '\n'
    write_text(run_dir / 'BAD_STATE_REPORT.md', md)
    return report


def evaluate(run_dir: pathlib.Path, config: dict[str, Any]) -> dict[str, Any]:
    gates = config.get("gates", {})
    threshold = int(gates.get("eval_threshold", 80))
    conditional_threshold = int(gates.get("eval_conditional_threshold", 70))
    require_no_high = bool(gates.get("require_no_high_regressions", True))

    tests = test_summary(run_dir / "TEST_REPORT.json")
    policy = read_json(run_dir / "POLICY_REPORT.json", {"ok": True, "violations": []})
    regression = read_json(run_dir / "REGRESSION_REPORT.json", {"severity": "UNKNOWN", "regressions_found": False})
    bad_state = read_json(run_dir / "BAD_STATE_REPORT.json", {"status": "UNKNOWN", "signals": []})
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

    if bad_state.get("status") == "HIGH":
        score -= 20
        findings.append("bad_state_high")
    elif bad_state.get("status") == "WARN":
        score -= 8
        findings.append("bad_state_warn")

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
            "bad_state": bad_state.get("status", "UNKNOWN"),
        },
        "hard_floor_breaches": floor_breaches,
        "findings": findings,
        "evaluated_at": now_iso(),
    }
    if categories:
        report["categories"] = categories
    write_json(run_dir / "EVAL_REPORT.json", report)
    return report


def prepare_retry(run_dir: pathlib.Path, config: dict[str, Any], reason: str | None) -> dict[str, Any]:
    retry_log = read_json(run_dir / 'RETRY_LOG.jsonl', [])
    max_retry_rounds = int(config.get('gates', {}).get('max_retry_rounds', 2))
    next_round = len(retry_log) + 1
    if next_round > max_retry_rounds:
        return {'prepared': False, 'reason': 'max_retry_rounds_exhausted'}
    write_text(run_dir / 'RETRY_TASK.md', f'# Retry Task\n\nRetry round: {next_round} / {max_retry_rounds}\n\n## Why retry is needed\n- {reason or "gate failure"}\n')
    write_text(run_dir / 'SECOND_PASS_PLAN.md', '# Second Pass Plan\n\n1. isolate failure cause\n2. remediate narrowly\n3. re-run relevant verification\n')
    retry_log.append({'round': next_round, 'reason': reason or 'gate_failure', 'prepared_at': now_iso()})
    write_json(run_dir / 'RETRY_LOG.jsonl', retry_log)
    return {'prepared': True, 'round': next_round, 'max_rounds': max_retry_rounds}


def run_mode_from_plan(run_dir: pathlib.Path) -> str | None:
    plan = run_dir / "PLAN.md"
    if plan.exists():
        for line in plan.read_text(encoding="utf-8").splitlines()[:10]:
            if line.lower().startswith("mode:"):
                return line.split(":", 1)[1].strip().lower()
    meta = read_json(run_dir / "RUN_META.json", {})
    return meta.get("mode")


def publish_ledger(run_dir: pathlib.Path) -> dict[str, Any]:
    LEDGERS_DIR.mkdir(parents=True, exist_ok=True)
    if not LEDGER_INDEX_PATH.exists():
        write_json(LEDGER_INDEX_PATH, [])
    ledger_path = run_dir / "RUN_LEDGER.md"
    if not ledger_path.exists():
        raise FileNotFoundError(f"Missing ledger: {ledger_path}")

    run_id = run_dir.name
    published_at = now_iso()
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
    return {"run_id": run_id, "published_at": published_at, "path": str(published_path)}


def first_heading(text: str) -> str:
    for line in text.splitlines():
        if line.startswith('# '):
            return line[2:].strip()
    return 'Run Ledger'


def _parse_frontmatter(text: str) -> dict[str, str]:
    if not text.startswith("---"):
        return {}
    end = text.find("\n---", 3)
    if end == -1:
        return {}
    fm: dict[str, str] = {}
    for line in text[4:end].splitlines():
        if ":" in line:
            k, v = line.split(":", 1)
            fm[k.strip()] = v.strip()
    return fm


def rebuild_ledger_index() -> list[dict[str, Any]]:
    entries: list[dict[str, Any]] = []
    for path in sorted(LEDGERS_DIR.glob("*.md")):
        if path.name in {"INDEX.md", "README.md", "DOC_SYNC_REPORT.md"}:
            continue
        text = path.read_text(encoding="utf-8")
        fm = _parse_frontmatter(text)
        if fm:
            entries.append({
                "run_id": fm.get("run_id", path.stem),
                "mode": fm.get("mode", "unknown"),
                "task_excerpt": "",
                "published_at": fm.get("published_at", dt.datetime.fromtimestamp(path.stat().st_mtime, tz=dt.timezone.utc).isoformat()),
                "path": str(path.relative_to(ROOT)),
                "eval_score": int(fm["eval_score"]) if fm.get("eval_score", "").isdigit() else fm.get("eval_score"),
                "eval_verdict": fm.get("eval_verdict"),
                "qa_verdict": fm.get("qa_verdict"),
                "build_status": fm.get("build_status"),
                "breaker_verdict": fm.get("breaker_verdict"),
                "regression_severity": fm.get("regression_severity"),
            })
        else:
            entries.append({
                "run_id": path.stem,
                "mode": "unknown",
                "task_excerpt": "",
                "published_at": dt.datetime.fromtimestamp(path.stat().st_mtime, tz=dt.timezone.utc).isoformat(),
                "path": str(path.relative_to(ROOT)),
            })
    entries.sort(key=lambda e: str(e.get("published_at", "")))
    write_json(LEDGER_INDEX_PATH, entries)
    md = "# Ledger Index\n\n" + ("\n".join(f'- `{e["run_id"]}` — {e.get("mode", "unknown")}' for e in entries) if entries else "_No ledgers published yet._") + "\n"
    write_text(LEDGERS_DIR / "INDEX.md", md)
    return entries


def registry_render() -> None:
    reg = read_json(PF_DIR / 'RECOMMENDATION_REGISTRY.json', {'schema_version': 2, 'updated_at': None, 'next_id': 1, 'items': []})
    lines = ['# Recommendation Registry', '']
    if not reg.get('items'):
        lines.append('_No recommendations tracked yet._')
    else:
        for item in reg['items']:
            lines.append(f"- **{item['id']}** [{item.get('status', 'open')}] {item.get('title', '')}")
    write_text(PF_DIR / 'RECOMMENDATION_REGISTRY.md', '\n'.join(lines) + '\n')


def recommendation_summary() -> dict[str, Any]:
    reg = read_json(PF_DIR / 'RECOMMENDATION_REGISTRY.json', {'items': []})
    return {'total': len(reg.get('items', [])), 'open': len([i for i in reg.get('items', []) if i.get('status') != 'closed'])}


def mark_recommendation(rec_id: str, status: str, note: str | None) -> dict[str, Any]:
    reg = read_json(PF_DIR / 'RECOMMENDATION_REGISTRY.json', {'schema_version': 2, 'updated_at': None, 'next_id': 1, 'items': []})
    found = None
    for item in reg['items']:
        if item.get('id') == rec_id:
            found = item
            break
    if found is None:
        found = {'id': rec_id, 'title': rec_id, 'status': status, 'history': []}
        reg['items'].append(found)
    found['status'] = status
    found.setdefault('history', []).append({'at': now_iso(), 'status': status, 'note': note or ''})
    reg['updated_at'] = now_iso()
    write_json(PF_DIR / 'RECOMMENDATION_REGISTRY.json', reg)
    registry_render()
    return found


def record_follow_on(from_run: pathlib.Path, to_run: pathlib.Path, reason: str) -> dict[str, Any]:
    meta = read_json(from_run / 'RUN_META.json', {})
    meta.setdefault('follow_ons', []).append({'to_run': to_run.name, 'reason': reason, 'recorded_at': now_iso()})
    write_json(from_run / 'RUN_META.json', meta)
    return meta


def contract_index_add(name: str, path: str, description: str, status: str = 'outstanding') -> dict[str, Any]:
    idx = read_json(CONTRACTS_DIR / 'INDEX.json', {'version': 1, 'description': 'Outstanding contract index', 'contracts': []})
    entry = {'name': name, 'path': path, 'date_produced': dt.date.today().isoformat(), 'description': description, 'status': status, 'added_at': now_iso()}
    idx['contracts'].append(entry)
    write_json(CONTRACTS_DIR / 'INDEX.json', idx)
    rebuild_contract_index()
    return entry


def contract_index_update(name: str, status: str) -> dict[str, Any]:
    idx = read_json(CONTRACTS_DIR / 'INDEX.json', {'version': 1, 'description': 'Outstanding contract index', 'contracts': []})
    found = None
    for c in idx['contracts']:
        if c['name'] == name:
            found = c
            break
    if found is None:
        return {'error': f'contract not found: {name}'}
    found['status'] = status
    found['updated_at'] = now_iso()
    write_json(CONTRACTS_DIR / 'INDEX.json', idx)
    rebuild_contract_index()
    return found


def rebuild_contract_index() -> dict[str, Any]:
    idx = read_json(CONTRACTS_DIR / 'INDEX.json', {'version': 1, 'description': 'Outstanding contract index', 'contracts': []})
    outstanding = [c for c in idx.get('contracts', []) if c.get('status') == 'outstanding']
    in_progress = [c for c in idx.get('contracts', []) if c.get('status') == 'in_progress']
    completed = [c for c in idx.get('contracts', []) if c.get('status') in ('implemented', 'superseded', 'cancelled')]
    lines = ['# Contract Index', '', 'Outstanding and historical development contracts.', '',
             'Contracts are stored under `.harness/contracts/YYYY-MM-DD/` directories, one per production date.', '',
             '## Status Legend', '', '| Status | Meaning |', '|--------|---------|',
             '| `outstanding` | Not yet picked up for implementation |',
             '| `in_progress` | Currently being implemented in an active delivery run |',
             '| `implemented` | Completed and verified |',
             '| `superseded` | Replaced by a newer contract |',
             '| `cancelled` | No longer needed |', '']
    lines.append('## Outstanding Contracts')
    lines.append('')
    if outstanding:
        for c in outstanding:
            lines.append(f"- **{c['name']}** — {c.get('description', '')} (`{c.get('path', '')}`)")
    else:
        lines.append('_No outstanding contracts._')
    lines.append('')
    if in_progress:
        lines.append('## In Progress')
        lines.append('')
        for c in in_progress:
            lines.append(f"- **{c['name']}** — {c.get('description', '')} (`{c.get('path', '')}`)")
        lines.append('')
    if completed:
        lines.append('## Recently Completed')
        lines.append('')
        for c in completed:
            lines.append(f"- **{c['name']}** [{c.get('status')}] — {c.get('description', '')} (`{c.get('path', '')}`)")
        lines.append('')
    if not completed:
        lines.append('## Recently Completed')
        lines.append('')
        lines.append('_No completed contracts yet._')
        lines.append('')
    write_text(CONTRACTS_DIR / 'INDEX.md', '\n'.join(lines))
    return idx


def state_machine_render() -> str:
    sm = load_yaml(STATE_MACHINE_FILE)
    lines = ['flowchart TD']
    for mode, spec in sm.get('modes', {}).items():
        prev = None
        for st in spec.get('states', []):
            node = f'{mode}_{st}'.replace('-', '_')
            lines.append(f'  {node}["{mode}:{st}"]')
            if prev:
                lines.append(f'  {prev} --> {node}')
            prev = node
    mermaid = '\n'.join(lines) + '\n'
    write_text(HARNESS / 'state_machine' / 'STATE_MACHINE.mmd', mermaid)
    return mermaid


def state_machine_check(run_dir: pathlib.Path) -> dict[str, Any]:
    meta = read_json(run_dir / 'RUN_META.json', {})
    state = 'initialized'
    if (run_dir / 'TASK.md').exists() and (run_dir / 'PLAN.md').exists():
        state = 'planned'
    if read_json(run_dir / 'DIFF_STATS.json', {}).get('files_changed', 0) > 0:
        state = 'implemented'
    if (run_dir / 'REVIEW_NOTES.md').exists():
        state = 'reviewed'
    if parse_markdown_verdict(run_dir / 'QA_REPORT.md', [r'## Verdict\s+([A-Z_]+)']) == 'PASS':
        state = 'qa_passed'
    if (run_dir / 'BREAKER_REPORT.md').exists():
        state = 'breaker_completed'
    if (run_dir / 'EVAL_REPORT.json').exists():
        state = 'evaluated'
    if (LEDGERS_DIR / f"{meta.get('run_id', run_dir.name)}.md").exists():
        state = 'ledger_published'
    report = {'mode': meta.get('mode', 'delivery'), 'inferred_state': state, 'checked_at': now_iso()}
    write_json(run_dir / 'STATE_MACHINE_REPORT.json', report)
    return report


def bad_state_scan(active: bool = False) -> dict[str, Any]:
    config = load_config()
    reports = []
    if RUNS_DIR.exists():
        for run_dir in sorted(RUNS_DIR.iterdir()):
            if run_dir.is_dir():
                reports.append({'run': run_dir.name, **bad_state_check(run_dir, config)})
    return {'active': active, 'reports': reports}


def schedule_due() -> dict[str, Any]:
    sched = load_yaml(SCHEDULES_FILE)
    state = read_json(SCHEDULE_STATE_FILE, {'last_run_by_job': {}})
    jobs = [{'id': j['id'], 'type': j.get('type', 'deterministic'), 'cron': j.get('cron')} for j in sched.get('jobs', [])]
    return {'jobs': jobs, 'state': state}


def schedule_run(job_id: str) -> dict[str, Any]:
    sched = load_yaml(SCHEDULES_FILE)
    state = read_json(SCHEDULE_STATE_FILE, {'last_run_by_job': {}})
    jobs = {j['id']: j for j in sched.get('jobs', [])}
    if job_id not in jobs:
        raise SystemExit(f'Unknown job: {job_id}')
    cmd = jobs[job_id]['command']
    if cmd == 'rebuild-ledger-index':
        result = rebuild_ledger_index()
    elif cmd == 'registry-render':
        registry_render(); result = {'ok': True}
    elif cmd.startswith('bad-state-scan'):
        result = bad_state_scan(active='--active' in cmd)
    else:
        result = {'ok': False, 'note': 'agent_gated_or_unimplemented'}
    state.setdefault('last_run_by_job', {})[job_id] = now_iso()
    write_json(SCHEDULE_STATE_FILE, state)
    return {'job': job_id, 'result': result}


def main() -> int:
    parser = argparse.ArgumentParser(description='Repo-local agentic harness helper')
    sub = parser.add_subparsers(dest='command', required=True)
    p = sub.add_parser('start'); p.add_argument('--mode', choices=['delivery', 'maintenance', 'restructure', 'product_feedback'], default='delivery'); p.add_argument('--task', required=False); p.add_argument('--task-file', required=False)
    p = sub.add_parser('run'); p.add_argument('--run-dir', required=True); p.add_argument('--intent', choices=['format', 'lint', 'test', 'build', 'db'], required=True)
    p = sub.add_parser('diff'); p.add_argument('--run-dir', required=True)
    p = sub.add_parser('validate'); p.add_argument('--run-dir', required=True)
    p = sub.add_parser('evaluate'); p.add_argument('--run-dir', required=True)
    p = sub.add_parser('prepare-retry'); p.add_argument('--run-dir', required=True); p.add_argument('--reason')
    p = sub.add_parser('bad-state-check'); p.add_argument('--run-dir', required=True)
    p = sub.add_parser('bad-state-scan'); p.add_argument('--active', action='store_true')
    p = sub.add_parser('context-manifest'); p.add_argument('--run-dir', required=True)
    p = sub.add_parser('publish-ledger'); p.add_argument('--run-dir', required=True)
    sub.add_parser('rebuild-ledger-index')
    sub.add_parser('registry-render')
    sub.add_parser('recommendation-summary')
    p = sub.add_parser('mark-recommendation'); p.add_argument('--id', required=True); p.add_argument('--status', required=True); p.add_argument('--note')
    p = sub.add_parser('record-follow-on'); p.add_argument('--from-run', required=True); p.add_argument('--to-run', required=True); p.add_argument('--reason', required=True)
    p = sub.add_parser('contract-add'); p.add_argument('--name', required=True); p.add_argument('--path', required=True); p.add_argument('--description', required=True); p.add_argument('--status', default='outstanding')
    p = sub.add_parser('contract-update'); p.add_argument('--name', required=True); p.add_argument('--status', required=True, choices=['outstanding', 'in_progress', 'implemented', 'superseded', 'cancelled'])
    sub.add_parser('rebuild-contract-index')
    sub.add_parser('state-machine-render')
    p = sub.add_parser('state-machine-check'); p.add_argument('--run-dir', required=True)
    sub.add_parser('schedule-due')
    p = sub.add_parser('schedule-run'); p.add_argument('--job', required=True)
    args = parser.parse_args()
    config = load_config()

    if args.command == 'start':
        task = args.task
        if not task and args.task_file:
            tf = pathlib.Path(args.task_file)
            if tf.exists():
                task = tf.read_text(encoding='utf-8').strip()[:500]
            else:
                print(f'Task file not found: {args.task_file}', file=sys.stderr); return 1
        if not task:
            print('Either --task or --task-file is required', file=sys.stderr); return 1
        print(str(create_run(task, args.mode))); return 0
    if args.command == 'rebuild-ledger-index':
        print(json.dumps(rebuild_ledger_index(), indent=2)); return 0
    if args.command == 'registry-render':
        registry_render(); print(str(PF_DIR / 'RECOMMENDATION_REGISTRY.md')); return 0
    if args.command == 'recommendation-summary':
        print(json.dumps(recommendation_summary(), indent=2)); return 0
    if args.command == 'mark-recommendation':
        print(json.dumps(mark_recommendation(args.id, args.status, args.note), indent=2)); return 0
    if args.command == 'state-machine-render':
        print(state_machine_render()); return 0
    if args.command == 'schedule-due':
        print(json.dumps(schedule_due(), indent=2)); return 0
    if args.command == 'schedule-run':
        print(json.dumps(schedule_run(args.job), indent=2)); return 0
    if args.command == 'bad-state-scan':
        print(json.dumps(bad_state_scan(active=args.active), indent=2)); return 0

    if args.command in {'run','diff','validate','evaluate','prepare-retry','bad-state-check','context-manifest','publish-ledger','state-machine-check'}:
        run_dir = resolve_run_dir(args.run_dir)
        if not run_dir.exists():
            print(f'Run directory does not exist: {args.run_dir}', file=sys.stderr); return 1

    if args.command == 'run':
        results = run_intent(config, args.intent)
        report_path = run_dir / 'TEST_REPORT.json'
        existing = read_json(report_path, {'commands': [], 'last_intent': None, 'applicable': True})
        existing['commands'] = [c for c in existing.get('commands', []) if c.get('intent') != args.intent]
        for r in results: r['intent'] = args.intent
        existing['commands'].extend(results)
        existing['last_intent'] = args.intent
        write_json(report_path, existing)
        capture_diff(run_dir)
        print(str(report_path)); return 0
    if args.command == 'diff':
        capture_diff(run_dir); print(str(run_dir / 'PATCH.diff')); return 0
    if args.command == 'validate':
        print(json.dumps(validate_policy(run_dir, config), indent=2)); return 0
    if args.command == 'evaluate':
        print(json.dumps(evaluate(run_dir, config), indent=2)); return 0
    if args.command == 'prepare-retry':
        print(json.dumps(prepare_retry(run_dir, config, args.reason), indent=2)); return 0
    if args.command == 'bad-state-check':
        print(json.dumps(bad_state_check(run_dir, config), indent=2)); return 0
    if args.command == 'context-manifest':
        print(json.dumps(context_manifest(run_dir), indent=2)); return 0
    if args.command == 'publish-ledger':
        print(json.dumps(publish_ledger(run_dir), indent=2)); return 0
    if args.command == 'record-follow-on':
        print(json.dumps(record_follow_on(resolve_run_dir(args.from_run), resolve_run_dir(args.to_run), args.reason), indent=2)); return 0
    if args.command == 'contract-add':
        print(json.dumps(contract_index_add(args.name, args.path, args.description, args.status), indent=2)); return 0
    if args.command == 'contract-update':
        print(json.dumps(contract_index_update(args.name, args.status), indent=2)); return 0
    if args.command == 'rebuild-contract-index':
        print(json.dumps(rebuild_contract_index(), indent=2)); return 0
    if args.command == 'state-machine-check':
        print(json.dumps(state_machine_check(run_dir), indent=2)); return 0
    return 1


if __name__ == '__main__':
    raise SystemExit(main())
