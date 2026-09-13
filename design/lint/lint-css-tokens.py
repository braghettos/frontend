#!/usr/bin/env python3
"""
lint-css-tokens — token-adoption checks for the Layer 1 rules in ../01-tokens.md.

THE BASELINE IS THE POINT. This codebase carries ~300 pre-existing token violations, so a plain
gate would fail CI on its first run and be switched off within a day — which is how the last
composition lint died (23 false positives against 1 real defect, then deleted). Instead the
current state is recorded in a baseline file: CI fails on anything NOT in it, so new code is held
to the rule while the existing debt is counted, visible, and burns down.

That makes the baseline a debt ledger, not an excuse: `--summary` prints what is left per rule, and
the file shrinks as the sweep proceeds.

Usage:
    lint-css-tokens.py <dir> [--baseline FILE] [--update-baseline] [--summary] [--rule R1,R2]

Exit code is the number of NEW violations (0 = clean against the baseline).
"""
import argparse
import glob
import json
import os
import re
import sys

# A hex inside `var(--token, #888)` is a FALLBACK, not a hardcoded colour — flagging it would be a
# false positive on defensive CSS that is doing the right thing.
VAR_FALLBACK = re.compile(r'var\(\s*--[\w-]+\s*,[^)]*\)')


def css_files(root):
    return sorted(
        glob.glob(os.path.join(root, '**', '*.module.css'), recursive=True)
        + glob.glob(os.path.join(root, '**', 'index.css'), recursive=True)
    )


COMMENT = re.compile(r'/\*.*?\*/', re.S)


def _decomment(text):
    """Blank out /* ... */ while keeping every byte offset, so line numbers stay true.

    A comment is prose, not code. These files explain themselves at length — what antd does with
    `margin-bottom: 1em`, which breakpoint a cluster collapses at — and a scanner that reads prose
    reports the EXAMPLE as the violation. That is worse than a miss: the only way to satisfy it is
    to delete the explanation. Newlines are preserved so `text[:start].count("\n")` still works."""
    return COMMENT.sub(lambda m: re.sub(r'[^\n]', ' ', m.group(0)), text)


def _read(path):
    return _decomment(open(path, encoding='utf-8').read())


def _scan(path, pattern, ok):
    """Yield (line, declaration) for every match whose value fails `ok`."""
    text = _read(path)
    for match in re.finditer(pattern, text):
        if ok(match.group(1)):
            continue
        line = text[:match.start()].count('\n') + 1
        yield line, re.sub(r'\s+', ' ', match.group(0)).strip()[:90]


def rule_font_size(path):
    """T3 — every font-size resolves to a token, not a raw number.

    `1em`, `100%` and `inherit` are exempt: they declare NO size of their own, they restate the
    parent's. The markdown block in the Autopilot rail uses this to flatten h1-h6 to body size —
    a deliberate suppression of the heading ramp, not a size chosen off-scale. There is nothing
    for a token to name.

    Anything else relative (`0.85em`) is NOT exempt. It picks a size the scale does not contain,
    which is exactly what this rule exists to notice; that it does so as a ratio rather than a
    number makes it harder to see, not more legitimate."""
    return _scan(
        path, r'font-size:\s*([^;]+);',
        lambda v: 'var(' in v or IMPORTANT.sub('', v).strip() in ('1em', '100%', 'inherit'),
    )


# `!important` is an override, not a value — stripping it before the exemption check is what keeps
# `margin: 0 !important` out of the results. It was a false positive on the first real CI run, on a
# file this very design system had just added.
IMPORTANT = re.compile(r'\s*!\s*important\s*$', re.I)


def _not_a_size(value):
    """True when every part of the value is `0` or `auto` — neither is a length.

    This was a hardcoded set of three strings ('0', 'auto', '0 auto'), which is a list of the
    cases someone happened to hit rather than a rule. `margin: auto 0` is the same statement with
    the words the other way round, and it was the last "violation" left in the codebase after the
    sweep: a declaration containing no length at all, demanding a length token."""
    return all(p in ('0', 'auto') for p in IMPORTANT.sub('', value).split())


def rule_spacing(path):
    """T4 — padding/margin resolve to --spacing-*. `0` and `auto` are not sizes.

    A NEGATIVE margin is exempt. It is not spacing — it is an offset, pulling an element out of
    the flow to meet something else: a collapsed border, a bleeding edge, or the fixed
    screen-reader-only idiom (`height: 1px; margin: -1px; clip-path: inset(50%)`), where the
    -1px is part of the pattern and snapping it to a token breaks it. Offsets answer to the thing
    they are offsetting against, not to the spacing scale."""
    return _scan(
        path, r'(?:padding|margin)[a-z-]*:\s*([^;]+);',
        lambda v: 'var(' in v or _not_a_size(v) or re.search(r'-\d', v) is not None,
    )


def rule_gap(path):
    """T4 — gap resolves to --spacing-*."""
    return _scan(path, r'\bgap:\s*([^;]+);', lambda v: 'var(' in v or _not_a_size(v))


def rule_hex_literal(path):
    """T1 — colour comes from a token, never a hex literal.

    A hex used as a `var()` FALLBACK is exempt: `color-mix(in srgb, var(--text-color, #888) 20%,
    transparent)` is defensive CSS doing the right thing, and flagging it teaches authors to remove
    their fallbacks."""
    text = _read(path)
    for match in re.finditer(r'^\s*([a-z-]+):\s*([^;]+);', text, re.M):
        value = match.group(2)
        stripped = VAR_FALLBACK.sub('', value)
        if re.search(r'#[0-9A-Fa-f]{3,8}\b', stripped):
            line = text[:match.start()].count('\n') + 1
            yield line, re.sub(r'\s+', ' ', match.group(0)).strip()[:90]


def rule_breakpoint(path):
    """T6 — don't invent another breakpoint.

    No breakpoint token exists yet, so this cannot say "use the token". What it CAN do is stop a
    sixth value appearing: four components already invent their own (1024/640, 1180/960, 768) and
    no two share one. Every existing value sits in the baseline; a new one fails."""
    return _scan(path, r'@media[^{]*\((?:max|min)-width:\s*([^)]+)\)', lambda v: 'var(' in v)


def rule_unguarded_animation(path):
    """T9 — a looping animation respects prefers-reduced-motion.

    File-scoped deliberately: the guard is conventionally a media block at the end of the same
    file, so cross-file analysis would buy nothing and cost precision.

    Comments are stripped BOTH sides of this one. A comment that merely mentions
    prefers-reduced-motion is not a guard, and suppressing the rule on prose would be the one
    false NEGATIVE in this file — accessibility silently unchecked because someone wrote about it."""
    text = _read(path)
    if 'prefers-reduced-motion' in text:
        return
    for match in re.finditer(r'animation:[^;]*\binfinite\b[^;]*;', text):
        line = text[:match.start()].count('\n') + 1
        yield line, re.sub(r'\s+', ' ', match.group(0)).strip()[:90]


RULES = {
    'font-size': (rule_font_size, 'T3'),
    'spacing': (rule_spacing, 'T4'),
    'gap': (rule_gap, 'T4'),
    'hex-literal': (rule_hex_literal, 'T1'),
    'breakpoint': (rule_breakpoint, 'T6'),
    'unguarded-animation': (rule_unguarded_animation, 'T9'),
}


def collect(root, selected):
    """{rule: {relative_path: count}} — counts, not line numbers, so the baseline survives edits
    elsewhere in a file. A file whose violations DROP is not a failure."""
    out = {}
    for name in selected:
        fn, _ = RULES[name]
        per_file = {}
        for path in css_files(root):
            hits = list(fn(path))
            if hits:
                per_file[os.path.relpath(path, root)] = len(hits)
        out[name] = per_file
    return out


def detail(root, name):
    fn, _ = RULES[name]
    for path in css_files(root):
        for line, text in fn(path):
            yield os.path.relpath(path, root), line, text


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('root')
    ap.add_argument('--baseline', default=None, help='JSON debt ledger (default: <script dir>/css-baseline.json)')
    ap.add_argument('--update-baseline', action='store_true')
    ap.add_argument('--summary', action='store_true', help='print the remaining debt per rule')
    ap.add_argument('--rule')
    args = ap.parse_args()

    selected = args.rule.split(',') if args.rule else list(RULES)
    for name in selected:
        if name not in RULES:
            print(f'unknown rule: {name}', file=sys.stderr)
            return 2

    baseline_path = args.baseline or os.path.join(os.path.dirname(os.path.abspath(__file__)), 'css-baseline.json')
    current = collect(args.root, selected)

    if args.update_baseline:
        with open(baseline_path, 'w', encoding='utf-8') as fh:
            json.dump(current, fh, indent=2, sort_keys=True)
            fh.write('\n')
        total = sum(sum(f.values()) for f in current.values())
        print(f'baseline written: {baseline_path} ({total} violations recorded)')
        return 0

    baseline = {}
    if os.path.exists(baseline_path):
        baseline = json.load(open(baseline_path, encoding='utf-8'))

    if args.summary:
        print(f'{"rule":<22} {"id":<4} {"now":>6} {"baseline":>9} {"delta":>7}')
        for name in selected:
            now = sum(current.get(name, {}).values())
            was = sum(baseline.get(name, {}).values())
            flag = '' if now <= was else '  ← NEW'
            print(f'{name:<22} {RULES[name][1]:<4} {now:>6} {was:>9} {now - was:>+7}{flag}')
        return 0

    new_total = 0
    for name in selected:
        allowed = baseline.get(name, {})
        offenders = []
        for path, count in sorted(current.get(name, {}).items()):
            if count > allowed.get(path, 0):
                offenders.append((path, count, allowed.get(path, 0)))
        if not offenders:
            continue
        print(f'\n{RULES[name][1]} ({name}): {len(offenders)} file(s) above baseline')
        for path, count, was in offenders:
            over = count - was
            print(f'  {path}: {count} violations, baseline {was} — {over} NEW')
            # The baseline records per-file COUNTS, not line numbers, so that edits elsewhere in a
            # file do not invalidate it. The cost is that the specific new line cannot be named —
            # every violation in the file is listed, and the author knows which one they just wrote.
            for dpath, line, text in detail(args.root, name):
                if dpath == path:
                    print(f'      {line}: {text}')
            new_total += over

    if new_total == 0:
        print('clean against baseline')
    return new_total


if __name__ == '__main__':
    sys.exit(main())
