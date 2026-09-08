#!/usr/bin/env python3
"""Refuse whole-tree git staging and the writing forms of git stash.

This checkout is regularly open in more than one agent session at once, and
CLAUDE.md records four separate incidents in one night where a whole-tree
command took another session's work: 41,379 lines of somebody else's untracked
CSV swept into an unrelated commit, a stash that carried away in-flight edits,
and a commit titled about fonts that pushed a different session's uncommitted
React changes. None of those were noticed by the session that caused them.

Two things about this file are deliberate and easy to undo by accident.

It is Python rather than the usual `jq` one-liner, because jq is not installed
here — and a hook written against a missing binary does not fail loudly, it
simply never fires, which is the worst possible outcome for a guardrail.

It FAILS OPEN. Anything it cannot parse, and any exception at all, exits 0 and
allows the command. A guard that blocks work when it cannot read its own input
is worse than the hazard it guards against.

It is a backstop, not the fix. The fix is that a second session works in a
worktree (.claude/worktrees/ already holds several) and stages explicit paths.
"""

import json
import re
import sys

# Reading is how you find out what a previous session left behind, so the two
# read-only stash subcommands stay allowed. Everything else under `stash`
# writes: push, save, pop, apply, drop, clear, branch, create, store — and a
# bare `git stash` is `push`.
STASH_READS = {"list", "show"}

# Whole-tree pathspecs. `git add ./src` is a scoped stage and is fine; a bare
# `.` or `:/` is the whole tree.
TREE_PATHSPECS = {".", ":/", ":/."}
TREE_FLAGS = {"-A", "--all", "--no-ignore-removal"}

# `git add -n .` stages nothing — it reports what a stage WOULD take, which is
# the check to run before staging and the one this hook should never refuse.
# Found by the hook blocking exactly that command a minute after it was wired
# up, which is also how we know it is wired up.
DRY_RUN = {"-n", "--dry-run"}

SPLIT = re.compile(r"(?:&&|\|\||[;|\n])")

# `git` itself, and a leading `VAR=value` env assignment, which the tokenizer
# hands back as its own word rather than as part of the command.
GIT_START = re.compile(r"^git(?:\.exe)?$", re.IGNORECASE)
ENV_ASSIGN = re.compile(r"^\w+=")
GIT_OPTS_WITH_VALUE = {"-C", "-c", "--git-dir", "--work-tree", "--namespace", "--exec-path"}


def words(segment):
    """Rough shell tokenizer. Falls back to whitespace splitting on anything
    it cannot lex — an unparseable segment must not block."""
    try:
        import shlex

        return shlex.split(segment, posix=True)
    except ValueError:
        return segment.split()


def git_args(tokens):
    """Return git's arguments after its own options, or None if not a git call."""
    i = 0
    while i < len(tokens) and ENV_ASSIGN.match(tokens[i]):
        i += 1
    if i >= len(tokens) or not GIT_START.match(tokens[i]):
        return None
    i += 1
    while i < len(tokens):
        t = tokens[i]
        if t in GIT_OPTS_WITH_VALUE:
            i += 2
            continue
        if t.startswith("-"):
            i += 1
            continue
        break
    return tokens[i:]


def refusal(segment):
    """The reason this segment is refused, or None to allow it."""
    args = git_args(words(segment))
    if not args:
        return None
    sub, rest = args[0], args[1:]

    if sub == "add":
        # Everything after `--` is a pathspec, never a flag.
        try:
            cut = rest.index("--")
            flags, paths = rest[:cut], rest[cut + 1 :]
        except ValueError:
            flags = [a for a in rest if a.startswith("-")]
            paths = [a for a in rest if not a.startswith("-")]
        if any(f in DRY_RUN for f in flags):
            return None
        if any(f in TREE_FLAGS for f in flags):
            return "`git add " + " ".join(f for f in flags if f in TREE_FLAGS) + "` stages the whole tree"
        if any(p in TREE_PATHSPECS for p in paths):
            return "`git add .` stages the whole tree"
        return None

    if sub == "stash":
        verb = next((a for a in rest if not a.startswith("-")), "push")
        if verb in STASH_READS:
            return None
        return "`git stash " + verb + "` writes, and takes whatever else is in the tree with it"

    return None


def main():
    try:
        payload = json.load(sys.stdin)
    except Exception:
        return 0

    try:
        if payload.get("tool_name") not in ("Bash", "PowerShell"):
            return 0
        command = payload.get("tool_input", {}).get("command")
        if not isinstance(command, str):
            return 0

        for segment in SPLIT.split(command):
            why = refusal(segment.strip())
            if why:
                sys.stderr.write(
                    "Blocked by .claude/hooks/block-whole-tree-git.py: "
                    + why
                    + ".\n\nThis checkout is often open in more than one session at once, and a "
                    "whole-tree command has taken another session's uncommitted work four times "
                    "here. Stage explicit paths instead:\n\n"
                    "    git add <path> [<path> ...]\n\n"
                    "`git stash list` and `git stash show` are still allowed. If you genuinely "
                    "need this, ask the user to run it themselves.\n"
                )
                return 2
    except Exception:
        return 0

    return 0


if __name__ == "__main__":
    sys.exit(main())
