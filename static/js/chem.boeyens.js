// chem.boeyens.js — Evans & Boeyens (1989) conformational decomposition
//
// Reference: D. G. Evans, J. C. A. Boeyens, "Conformational Analysis of
// Ring Pucker", Acta Cryst. (1989), B45, 581-590.
//
// This is a DIFFERENT, complementary description from
// Chem._classifyHexagonPucker / Chem._classifyPentagonPucker (used
// everywhere else in the app — the ring table, the ring diagrams, the
// "Conformation" column). That classifier snaps a ring to the single
// NEAREST named family on an equal 45 deg/60 deg grid ("Boat (approx.)").
// This module does not snap to anything: it expresses the ring's actual
// (q2, phi2[, q3]) exactly as a normalized linear combination of the two
// (or three) nearest primitive symmetric forms, e.g.
// "91.6% Chair + 7.3% Boat (phi=180 deg) + 1.1% Twist-boat (phi=210 deg)".
// The two views are intentionally kept separate — no shared thresholds,
// no shared diagram — per the paper's own basis (Cremer-Pople normal
// modes: the B2u chair mode plus the single nearest Em boat/twist-boat
// pair for 6-rings; the single nearest Em envelope/twist pair for
// 5-rings; see the paper's "Description of ring pucker" section).
//
// Formulas re-derived independently from the paper's own equations
// (p. 589, "The coefficients are given by XA' and XB'") and cross-checked
// two ways:
//   1. Bit-for-bit against PLATON's Fortran implementation (A. L. Spek),
//      subroutines PLA218-PLA225 (dispatch: PLA219 for 6-rings, PLA221
//      for 5-rings; the actual coefficient solve is PLA222, an exact
//      transcription of the paper's XA(M)/XB(M) formulas; the nearest-
//      phase search is PLA224/PLA225).
//   2. Against all three worked examples in the paper itself (Table 3,
//      rings 1-2; Table 4, rings 1-2) — every fraction reproduced to
//      within rounding of the published percentages.
//
// Not (yet) attempted: the atom-numbered classical symbols (e.g. "1,4B",
// "2,5B") from PLATON's NAMX tables, which require a fixed, convention-
// specific ring-atom numbering the same way the "38 canonical IUPAC
// forms" note elsewhere in the app does — out of scope here, same as
// there. Also not attempted: 7- and 8-membered rings (PLA220/223-225
// handle those in PLATON, but Chem.calcRingPucker only supports 5/6).

Object.assign(Chem, {

    // Nearest candidate phase angle (degrees, in [0, 360)) to `phi` among
    // offsetDeg + k*stepDeg for k = 0..kCount-1. Used to find the boat/
    // twist-boat (6-ring) or envelope/twist (5-ring) phase closest to the
    // ring's actual phi2. Matches PLATON's PLA224/PLA225 nearest-phase
    // search (candidates are just the other representation's convention
    // for "k * 180 / (2N)"; picking any representative modulo 360 is
    // sufficient since the coefficient formula below is 360-periodic).
    _boeyensNearestPhase(phi, offsetDeg, stepDeg, kCount) {
        phi = ((phi % 360) + 360) % 360;
        let best = offsetDeg, bestDist = Infinity;

        for (let k = 0; k < kCount; k++) {
            const angle = offsetDeg + k * stepDeg;
            const d = Math.min(Math.abs(phi - angle) % 360, 360 - (Math.abs(phi - angle) % 360));
            if (d < bestDist) { bestDist = d; best = angle; }
        }

        return best;
    },

    // Solves for the (unnormalized) coefficients of the two primitive
    // forms at phase angles A and B that bracket the ring's actual phase
    // `phi`, given the ring's Em-mode amplitude `q` (q2 for both 5- and
    // 6-rings). This is the paper's XA(M)/XB(M) equations (p. 589),
    // transcribed 1:1 from PLATON's PLA222:
    //   XA = q * sin(phi - B) / sin(A - B)
    //   XB = q * sin(A - phi) / sin(A - B)
    // Since A and B are the nearest phases from _boeyensNearestPhase (and
    // therefore bracket phi within a single cell), both come out
    // non-negative in practice; tiny negative floating-point noise at a
    // cell boundary is clamped to 0.
    _boeyensCoeffs(q, phi, A, B) {
        const rad = d => d * Math.PI / 180;
        const R = rad(phi), Ar = rad(A), Br = rad(B);
        const w = Math.sin(Ar - Br);

        if (Math.abs(w) < 1e-10) return null;

        return {
            xa: Math.max(0, q * Math.sin(R - Br) / w),
            xb: Math.max(0, q * Math.sin(Ar - R) / w),
        };
    },

    // 6-ring decomposition: Chair (B2u mode, amplitude |q3|) + nearest
    // Boat/Twist-boat pair (Em mode, amplitude q2). `result` is a
    // Chem.calcRingPucker() result with N === 6.
    boeyensDecompose6(result) {
        if (!result || result.N !== 6) return null;
        if (result.classification && result.classification.family === 'Planar') return null;

        const { q2, phi2, q3 } = result;

        const A = this._boeyensNearestPhase(phi2, 0, 60, 6);  // boat phases
        const B = this._boeyensNearestPhase(phi2, 30, 60, 6); // twist-boat phases

        const coeffs = this._boeyensCoeffs(q2, phi2, A, B);
        if (!coeffs) return null;

        const v = Math.abs(q3);
        const total = coeffs.xa + coeffs.xb + v;
        if (total < 1e-8) return null;

        return {
            N: 6,
            chair: { fraction: v / total, sign: q3 >= 0 ? 1 : -1 },
            boat: { fraction: coeffs.xa / total, phase: A },
            twistBoat: { fraction: coeffs.xb / total, phase: B },
        };
    },

    // 5-ring decomposition: nearest Envelope/Twist pair only (no B2u term
    // — it only exists for even N). `result` is a Chem.calcRingPucker()
    // result with N === 5.
    boeyensDecompose5(result) {
        if (!result || result.N !== 5) return null;
        if (result.classification && result.classification.family === 'Planar') return null;

        const { q2, phi2 } = result;

        const A = this._boeyensNearestPhase(phi2, 0, 36, 10);  // envelope phases
        const B = this._boeyensNearestPhase(phi2, 18, 36, 10); // twist phases

        const coeffs = this._boeyensCoeffs(q2, phi2, A, B);
        if (!coeffs) return null;

        const total = coeffs.xa + coeffs.xb;
        if (total < 1e-8) return null;

        return {
            N: 5,
            envelope: { fraction: coeffs.xa / total, phase: A },
            twist: { fraction: coeffs.xb / total, phase: B },
        };
    },

    // Dispatcher: routes to boeyensDecompose6/5 based on result.N. Returns
    // null for anything else (7/8-membered, planar, or missing data).
    boeyensDecomposition(result) {
        if (!result) return null;
        if (result.N === 6) return this.boeyensDecompose6(result);
        if (result.N === 5) return this.boeyensDecompose5(result);
        return null;
    },

    // Plain-text one-line summary, shared by the ring-details panel and
    // the Markdown export so the two never drift apart.
    boeyensDecompositionLabel(decomp) {
        if (!decomp) return null;

        const pct = f => (f * 100).toFixed(1);

        if (decomp.N === 6) {
            const chairNote = decomp.chair.sign < 0 ? ', inverted' : '';
            return `${pct(decomp.chair.fraction)}% Chair${chairNote} `
                + `+ ${pct(decomp.boat.fraction)}% Boat (\u03c6=${decomp.boat.phase}\u00b0) `
                + `+ ${pct(decomp.twistBoat.fraction)}% Twist-boat (\u03c6=${decomp.twistBoat.phase}\u00b0)`;
        }

        return `${pct(decomp.envelope.fraction)}% Envelope (\u03c6=${decomp.envelope.phase}\u00b0) `
            + `+ ${pct(decomp.twist.fraction)}% Twist (\u03c6=${decomp.twist.phase}\u00b0)`;
    },

});
