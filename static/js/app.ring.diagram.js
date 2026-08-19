// app.ring.diagram.js — graphical Cremer-Pople diagrams for the Ring tab
//
// Two separate diagrams, since 6-membered rings need two puckering
// coordinates (theta, phi2) while 5-membered rings only have one (phi2,
// with Q as amplitude) — they are not compatible axes and are not merged:
//
//   - 6-ring: Cartesian phi2/theta map — essentially an equirectangular
//     ("unrolled") projection of the Cremer-Pople sphere, x = phi2
//     (0-360 deg, left to right), y = theta (0-180 deg, top to bottom).
//     The two chair poles (theta = 0 and theta = 180) become the top and
//     bottom edges of the rectangle instead of a single point, exactly
//     like a lat/long map projection of a globe. Resolution is fixed at
//     PPD (pixels per degree) in both directions, so the plot area is
//     literally 360*PPD x 180*PPD data pixels.
//
//     Horizontal bands (pale fill) mark the real theta classification
//     zones from Chem._classifyHexagonPucker (chair / envelope-half-
//     chair / boat-twist-boat, boundaries at 22.5/67.5/112.5/157.5 deg).
//     Vertical lines every 30 deg of phi2 mark the phase cells (running
//     top to bottom through all bands). Generic conformer-family letters
//     (C/E/H/B/S) are drawn faintly in the background of each cell —
//     WITHOUT the IUPAC atom-numbering sub/superscripts (e.g. "3S1"),
//     since those require a defined, molecule-specific ring-atom
//     numbering (as in sugars) that doesn't apply to generic rings.
//
//   - 5-ring: same idea, but a 5-ring only has one puckering coordinate
//     besides the amplitude Q (which is intentionally NOT encoded here,
//     per design — there is no meaningful second axis), so it collapses
//     to a single horizontal band: x = phi2, y is purely a display
//     convenience (all points sit on one center line; near-coincident
//     points are nudged apart automatically so they stay distinguishable,
//     see _dedupeRingPoints). Alternating pale fill + vertical lines
//     every 18 deg mark the canonical envelope (E) / twist (T) phase
//     cells (10 E + 10 T = 20 total), matching Chem._classifyPentagonPucker.
//
//   - Planar rings (Q < 0.05, per Chem.calcRingPucker's own threshold):
//     phi2 (and theta, for 6-rings) are numerically meaningless noise at
//     that amplitude. They are still plotted at their nominal (noisy)
//     coordinate — no repositioning — but rendered paler and with a
//     dashed cross marker instead of a plain filled circle, and their
//     tooltip explains why the position isn't reliable.
//
// All rings saved in the current session (this.savedRings) are plotted,
// including invalid ones (shown dimmed). Point numbering (#) and color
// match the row numbering in the saved-rings table for easy cross-
// reference, and selecting a row there (or a point here) highlights the
// same ring in both places (App._selectedRingId).

Object.assign(App, {

    _ringDiagramPalette: [
        '#4e79a7', '#f28e2b', '#e15759', '#76b7b2', '#59a14f',
        '#edc948', '#b07aa1', '#ff9da7', '#9c755f', '#bab0ac',
    ],

    _ringDiagramColor(i) {
        const palette = this._ringDiagramPalette;
        return palette[i % palette.length];
    },

    // Pixels per degree for BOTH axes of the Cartesian ring diagrams —
    // the plot area is exactly 360*PPD wide and (for the 6-ring) 180*PPD
    // tall, i.e. a literal 360 x 180 (x2-4) data-pixel grid as requested.
    _RING_DIAGRAM_PPD: 2.5,

    _ring6DiagramData() {
        return this.savedRings
            .map((ring, idx) => ({ ring, idx }))
            .filter(({ ring }) => ring.result && ring.result.N === 6);
    },

    _ring5DiagramData() {
        return this.savedRings
            .map((ring, idx) => ({ ring, idx }))
            .filter(({ ring }) => ring.result && ring.result.N === 5);
    },

    _ringDiagramFamilyLabel(result) {
        if (!result || !result.classification) return '—';
        const c = result.classification;
        return c.symbol === '—' ? c.family : `${c.family} (${c.symbol})`;
    },

    _isRingPlanar(ring) {
        return !!(ring.result && ring.result.classification &&
            ring.result.classification.family === 'Planar');
    },

    // Golden-angle spiral offset, used to fan out points that would
    // otherwise land on (almost) the same pixel — both genuinely
    // coincident data and the "planar" cluster near phi2/theta = 0,
    // which have no informative position anyway. `order` = 0, 1, 2, ...
    // among the points sharing a bin.
    _goldenSpiralOffset(order, stepPx) {
        if (order === 0) return { dx: 0, dy: 0 };
        const goldenAngle = 137.5 * Math.PI / 180;
        const ang = order * goldenAngle;
        const rad = stepPx * Math.sqrt(order);
        return { dx: rad * Math.cos(ang), dy: rad * Math.sin(ang) };
    },

    // Groups raw (cx, cy) points into pixel bins and applies a golden-
    // spiral offset within each bin so near-coincident points (exact
    // duplicates, or several "planar" rings all sitting near the same
    // noisy corner) stay individually clickable/visible. `binPx`
    // controls how close two points have to be to count as colliding.
    _dedupeRingPoints(points, binPx) {
        const bins = new Map();

        points.forEach(p => {
            const key = `${Math.round(p.cx / binPx)},${Math.round(p.cy / binPx)}`;
            if (!bins.has(key)) bins.set(key, []);
            bins.get(key).push(p);
        });

        bins.forEach(group => {
            if (group.length < 2) return;
            group.forEach((p, order) => {
                const { dx, dy } = this._goldenSpiralOffset(order, binPx * 0.9);
                p.cx += dx;
                p.cy += dy;
            });
        });

        return points;
    },

    // Clicking a point selects/deselects that ring exactly like clicking
    // its table row would (same App._selectedRingId state) — highlights
    // the ring atoms in the 3D viewer and marks the row/point.
    _onRingDiagramPointClick(ringId, atomIndices) {
        const alreadySelected = String(this._selectedRingId) === String(ringId);

        this._selectedRingId = alreadySelected ? null : ringId;
        this._setHighlightedAtoms(alreadySelected ? new Set() : new Set(atomIndices));

        this._renderRingAnalysis();
    },

    // Cheap in-place restyle (no full re-render) used when the *table*
    // row selection changes, so the diagrams stay in sync without
    // rebuilding the SVG (which would also reset native <title> hover
    // state mid-hover).
    _applyRingDiagramSelection() {
        document.querySelectorAll('.ring-diagram-point').forEach(g => {
            const halo = g.querySelector('.ring-diagram-halo');
            if (!halo) return;

            const isSelected = String(g.dataset.ringId) === String(this._selectedRingId);
            halo.style.opacity = isSelected ? '1' : '0';
        });
    },

    _renderRingDiagrams() {
        this._renderRing6Diagram();
        this._renderRing5Diagram();
        this._wireRingDiagramExport();
    },

    // Base filename for ring-diagram PNG exports, matching the same
    // formula source and fallback used by exportMd()/exportPng() in
    // app.export.js (this.parsed.formula, falling back to "xyz2tab").
    _ringExportBaseName() {
        const raw = this.parsed && this.parsed.formula;
        if (!raw) return 'xyz2tab';

        // formulas here are expected to already be plain text (e.g.
        // "C30H38B2FeN10S2"); strip anything that isn't filename-safe
        // just in case (whitespace, sub/superscript markup, etc.)
        const clean = String(raw).replace(/[^A-Za-z0-9]/g, '');
        return clean || 'xyz2tab';
    },

    _ringDiagramLegend(data) {
        return data.map(({ ring, idx }) => ({
            color: this._ringDiagramColor(idx),
            label: `${idx + 1}. ${ring.name} \u2014 ${this._getRingAtoms(ring).map(a => a.label).join('\u2013')} (${this._ringDiagramFamilyLabel(ring.result)})`,
        }));
    },

    // Exports whichever ring diagrams currently have data as separate
    // PNG files (one per ring size, since they're different plots),
    // triggered from a single shared button. Downloads are staggered
    // slightly so browsers don't block the second one.
    _exportAllRingDiagramsPng() {
        const base = this._ringExportBaseName();
        const jobs = [];

        const data6 = this._ring6DiagramData();
        if (data6.length) {
            jobs.push(() => this._exportRingDiagramPng(
                'ring-diagram-6-svg', `${base}_6_mb_rings.png`, this._ringDiagramLegend(data6)));
        }

        const data5 = this._ring5DiagramData();
        if (data5.length) {
            jobs.push(() => this._exportRingDiagramPng(
                'ring-diagram-5-svg', `${base}_5_mb_rings.png`, this._ringDiagramLegend(data5)));
        }

        jobs.forEach((job, i) => setTimeout(job, i * 350));
    },

    // Wires a single export button for both diagrams. Prefers a shared
    // button (id "btn-export-rings-png") if the markup has been updated
    // to only have one; otherwise falls back to repurposing the old
    // 6-ring button as the sole visible control and hiding the 5-ring
    // one, so only one button shows up either way.
    _wireRingDiagramExport() {
        const shared = document.getElementById('btn-export-rings-png');
        const btn6 = document.getElementById('btn-export-ring6-png');
        const btn5 = document.getElementById('btn-export-ring5-png');

        const hasAny = this._ring6DiagramData().length > 0 || this._ring5DiagramData().length > 0;
        const handler = () => this._exportAllRingDiagramsPng();

        if (shared) {
            shared.disabled = !hasAny;
            shared.onclick = handler;
            if (btn6) btn6.style.display = 'none';
            if (btn5) btn5.style.display = 'none';
        } else if (btn6) {
            btn6.disabled = !hasAny;
            btn6.onclick = handler;
            if (btn5) btn5.style.display = 'none';
        } else if (btn5) {
            btn5.disabled = !hasAny;
            btn5.onclick = handler;
        }
    },

    // Shared per-point markup: a hidden "halo" ring (toggled on selection)
    // drawn behind the actual data point marker. `planar` swaps the
    // normal filled circle for a paler dashed circle with a "P" mark
    // (nearly-planar ring — theta/phi2 are unreliable at this Q).
    _ringDiagramPointSvg(ring, idx, cx, cy, extraCircleStyle, atomIdxCsv, titleText, planar) {
        const isSelected = String(this._selectedRingId) === String(ring.id);
        const color = this._ringDiagramColor(idx);

        const marker = planar
            ? `
                <circle cx="${cx}" cy="${cy}" r="9" style="fill:none;stroke:${color};stroke-width:2;${extraCircleStyle}stroke-dasharray:3,2" />
                <text x="${cx}" y="${cy + 3.5}" text-anchor="middle" style="fill:${color};font-size:9px;font-weight:700;pointer-events:none">P</text>
            `
            : `<circle cx="${cx}" cy="${cy}" r="9" style="fill:${color};${extraCircleStyle}" />`;

        const numberFill = planar ? color : '#fff';

        return `
            <g class="ring-diagram-point" data-ring-id="${ring.id}" data-atoms="${atomIdxCsv}" style="cursor:pointer">
                <circle class="ring-diagram-halo" cx="${cx}" cy="${cy}" r="13"
                    style="fill:none;stroke:var(--accent,#236546);stroke-width:2.5;opacity:${isSelected ? 1 : 0}" />
                ${marker}
                <text x="${cx}" y="${cy + (planar ? -13 : 3.5)}" text-anchor="middle" style="fill:${numberFill};font-size:9px;font-weight:600;pointer-events:none">${idx + 1}</text>
                <title>${titleText}</title>
            </g>
        `;
    },

    // Draws one row of alternating labels — one per canonical conformer
    // — placed exactly ON the phi2 grid lines (every cellDeg degrees:
    // 0, cellDeg, 2*cellDeg, ...), matching how Boeyens (1978), Fig. 1
    // places each named conformation exactly on a spoke rather than
    // floating between spokes. `phase0Deg` is the phi2 value of the
    // first grid line that gets letters[0] (matches the classifier's
    // own phase anchors: 0 deg for chair/boat/envelope, 30 deg for
    // twist-boat/half-chair). Sitting right on the grid line means a
    // line would otherwise run straight through the letter, so each
    // one gets a small opaque halo behind it to break the line rather
    // than looking like it's crossed out.
    _ringLetterRow(xOf, y0, y1, cellDeg, letters, phase0Deg = 0) {
        const yMid = (y0 + y1) / 2;
        let svg = '';
        for (let phi = 0; phi < 360; phi += cellDeg) {
            const isFirst = Math.round((phi - phase0Deg) / cellDeg) % 2 === 0;
            const letter = isFirst ? letters[0] : letters[1];
            const x = xOf(phi);
            svg += `<rect x="${x - 7}" y="${yMid - 8}" width="14" height="15" rx="3" style="fill:var(--surface,#fff);opacity:0.8;pointer-events:none" />`;
            svg += `<text x="${x}" y="${yMid + 4}" text-anchor="middle" style="fill:var(--text,#222);font-size:12px;font-weight:700;opacity:0.5;pointer-events:none">${letter}</text>`;
        }
        return svg;
    },

    // --- 6-ring: Cartesian phi2 (x) / theta (y) map ---

    _renderRing6Diagram() {
        const container = document.getElementById('ring-diagram-6-wrap');
        if (!container) return;

        const data = this._ring6DiagramData();

        if (!data.length) {
            container.innerHTML = `
                <div class="result-box">
                    No saved 6-membered rings yet.
                </div>
            `;
            return;
        }

        const PPD = this._RING_DIAGRAM_PPD;
        const plotW = 360 * PPD;
        const plotH = 180 * PPD;
        // extra left/right margin so seam-echo markers (see below) have
        // room to peek past the plot edge without being clipped
        const marginLeft = 56, marginRight = 24, marginTop = 34, marginBottom = 64;
        const W = marginLeft + plotW + marginRight;
        const H = marginTop + plotH + marginBottom;

        const xOf = phi => marginLeft + (((phi % 360) + 360) % 360) / 360 * plotW;
        const yOf = theta => marginTop + Math.max(0, Math.min(180, theta)) / 180 * plotH;

        let svg = `<svg id="ring-diagram-6-svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" style="max-width:100%;height:auto">`;
        svg += `<rect x="0" y="0" width="${W}" height="${H}" style="fill:var(--surface,#fff)" />`;

        // theta classification bands (pale fill), boundaries from
        // Chem._classifyHexagonPucker: chair / envelope-halfchair /
        // boat-twistboat / envelope-halfchair / chair.
        const bandDefs = [
            { t0: 0, t1: 22.5, color: '#4e79a7' }, // chair
            { t0: 22.5, t1: 67.5, color: '#59a14f' }, // envelope / half-chair
            { t0: 67.5, t1: 112.5, color: '#e15759' }, // boat / twist-boat
            { t0: 112.5, t1: 157.5, color: '#59a14f' },
            { t0: 157.5, t1: 180, color: '#4e79a7' },
        ];
        bandDefs.forEach(({ t0, t1, color }) => {
            const y0 = yOf(t0), y1 = yOf(t1);
            svg += `<rect x="${marginLeft}" y="${y0}" width="${plotW}" height="${y1 - y0}" style="fill:${color};opacity:0.17" />`;
        });

        // vertical phi2 phase lines, every 30 deg, running the full
        // height of the plot (through all bands)
        for (let phi = 0; phi <= 360; phi += 30) {
            const x = xOf(phi);
            svg += `<line x1="${x}" y1="${marginTop}" x2="${x}" y2="${marginTop + plotH}" style="stroke:var(--border,#888);stroke-width:1;opacity:0.5" />`;
        }

        // solid boundary lines at the classification thetas, plus thin
        // dashed reference lines at the envelope/half-chair row (45/135)
        [22.5, 67.5, 112.5, 157.5].forEach(theta => {
            const y = yOf(theta);
            svg += `<line x1="${marginLeft}" y1="${y}" x2="${marginLeft + plotW}" y2="${y}" style="stroke:var(--border,#999);stroke-width:1;opacity:0.55" />`;
        });
        [45, 135].forEach(theta => {
            const y = yOf(theta);
            svg += `<line x1="${marginLeft}" y1="${y}" x2="${marginLeft + plotW}" y2="${y}" style="stroke:var(--border,#999);stroke-width:0.6;stroke-dasharray:3,3;opacity:0.35" />`;
        });
        // the equator (theta = 90, boat / twist-boat) is drawn bold,
        // matching the reference diagram's emphasized boat/twist-boat
        // circle — every canonical boat/twist-boat form sits exactly
        // on this line
        {
            const y = yOf(90);
            svg += `<line x1="${marginLeft}" y1="${y}" x2="${marginLeft + plotW}" y2="${y}" style="stroke:var(--text,#222);stroke-width:1.3;opacity:0.5" />`;
        }

        // plot border
        svg += `<rect x="${marginLeft}" y="${marginTop}" width="${plotW}" height="${plotH}" style="fill:none;stroke:var(--border,#999);stroke-width:1.2" />`;

        // background conformer letters. Chair (theta = 0 / 180) has no
        // phi-dependence, so — matching the reference diagram, where
        // "1C4"/"4C1" repeats at every 30 deg around the rim — it's
        // repeated every 30 deg right at the two edges rather than
        // once per 60 deg band. Envelope/half-chair and boat/twist-boat
        // sit on their respective rows as before.
        svg += this._ringLetterRow(xOf, yOf(0) + 6, yOf(0) + 22, 30, ['C', 'C']);
        svg += this._ringLetterRow(xOf, yOf(22.5), yOf(67.5), 30, ['E', 'H'], 0);
        svg += this._ringLetterRow(xOf, yOf(67.5), yOf(112.5), 30, ['B', 'S'], 0);
        svg += this._ringLetterRow(xOf, yOf(112.5), yOf(157.5), 30, ['E', 'H'], 0);
        svg += this._ringLetterRow(xOf, yOf(180) - 22, yOf(180) - 6, 30, ['C', 'C']);

        // phi2 ticks (bottom), every 30 deg — bare numbers, no unit
        // (the axis title already carries "/ deg")
        for (let phi = 0; phi <= 360; phi += 30) {
            const x = xOf(phi === 360 ? 359.999 : phi);
            svg += `<line x1="${x}" y1="${marginTop + plotH}" x2="${x}" y2="${marginTop + plotH + 5}" style="stroke:var(--text,#444);stroke-width:0.8" />`;
            svg += `<text x="${x}" y="${marginTop + plotH + 18}" text-anchor="middle" style="fill:var(--text,#333);font-size:11px">${phi}</text>`;
        }
        svg += `<text x="${marginLeft + plotW / 2}" y="${H - 8}" text-anchor="middle" style="fill:var(--text,#222);font-size:12px;font-weight:600">&#966;&#8322; / &#176;</text>`;

        // theta ticks (left), every 45 deg — bare numbers, no unit
        [0, 45, 90, 135, 180].forEach(theta => {
            const y = yOf(theta);
            svg += `<line x1="${marginLeft - 5}" y1="${y}" x2="${marginLeft}" y2="${y}" style="stroke:var(--text,#444);stroke-width:0.8" />`;
            svg += `<text x="${marginLeft - 8}" y="${y + 3.5}" text-anchor="end" style="fill:var(--text,#333);font-size:11px">${theta}</text>`;
        });
        svg += `<text x="14" y="${marginTop + plotH / 2}" text-anchor="middle" style="fill:var(--text,#222);font-size:12px;font-weight:600" transform="rotate(-90 14 ${marginTop + plotH / 2})">&#952; / &#176;</text>`;

        // data points (with collision de-clustering)
        const rawPoints = data.map(({ ring, idx }) => {
            const r = ring.result;
            const invalid = this._isRingInvalid(ring);
            const planar = this._isRingPlanar(ring);
            const atoms = this._getRingAtoms(ring);
            return {
                ring, idx, invalid, planar, atoms,
                cx: xOf(r.phi2), cy: yOf(r.theta),
            };
        });
        this._dedupeRingPoints(rawPoints, 10);

        rawPoints.forEach(({ ring, idx, invalid, planar, atoms, cx, cy }) => {
            const r = ring.result;
            const atomIdxCsv = atoms.map(a => a.index).join(',');

            const opacity = invalid ? 0.3 : (planar ? 0.55 : 0.9);
            const circleStyle = `opacity:${opacity};` +
                (planar ? '' : `stroke:var(--surface,#fff);stroke-width:1.5`);

            const title = `${ring.name}: ${atoms.map(a => a.label).join('\u2013')}\n` +
                `Q = ${r.Q.toFixed(4)} \u00c5, \u03b8 = ${r.theta.toFixed(2)}\u00b0, \u03c6\u2082 = ${r.phi2.toFixed(2)}\u00b0\n` +
                `${this._ringDiagramFamilyLabel(r)}${invalid ? ' (invalid)' : ''}` +
                (planar ? '\nRing is nearly planar (Q &lt; 0.05 \u00c5) \u2014 \u03b8/\u03c6\u2082 are numerically meaningless noise, so this position is unreliable (shown paler, dashed).' : '');

            svg += this._ringDiagramPointSvg(ring, idx, cx, cy, circleStyle, atomIdxCsv, title, planar);
        });

        svg += `<text x="${marginLeft + plotW / 2}" y="${marginTop - 12}" text-anchor="middle" style="fill:var(--text,#333);font-size:11.5px;font-weight:500">C = chair, E = envelope, H = half-chair, B = boat, S = twist-boat. Equirectangular projection of the Cremer-Pople sphere.</text>`;

        svg += `</svg>`;

        container.innerHTML = svg;

        container.querySelectorAll('.ring-diagram-point').forEach(g => {
            g.addEventListener('click', () => {
                const ringId = g.dataset.ringId;
                const atomIndices = g.dataset.atoms.split(',').filter(Boolean).map(Number);
                this._onRingDiagramPointClick(ringId, atomIndices);
            });
        });
    },

    // --- 5-ring: single phi2 band (E/T pseudorotation phase, no Q axis) ---

    _renderRing5Diagram() {
        const container = document.getElementById('ring-diagram-5-wrap');
        if (!container) return;

        const data = this._ring5DiagramData();

        if (!data.length) {
            container.innerHTML = `
                <div class="result-box">
                    No saved 5-membered rings yet.
                </div>
            `;
            return;
        }

        const PPD = this._RING_DIAGRAM_PPD;
        const plotW = 360 * PPD;
        const bandH = 130;
        const marginLeft = 40, marginRight = 24, marginTop = 34, marginBottom = 60;
        const W = marginLeft + plotW + marginRight;
        const H = marginTop + bandH + marginBottom;

        const xOf = phi => marginLeft + (((phi % 360) + 360) % 360) / 360 * plotW;
        const bandY0 = marginTop, bandY1 = marginTop + bandH, bandMid = (bandY0 + bandY1) / 2;

        let svg = `<svg id="ring-diagram-5-svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" style="max-width:100%;height:auto">`;
        svg += `<rect x="0" y="0" width="${W}" height="${H}" style="fill:var(--surface,#fff)" />`;

        // single band: alternating pale E / T phase-cell fill, every
        // 18 deg (canonical envelope/twist phase spacing), matching
        // Chem._classifyPentagonPucker exactly (E centers at k*36 deg,
        // T centers at 18 + k*36 deg)
        const eColor = '#59a14f', tColor = '#b07aa1';
        for (let phi = 0; phi < 360; phi += 18) {
            const isEnvelope = phi % 36 === 0;
            const x0 = xOf(phi);
            svg += `<rect x="${x0}" y="${bandY0}" width="${plotW / 20}" height="${bandH}" style="fill:${isEnvelope ? eColor : tColor};opacity:0.17" />`;
        }

        // vertical phase-cell lines every 18 deg
        for (let phi = 0; phi <= 360; phi += 18) {
            const x = xOf(phi);
            const major = phi % 36 === 0;
            svg += `<line x1="${x}" y1="${bandY0}" x2="${x}" y2="${bandY1}" style="stroke:var(--border,#888);stroke-width:${major ? 1.3 : 0.9};opacity:${major ? 0.6 : 0.42}" />`;
        }

        // band border
        svg += `<rect x="${marginLeft}" y="${bandY0}" width="${plotW}" height="${bandH}" style="fill:none;stroke:var(--border,#999);stroke-width:1.2" />`;

        // background E/T letters, one per 18 deg cell
        svg += this._ringLetterRow(xOf, bandY0, bandY1, 18, ['E', 'T'], 0);

        // phi2 ticks (bottom), every 60 deg (finer 18 deg cells are
        // already marked by the grid + letters above) — bare numbers,
        // no unit (the axis title already carries "/ deg")
        for (let phi = 0; phi <= 360; phi += 60) {
            const x = xOf(phi === 360 ? 359.999 : phi);
            svg += `<line x1="${x}" y1="${bandY1}" x2="${x}" y2="${bandY1 + 5}" style="stroke:var(--text,#444);stroke-width:0.8" />`;
            svg += `<text x="${x}" y="${bandY1 + 18}" text-anchor="middle" style="fill:var(--text,#333);font-size:11px">${phi}</text>`;
        }
        svg += `<text x="${marginLeft + plotW / 2}" y="${H - 8}" text-anchor="middle" style="fill:var(--text,#222);font-size:12px;font-weight:600">&#966;&#8322; / &#176;</text>`;

        // data points, all nominally on the band's center line
        // (no radial/Q information encoded); collision de-clustering
        // nudges apart points that land close together in phi2
        const rawPoints = data.map(({ ring, idx }) => {
            const r = ring.result;
            const invalid = this._isRingInvalid(ring);
            const planar = this._isRingPlanar(ring);
            const atoms = this._getRingAtoms(ring);
            return {
                ring, idx, invalid, planar, atoms,
                cx: xOf(r.phi2), cy: bandMid,
            };
        });
        this._dedupeRingPoints(rawPoints, 14);

        rawPoints.forEach(({ ring, idx, invalid, planar, atoms, cx, cy }) => {
            const r = ring.result;
            const atomIdxCsv = atoms.map(a => a.index).join(',');

            const opacity = invalid ? 0.3 : (planar ? 0.55 : 0.9);
            const circleStyle = `opacity:${opacity};` +
                (planar ? '' : `stroke:var(--surface,#fff);stroke-width:1.5`);

            const title = `${ring.name}: ${atoms.map(a => a.label).join('\u2013')}\n` +
                `Q = ${r.Q.toFixed(4)} \u00c5, \u03c6\u2082 = ${r.phi2.toFixed(2)}\u00b0\n` +
                `${this._ringDiagramFamilyLabel(r)}${invalid ? ' (invalid)' : ''}` +
                (planar ? '\nRing is nearly planar (Q &lt; 0.05 \u00c5) \u2014 \u03c6\u2082 is numerically meaningless noise, so this position is unreliable (shown paler, dashed).' : '');

            svg += this._ringDiagramPointSvg(ring, idx, cx, cy, circleStyle, atomIdxCsv, title, planar);
        });

        svg += `<text x="${marginLeft + plotW / 2}" y="${marginTop - 12}" text-anchor="middle" style="fill:var(--text,#333);font-size:11.5px;font-weight:500">E = envelope, T = twist.</text>`;

        svg += `</svg>`;

        container.innerHTML = svg;

        container.querySelectorAll('.ring-diagram-point').forEach(g => {
            g.addEventListener('click', () => {
                const ringId = g.dataset.ringId;
                const atomIndices = g.dataset.atoms.split(',').filter(Boolean).map(Number);
                this._onRingDiagramPointClick(ringId, atomIndices);
            });
        });
    },

    // --- Shared PNG export (SVG -> canvas, with atom/ring legend appended) ---

    _exportRingDiagramPng(svgId, filename, legendItems) {
        const svgEl = document.getElementById(svgId);
        if (!svgEl) return;

        const width = parseInt(svgEl.getAttribute('width'), 10);
        const height = parseInt(svgEl.getAttribute('height'), 10);

        const svgData = new XMLSerializer().serializeToString(svgEl);
        const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
        const url = URL.createObjectURL(svgBlob);

        const img = new Image();
        img.onload = () => {
            const scale = 2;
            const lineHeight = 18;
            const legendTop = 16;
            const legendHeight = legendItems.length
                ? legendTop + legendItems.length * lineHeight + 12
                : 0;

            const canvas = document.createElement('canvas');
            canvas.width = width * scale;
            canvas.height = (height + legendHeight) * scale;

            const ctx = canvas.getContext('2d');
            ctx.scale(scale, scale);

            const bodyStyle = getComputedStyle(document.body);
            const bg = (bodyStyle.getPropertyValue('--surface') || '').trim() || '#ffffff';
            const fg = (bodyStyle.getPropertyValue('--text') || '').trim() || '#000000';

            ctx.fillStyle = bg;
            ctx.fillRect(0, 0, width, height + legendHeight);
            ctx.drawImage(img, 0, 0, width, height);

            if (legendItems.length) {
                ctx.font = '12px sans-serif';
                legendItems.forEach((item, i) => {
                    const y = height + legendTop + i * lineHeight;
                    ctx.fillStyle = item.color;
                    ctx.fillRect(10, y, 12, 12);
                    ctx.fillStyle = fg;
                    ctx.fillText(item.label, 28, y + 10);
                });
            }

            URL.revokeObjectURL(url);

            canvas.toBlob(blob => {
                const a = document.createElement('a');
                a.href = URL.createObjectURL(blob);
                a.download = filename;
                document.body.appendChild(a);
                a.click();
                a.remove();
            });
        };

        img.src = url;
    },

});
