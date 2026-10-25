#!/usr/bin/env python3
"""Deterministic metrics for a Claude Code multi-agent run (workflow-retro, deep mode).

Reads the session transcript + every subagent transcript/meta under
~/.claude/projects/<project>/<session>/ and prints a markdown metrics block.
Numbers only — the qualitative analysis is the model's job (see SKILL.md).

Usage:
  python3 collect.py [--session <id|path.jsonl>] [--project-dir <dir>]
                     [--since <ISO-8601>] [--prices <prices.json>] [--json <out.json>]

--session      default: newest *.jsonl in the project dir (= the current session)
--project-dir  default: ~/.claude/projects/<cwd with / and . replaced by ->
--since        only count entries at/after this timestamp (scope to one workflow)
--timeline     also print a text timeline (prompts, Agent/SendMessage calls, hand-back reports,
               truncated) — the qualitative input for the retro, so nobody hand-parses JSONL
--prices       {"<model>": {"in": $/Mtok, "out": .., "cache_read": .., "cache_write": ..}}
               without it, cost is NOT computed (never guessed)
"""
import argparse
import glob
import json
import os
import re
import sys
from collections import Counter, defaultdict
from datetime import datetime

IDLE_CAP_S = 300  # gaps longer than this count as idle, not active work
# file paths read through the shell (agents often `cat`/`sed -n` instead of Read)
BASH_READ_RE = re.compile(r"\b(?:cat|head|tail|sed\s+-n\s+'[^']*'|sed\s+-n\s+\S+|less|wc(?:\s+-\w+)?)\s+([~\w./-]+\.\w+)")
HOOK_RE = re.compile(r"^(Stop hook feedback|.*hook (blocking error|additional context))", re.S)
NOISE_PREFIXES = ("<command-message>", "<command-name>", "<local-command", "<system-reminder>", "[SYSTEM NOTIFICATION")
COORD_RE = re.compile(r"^(The coordinator sent a message|Another Claude session sent a message)")


def ts(s):
    return datetime.fromisoformat(s.replace("Z", "+00:00")) if s else None


def default_project_dir():
    slug = re.sub(r"[/.]", "-", os.getcwd())
    return os.path.expanduser(f"~/.claude/projects/{slug}")


def norm(path):
    """Repo-relative when inside cwd, so `cat src/x.ts` and Read(/abs/src/x.ts) match."""
    path = os.path.expanduser(path)
    root = os.getcwd() + os.sep
    return path[len(root):] if path.startswith(root) else path


def load(path):
    out = []
    with open(path) as f:
        for line in f:
            try:
                out.append(json.loads(line))
            except json.JSONDecodeError:
                pass
    return out


def text_of(content):
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        return " ".join(x.get("text", "") for x in content if isinstance(x, dict) and x.get("type") == "text")
    return ""


def result_len(content):
    if isinstance(content, str):
        return len(content)
    if isinstance(content, list):
        return sum(len(x.get("text", "")) for x in content if isinstance(x, dict))
    return 0


def analyze(entries, since=None, until=None):
    """Aggregate one transcript. Assistant entries are split per content block and share
    message.id — usage is counted once per message.id."""
    usage = Counter()
    models = Counter()
    tools = Counter()
    errors = []
    reads = Counter()
    greps = Counter()
    big_results = []
    spawns = []
    resumes = Counter()
    coordinator_msgs = 0
    hook_turns = 0
    hook_tokens = 0
    in_hook_turn = False  # assistant usage after a hook-injected prompt = hook overhead
    seen_msg = set()
    tool_names = {}
    stamps = []
    for d in entries:
        t = ts(d.get("timestamp"))
        if t and ((since and t < since) or (until and t > until)):
            continue
        if t and d.get("type") in ("assistant", "user"):
            stamps.append(t)
        if d.get("type") == "assistant":
            m = d.get("message", {})
            mid = m.get("id")
            if mid and mid not in seen_msg:
                seen_msg.add(mid)
                u = m.get("usage") or {}
                for k in ("input_tokens", "output_tokens", "cache_read_input_tokens", "cache_creation_input_tokens"):
                    usage[k] += u.get(k) or 0
                    if in_hook_turn:
                        hook_tokens += u.get(k) or 0
                models[m.get("model", "?")] += 1
            for x in m.get("content") or []:
                if x.get("type") != "tool_use":
                    continue
                name, inp = x.get("name"), x.get("input") or {}
                tools[name] += 1
                tool_names[x.get("id")] = name
                if name == "Read" and inp.get("file_path"):
                    reads[norm(inp["file_path"])] += 1
                elif name == "Grep" and inp.get("pattern"):
                    greps[inp["pattern"]] += 1
                elif name == "Bash" and inp.get("command"):
                    for path in BASH_READ_RE.findall(inp["command"]):
                        reads[norm(path)] += 1
                elif name in ("Agent", "Workflow"):
                    spawns.append((d.get("timestamp"), name, inp.get("subagent_type") or inp.get("name") or "workflow",
                                   inp.get("description", "")))
                elif name == "SendMessage" and inp.get("to"):
                    resumes[inp["to"]] += 1
        elif d.get("type") == "user":
            c = d.get("message", {}).get("content")
            txt = text_of(c).strip()
            if txt:  # a new prompt (not a tool_result) starts a new turn
                in_hook_turn = bool(HOOK_RE.match(txt))
                hook_turns += in_hook_turn
            if COORD_RE.match(txt):
                coordinator_msgs += 1
            if isinstance(c, list):
                for x in c:
                    if not isinstance(x, dict) or x.get("type") != "tool_result":
                        continue
                    name = tool_names.get(x.get("tool_use_id"), "?")
                    if x.get("is_error"):
                        errors.append(f"{name}: {text_of(x.get('content')) or str(x.get('content'))}"[:160])
                    big_results.append((result_len(x.get("content")), name))
    stamps.sort()
    active = sum(min((b - a).total_seconds(), IDLE_CAP_S) for a, b in zip(stamps, stamps[1:]))
    return {
        "usage": dict(usage), "models": dict(models), "tools": dict(tools), "errors": errors,
        "reads": reads, "greps": greps, "big_results": sorted(big_results, reverse=True)[:3],
        "spawns": spawns, "resumes": dict(resumes), "coordinator_msgs": coordinator_msgs,
        "hook_turns": hook_turns, "hook_tokens": hook_tokens,
        "start": stamps[0] if stamps else None, "end": stamps[-1] if stamps else None,
        "active_s": active, "api_calls": len(seen_msg),
    }


def timeline(entries, who, since=None, until=None, width=400):
    """(timestamp, who, kind, text) rows for the qualitative pass."""
    rows = []
    for d in entries:
        t = ts(d.get("timestamp"))
        if not t or (since and t < since) or (until and t > until):
            continue
        if d.get("type") == "user":
            txt = text_of(d.get("message", {}).get("content")).strip()
            if txt and not txt.startswith(NOISE_PREFIXES) and not HOOK_RE.match(txt):
                rows.append((t, who, "prompt", txt))
        elif d.get("type") == "assistant":
            for x in d.get("message", {}).get("content") or []:
                if x.get("type") != "tool_use":
                    continue
                inp = x.get("input") or {}
                if x.get("name") in ("Agent", "SendMessage", "SubagentHandback", "AskUserQuestion"):
                    body = inp.get("prompt") or inp.get("message") or inp.get("report") or json.dumps(inp, ensure_ascii=False)
                    rows.append((t, who, x["name"], f"{inp.get('description') or inp.get('to') or ''} {body}".strip()))
    return [(t, w, k, re.sub(r"\s+", " ", txt)[:width]) for t, w, k, txt in rows]


def total_tokens(u):
    return sum(u.get(k, 0) for k in ("input_tokens", "output_tokens", "cache_read_input_tokens",
                                     "cache_creation_input_tokens"))


def cache_hit(u):
    denom = u.get("input_tokens", 0) + u.get("cache_read_input_tokens", 0) + u.get("cache_creation_input_tokens", 0)
    return (u.get("cache_read_input_tokens", 0) / denom) if denom else 0.0


def cost(u, models, prices):
    if not prices or len(models) != 1:
        return None  # unknown model price or mixed models → don't guess
    p = prices.get(next(iter(models)))
    if not p:
        return None
    return (u.get("input_tokens", 0) * p["in"] + u.get("output_tokens", 0) * p["out"]
            + u.get("cache_read_input_tokens", 0) * p["cache_read"]
            + u.get("cache_creation_input_tokens", 0) * p["cache_write"]) / 1e6


def fmt_k(n):
    return f"{n/1e6:.2f}M" if n >= 1e6 else f"{n/1e3:.1f}k" if n >= 1e3 else str(n)


def fmt_dur(s):
    s = int(s)
    return f"{s//3600}h{(s%3600)//60:02d}m" if s >= 3600 else f"{s//60}m{s%60:02d}s"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--session")
    ap.add_argument("--project-dir", default=default_project_dir())
    ap.add_argument("--since")
    ap.add_argument("--until")
    ap.add_argument("--prices")
    ap.add_argument("--json")
    ap.add_argument("--timeline", action="store_true")
    a = ap.parse_args()

    if a.session and a.session.endswith(".jsonl"):
        main_path = os.path.expanduser(a.session)
    elif a.session:
        main_path = os.path.join(a.project_dir, f"{a.session}.jsonl")
    else:
        cands = sorted(glob.glob(os.path.join(a.project_dir, "*.jsonl")), key=os.path.getmtime)
        if not cands:
            sys.exit(f"no session transcripts in {a.project_dir}")
        main_path = cands[-1]
    sess_dir = main_path[:-len(".jsonl")]
    since = ts(a.since) if a.since else None
    until = ts(a.until) if a.until else None
    prices = json.load(open(a.prices)) if a.prices else None

    main = analyze(load(main_path), since, until)
    agents = {}
    for jp in glob.glob(os.path.join(sess_dir, "**", "agent-*.jsonl"), recursive=True):
        aid = os.path.basename(jp)[len("agent-"):-len(".jsonl")]
        mp = jp[:-len(".jsonl")] + ".meta.json"
        meta = json.load(open(mp)) if os.path.exists(mp) else {}
        r = analyze(load(jp), since, until)
        if r["api_calls"] == 0:
            continue
        r["meta"] = meta
        agents[aid] = r

    def depth(aid):
        return agents[aid]["meta"].get("spawnDepth", 1)

    order = sorted(agents, key=lambda k: agents[k]["start"])
    all_u = Counter(main["usage"])
    for r in agents.values():
        all_u.update(r["usage"])
    all_models = Counter(main["models"])
    for r in agents.values():
        all_models.update(r["models"])

    sub_start = min((agents[k]["start"] for k in order), default=None)
    sub_end = max((agents[k]["end"] for k in order), default=None)
    sum_active = sum(agents[k]["active_s"] for k in order)
    # peak parallelism: max agents whose [start, end] windows overlap
    events = sorted([(agents[k]["start"], 1) for k in order] + [(agents[k]["end"], -1) for k in order])
    cur = peak = 0
    for _, step in events:
        cur += step
        peak = max(peak, cur)

    out = []
    p = out.append
    p(f"# Workflow metrics — session `{os.path.basename(sess_dir)}`")
    if since or until:
        p(f"_Scoped to entries {a.since or '…'} → {a.until or 'now'}._")
    p("")
    p("## Totals")
    p(f"- Agents launched: **{len(order)}** "
      f"({', '.join(f'{v}× {k}' for k, v in Counter(agents[k]['meta'].get('agentType', '?') for k in order).items())})")
    p(f"- Tokens processed, whole session (main + agents, incl. cache reads): **{fmt_k(total_tokens(all_u))}** — "
      f"in {fmt_k(all_u['input_tokens'])}, out {fmt_k(all_u['output_tokens'])}, "
      f"cache read {fmt_k(all_u['cache_read_input_tokens'])}, cache write {fmt_k(all_u['cache_creation_input_tokens'])}")
    p(f"- Of which main/orchestrator: {fmt_k(total_tokens(main['usage']))}; agents: "
      f"{fmt_k(total_tokens(all_u) - total_tokens(main['usage']))}")
    p(f"- Cache hit ratio: {cache_hit(all_u):.0%}")
    c = cost(all_u, all_models, prices)
    p(f"- Cost: {'$%.2f' % c if c is not None else 'not computed (pass --prices; never estimate from memory)'}")
    p(f"- Models: {', '.join(f'{m} ({n} calls)' for m, n in all_models.items())}")
    if sub_start:
        p(f"- Agent span (first start → last end): {fmt_dur((sub_end - sub_start).total_seconds())}; "
          f"sum of agent active time: {fmt_dur(sum_active)}; peak parallel agents: {peak}")
    p(f"- Orchestrator → agent follow-ups (SendMessage resumes): {sum(main['resumes'].values())}")
    if main["hook_turns"]:
        p(f"- Hook-triggered turns in main: {main['hook_turns']}, costing {fmt_k(main['hook_tokens'])} tokens "
          f"({main['hook_tokens'] / max(total_tokens(main['usage']), 1):.0%} of main)")
    p("")
    p("## Launch order")
    p("| # | Start (UTC) | Agent | Type | Parent | Active | Tokens | Cache hit | Tools | Errors | Resumed |")
    p("|---|---|---|---|---|---|---|---|---|---|---|")
    for i, k in enumerate(order, 1):
        r, m = agents[k], agents[k]["meta"]
        indent = "↳ " * (depth(k) - 1)
        p(f"| {i} | {r['start']:%m-%d %H:%M:%S} | {indent}{m.get('description', k)} | {m.get('agentType', '?')} | "
          f"{m.get('parentAgentId', 'main')[:8]} | {fmt_dur(r['active_s'])} | {fmt_k(total_tokens(r['usage']))} | "
          f"{cache_hit(r['usage']):.0%} | {sum(r['tools'].values())} | {len(r['errors'])} | "
          f"{main['resumes'].get(k, 0) + sum(agents[o]['resumes'].get(k, 0) for o in agents)} |")
    p("")
    p("## Per-agent tool mix and heaviest tool results")
    for k in order:
        r = agents[k]
        mix = ", ".join(f"{n}×{t}" for t, n in sorted(r["tools"].items(), key=lambda x: -x[1]))
        heavy = ", ".join(f"{name} {fmt_k(n)} chars" for n, name in r["big_results"])
        p(f"- **{r['meta'].get('description', k)}** — {mix or 'no tools'}; heaviest: {heavy or '—'}")
    p("")
    p("## Duplication (deterministic)")
    readers = defaultdict(set)
    for k in order:
        for f in agents[k]["reads"]:
            readers[f].add(agents[k]["meta"].get("description", k))
    for f in main["reads"]:
        readers[f].add("main")
    dups = sorted(((f, s) for f, s in readers.items() if len(s) > 1), key=lambda x: -len(x[1]))
    if dups:
        for f, s in dups[:15]:
            p(f"- `{f}` read by {len(s)}: {', '.join(sorted(s))}")
    else:
        p("- No file read by more than one agent.")
    rereads = [(agents[k]["meta"].get("description", k), f, n) for k in order for f, n in agents[k]["reads"].items() if n > 2]
    for who, f, n in rereads[:10]:
        p(f"- `{f}` re-read {n}× by {who}")
    p("")
    p("## Errors / failed tool calls")
    any_err = False
    for who, r in [("main", main)] + [(agents[k]["meta"].get("description", k), agents[k]) for k in order]:
        for e in r["errors"][:5]:
            any_err = True
            p(f"- {who}: {e}")
    if not any_err:
        p("- None.")
    if a.timeline:
        rows = timeline(load(main_path), "main", since, until)
        for jp in glob.glob(os.path.join(sess_dir, "**", "agent-*.jsonl"), recursive=True):
            aid = os.path.basename(jp)[len("agent-"):-len(".jsonl")]
            if aid in agents:
                rows += timeline(load(jp), agents[aid]["meta"].get("description", aid)[:30], since, until)
        out += ["", "## Timeline (truncated)"]
        out += [f"- {t:%m-%d %H:%M:%S} **{w}** {k}: {txt}" for t, w, k, txt in sorted(rows)]
    print("\n".join(out))

    if a.json:
        summary = {
            "session": os.path.basename(sess_dir), "agents": len(order),
            "agent_types": dict(Counter(agents[k]["meta"].get("agentType", "?") for k in order)),
            "tokens_total": total_tokens(all_u), "tokens_main": total_tokens(main["usage"]),
            "cache_hit": round(cache_hit(all_u), 3), "cost_usd": c,
            "resumes": sum(main["resumes"].values()), "errors": len(main["errors"]) + sum(len(agents[k]["errors"]) for k in order),
            "span_s": (sub_end - sub_start).total_seconds() if sub_start else 0, "agent_active_s": sum_active,
            "dup_files": len(dups), "peak_parallel": peak,
            "hook_turns": main["hook_turns"], "hook_tokens": main["hook_tokens"],
        }
        with open(a.json, "w") as f:
            json.dump(summary, f, indent=2)


if __name__ == "__main__":
    main()
