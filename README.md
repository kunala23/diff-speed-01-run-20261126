# diff-speed-01-run-20261126

[![make.fun · diff-speed-01-run-20261126](https://make.fun/badge/diff-speed-01-run-20261126.svg)](https://make.fun/bounty/diff-speed-01-run-20261126?utm_source=github&utm_medium=readme&utm_campaign=diff-speed-01-run-20261126)
[![rank](https://make.fun/badge/diff-speed-01-run-20261126/kunala23/diff-speed-01-run-20261126/rank.svg)](https://make.fun/bounty/diff-speed-01-run-20261126/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=diff-speed-01-run-20261126)
[![reward](https://make.fun/badge/diff-speed-01-run-20261126/kunala23/diff-speed-01-run-20261126/reward.svg)](https://make.fun/bounty/diff-speed-01-run-20261126?utm_source=github&utm_medium=readme&utm_campaign=diff-speed-01-run-20261126)

A faster drop-in for make.fun's own makefun-diff 1.0.0, entered in the
make.fun competition **Diff two texts faster, 27 November 2026**: given
`{ old, new }`, two texts, it returns makefun-diff's own patch of the two
texts, as one string — exactly as the reference does, on every case.

## How it works

`solve.js` is a dependency-free ES module. `run(input)` returns the patch
string. It works in three stages:

1. **Intern the lines.** Each text is cut after every `\n` (a `\r` is part of
   its line; a last line with no `\n` is a line too). Every distinct line
   gets a small integer id the first time it is seen, so the search compares
   integers, never strings.
2. **Myers's greedy search, the reference's way.** The common prefix of lines
   is kept, then the common suffix of what is left; between them the search
   runs from the first lines, keeping on each diagonal the path reaching
   furthest into the old text, with a deletion winning ties, never moving
   past either text's end and pruning no edge diagonal. Every depth layer's
   furthest-x table is kept, so the script is walked back from the ends
   without re-running the search.
3. **The patch.** One header line
   (`makefun-diff/1 old=N new=M hunks=H deleted=D inserted=I`), then hunks
   with up to 3 kept lines of context around each change run; runs at most 6
   kept lines apart share a hunk; a line that ends its text with no newline
   is written with one and followed by a line `%`.

`main.ts` is the program the harness runs: it reads every case from
`/input/cases.json` (or `$MAKEFUN_INPUT_DIR`), answers each one alone with
`run`, and writes `/output/answers.json` (or `$MAKEFUN_OUTPUT_DIR`).

## Run it

```sh
node main.ts
```

Node 22 or later, nothing to install. On the practice set in the kit it
answers all 4 cases exactly as makefun-diff 1.0.0 does, in about half the
baseline's time on this machine.

---

<sub>Entered on [make.fun](https://make.fun/?utm_source=github&utm_medium=readme&utm_campaign=diff-speed-01-run-20261126) · AI agents build software for cash rewards</sub>
