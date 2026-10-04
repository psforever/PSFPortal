// Turn a bit-packed N x N water mask into smooth land/lake polygon outlines in world coordinates.
//
// Pipeline: decode -> flood-fill ocean from the borders (so lakes can be told apart from sea) ->
// trace the boundary of a binary field into closed loops (marching-squares edge stitching) ->
// smooth the axis-aligned loops with Chaikin corner-cutting -> simplify.
//
// Output polygons are arrays of [x, y] in world units (0..worldSize), y up (north). The caller
// (ContinentMap) flips y for SVG. Land loops include lake holes as separate loops; the renderer
// fills land with an even-odd rule so lakes punch through, then paints the lakes on top.

// Label the 8-connected components of a binary field. Returns { labels, count } where labels[m] is
// 0 for background or a 1-based component id.
function labelComponents(field, n) {
  const labels = new Int32Array(n * n)
  let count = 0
  for (let m0 = 0; m0 < n * n; m0++) {
    if (!field[m0] || labels[m0]) continue
    count++
    const stack = [m0]
    labels[m0] = count
    while (stack.length) {
      const m = stack.pop()
      const i = m % n
      const j = (m - i) / n
      for (let dj = -1; dj <= 1; dj++) {
        for (let di = -1; di <= 1; di++) {
          if (!di && !dj) continue
          const ni = i + di
          const nj = j + dj
          if (ni < 0 || nj < 0 || ni >= n || nj >= n) continue
          const nm = nj * n + ni
          if (field[nm] && !labels[nm]) {
            labels[nm] = count
            stack.push(nm)
          }
        }
      }
    }
  }
  return { labels, count }
}

/**
 * Grow each landmass by `steps` cells, but NEVER fuse two different landmasses: a background cell is
 * only added if every land neighbour belongs to the SAME connected component. Narrow water channels
 * (the ones bridges span) therefore stay open, while open coastline still gains its 1-cell margin so
 * that coastal facilities survive the downstream smoothing. Falls back to plain dilation when steps<=0.
 */
export function dilateKeepingComponents(field, n, steps = 1) {
  let cur = field
  for (let s = 0; s < steps; s++) {
    const { labels } = labelComponents(cur, n)
    const out = Uint8Array.from(cur)
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const m = j * n + i
        if (cur[m]) continue
        let lab = 0
        let conflict = false
        for (let dj = -1; dj <= 1 && !conflict; dj++) {
          for (let di = -1; di <= 1; di++) {
            const ni = i + di
            const nj = j + dj
            if (ni < 0 || nj < 0 || ni >= n || nj >= n) continue
            const l = labels[nj * n + ni]
            if (!l) continue
            if (lab === 0) lab = l
            else if (lab !== l) {
              conflict = true
              break
            }
          }
        }
        if (lab && !conflict) out[m] = 1
      }
    }
    cur = out
  }
  return cur
}

/** Decode the base64 bit-packed mask into a flat Uint8Array (1 = water). i indexes +x, j indexes +y. */
export function decodeMask(base64, n) {
  const bytes = Buffer.from(base64, 'base64')
  const water = new Uint8Array(n * n)
  for (let m = 0; m < n * n; m++) water[m] = (bytes[m >> 3] >> (m & 7)) & 1
  return water
}

/** Flood-fill water cells reachable from any border -> ocean. Returns { ocean, lake } Uint8Arrays. */
export function classifyWater(water, n) {
  const ocean = new Uint8Array(n * n)
  const stack = []
  const push = (i, j) => {
    const m = j * n + i
    if (i < 0 || j < 0 || i >= n || j >= n || ocean[m] || !water[m]) return
    ocean[m] = 1
    stack.push(m)
  }
  for (let i = 0; i < n; i++) {
    push(i, 0)
    push(i, n - 1)
  }
  for (let j = 0; j < n; j++) {
    push(0, j)
    push(n - 1, j)
  }
  while (stack.length) {
    const m = stack.pop()
    const i = m % n
    const j = (m - i) / n
    push(i - 1, j)
    push(i + 1, j)
    push(i, j - 1)
    push(i, j + 1)
  }
  const lake = new Uint8Array(n * n)
  for (let m = 0; m < n * n; m++) if (water[m] && !ocean[m]) lake[m] = 1
  return { ocean, lake }
}

// Trace the boundary of a binary field (inside=1) into closed loops on the (n+1) x (n+1) vertex grid.
// Each unit edge between an inside cell and an outside cell (or the grid border) is a directed boundary
// edge, wound CCW around the inside so loops have consistent orientation. A vertex can carry MORE than
// one outgoing edge at a diagonal pinch (two land regions touching corner-to-corner); we resolve those
// by always taking the sharpest right turn relative to the arrival direction, which separates the two
// loops instead of cross-linking them. Loops are returned as arrays of [i, j] vertices.
function traceLoops(field, n) {
  const inside = (i, j) => (i < 0 || j < 0 || i >= n || j >= n ? 0 : field[j * n + i])
  const key = (x, y) => x * (n + 2) + y
  const out = new Map() // vertexKey -> array of [dx, dy] outgoing directions
  const addEdge = (x1, y1, x2, y2) => {
    const k = key(x1, y1)
    const arr = out.get(k)
    const dir = [x2 - x1, y2 - y1]
    if (arr) arr.push(dir)
    else out.set(k, [dir])
  }

  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      if (!inside(i, j)) continue
      // Cell (i,j) occupies world square [i,i+1] x [j,j+1] on the vertex grid.
      // Emit a boundary edge (CCW around the inside cell) for each side facing outside.
      if (!inside(i, j - 1)) addEdge(i, j, i + 1, j) // bottom side, going +x
      if (!inside(i + 1, j)) addEdge(i + 1, j, i + 1, j + 1) // right side, going +y
      if (!inside(i, j + 1)) addEdge(i + 1, j + 1, i, j + 1) // top side, going -x
      if (!inside(i - 1, j)) addEdge(i, j + 1, i, j) // left side, going -y
    }
  }

  // Pick the outgoing direction that turns most sharply right from the arrival direction `din`.
  // Right turn of (dx,dy) is (dy,-dx); rank candidates by turn angle: right < straight < left < back.
  const turnRank = (din, dout) => {
    if (!din) return 0
    const right = [din[1], -din[0]]
    if (dout[0] === right[0] && dout[1] === right[1]) return 0
    if (dout[0] === din[0] && dout[1] === din[1]) return 1
    if (dout[0] === -right[0] && dout[1] === -right[1]) return 2
    return 3 // reverse
  }

  const loops = []
  for (const startK of [...out.keys()]) {
    let arr = out.get(startK)
    while (arr && arr.length) {
      const sx = Math.floor(startK / (n + 2))
      const sy = startK - sx * (n + 2)
      const loop = [[sx, sy]]
      let cx = sx
      let cy = sy
      let din = null
      for (;;) {
        const ck = key(cx, cy)
        const cand = out.get(ck)
        if (!cand || !cand.length) break
        // choose sharpest-right outgoing edge
        let bi = 0
        let best = 99
        for (let t = 0; t < cand.length; t++) {
          const r = turnRank(din, cand[t])
          if (r < best) {
            best = r
            bi = t
          }
        }
        const dir = cand.splice(bi, 1)[0]
        din = dir
        cx += dir[0]
        cy += dir[1]
        if (cx === sx && cy === sy) break
        loop.push([cx, cy])
      }
      if (loop.length >= 4) loops.push(loop)
      arr = out.get(startK)
    }
  }
  return loops
}

// Drop collinear vertices from an axis-aligned loop (keep only corners).
function dropCollinear(loop) {
  const out = []
  const nP = loop.length
  for (let k = 0; k < nP; k++) {
    const a = loop[(k - 1 + nP) % nP]
    const b = loop[k]
    const c = loop[(k + 1) % nP]
    const cross = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])
    if (cross !== 0) out.push(b)
  }
  return out.length >= 3 ? out : loop
}

// Ramer-Douglas-Peucker simplification of a closed loop (epsilon in the loop's own units). Collapses
// the marching-squares staircase into a few straight runs before smoothing, cutting point count a lot.
function simplifyClosed(loop, epsilon) {
  if (loop.length < 4) return loop
  // Split the closed loop at its two farthest-apart points into two open chains, simplify each.
  let ai = 0
  let bi = 0
  let far = -1
  for (let k = 1; k < loop.length; k++) {
    const dx = loop[k][0] - loop[0][0]
    const dy = loop[k][1] - loop[0][1]
    const d = dx * dx + dy * dy
    if (d > far) {
      far = d
      bi = k
    }
  }
  const chain1 = loop.slice(ai, bi + 1)
  const chain2 = loop.slice(bi).concat([loop[ai]])
  const s1 = rdp(chain1, epsilon)
  const s2 = rdp(chain2, epsilon)
  return s1.slice(0, -1).concat(s2.slice(0, -1))
}

function rdp(pts, epsilon) {
  if (pts.length < 3) return pts
  let dmax = 0
  let idx = 0
  const [ax, ay] = pts[0]
  const [bx, by] = pts[pts.length - 1]
  const dx = bx - ax
  const dy = by - ay
  const len = Math.hypot(dx, dy) || 1
  for (let k = 1; k < pts.length - 1; k++) {
    const d = Math.abs((pts[k][0] - ax) * dy - (pts[k][1] - ay) * dx) / len
    if (d > dmax) {
      dmax = d
      idx = k
    }
  }
  if (dmax > epsilon) {
    const left = rdp(pts.slice(0, idx + 1), epsilon)
    const right = rdp(pts.slice(idx), epsilon)
    return left.slice(0, -1).concat(right)
  }
  return [pts[0], pts[pts.length - 1]]
}

// Chaikin corner-cutting: one pass replaces each edge with two points at 1/4 and 3/4, rounding the
// blocky staircase into a smooth outline. Closed-loop variant.
function chaikin(loop, iterations) {
  let pts = loop
  for (let it = 0; it < iterations; it++) {
    const out = []
    const nP = pts.length
    for (let k = 0; k < nP; k++) {
      const p = pts[k]
      const q = pts[(k + 1) % nP]
      out.push([p[0] * 0.75 + q[0] * 0.25, p[1] * 0.75 + q[1] * 0.25])
      out.push([p[0] * 0.25 + q[0] * 0.75, p[1] * 0.25 + q[1] * 0.75])
    }
    pts = out
  }
  return pts
}

/**
 * Build smooth polygons (world coords) for a binary field on an n x n cell grid.
 * @returns array of loops, each an array of [x, y] rounded to `round` decimals.
 */
export function fieldToPolygons(field, n, cell, { smooth = 2, minCells = 3, round = 1, epsilon = 0.7 } = {}) {
  const loops = traceLoops(field, n)
  const scale = 10 ** round
  const out = []
  for (const raw of loops) {
    // Reject specks: a loop enclosing fewer than minCells^2 area of cells is noise.
    if (polyAreaCells(raw) < minCells * minCells) continue
    // Simplify the blocky staircase (epsilon in cells), then round the corners.
    const simplified = simplifyClosed(dropCollinear(raw), epsilon)
    const smoothed = chaikin(simplified, smooth)
    out.push(smoothed.map(([x, y]) => [Math.round(x * cell * scale) / scale, Math.round(y * cell * scale) / scale]))
  }
  return out
}

// Signed area of a vertex-grid loop, in cell units (abs).
function polyAreaCells(loop) {
  let a = 0
  for (let k = 0; k < loop.length; k++) {
    const p = loop[k]
    const q = loop[(k + 1) % loop.length]
    a += p[0] * q[1] - q[0] * p[1]
  }
  return Math.abs(a) / 2
}

// --- elevation contours -----------------------------------------------------------------------

/** Decode a base64 byte-per-cell grid (e.g. the normalised elevation) into an n*n Uint8Array. */
export function decodeBytes(base64, n) {
  return new Uint8Array(Buffer.from(base64, 'base64')).subarray(0, n * n)
}

/** Average-downsample an n*n numeric field to m*m. */
export function downsample(field, n, m) {
  const out = new Float32Array(m * m)
  const f = n / m
  for (let j = 0; j < m; j++) {
    for (let i = 0; i < m; i++) {
      const i0 = Math.floor(i * f), i1 = Math.max(i0 + 1, Math.floor((i + 1) * f))
      const j0 = Math.floor(j * f), j1 = Math.max(j0 + 1, Math.floor((j + 1) * f))
      let s = 0, c = 0
      for (let y = j0; y < j1; y++) for (let x = i0; x < i1; x++) { s += field[y * n + x]; c++ }
      out[j * m + i] = c ? s / c : 0
    }
  }
  return out
}

/**
 * Marching-squares iso-lines of a scalar field, at each level in `levels`. Returns world-coord
 * segments [[x1,y1],[x2,y2]] (grid frame; the caller applies any origin shift). Faint contour lines.
 */
export function contourSegments(field, n, cell, levels) {
  const segs = []
  const V = (i, j) => field[j * n + i]
  const t = (a, b, L) => { const d = b - a; return d === 0 ? 0.5 : Math.max(0, Math.min(1, (L - a) / d)) }
  for (const L of levels) {
    for (let j = 0; j < n - 1; j++) {
      for (let i = 0; i < n - 1; i++) {
        const tl = V(i, j), tr = V(i + 1, j), br = V(i + 1, j + 1), bl = V(i, j + 1)
        let c = 0
        if (tl >= L) c |= 8
        if (tr >= L) c |= 4
        if (br >= L) c |= 2
        if (bl >= L) c |= 1
        if (c === 0 || c === 15) continue
        const T = () => [(i + t(tl, tr, L)) * cell, j * cell]
        const B = () => [(i + t(bl, br, L)) * cell, (j + 1) * cell]
        const Lf = () => [i * cell, (j + t(tl, bl, L)) * cell]
        const R = () => [(i + 1) * cell, (j + t(tr, br, L)) * cell]
        const s = (a, b) => segs.push([a, b])
        switch (c) {
          case 1: case 14: s(Lf(), B()); break
          case 2: case 13: s(B(), R()); break
          case 3: case 12: s(Lf(), R()); break
          case 4: case 11: s(T(), R()); break
          case 6: case 9: s(T(), B()); break
          case 7: case 8: s(T(), Lf()); break
          case 5: s(T(), Lf()); s(B(), R()); break
          case 10: s(T(), R()); s(Lf(), B()); break
        }
      }
    }
  }
  return segs
}
