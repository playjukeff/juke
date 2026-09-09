"""Every workflow step actually does something.

    python scripts/test_workflows.py

A GitHub workflow is the one thing in this repository whose validity nothing
checked. The suites check the code, the code checks the data, and the file
that decides whether any of it deploys was read by nobody until GitHub
refused it -- with "This run likely failed because of a workflow file
issue", which names no line and no step.

That is not hypothetical. Removing a test step deleted its `run:` line and
left the `- name:` above it, because the comment block that introduced the
step sat above the NAME rather than above the run, so a script walking back
over comments from the run line never reached it. A step with a name and
nothing to do is invalid, so the worker stopped deploying entirely -- and it
stayed broken across a merge, because a deploy that never starts looks a lot
like one nobody was waiting for.

Standard library only, like every other Python suite here: PyYAML is not a
dependency this project has, and the two properties worth checking do not
need a parser.
"""

import os
import re
import sys

WORKFLOWS = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                         ".github", "workflows")

failures = []


def check(what, ok, detail=""):
    if ok:
        print("ok  " + what)
    else:
        failures.append(what)
        print("x   " + what + ("\n      " + detail if detail else ""))


def steps_without_action(path):
    """A step is `- name:` and everything indented under it. It has to carry
    a `run:` or a `uses:` somewhere in that block."""
    with open(path, encoding="utf-8") as fh:
        lines = fh.read().replace("\r\n", "\n").split("\n")

    orphans = []
    for i, line in enumerate(lines):
        m = re.match(r"^(\s*)- name: (.+)$", line)
        if not m:
            continue
        indent = len(m.group(1))
        found = False
        for nxt in lines[i + 1:]:
            if not nxt.strip():
                continue
            # Dedenting to or past the dash ends this step.
            if len(nxt) - len(nxt.lstrip()) <= indent:
                break
            if re.match(r"^\s*(run|uses):", nxt):
                found = True
                break
        if not found:
            orphans.append("line %d: %s" % (i + 1, m.group(2).strip()))
    return orphans


def scripts_that_do_not_exist(path, root):
    """A step running `node worker/x.mjs` or `python scripts/y.py` names a
    file. Deleting the file and leaving the step is the other half of the
    same mistake, and it fails at deploy time rather than at review time."""
    with open(path, encoding="utf-8") as fh:
        text = fh.read()
    missing = []
    for m in re.finditer(r"(?:node|python|py)\s+((?:worker|scripts|tests)/[\w./-]+)", text):
        rel = m.group(1)
        if not os.path.exists(os.path.join(root, rel)):
            missing.append(rel)
    return sorted(set(missing))


def main():
    root = os.path.dirname(WORKFLOWS.rstrip(os.sep))
    root = os.path.dirname(os.path.dirname(WORKFLOWS))
    if not os.path.isdir(WORKFLOWS):
        print("x   no .github/workflows directory")
        return 1

    files = sorted(f for f in os.listdir(WORKFLOWS) if f.endswith((".yml", ".yaml")))
    check("there are workflows to check", bool(files), WORKFLOWS)

    for name in files:
        path = os.path.join(WORKFLOWS, name)
        orphans = steps_without_action(path)
        check("%s: every step has a run or a uses" % name,
              not orphans, "\n      ".join(orphans))

        missing = scripts_that_do_not_exist(path, root)
        check("%s: every script it runs exists" % name,
              not missing, ", ".join(missing))

    print("\nFAIL - %d failing" % len(failures) if failures else "\nOK - the workflows")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
