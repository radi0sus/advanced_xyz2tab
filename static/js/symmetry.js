// symmetry.js — approximate molecular point-group detection with a
// tolerance-based, continuous error score instead of a hard yes/no test.
//
// Scope (agreed / discussed):
//   Solid:      C1, Cs, Ci, Cn, Cnv, Cnh, Dn, Dnh, Dnd, S2n  (n = 1..8)
//               C-infinity-v, D-infinity-h (linear molecules)
//   Best effort: Td, Oh, T, Th, O  (cubic — candidate axes for these do not
//               generally pass through any atom, so they need a combinatorial
//               candidate search; kept deliberately simple, see below)
//   Out of scope: Ih (icosahedral)
//
// Approach
//   1. detect(atoms)   — expensive, geometry-only part. Finds the center of
//      mass, classifies the inertia "top" type, builds a candidate set of
//      axes/planes, and tests every candidate against the actual atoms,
//      producing raw error values in Angstrom (no pass/fail yet).
//   2. classify(raw, toleranceAngstrom) — cheap. Walks the standard textbook
//      decision tree (main axis -> perpendicular C2's? -> sigma_h? -> ...)
//      using the raw errors and the given tolerance, and also evaluates the
//      "runner up" branches so a ranked candidate list can be shown.
//
// detect() is the O(n^2)-ish part (nearest-neighbor matching per candidate)
// and is only ever run once per loaded structure; classify() is cheap and
// safe to re-run on every tolerance-slider change.

const Symmetry = {

    // Above this atom count, auto-run on file load is skipped and a manual
    // "Analyze symmetry" button is shown instead (see app.core.js).
    MAX_ATOMS_AUTO: 300,

    // Highest proper rotation order tested in the Cn / Sn search loops.
    MAX_N: 8,

    // --- small vector helpers (plain {x,y,z} objects, consistent with Chem) ---
    _sub(a, b) { return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z }; },
    _add(a, b) { return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z }; },
    _scale(a, s) { return { x: a.x * s, y: a.y * s, z: a.z * s }; },
    _dot(a, b) { return a.x * b.x + a.y * b.y + a.z * b.z; },
    _cross(a, b) {
        return {
            x: a.y * b.z - a.z * b.y,
            y: a.z * b.x - a.x * b.z,
            z: a.x * b.y - a.y * b.x,
        };
    },
    _len(a) { return Math.sqrt(this._dot(a, a)); },
    _norm(a) {
        const l = this._len(a);
        if (l < 1e-9) return null;
        return { x: a.x / l, y: a.y / l, z: a.z / l };
    },

    // Canonical string key for an (unsigned) axis/normal direction, so that
    // v and -v dedupe to the same candidate.
    _dirKey(v) {
        let { x, y, z } = v;
        // Flip sign so the first "significant" component is positive —
        // makes v and -v collapse to the same key.
        const flip = (Math.abs(x) > 1e-6 ? x : (Math.abs(y) > 1e-6 ? y : z)) < 0;
        if (flip) { x = -x; y = -y; z = -z; }
        return `${x.toFixed(3)},${y.toFixed(3)},${z.toFixed(3)}`;
    },

    // --- geometric transforms, all performed relative to `center` ---
    _rotate(p, center, axis, angleRad) {
        // Rodrigues' rotation formula.
        const v = this._sub(p, center);
        const cosA = Math.cos(angleRad), sinA = Math.sin(angleRad);
        const term1 = this._scale(v, cosA);
        const term2 = this._scale(this._cross(axis, v), sinA);
        const term3 = this._scale(axis, this._dot(axis, v) * (1 - cosA));
        return this._add(center, this._add(this._add(term1, term2), term3));
    },
    _reflect(p, center, normal) {
        const v = this._sub(p, center);
        const d = this._dot(v, normal);
        return this._sub(p, this._scale(normal, 2 * d));
    },
    _invert(p, center) {
        return this._sub(this._scale(center, 2), p);
    },
    // Improper rotation S_n = rotate by 2*pi/n, then reflect in the plane
    // perpendicular to the same axis.
    _improperRotate(p, center, axis, angleRad) {
        const rotated = this._rotate(p, center, axis, angleRad);
        return this._reflect(rotated, center, axis);
    },

    // --- nearest-neighbor matching error for a transformed atom set ---
    // atomsByElement: Map(element -> array of {x,y,z}) for the ORIGINAL atoms.
    // Returns the RMS distance (Angstrom) from each transformed atom to the
    // closest original atom of the same element.
    _matchError(transformed, elements, atomsByElement) {
        let sumSq = 0;
        for (let i = 0; i < transformed.length; i++) {
            const candidates = atomsByElement.get(elements[i]);
            let best = Infinity;
            for (const a of candidates) {
                const dx = transformed[i].x - a.x;
                const dy = transformed[i].y - a.y;
                const dz = transformed[i].z - a.z;
                const d2 = dx * dx + dy * dy + dz * dz;
                if (d2 < best) best = d2;
            }
            sumSq += best;
        }
        return Math.sqrt(sumSq / transformed.length);
    },

    // Given [{order, error}, ...] results for one candidate axis (all orders
    // tested), pick the highest order that is essentially as good as the
    // best-fitting order found. A true Cn axis inherently also "passes" at
    // every divisor of n (rotating twice by 360/6 is the same test as once
    // by 360/3), so those divisors would otherwise win on pure numerical
    // noise; an unrelated higher order that merely happens to land close to
    // a neighboring atom by coincidence (e.g. testing 8-fold subdivision on
    // atoms that are actually 6-fold symmetric) is excluded because its
    // error is clearly worse, not just numerically different.
    _pickOrder(results) {
        const minError = Math.min(...results.map(r => r.error));
        const margin = Math.max(0.02, minError * 2);
        const passing = results.filter(r => r.error <= minError + margin);
        passing.sort((a, b) => b.order - a.order);
        return passing[0] || results.reduce((a, b) => (b.error < a.error ? b : a));
    },

    // ==========================================================
    // Step 1 — detect(): expensive, geometry-only. No tolerance used here
    // except tiny numerical epsilons (grouping heuristics, near-zero checks).
    // ==========================================================
    detect(atoms) {
        const n = atoms.length;

        // --- center of mass ---
        let totalMass = 0;
        let com = { x: 0, y: 0, z: 0 };
        for (const a of atoms) {
            const m = Parser.atomicWeights[a.element] || 12.011;
            totalMass += m;
            com = this._add(com, this._scale(a, m));
        }
        com = this._scale(com, 1 / totalMass);

        // --- mass-weighted inertia tensor about the center of mass ---
        let Ixx = 0, Iyy = 0, Izz = 0, Ixy = 0, Ixz = 0, Iyz = 0;
        for (const a of atoms) {
            const m = Parser.atomicWeights[a.element] || 12.011;
            const v = this._sub(a, com);
            Ixx += m * (v.y * v.y + v.z * v.z);
            Iyy += m * (v.x * v.x + v.z * v.z);
            Izz += m * (v.x * v.x + v.y * v.y);
            Ixy -= m * v.x * v.y;
            Ixz -= m * v.x * v.z;
            Iyz -= m * v.y * v.z;
        }
        const I = [[Ixx, Ixy, Ixz], [Ixy, Iyy, Iyz], [Ixz, Iyz, Izz]];
        const { values, vectors } = Chem._jacobi3x3(I);

        // Scale reference for "is this eigenvalue ~ zero" / grouping decisions.
        const maxI = Math.max(Math.abs(values[0]), Math.abs(values[1]), Math.abs(values[2]), 1e-6);

        // Sort eigenvalues (ascending) together with their eigenvectors.
        const order = [0, 1, 2].sort((a, b) => values[a] - values[b]);
        const sortedVals = order.map(i => values[i]);
        const sortedVecs = order.map(i => ({ x: vectors[i][0], y: vectors[i][1], z: vectors[i][2] }));

        const relDiff = (a, b) => Math.abs(a - b) / maxI;

        const isPoint = n === 1 || Math.abs(sortedVals[2]) < 1e-8;
        const isLinear = !isPoint && relDiff(sortedVals[0], 0) < 0.01 && sortedVals[0] < 0.01 * maxI;

        // atoms-by-element lookup, reused by every candidate test below.
        const atomsByElement = new Map();
        for (const a of atoms) {
            if (!atomsByElement.has(a.element)) atomsByElement.set(a.element, []);
            atomsByElement.get(a.element).push(a);
        }
        const elementsArr = atoms.map(a => a.element);
        const allCoords = atoms.map(a => ({ x: a.x, y: a.y, z: a.z }));

        // --- a single atom (or degenerate all-atoms-coincident input) has no
        // distinguished axis at all — every direction is an equivalent
        // infinite-fold rotation axis, plus every mirror plane and the
        // inversion center. That's Kh (full rotation-reflection symmetry),
        // a strictly higher symmetry than D∞h, which requires one special
        // axis direction (i.e. at least 2 atoms). ---
        if (isPoint) {
            return {
                isPoint: true,
                atomCount: n,
                com,
            };
        }

        // --- linear molecules are a fully separate, simple case ---
        if (isLinear) {
            const axis = this._norm(sortedVecs[0]) || { x: 0, y: 0, z: 1 };
            const inverted = allCoords.map(p => this._invert(p, com));
            const inversionError = this._matchError(inverted, elementsArr, atomsByElement);
            return {
                isLinear: true,
                atomCount: n,
                com,
                linearAxis: axis,
                inversionError,
            };
        }

        // --- equivalence groups: same element + similar distance from COM ---
        // Used only to generate axis/plane CANDIDATES — a wrong grouping can
        // at worst miss a candidate, it can never cause a false positive,
        // since every candidate is still verified by the exact matching test.
        const withDist = atoms.map(a => ({
            atom: a,
            vec: this._sub(a, com),
            dist: this._len(this._sub(a, com)),
        })).filter(e => e.dist > 0.05); // skip atoms essentially on the COM

        const byElement = new Map();
        for (const e of withDist) {
            if (!byElement.has(e.atom.element)) byElement.set(e.atom.element, []);
            byElement.get(e.atom.element).push(e);
        }

        const axisCandidates = new Map(); // key -> {x,y,z}
        const addAxisCandidate = v => {
            const u = this._norm(v);
            if (!u) return;
            axisCandidates.set(this._dirKey(u), u);
        };

        // Principal inertia axes are always useful candidates (covers the
        // symmetric-top and asymmetric-top cases where the unique axis, or
        // all three axes, are exactly the eigenvectors).
        sortedVecs.forEach(v => addAxisCandidate(v));

        for (const [, group] of byElement) {
            group.sort((a, b) => a.dist - b.dist);
            // cluster consecutive atoms whose distance from COM is close —
            // a generous, purely heuristic grouping window.
            let cluster = [];
            const clusters = [];
            for (const e of group) {
                if (cluster.length === 0 ||
                    Math.abs(e.dist - cluster[cluster.length - 1].dist) < Math.max(0.05, 0.02 * e.dist)) {
                    cluster.push(e);
                } else {
                    clusters.push(cluster);
                    cluster = [e];
                }
            }
            if (cluster.length) clusters.push(cluster);

            for (const c of clusters) {
                // Level 1 — individual atom vectors (covers Cn axes that DO
                // pass through atoms, e.g. the 3xC4 in an octahedron).
                for (const e of c) addAxisCandidate(this._norm(e.vec));

                // Level 2 — pairwise and triple sums (covers Cn/Sn axes that
                // pass through edge/face midpoints instead, e.g. the 4xC3 in
                // a tetrahedron or the 4xC3 in an octahedron). Capped to
                // bound cost for large equivalence groups.
                const units = c.map(e => this._norm(e.vec)).filter(Boolean);
                const capPairs = Math.min(units.length, 30);
                const capTriples = Math.min(units.length, 20);
                for (let i = 0; i < capPairs; i++) {
                    for (let j = i + 1; j < capPairs; j++) {
                        addAxisCandidate(this._add(units[i], units[j]));
                    }
                }
                for (let i = 0; i < capTriples; i++) {
                    for (let j = i + 1; j < capTriples; j++) {
                        for (let k = j + 1; k < capTriples; k++) {
                            addAxisCandidate(this._add(this._add(units[i], units[j]), units[k]));
                        }
                    }
                }
            }
        }

        // --- test every candidate axis for the best Cn it supports (n=2..MAX_N) ---
        const axes = [];
        for (const [, axis] of axisCandidates) {
            const results = [];
            for (let ord = this.MAX_N; ord >= 2; ord--) {
                const angle = (2 * Math.PI) / ord;
                const transformed = allCoords.map(p => this._rotate(p, com, axis, angle));
                const error = this._matchError(transformed, elementsArr, atomsByElement);
                results.push({ order: ord, error });
            }
            axes.push({ dir: axis, ...this._pickOrder(results) });
        }
        // Keep only the numerically best result if two near-identical axis
        // directions slipped through dedup with slightly different rounding.
        axes.sort((a, b) => (b.order - a.order) || (a.error - b.error));

        // --- improper rotations Sn on the same candidate axes (n=3..MAX_N) ---
        const improperAxes = [];
        for (const [, axis] of axisCandidates) {
            const results = [];
            for (let ord = this.MAX_N; ord >= 3; ord--) {
                const angle = (2 * Math.PI) / ord;
                const transformed = allCoords.map(p => this._improperRotate(p, com, axis, angle));
                const error = this._matchError(transformed, elementsArr, atomsByElement);
                results.push({ order: ord, error });
            }
            improperAxes.push({ dir: axis, ...this._pickOrder(results) });
        }
        improperAxes.sort((a, b) => (b.order - a.order) || (a.error - b.error));

        // --- inversion center (single test, always through COM) ---
        const invertedAll = allCoords.map(p => this._invert(p, com));
        const inversionError = this._matchError(invertedAll, elementsArr, atomsByElement);

        // --- mirror plane candidates ---
        const planeCandidates = new Map();
        const addPlaneCandidate = normal => {
            const u = this._norm(normal);
            if (!u) return;
            planeCandidates.set(this._dirKey(u), u);
        };

        // Planes built from perpendicular bisectors between same-element,
        // same-distance atom pairs (works even without any axis, e.g. Cs).
        for (const [, group] of byElement) {
            const units = group.map(e => e.vec);
            const cap = Math.min(units.length, 30);
            for (let i = 0; i < cap; i++) {
                for (let j = i + 1; j < cap; j++) {
                    addPlaneCandidate(this._sub(units[i], units[j]));
                }
            }
        }
        // Planes containing a candidate axis (normal = axis x atomVector) —
        // covers sigma_v / sigma_d once a main axis exists.
        const topAxes = axes.slice(0, 6); // bound cost; highest-order axes first
        for (const ax of topAxes) {
            for (const [, group] of byElement) {
                for (const e of group.slice(0, 12)) {
                    addPlaneCandidate(this._cross(ax.dir, e.vec));
                }
            }
            // sigma_h candidate: plane perpendicular to the axis itself.
            addPlaneCandidate(ax.dir);
        }
        // Principal inertia planes as a safety net.
        sortedVecs.forEach(v => addPlaneCandidate(v));

        const planes = [];
        for (const [, normal] of planeCandidates) {
            const transformed = allCoords.map(p => this._reflect(p, com, normal));
            const error = this._matchError(transformed, elementsArr, atomsByElement);
            planes.push({ normal, error });
        }
        planes.sort((a, b) => a.error - b.error);

        return {
            isLinear: false,
            atomCount: n,
            com,
            geometryClass: relDiff(sortedVals[0], sortedVals[2]) < 0.01
                ? 'spherical' // all three principal moments equal
                : (relDiff(sortedVals[0], sortedVals[1]) < 0.01 || relDiff(sortedVals[1], sortedVals[2]) < 0.01)
                    ? 'symmetric'
                    : 'asymmetric',
            axes,
            improperAxes,
            planes,
            inversionError,
        };
    },

    // ==========================================================
    // Step 2 — classify(): cheap, tolerance-dependent decision tree.
    // Safe to re-run whenever the tolerance slider changes.
    // ==========================================================
    classify(raw, tol) {
        const pass = e => e !== undefined && e !== null && e <= tol;

        if (raw.isPoint) {
            return {
                pointGroup: 'Kh',
                elements: [],
                candidates: [{ name: 'Kh', error: 0 }],
            };
        }

        if (raw.isLinear) {
            const group = pass(raw.inversionError) ? 'D\u221eh' : 'C\u221ev';
            return {
                pointGroup: group,
                elements: [{ type: 'i', error: raw.inversionError }],
                candidates: [
                    { name: 'D\u221eh', error: raw.inversionError },
                    { name: 'C\u221ev', error: 0 },
                ].sort((a, b) => a.error - b.error),
            };
        }

        const { axes, improperAxes, planes, inversionError } = raw;

        // Helper: best axis of a given exact order passing tolerance.
        const bestAxisOfOrder = (ord, dirFilter) => {
            let best = null;
            for (const a of axes) {
                if (a.order !== ord) continue;
                if (dirFilter && !dirFilter(a.dir)) continue;
                if (!best || a.error < best.error) best = a;
            }
            return best;
        };
        const perpendicular = (u, v) => Math.abs(this._dot(u, v)) < 0.05;
        const parallel = (u, v) => Math.abs(this._dot(u, v)) > 0.95;

        const candidates = [];
        const addCandidate = (name, error) => candidates.push({ name, error });
        // Wrap an internal axis/plane object into a display-friendly element
        // with an explicit `type`, without touching the original object
        // (which may still be reused for candidate-error math above).
        const tag = (type, source, count) => ({ type, order: source.order, error: source.error, count });

        // --- cubic branch: needs the FULL expected axis set for a genuine
        // cubic group — 3 (mutually independent) C4 axes for octahedral, or
        // 4 independent C3 axes for tetrahedral. A weaker trigger such as
        // "2 or more non-parallel high-order axes" is not enough evidence:
        // once the tolerance is opened up, a couple of loosely-passing
        // combinatorial candidate axes can slip through on molecules that
        // are genuinely NOT cubic (e.g. a trigonally twisted D3/D3d-type
        // ML6 complex really only has one legitimate C3 axis) and would
        // otherwise get misclassified into e.g. Th.
        const highOrderAxes = axes.filter(a => a.order >= 3 && pass(a.error));
        const independentHighAxes = [];
        for (const a of highOrderAxes) {
            if (!independentHighAxes.some(b => parallel(a.dir, b.dir))) independentHighAxes.push(a);
        }
        const c4sAll = independentHighAxes.filter(a => a.order === 4);
        const c3sAll = independentHighAxes.filter(a => a.order === 3);

        // Extra required signature: genuine T/Th/O/Td/Oh always contain a D2
        // rotational core — 3 mutually perpendicular C2 axes. Without this,
        // "4 non-parallel C3-ish axes" is not reliable evidence on its own:
        // any roughly-octahedral 6-ligand shape can produce coincidentally
        // passing pseudo-C3 axes through alternating "face" directions
        // (an octahedron's 8 faces split into two interpenetrating
        // tetrahedra) even when the true symmetry is much lower (e.g. a
        // trigonally twisted D3/D3d-type ML6 complex).
        const perpClique = [];
        for (const a of axes) {
            // Any even-order axis (2, 4, 6, 8) is trivially also a valid C2
            // axis (apply it n/2 times -> 180° rotation) — detect() only
            // records the single best-fit order per direction, so a genuine
            // C4 axis (like SF6's) is stored as order 4, never as order 2.
            if (a.order % 2 !== 0 || !pass(a.error)) continue;
            if (perpClique.every(b => perpendicular(a.dir, b.dir))) perpClique.push(a);
        }
        const hasCubicC2Core = perpClique.length >= 3;

        if (hasCubicC2Core && (c4sAll.length >= 3 || c3sAll.length >= 4)) {
            const c4s = c4sAll;
            const c3s = c3sAll;
            const bestS4 = improperAxes.find(a => a.order === 4);
            const anySigma = planes.length ? planes[0] : null;

            let group, elements = [], limitingError;
            if (c4s.length >= 2) {
                // octahedral family
                const sigmaOk = anySigma && pass(anySigma.error);
                if (pass(inversionError) && sigmaOk) {
                    group = 'Oh';
                    elements = [tag('Cn', c4s[0], c4s.length), { type: 'i', error: inversionError }, { type: 'sigma', error: anySigma.error }];
                    limitingError = Math.max(c4s[0].error, inversionError, anySigma.error);
                } else {
                    group = 'O';
                    elements = [tag('Cn', c4s[0], c4s.length)];
                    limitingError = c4s[0].error;
                }
                addCandidate('Oh', Math.max(c4s[0].error, inversionError, anySigma ? anySigma.error : 1));
                addCandidate('O', c4s[0].error);
            } else {
                // tetrahedral family (C3 axes only, no C4)
                const s4Ok = bestS4 && pass(bestS4.error);
                const sigmaOk = anySigma && pass(anySigma.error);
                if (s4Ok && sigmaOk) {
                    group = 'Td';
                    elements = [tag('Cn', c3s[0], c3s.length), tag('Sn', bestS4), { type: 'sigma', error: anySigma.error }];
                    limitingError = Math.max(c3s[0].error, bestS4.error, anySigma.error);
                } else if (pass(inversionError) && sigmaOk) {
                    group = 'Th';
                    elements = [tag('Cn', c3s[0], c3s.length), { type: 'i', error: inversionError }, { type: 'sigma', error: anySigma.error }];
                    limitingError = Math.max(c3s[0].error, inversionError, anySigma.error);
                } else {
                    group = 'T';
                    elements = [tag('Cn', c3s[0], c3s.length)];
                    limitingError = c3s[0].error;
                }
                addCandidate('Td', Math.max(c3s[0].error, bestS4 ? bestS4.error : 1, anySigma ? anySigma.error : 1));
                addCandidate('Th', Math.max(c3s[0].error, inversionError, anySigma ? anySigma.error : 1));
                addCandidate('T', c3s[0].error);
            }

            return {
                pointGroup: group,
                elements,
                candidates: candidates.sort((a, b) => a.error - b.error),
                geometryClass: raw.geometryClass,
                cubic: true,
            };
        }

        // --- standard Cn / Dn branch ---
        const mainAxis = axes.filter(a => pass(a.error)).sort((a, b) => (b.order - a.order) || (a.error - b.error))[0] || null;

        if (!mainAxis) {
            const bestPlane = planes.length ? planes[0] : null;
            let group;
            const elements = [];
            if (bestPlane && pass(bestPlane.error)) {
                group = 'Cs';
                elements.push({ type: 'sigma', error: bestPlane.error });
            } else if (pass(inversionError)) {
                group = 'Ci';
                elements.push({ type: 'i', error: inversionError });
            } else {
                group = 'C1';
            }
            addCandidate('Cs', bestPlane ? bestPlane.error : 1);
            addCandidate('Ci', inversionError);
            addCandidate('C1', 0);
            return { pointGroup: group, elements, candidates: candidates.sort((a, b) => a.error - b.error), geometryClass: raw.geometryClass };
        }

        const nOrd = mainAxis.order;
        const perpC2s = axes.filter(a => a.order === 2 && pass(a.error) && perpendicular(a.dir, mainAxis.dir));
        const isD = perpC2s.length >= 1 && (nOrd === 2 ? true : perpC2s.length >= Math.max(1, nOrd - 1) || perpC2s.length >= 1);

        const sigmaH = planes.filter(p => parallel(p.normal, mainAxis.dir)).sort((a, b) => a.error - b.error)[0] || null;
        const vertPlanes = planes.filter(p => perpendicular(p.normal, mainAxis.dir) && pass(p.error));
        const sigmaHOk = sigmaH && pass(sigmaH.error);
        const Sn2 = improperAxes.find(a => a.order === 2 * nOrd && parallel(a.dir, mainAxis.dir));

        let group;
        const elements = [tag('Cn', mainAxis)];

        if (isD) {
            elements.push(tag('C2\u22a5', perpC2s[0]));
            if (sigmaHOk) {
                group = `D${nOrd}h`;
                elements.push({ type: 'sigma_h', error: sigmaH.error });
                addCandidate(`D${nOrd}h`, Math.max(mainAxis.error, perpC2s[0].error, sigmaH.error));
                addCandidate(`D${nOrd}d`, Math.max(mainAxis.error, perpC2s[0].error, vertPlanes[0] ? vertPlanes[0].error : 1));
                addCandidate(`D${nOrd}`, Math.max(mainAxis.error, perpC2s[0].error));
            } else if (vertPlanes.length) {
                group = `D${nOrd}d`;
                elements.push({ type: 'sigma_d', error: vertPlanes[0].error });
                addCandidate(`D${nOrd}d`, Math.max(mainAxis.error, perpC2s[0].error, vertPlanes[0].error));
                addCandidate(`D${nOrd}h`, Math.max(mainAxis.error, perpC2s[0].error, sigmaH ? sigmaH.error : 1));
                addCandidate(`D${nOrd}`, Math.max(mainAxis.error, perpC2s[0].error));
            } else {
                group = `D${nOrd}`;
                addCandidate(`D${nOrd}`, Math.max(mainAxis.error, perpC2s[0].error));
                addCandidate(`D${nOrd}h`, Math.max(mainAxis.error, perpC2s[0].error, sigmaH ? sigmaH.error : 1));
                addCandidate(`D${nOrd}d`, Math.max(mainAxis.error, perpC2s[0].error, vertPlanes[0] ? vertPlanes[0].error : 1));
            }
        } else {
            if (sigmaHOk) {
                group = `C${nOrd}h`;
                elements.push({ type: 'sigma_h', error: sigmaH.error });
                addCandidate(`C${nOrd}h`, Math.max(mainAxis.error, sigmaH.error));
                addCandidate(`C${nOrd}v`, Math.max(mainAxis.error, vertPlanes[0] ? vertPlanes[0].error : 1));
                addCandidate(`C${nOrd}`, mainAxis.error);
            } else if (vertPlanes.length) {
                group = `C${nOrd}v`;
                elements.push({ type: 'sigma_v', error: vertPlanes[0].error });
                addCandidate(`C${nOrd}v`, Math.max(mainAxis.error, vertPlanes[0].error));
                addCandidate(`C${nOrd}h`, Math.max(mainAxis.error, sigmaH ? sigmaH.error : 1));
                addCandidate(`C${nOrd}`, mainAxis.error);
            } else if (Sn2 && pass(Sn2.error)) {
                group = `S${2 * nOrd}`;
                elements.push(tag('Sn', Sn2));
                addCandidate(`S${2 * nOrd}`, Math.max(mainAxis.error, Sn2.error));
                addCandidate(`C${nOrd}`, mainAxis.error);
            } else {
                group = `C${nOrd}`;
                addCandidate(`C${nOrd}`, mainAxis.error);
                addCandidate(`C${nOrd}v`, Math.max(mainAxis.error, vertPlanes[0] ? vertPlanes[0].error : 1));
                addCandidate(`C${nOrd}h`, Math.max(mainAxis.error, sigmaH ? sigmaH.error : 1));
            }
        }

        return {
            pointGroup: group,
            elements,
            candidates: candidates.sort((a, b) => a.error - b.error),
            geometryClass: raw.geometryClass,
        };
    },

    // Stable, tolerance-independent candidate ranking. Always evaluates the
    // same fixed set of plausible groups directly from the raw geometry —
    // unlike classify(), which only walks a single decision-tree branch that
    // can change qualitatively as the tolerance slider moves. This ranking
    // never changes with tolerance; only which entry is "assigned" does
    // (see classify()). This is also how e.g. "how close is this to Oh?"
    // gets answered even when the actual assignment is something lower,
    // like D3d.
    rankCandidates(raw) {
        const results = [];
        const add = (name, error) => results.push({ name, error });
        const NOT_FOUND = 999; // sentinel: this element type wasn't found at all

        if (raw.isPoint) {
            add('Kh', 0);
            return results;
        }

        if (raw.isLinear) {
            add('C\u221ev', 0);
            add('D\u221eh', raw.inversionError);
            return results.sort((a, b) => a.error - b.error);
        }

        const { axes, improperAxes, planes, inversionError } = raw;

        if (!axes.length) {
            add('C1', 0);
            if (planes.length) add('Cs', planes[0].error);
            add('Ci', inversionError);
            return results.sort((a, b) => a.error - b.error);
        }

        const perpendicular = (u, v) => Math.abs(this._dot(u, v)) < 0.05;
        const parallel = (u, v) => Math.abs(this._dot(u, v)) > 0.95;
        const bestOf = list => list.length ? list.reduce((a, b) => (b.error < a.error ? b : a)) : null;
        const e = v => (v ? v.error : NOT_FOUND);

        // Best axis anchors the Cn/Dn family — prioritize the highest order
        // first (as classify() does), not just the lowest raw error, or a
        // coincidentally tiny-error low-order axis could shadow the
        // molecule's actual highest-order axis. Restrict to a sane absolute
        // error cutoff first (matches the slider's max), so a spuriously
        // high order with a huge error can't get picked just because
        // nothing else reached that order.
        const SANE_CUTOFF = 0.5;
        const goodAxes = axes.filter(a => a.error <= SANE_CUTOFF);

        if (!goodAxes.length) {
            // Not one candidate axis is even remotely plausible at any
            // usable tolerance. Falling back to the full, unfiltered axis
            // pool here would just resurface whichever order happened to
            // test lowest (typically the highest tested order, MAX_N,
            // since a smaller rotation angle trivially produces a smaller
            // mismatch even with zero real symmetry) — e.g. reporting a
            // "C8" candidate at ~0.8 Å error for a molecule with no
            // rotational symmetry at all. Treat this the same as having no
            // candidate axes to begin with.
            add('C1', 0);
            if (planes.length) add('Cs', planes[0].error);
            add('Ci', inversionError);
            return results.sort((a, b) => a.error - b.error);
        }

        const axisPool = goodAxes;
        const mainAxis = axisPool.slice().sort((a, b) => (b.order - a.order) || (a.error - b.error))[0];
        const n = mainAxis.order;

        const perpC2 = bestOf(axes.filter(a => a.order % 2 === 0 && perpendicular(a.dir, mainAxis.dir)));
        const sigmaH = bestOf(planes.filter(p => parallel(p.normal, mainAxis.dir)));
        const vertPlane = bestOf(planes.filter(p => perpendicular(p.normal, mainAxis.dir)));
        const bestPlaneOverall = bestOf(planes);

        add(`C${n}`, mainAxis.error);
        add(`C${n}v`, Math.max(mainAxis.error, e(vertPlane)));
        add(`C${n}h`, Math.max(mainAxis.error, e(sigmaH)));
        add(`D${n}`, Math.max(mainAxis.error, e(perpC2)));
        add(`D${n}h`, Math.max(mainAxis.error, e(perpC2), e(sigmaH)));
        add(`D${n}d`, Math.max(mainAxis.error, e(perpC2), e(vertPlane)));

        // Best standalone Sn anywhere in the molecule — NOT required to
        // coincide with the main proper axis above. An Sn point group only
        // needs its own improper axis; tying this to whichever axis won the
        // (order, error)-based main-axis selection would hide a genuinely
        // good Sn that happens to sit on a different (e.g. perpendicular)
        // axis, understating how close the molecule actually is to some Sn
        // symmetry.
        const bestSn = bestOf(improperAxes);
        if (bestSn) add(`S${bestSn.order}`, bestSn.error);

        add('Cs', bestPlaneOverall ? bestPlaneOverall.error : NOT_FOUND);
        add('Ci', inversionError);
        add('C1', 0);

        // Cubic — shown whenever at least one C3/C4 axis was found at all,
        // regardless of the stricter "3xC4 / 4xC3 + D2 core" requirement
        // classify() uses to actually ASSIGN a cubic group. That lets the
        // ranking answer "how far off is Oh" even when the real assignment
        // is a lower, non-cubic group.
        const bestC4 = bestOf(axes.filter(a => a.order === 4));
        const bestC3 = bestOf(axes.filter(a => a.order === 3));
        const bestS4 = bestOf(improperAxes.filter(a => a.order === 4));
        if (bestC4) {
            add('O', bestC4.error);
            add('Oh', Math.max(bestC4.error, inversionError, e(bestPlaneOverall)));
        }
        if (bestC3) {
            add('T', bestC3.error);
            add('Th', Math.max(bestC3.error, inversionError, e(bestPlaneOverall)));
            add('Td', Math.max(bestC3.error, e(bestS4), e(bestPlaneOverall)));
        }

        return results.sort((a, b) => a.error - b.error);
    },

    // Convenience wrapper used by the UI: runs both steps.
    analyze(atoms, toleranceAngstrom) {
        const raw = this.detect(atoms);
        const result = this.classify(raw, toleranceAngstrom);
        result.atomCount = raw.atomCount;
        result.isLinear = !!raw.isLinear;
        result.isPoint = !!raw.isPoint;
        return { raw, result };
    },
};
