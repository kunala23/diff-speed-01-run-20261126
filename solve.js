// diff-speed-01-run-20261126 — a fast drop-in for makefun-diff 1.0.0.
//
// Given one case's input { old, new }, two texts, run() returns the exact
// patch string makefun-diff 1.0.0 would return: the same line splitting, the
// same Myers edit script with make.fun's deletion tie-break, the same hunk
// layout. It is faster because it never builds the reference's linked list
// of path objects: lines are interned to small integer ids once, and the
// search runs on plain integer arrays.
//
// Line identity: a line is its code units including its trailing "\n" when
// it has one, so a last line with no "\n" never equals the same text with
// one. Every distinct line gets an integer id the first time it is seen;
// the search then compares integers, never strings.
//
// The search: the common prefix of lines is kept, then the common suffix of
// what is left; between them Myers's greedy search runs from the first
// lines. For each depth d and each diagonal k we keep the furthest x the
// search reaches (after following the snake of equal lines), exactly as the
// reference does: a deletion wins a tie, a step never moves past either
// text's end, no edge diagonal is pruned. Every depth layer is kept, so the
// script is walked back from (N, M) without re-running the search.
//
// The patch: one header line, then hunks holding up to 3 kept lines of
// context around each change run; runs at most 6 kept lines apart share a
// hunk; a line that ends its text with no newline is written with one and
// followed by a line "%". Identical texts are the header line alone.

/** The patch's first word. */
const FORMAT = 'makefun-diff/1';

/** The kept lines a hunk shows before and after each change run. */
const CONTEXT = 3;

const KEEP = 0;
const DEL = 1;
const INS = 2;

/**
 * Split a text into interned line ids. `ids` maps each distinct line string
 * to its id, `lines` holds each distinct line string once, at its id's
 * index, so lines[id] is the line's text for rendering the patch. Lines are
 * sliced straight out of the text (a slice keeps its trailing "\n" when it
 * has one), so no line string is ever rebuilt by concatenation.
 */
function tokenize(text, ids, lines) {
  // Count the lines first, so the id array is sized exactly once.
  let n = 0;
  for (let i = text.indexOf('\n'); i !== -1; i = text.indexOf('\n', i + 1)) n++;
  if (text.length > 0 && !text.endsWith('\n')) n++;
  const out = new Int32Array(n);
  let at = 0;
  let start = 0;
  while (start < text.length) {
    const nl = text.indexOf('\n', start);
    const line = nl === -1 ? text.slice(start) : text.slice(start, nl + 1);
    let id = ids.get(line);
    if (id === undefined) {
      id = lines.length;
      ids.set(line, id);
      lines.push(line);
    }
    out[at++] = id;
    start = nl === -1 ? text.length : nl + 1;
  }
  return out;
}

/**
 * The edit script of a[aLo..aHi) into b[bLo..bHi), as runs of [kind, count]
 * in order, following the reference rule exactly. The forward pass keeps
 * every depth layer's furthest-x table; the backward pass walks the script
 * back from the ends, choosing at each depth the same candidate the forward
 * pass chose (a deletion when it reaches at least as far into the old text
 * as the insertion).
 */
function myersRuns(a, b, aLo, aHi, bLo, bHi) {
  const N = aHi - aLo;
  const M = bHi - bLo;
  // Views over the middle slices, so the search indexes from 0.
  const aa = a.subarray(aLo, aHi);
  const bb = b.subarray(bLo, bHi);
  // vs[d] holds the furthest x on each diagonal k in [-d, d] after depth d,
  // at index k + d; -1 where that diagonal was never reached.
  const vs = [];
  // Depth 0: the snake from (0, 0).
  let x = 0;
  let y = 0;
  while (x < N && y < M && aa[x] === bb[y]) {
    x++;
    y++;
  }
  const v0 = new Int32Array(1);
  v0[0] = x;
  vs.push(v0);
  let D = 0;
  if (x !== N || y !== M) {
    let found = false;
    for (let d = 1; d <= N + M && !found; d++) {
      const prev = vs[d - 1];
      const pd = d - 1;
      const cur = new Int32Array(2 * d + 1);
      cur.fill(-1);
      // Diagonal k = -d has only the insertion candidate; k = d only the
      // deletion one; the interior diagonals have both, with table indexes
      // always in range, so their checks are skipped.
      const plen = prev.length;
      for (let k = -d; k <= d; k += 2) {
        let delX = -2;
        let insX = -2;
        if (k === -d) {
          const vx = prev[0];
          if (vx >= 0 && vx - (k + 1) < M) insX = vx;
        } else if (k === d) {
          const vx = prev[plen - 1];
          if (vx >= 0 && vx < N) delX = vx + 1;
        } else {
          const vDel = prev[k - 1 + pd];
          if (vDel >= 0 && vDel < N) delX = vDel + 1;
          const vIns = prev[k + 1 + pd];
          if (vIns >= 0 && vIns - (k + 1) < M) insX = vIns;
        }
        if (delX === -2 && insX === -2) continue;
        x = delX >= insX ? delX : insX;
        y = x - k;
        while (x < N && y < M && aa[x] === bb[y]) {
          x++;
          y++;
        }
        cur[k + d] = x;
        if (x === N && y === M) {
          D = d;
          found = true;
          break;
        }
      }
      vs.push(cur);
    }
    if (!found) throw new Error('makefun-diff: the search ended without reaching both ends');
  }
  // Walk back from (N, M): each depth contributes one edit and the snake
  // that followed it; depth 0 contributes the opening snake alone.
  const rev = [];
  x = N;
  y = M;
  for (let d = D; d >= 1; d--) {
    const k = x - y;
    const prev = vs[d - 1];
    const pd = d - 1;
    const iDel = k - 1 + pd;
    const iIns = k + 1 + pd;
    let delX = -2;
    let insX = -2;
    if (iDel >= 0 && iDel < prev.length) {
      const vx = prev[iDel];
      if (vx >= 0 && vx < N) delX = vx + 1;
    }
    if (iIns >= 0 && iIns < prev.length) {
      const vx = prev[iIns];
      if (vx >= 0 && vx - (k + 1) < M) insX = vx;
    }
    const takeDel = delX >= insX;
    const x0 = takeDel ? delX : insX;
    const y0 = x0 - k;
    if (x > x0) rev.push([KEEP, x - x0]);
    if (takeDel) {
      rev.push([DEL, 1]);
      x = x0 - 1;
      y = y0;
    } else {
      rev.push([INS, 1]);
      x = x0;
      y = y0 - 1;
    }
  }
  if (x > 0) rev.push([KEEP, x]);
  // Reverse, merging neighbours of one kind into single runs.
  const runs = [];
  for (let i = rev.length - 1; i >= 0; i--) {
    const r = rev[i];
    const tail = runs.length > 0 ? runs[runs.length - 1] : undefined;
    if (tail !== undefined && tail[0] === r[0]) tail[1] += r[1];
    else runs.push([r[0], r[1]]);
  }
  return runs;
}

/** Push a run, merging it with the previous one when it is of the same kind. */
function pushRun(runs, kind, count) {
  if (count <= 0) return;
  const tail = runs.length > 0 ? runs[runs.length - 1] : undefined;
  if (tail !== undefined && tail[0] === kind) tail[1] += count;
  else runs.push([kind, count]);
}

/**
 * Write one patch line into `out`: its op, then the line itself. A line
 * with no trailing newline is written with one and followed by a line "%".
 * The op and the line go in as separate pieces; the final join puts them
 * together, so no per-line string is built by concatenation.
 */
function written(out, op, line) {
  if (line.endsWith('\n')) out.push(op, line);
  else out.push(op + line + '\n%\n');
}

/** makefun-diff 1.0.0's answer for one case's input: its patch, as one string. */
export function run(input) {
  if (input === null || typeof input !== 'object' || typeof input.old !== 'string' || typeof input.new !== 'string') {
    throw new TypeError('makefun-diff: the input is { old, new }, two strings');
  }
  const ids = new Map();
  const lines = [];
  const a = tokenize(input.old, ids, lines);
  const b = tokenize(input.new, ids, lines);
  const n = a.length;
  const m = b.length;
  // The common prefix, then the common suffix of what is left.
  let prefix = 0;
  while (prefix < n && prefix < m && a[prefix] === b[prefix]) prefix++;
  let suffix = 0;
  while (suffix < n - prefix && suffix < m - prefix && a[n - 1 - suffix] === b[m - 1 - suffix]) suffix++;
  const runs = [];
  pushRun(runs, KEEP, prefix);
  for (const r of myersRuns(a, b, prefix, n - suffix, prefix, m - suffix)) pushRun(runs, r[0], r[1]);
  pushRun(runs, KEEP, suffix);

  // The change runs: each a stretch of deletions and insertions between two
  // kept lines, at old line o and new line p.
  const changes = [];
  let o = 0;
  let p = 0;
  let deleted = 0;
  let inserted = 0;
  for (const r of runs) {
    const kind = r[0];
    const count = r[1];
    if (kind === KEEP) {
      o += count;
      p += count;
      continue;
    }
    let c = changes.length > 0 ? changes[changes.length - 1] : undefined;
    if (c === undefined || c.o + c.dels !== o || c.p + c.ins !== p) {
      c = { o, p, dels: 0, ins: 0 };
      changes.push(c);
    }
    if (kind === DEL) {
      c.dels += count;
      o += count;
      deleted += count;
    } else {
      c.ins += count;
      p += count;
      inserted += count;
    }
  }

  // The hunks: change runs at most 2 * CONTEXT kept lines apart share one.
  const hunks = [];
  for (const c of changes) {
    const h = hunks.length > 0 ? hunks[hunks.length - 1] : undefined;
    const prev = h !== undefined ? h[h.length - 1] : undefined;
    if (prev !== undefined && c.o - (prev.o + prev.dels) <= 2 * CONTEXT) h.push(c);
    else hunks.push([c]);
  }
  const out = [`${FORMAT} old=${n} new=${m} hunks=${hunks.length} deleted=${deleted} inserted=${inserted}\n`];
  for (const h of hunks) {
    const first = h[0];
    const lastC = h[h.length - 1];
    const oldStart = Math.max(0, first.o - CONTEXT);
    const newStart = first.p - (first.o - oldStart);
    const after = Math.min(CONTEXT, n - (lastC.o + lastC.dels));
    const oldEnd = lastC.o + lastC.dels + after;
    const newEnd = lastC.p + lastC.ins + after;
    out.push(`@ ${oldStart + 1} ${oldEnd - oldStart} ${newStart + 1} ${newEnd - newStart}\n`);
    let at = oldStart;
    for (const c of h) {
      for (; at < c.o; at++) written(out, '=', lines[a[at]]);
      for (let i = 0; i < c.dels; i++) written(out, '-', lines[a[c.o + i]]);
      for (let i = 0; i < c.ins; i++) written(out, '+', lines[b[c.p + i]]);
      at = c.o + c.dels;
    }
    for (; at < oldEnd; at++) written(out, '=', lines[a[at]]);
  }
  return out.join('');
}
