// tables.js — renders bond, angle, info and geometry tables

const Tables = {

    _onBondClick: null,
    _onAngleClick: null,
    _onDihedralClick: null,
    _onAtomClick: null,
    _onAtomExcludeClick: null,

    _onManualBondRemove: null,
    _onManualDistanceRemove: null,
    _onManualAngleRemove: null,
    _onManualDihedralRemove: null,

    setAtomClickCallback(fn) { this._onAtomClick = fn; },
    setAtomExcludeCallback(fn) { this._onAtomExcludeClick = fn; },
    setBondClickCallback(fn) { this._onBondClick = fn; },
    setAngleClickCallback(fn) { this._onAngleClick = fn; },
    setDihedralClickCallback(fn) { this._onDihedralClick = fn; },

    setManualBondRemoveCallback(fn) { this._onManualBondRemove = fn; },
    setManualDistanceRemoveCallback(fn) { this._onManualDistanceRemove = fn; },
    setManualAngleRemoveCallback(fn) { this._onManualAngleRemove = fn; },
    setManualDihedralRemoveCallback(fn) { this._onManualDihedralRemove = fn; },

    // Track currently selected row per table
    _selectedBondRow: null,
    _selectedAngleRow: null,
    _selectedDihedralRow: null,

    // Sort state per rendered table.
    // Cycle per column: unsorted -> asc -> desc -> unsorted
    _sortState: {},

    _collator: new Intl.Collator(undefined, {
        numeric: true,
        sensitivity: 'base',
    }),

    _toggleSort(tableKey, column) {
        const current = this._sortState[tableKey];

        if (!current || current.column !== column) {
            this._sortState[tableKey] = {
                column,
                dir: 'asc',
            };
            return;
        }

        if (current.dir === 'asc') {
            this._sortState[tableKey] = {
                column,
                dir: 'desc',
            };
            return;
        }

        delete this._sortState[tableKey];
    },

    _sortIndicator(tableKey, column) {
        const current = this._sortState[tableKey];

        if (!current || current.column !== column) {
            return '↕';
        }

        return current.dir === 'asc' ? '↑' : '↓';
    },

    _sortTh(label, tableKey, column) {
        const current = this._sortState[tableKey];
        const active = current && current.column === column;

        return `
            <th
                class="sortable-th${active ? ' sorted' : ''}"
                data-sort-col="${column}"
                title="Click to sort"
            >
                <span>${label}</span>
                <span class="sort-indicator">${this._sortIndicator(tableKey, column)}</span>
            </th>
        `;
    },

    _bindSortHeaders(container, tableKey, rerender) {
        if (!container) return;

        container.querySelectorAll('th.sortable-th[data-sort-col]').forEach(th => {
            th.addEventListener('click', e => {
                e.stopPropagation();

                const column = th.dataset.sortCol;
                this._toggleSort(tableKey, column);

                if (rerender) rerender();
            });
        });
    },

    _compareValues(a, b, type) {
        if (type === 'number') {
            const na = Number(a);
            const nb = Number(b);

            if (Number.isNaN(na) && Number.isNaN(nb)) return 0;
            if (Number.isNaN(na)) return 1;
            if (Number.isNaN(nb)) return -1;

            return na - nb;
        }

        return this._collator.compare(String(a ?? ''), String(b ?? ''));
    },

    _sortRows(tableKey, rows, columns) {
        const current = this._sortState[tableKey];

        if (!current || !columns || !columns[current.column]) {
            return [...rows];
        }

        const columnDef = columns[current.column];
        const dir = current.dir === 'desc' ? -1 : 1;

        return rows
            .map((row, originalIndex) => ({ row, originalIndex }))
            .sort((a, b) => {
                const av = columnDef.get(a.row, a.originalIndex);
                const bv = columnDef.get(b.row, b.originalIndex);

                const cmp = this._compareValues(av, bv, columnDef.type);

                if (cmp !== 0) return cmp * dir;

                // Stable fallback: original order
                return a.originalIndex - b.originalIndex;
            })
            .map(item => item.row);
    },

    // Shared column definitions for sortable tables — used both when
    // rendering the HTML tables (renderBonds, renderAngles, ...) and when
    // exporting to Markdown, so the exported row order always matches
    // exactly what is currently shown on screen (respects active sort).
    _bondColumns: {
        atom1: { type: 'text', get: b => b.labelI },
        atom2: { type: 'text', get: b => b.labelJ },
        distance: { type: 'number', get: b => b.dist },
    },

    _angleColumns: {
        atomA: { type: 'text', get: a => a.labelA },
        atomB: { type: 'text', get: a => a.labelB },
        atomC: { type: 'text', get: a => a.labelC },
        angle: { type: 'number', get: a => a.angle },
    },

    _manualDistanceColumns(atoms) {
        return {
            atoms: {
                type: 'text',
                get: m => this._measurementAtoms(m, atoms).map(a => a.label).join('–'),
            },
            distance: {
                type: 'number',
                get: m => {
                    const selectedAtoms = this._measurementAtoms(m, atoms);
                    return selectedAtoms.length === 2
                        ? Chem.distance(selectedAtoms[0], selectedAtoms[1])
                        : Number.NaN;
                },
            },
        };
    },

    _manualAngleColumns(atoms) {
        return {
            atoms: {
                type: 'text',
                get: m => this._measurementAtoms(m, atoms).map(a => a.label).join('–'),
            },
            angle: {
                type: 'number',
                get: m => {
                    const selectedAtoms = this._measurementAtoms(m, atoms);
                    return selectedAtoms.length === 3
                        ? Chem.calcAngle(selectedAtoms[0], selectedAtoms[1], selectedAtoms[2])
                        : Number.NaN;
                },
            },
        };
    },

    _manualDihedralColumns(atoms) {
        return {
            atoms: {
                type: 'text',
                get: m => this._measurementAtoms(m, atoms).map(a => a.label).join('–'),
            },
            dihedral: {
                type: 'number',
                get: m => {
                    const selectedAtoms = this._measurementAtoms(m, atoms);
                    return selectedAtoms.length === 4
                        ? Chem.calcDihedral(...selectedAtoms)
                        : Number.NaN;
                },
            },
        };
    },

    _selectRow(row, currentRef, callback, ...args) {
        // Deselect previous
        if (currentRef && currentRef !== row) {
            currentRef.classList.remove('selected');
        }

        // Toggle
        if (row.classList.contains('selected')) {
            row.classList.remove('selected');
            if (callback) callback(null);
            return null;
        } else {
            row.classList.add('selected');
            if (callback) callback(...args);
            return row;
        }
    },

    _getAtom(atoms, idx) {
        if (!atoms) return null;

        idx = Number(idx);

        return atoms.find ? atoms.find(a => Number(a.index) === idx) : atoms[idx];
    },

    // Local counterpart of App._unavailableAtomInfo — Tables doesn't share
    // App's instance state, so excludedAtoms/activeElements are passed in
    // explicitly by the caller (see _renderTables in app.core.js).
    _unavailableInfo(atom, excludedAtoms, activeElements) {
        if (!atom) return { label: '?', reason: 'missing' };
        if (excludedAtoms && excludedAtoms.has(atom.index)) return { label: atom.label, reason: 'excluded' };

        if (activeElements && activeElements.size > 0 && !activeElements.has(atom.element)) {
            return { label: atom.label, reason: 'hidden' };
        }

        return null;
    },

    _measurementAtoms(measurement, atoms) {
        const indices = measurement.atoms || [];

        return indices
            .map(idx => this._getAtom(atoms, idx))
            .filter(Boolean);
    },

    _measurementId(measurement, fallback) {
        return measurement.id !== undefined ? measurement.id : fallback;
    },

    // --- Info table ---
    renderInfo(container, parsed) {
        const { formula, fw, elCount, massFractions, natoms, comment, atoms } = parsed;

        let html = '<div class="table-label">Molecular information</div>';
        html += '<table class="data-table"><thead><tr>'
            + '<th>Element</th><th>Count</th>'
            + '<th>At. weight</th><th>Mass fraction %</th>'
            + '</tr></thead><tbody>';

        const els = Object.keys(elCount).sort((a, b) => {
            if (a === 'C') return -1;
            if (b === 'C') return 1;
            if (a === 'H') return -1;
            if (b === 'H') return 1;
            return a.localeCompare(b);
        });

        for (const el of els) {
            const aw = Parser.atomicWeights[el] || 0;
            html += `<tr>
                <td>${el}</td>
                <td>${elCount[el]}</td>
                <td>${aw.toFixed(3)}</td>
                <td>${(massFractions[el] || 0).toFixed(2)}</td>
            </tr>`;
        }

        html += '</tbody></table>';

        // DOSY size estimate — always computed from every atom in the
        // loaded file (no exclusions), independent of viewer selection.
        let dosyHtml = '';
        if (typeof Dosy !== 'undefined' && atoms && atoms.length >= 2) {
            const est = Dosy.calcEstimate(atoms);
            dosyHtml = `
                <div style="margin-top:6px;padding-top:6px;border-top:1px solid var(--border-color, #444)">
                    <div style="margin-bottom:4px"><b>Van der Waals volume:</b> ${est.volume.toFixed(3)} &#8491;&sup3;
                        <span style="color:var(--text-muted);font-size:12px">(voxel grid, Alvarez 2013 radii, ${est.gridSpacing.toFixed(3)} &#8491; spacing — matches MoloVol)</span>
                    </div>
                    <div style="margin-bottom:4px"><b>Van der Waals surface area:</b> ${est.surfaceArea.toFixed(3)} &#8491;&sup2;
                        <span style="color:var(--text-muted);font-size:12px">(marching cubes on the same grid, Lindblad 2005 area weights — matches MoloVol)</span>
                    </div>
                    <div style="margin-bottom:4px"><b>r<sub>eq</sub> (uncorrected):</b> ${est.r0.toFixed(3)} &#8491;
                        <span style="color:var(--text-muted);font-size:12px">(vdW-volume-equivalent sphere radius — a geometric proxy, not the empirical hydrodynamic radius)</span>
                    </div>
                    <div style="margin-bottom:4px"><b>r<sub>eq</sub> (Perrin-corrected):</b> ${est.rPerrin.toFixed(3)} &#8491;
                        <span style="color:var(--text-muted);font-size:12px">(${est.shape}, p&nbsp;=&nbsp;${est.p.toFixed(3)}, F&nbsp;=&nbsp;${est.F.toFixed(3)})</span>
                    </div>
                    <div><b>r<sub>g</sub> (radius of gyration):</b> ${est.rg.toFixed(3)} &#8491;
                        <span style="color:var(--text-muted);font-size:12px">(mass-weighted, atom positions — IUPAC definition, matches LAMMPS/GROMACS/OVITO)</span>
                    </div>
                </div>`;

            const dEst = Dosy.calcDiffusionEstimates(est.volume, est.r0, est.rPerrin);
            const segEst = Dosy.calcSegweEstimate(fw);
            const fmtD = d => (d * 1e9).toFixed(3);
            const solventLabel = { 'THF-d8': 'THF-d' + Format.subscriptNumber(8), 'C6D6': 'Benzene-d' + Format.subscriptNumber(6), 'Toluene-d8': 'Toluene-d' + Format.subscriptNumber(8), 'CDCl3': 'CDCl' + Format.subscriptNumber(3) };
            const allSolvents = ['THF-d8', 'C6D6', 'Toluene-d8', 'CDCl3'];
            let dRows = '';
            for (const solvent of allSolvents) {
                const v = dEst[solvent];
                const seg = segEst[solvent];
                const fmtOrDash = value => Number.isFinite(value) ? fmtD(value) : '&mdash;';
                
                dRows += `<tr><td>${solventLabel[solvent] || solvent}</td>` +
                    `<td>${fmtOrDash(v?.dNaive)}</td>` +
                    `<td>${fmtOrDash(v?.dPerrin)}</td>` +
                    `<td>${fmtOrDash(v?.dVondung)}</td>` +
                    `<td>${fmtOrDash(seg?.d)}</td></tr>`;
            }
            dosyHtml += `
                <div style="margin-top:6px;padding-top:6px;border-top:1px solid var(--border-color, #444)">
                    <div style="margin-bottom:4px"><b>D estimate</b>
                        <span style="color:var(--text-muted);font-size:12px">(298.15 K, all values in 10&#8315;&#8313; m&sup2;&middot;s&#8315;&sup1;)</span>
                    </div>
                    <table class="data-table">
                        <thead><tr><th>Solvent</th><th>D from r<sub>eq</sub></th><th>D from r<sub>eq</sub>, Perrin</th><th>D<sub>x,norm</sub></th><th>D (SEGWE)</th></tr></thead>
                        <tbody>${dRows}</tbody>
                    </table>
                    <div style="margin-top:4px;color:var(--text-muted);font-size:12px">"D from r<sub>eq</sub>" / "...Perrin" plug r<sub>eq</sub> (uncorrected / Perrin-shape-corrected) directly into Stokes&ndash;Einstein, using Holz reference viscosities. "D<sub>x,norm</sub>" and "D (SEGWE)" are two independent semiempirical models (Urbank &amp; Vondung, 2026; Evans et al., 2018) with their own solvent parameters — see README for details, error estimates, and why "D<sub>x,norm</sub>" is not a raw measured D.</div>
                </div>`;
        }

        html += `<div class="result-box" style="margin-top:8px">
            <div style="margin-bottom:4px"><b>Formula:</b> ${Format.chemicalFormula(formula)}</div>
            <div style="margin-bottom:4px"><b>Formula weight:</b> ${fw.toFixed(3)} g/mol</div>
            <div style="margin-bottom:4px"><b>Atoms:</b> ${natoms}</div>
            ${dosyHtml}
            ${comment ? `<div style="margin-top:6px"><b>Comment:</b> ${comment}</div>` : ''}
        </div>`;

        container.innerHTML = html;
    },

    // --- Point group symmetry (Info tab) ---
    // Split in two so the tolerance slider never gets destroyed mid-drag:
    // renderSymmetryShell() is written once, renderSymmetryBody() is
    // refreshed on every 'input' event.
    renderSymmetryShell(tolerance, initialBodyHtml = '') {
        return `
            <div class="table-label">Point group symmetry</div>
            <div class="result-box" style="margin-bottom:8px">
                <label for="symmetry-tolerance-slider">Tolerance</label>
                <input type="range" id="symmetry-tolerance-slider"
                       min="0.01" max="0.5" step="0.005" value="${tolerance}"
                       style="width:160px;vertical-align:middle;margin:0 8px">
                <span id="symmetry-tolerance-value">${tolerance.toFixed(3)} Å</span>
                <div style="margin-top:4px;color:var(--text-muted);font-size:12.5px">
                    Approximate, geometry-only detection (no external library).
                    Best-effort for cubic groups (${['Td', 'Oh', 'T', 'Th', 'O'].map(g => Format.pointGroupHtml(g)).join('/')});
                    icosahedral (${Format.pointGroupHtml('I')}/${Format.pointGroupHtml('Ih')}) is not covered.
                </div>
            </div>
            <div id="symmetry-results-body">${initialBodyHtml}</div>
        `;
    },

    _symmetryErrorBadge(error, tolerance) {
        if (error === undefined || error === null) return '<span style="color:var(--text-muted)">–</span>';
        const ok = error <= tolerance;
        const color = ok ? '#3fa34d' : (error <= tolerance * 2 ? '#d9a03f' : '#d94a4a');
        return `<span style="color:${color};font-weight:600">${error.toFixed(4)} Å</span>`;
    },

    renderSymmetryBody(classified, raw) {
        // Tolerance was already used to compute `classified`; read it back
        // off the slider here only for error-value color coding.
        const sliderEl = document.getElementById('symmetry-tolerance-slider');
        const tolerance = sliderEl ? parseFloat(sliderEl.value) : 0.10;

        let html = `<div class="result-box" style="margin-bottom:8px">
            <div><b>Point group:</b> <span class="result-value">${Format.pointGroupHtml(classified.pointGroup)}</span></div>
            ${raw && raw.isPoint ? '<div style="color:var(--text-muted);font-size:12.5px;margin-top:2px">Single atom (or coincident-point input): full spherical symmetry, no distinguished axis</div>' : ''}
            ${raw && raw.isLinear ? '<div style="color:var(--text-muted);font-size:12.5px;margin-top:2px">Linear molecule</div>' : ''}
        </div>`;

        if (classified.elements && classified.elements.length) {
            html += '<div class="table-label">Defining elements</div>';
            html += '<table class="data-table"><thead><tr><th>Element</th><th>Error</th></tr></thead><tbody>';
            for (const el of classified.elements) {
                html += `<tr>
                    <td>${Format.symmetryElementLabel(el)}</td>
                    <td>${this._symmetryErrorBadge(el.error, tolerance)}</td>
                </tr>`;
            }
            html += '</tbody></table>';
        }

        if (raw) {
            const candidates = Symmetry.rankCandidates(raw);
            const seen = new Set();
            html += '<div class="table-label" style="margin-top:8px">Scoring — candidate groups</div>';
            html += '<div style="color:var(--text-muted);font-size:12.5px;margin-bottom:4px">' +
                'Fixed ranking from the raw geometry — does not change with the ' +
                'tolerance slider; only the highlighted (assigned) row does.</div>';
            html += '<table class="data-table"><thead><tr><th>Group</th><th>Error</th></tr></thead><tbody>';
            for (const c of candidates) {
                if (seen.has(c.name)) continue;
                seen.add(c.name);
                const isAssigned = c.name === classified.pointGroup;
                html += `<tr${isAssigned ? ' style="font-weight:600"' : ''}>
                    <td>${Format.pointGroupHtml(c.name)}${isAssigned ? ' ←' : ''}</td>
                    <td>${this._symmetryErrorBadge(c.error, tolerance)}</td>
                </tr>`;
            }
            html += '</tbody></table>';
        }

        return html;
    },

    // --- Atom list under viewer ---
    renderAtomList(
        container,
        atoms,
        searchQuery = '',
        selectedAtoms = new Set(),
        excludedAtoms = new Set(),
        activeElements = null,
        scrollToIdx = null
    ) {
        if (!container) return;

        const q = (searchQuery || '').trim().toLowerCase();

        let shownAtoms = atoms || [];

        if (q) {
            // A bare integer (e.g. "15") means "find atom number 15", not a
            // coordinate digit search — matching it as a substring against
            // 6-decimal coordinates caused unrelated atoms to show up
            // whenever their x/y/z happened to contain that digit sequence.
            const isPureInteger = /^\d+$/.test(q);

            shownAtoms = shownAtoms.filter(atom => {
                const num = atom.labelIndex ?? atom.index;

                if (isPureInteger) {
                    return String(num) === q;
                }

                const haystack = [
                    atom.label,
                    atom.element,
                    num,
                    atom.x.toFixed(6),
                    atom.y.toFixed(6),
                    atom.z.toFixed(6),
                ].join(' ').toLowerCase();

                return haystack.includes(q);
            });
        }

        shownAtoms = this._sortRows('atomList', shownAtoms, {
            atom: {
                type: 'text',
                get: atom => atom.label,
            },
            element: {
                type: 'text',
                get: atom => atom.element,
            },
        });

        if (!shownAtoms.length) {
            container.innerHTML = `
                <div class="atom-list-empty">
                    No atoms match current search.
                </div>
            `;
            return;
        }

        let html = `
            <table class="atom-list-table">
                <thead>
                    <tr>
                        <th>#</th>
                        ${this._sortTh('Atom', 'atomList', 'atom')}
                        ${this._sortTh('El', 'atomList', 'element')}
                        <th>x</th>
                        <th>y</th>
                        <th>z</th>
                        <th>Exclude</th>
                    </tr>
                </thead>
                <tbody>
        `;

        shownAtoms.forEach(atom => {
            const isSelected = selectedAtoms && selectedAtoms.has(atom.index);
            const isExcluded = excludedAtoms && excludedAtoms.has(atom.index);
            const isElementInactive = activeElements && !activeElements.has(atom.element);

            const selectedClass = isSelected ? ' selected' : '';
            const excludedClass = isExcluded ? ' excluded' : '';
            const inactiveClass = isElementInactive ? ' element-inactive' : '';

            html += `
                <tr class="${selectedClass}${excludedClass}${inactiveClass}" data-idx="${atom.index}">
                    <td>${atom.labelIndex ?? atom.index}</td>
                    <td class="atom-label-cell">${atom.label}</td>
                    <td class="atom-element-cell"><span class="el-swatch" style="background:${Parser.getColor(atom.element)}"></span>${atom.element}</td>
                    <td>${atom.x.toFixed(4)}</td>
                    <td>${atom.y.toFixed(4)}</td>
                    <td>${atom.z.toFixed(4)}</td>
                    <td>
                        <input
                            type="checkbox"
                            class="atom-exclude-checkbox"
                            data-idx="${atom.index}"
                            ${isExcluded ? 'checked' : ''}
                            ${isElementInactive ? 'disabled' : ''}
                            title="${isElementInactive ? 'Inactive by element filter' : 'Exclude atom from analysis'}"
                        >
                    </td>
                </tr>
            `;
        });

        html += `
                </tbody>
            </table>
        `;

        container.innerHTML = html;

        this._bindSortHeaders(container, 'atomList', () => {
            this.renderAtomList(
                container,
                atoms,
                searchQuery,
                selectedAtoms,
                excludedAtoms,
                activeElements
            );
        });

        // Row click: select atom only if active and not excluded.
        container.querySelectorAll('tr[data-idx]').forEach(row => {
            row.addEventListener('click', () => {
                const idx = parseInt(row.dataset.idx, 10);
                const atom = atoms.find(a => a.index === idx);

                if (!atom) return;
                if (excludedAtoms && excludedAtoms.has(idx)) return;
                if (activeElements && !activeElements.has(atom.element)) return;

                if (this._onAtomClick) this._onAtomClick(idx);
            });
        });

        // Checkbox click: toggle exclude, do not trigger row selection.
        container.querySelectorAll('.atom-exclude-checkbox').forEach(cb => {
            cb.addEventListener('click', e => {
                e.stopPropagation();

                const idx = parseInt(cb.dataset.idx, 10);
                const excluded = cb.checked;

                if (this._onAtomExcludeClick) {
                    this._onAtomExcludeClick(idx, excluded);
                }
            });
        });

        // Soft-scroll the table to whichever atom was just (de)selected,
        // e.g. by clicking it in the 3D viewer or in this table itself.
        if (scrollToIdx != null) {
            const target = container.querySelector(`tr[data-idx="${scrollToIdx}"]`);
            if (target) this._scrollRowIntoView(target, container);
        }
    },

    // Manual scroll instead of target.scrollIntoView(): the atom table has a
    // sticky <thead>, and scrollIntoView's default block alignment can park
    // the row right behind that sticky header (most visible for the first
    // row, where the container can't scroll further up so the row just
    // stays hidden under the header). Account for the header's height
    // explicitly instead.
    _scrollRowIntoView(row, wrap) {
        if (!wrap) {
            row.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            return;
        }

        const thead = wrap.querySelector('thead');
        const headerHeight = thead ? thead.getBoundingClientRect().height : 0;
        const wrapRect = wrap.getBoundingClientRect();
        const rowRect = row.getBoundingClientRect();
        const hiddenAboveHeader = rowRect.top - wrapRect.top - headerHeight;
        const hiddenBelowBottom = rowRect.bottom - wrapRect.bottom;

        if (hiddenAboveHeader < 0) {
            wrap.scrollBy({ top: hiddenAboveHeader, behavior: 'smooth' });
        } else if (hiddenBelowBottom > 0) {
            wrap.scrollBy({ top: hiddenBelowBottom, behavior: 'smooth' });
        }
    },

    // --- Manual distances: saved measurements, NOT part of bond graph/statistics ---
    renderManualDistances(container, manualDistances, atoms, excludedAtoms = new Set(), activeElements = null) {
        if (!container) return;

        if (!manualDistances || manualDistances.length === 0) {
            container.innerHTML = '';
            return;
        }

        const sortedDistances = this._sortRows('manualDistances', manualDistances, this._manualDistanceColumns(atoms));

        let html = `
            <div class="table-label">Manual distances (${manualDistances.length})</div>
            <table class="data-table manual-measurement-table">
                <thead>
                    <tr>
                        <th>#</th>
                        ${this._sortTh('Atoms', 'manualDistances', 'atoms')}
                        ${this._sortTh('Distance (Å)', 'manualDistances', 'distance')}
                        <th>Status</th>
                        <th>Action</th>
                    </tr>
                </thead>
                <tbody>
        `;

        sortedDistances.forEach((m, idx) => {
            const selectedAtoms = this._measurementAtoms(m, atoms);
            if (selectedAtoms.length !== 2) return;

            const [a, b] = selectedAtoms;
            const d = Chem.distance(a, b);
            const id = this._measurementId(m, manualDistances.indexOf(m));

            const unavailable = selectedAtoms
                .map(atom => this._unavailableInfo(atom, excludedAtoms, activeElements))
                .filter(Boolean);

            const status = unavailable.length
                ? `invalid: ${unavailable.map(u => `${u.label} (${u.reason})`).join(', ')}`
                : 'valid';

            const invalid = status !== 'valid';

            html += `
                <tr class="${invalid ? 'inactive' : ''}">
                    <td>${idx + 1}</td>
                    <td>${a.label}–${b.label}</td>
                    <td>${d.toFixed(4)}</td>
                    <td>${status}</td>
                    <td>
                        <button
                            class="btn-small btn-danger manual-distance-remove"
                            data-id="${id}"
                        >
                            remove
                        </button>
                    </td>
                </tr>
            `;
        });

        html += `
                </tbody>
            </table>
        `;

        container.innerHTML = html;

        this._bindSortHeaders(container, 'manualDistances', () => {
            this.renderManualDistances(container, manualDistances, atoms, excludedAtoms, activeElements);
        });

        container.querySelectorAll('.manual-distance-remove').forEach(btn => {
            btn.addEventListener('click', e => {
                e.stopPropagation();

                const id = btn.dataset.id;

                if (this._onManualDistanceRemove) {
                    this._onManualDistanceRemove(id);
                }
            });
        });
    },

    // --- Manual angles: saved measurements, NOT part of automatic angle statistics ---
    renderManualAngles(container, manualAngles, atoms, excludedAtoms = new Set(), activeElements = null) {
        if (!container) return;

        if (!manualAngles || manualAngles.length === 0) {
            container.innerHTML = '';
            return;
        }

        const sortedAngles = this._sortRows('manualAngles', manualAngles, this._manualAngleColumns(atoms));

        let html = `
            <div class="table-label">Manual angles (${manualAngles.length})</div>
            <table class="data-table manual-measurement-table">
                <thead>
                    <tr>
                        <th>#</th>
                        ${this._sortTh('Atoms', 'manualAngles', 'atoms')}
                        ${this._sortTh('Angle (°)', 'manualAngles', 'angle')}
                        <th>Status</th>
                        <th>Action</th>
                    </tr>
                </thead>
                <tbody>
        `;

        sortedAngles.forEach((m, idx) => {
            const selectedAtoms = this._measurementAtoms(m, atoms);
            if (selectedAtoms.length !== 3) return;

            const [a, b, c] = selectedAtoms;
            const angle = Chem.calcAngle(a, b, c);
            const id = this._measurementId(m, manualAngles.indexOf(m));

            const unavailable = selectedAtoms
                .map(atom => this._unavailableInfo(atom, excludedAtoms, activeElements))
                .filter(Boolean);

            const status = unavailable.length
                ? `invalid: ${unavailable.map(u => `${u.label} (${u.reason})`).join(', ')}`
                : 'valid';

            const invalid = status !== 'valid';

            html += `
                <tr class="${invalid ? 'inactive' : ''}">
                    <td>${idx + 1}</td>
                    <td>${a.label}–${b.label}–${c.label}</td>
                    <td>${angle.toFixed(3)}</td>
                    <td>${status}</td>
                    <td>
                        <button
                            class="btn-small btn-danger manual-angle-remove"
                            data-id="${id}"
                        >
                            remove
                        </button>
                    </td>
                </tr>
            `;
        });

        html += `
                </tbody>
            </table>
        `;

        container.innerHTML = html;

        this._bindSortHeaders(container, 'manualAngles', () => {
            this.renderManualAngles(container, manualAngles, atoms, excludedAtoms, activeElements);
        });

        container.querySelectorAll('.manual-angle-remove').forEach(btn => {
            btn.addEventListener('click', e => {
                e.stopPropagation();

                const id = btn.dataset.id;

                if (this._onManualAngleRemove) {
                    this._onManualAngleRemove(id);
                }
            });
        });
    },

    // --- Manual dihedrals: saved measurements ---
    renderManualDihedrals(container, manualDihedrals, atoms, excludedAtoms = new Set(), activeElements = null) {
        if (!container) return;

        this._selectedDihedralRow = null;

        if (!manualDihedrals || manualDihedrals.length === 0) {
            container.innerHTML = '';
            return;
        }

        const sortedDihedrals = this._sortRows('manualDihedrals', manualDihedrals, this._manualDihedralColumns(atoms));

        let html = `
            <div class="table-label">Manual dihedrals (${manualDihedrals.length})</div>
            <table class="data-table manual-measurement-table">
                <thead>
                    <tr>
                        <th>#</th>
                        ${this._sortTh('Atoms', 'manualDihedrals', 'atoms')}
                        ${this._sortTh('Dihedral (°)', 'manualDihedrals', 'dihedral')}
                        <th>Status</th>
                        <th>Action</th>
                    </tr>
                </thead>
                <tbody>
        `;

        sortedDihedrals.forEach((m, idx) => {
            const selectedAtoms = this._measurementAtoms(m, atoms);
            if (selectedAtoms.length !== 4) return;

            const angle = Chem.calcDihedral(...selectedAtoms);
            const labels = selectedAtoms.map(a => a.label).join('–');
            const id = this._measurementId(m, manualDihedrals.indexOf(m));

            const unavailable = selectedAtoms
                .map(atom => this._unavailableInfo(atom, excludedAtoms, activeElements))
                .filter(Boolean);

            const status = unavailable.length
                ? `invalid: ${unavailable.map(u => `${u.label} (${u.reason})`).join(', ')}`
                : 'valid';

            const invalid = status !== 'valid';

            html += `
                <tr class="${invalid ? 'inactive' : ''}" data-atoms="${selectedAtoms.map(a => a.index).join(',')}">
                    <td>${idx + 1}</td>
                    <td>${labels}</td>
                    <td>${angle.toFixed(3)}</td>
                    <td>${status}</td>
                    <td>
                        <button
                            class="btn-small btn-danger manual-dihedral-remove"
                            data-id="${id}"
                        >
                            remove
                        </button>
                    </td>
                </tr>
            `;
        });

        html += `
                </tbody>
            </table>
        `;

        container.innerHTML = html;

        this._bindSortHeaders(container, 'manualDihedrals', () => {
            this.renderManualDihedrals(container, manualDihedrals, atoms, excludedAtoms, activeElements);
        });

        container.querySelectorAll('tr[data-atoms]').forEach(row => {
            row.addEventListener('click', () => {
                const atomIndices = row.dataset.atoms.split(',').map(Number);

                this._selectedDihedralRow = this._selectRow(
                    row,
                    this._selectedDihedralRow,
                    sel => {
                        if (this._onDihedralClick) {
                            this._onDihedralClick(sel ? atomIndices : null);
                        }
                    },
                    row
                );
            });
        });

        container.querySelectorAll('.manual-dihedral-remove').forEach(btn => {
            btn.addEventListener('click', e => {
                e.stopPropagation();

                const id = btn.dataset.id;

                if (this._onManualDihedralRemove) {
                    this._onManualDihedralRemove(id);
                }
            });
        });
    },

    // --- Bonds table ---
    renderBonds(bondWrap, summaryWrap, statsWrap, bonds) {
        this._selectedBondRow = null;

        const sortedBonds = this._sortRows('bonds', bonds, this._bondColumns);

        const groups = {};

        for (const b of bonds) {
            const key = Chem.orderBondLabel(b.elI, b.elJ).join('–');

            if (!groups[key]) groups[key] = [];
            groups[key].push(b.dist);
        }

        let html = `<div class="table-label">Bond lengths (${bonds.length})</div>`;

        if (bonds.length === 0) {
            html += '<div style="color:var(--text-muted);font-size:13px;padding:8px 0">No bonds match current filter.</div>';

            bondWrap.innerHTML = html;
            summaryWrap.innerHTML = '';
            statsWrap.innerHTML = '';

            return;
        }

        html += `
            <table class="data-table">
                <thead>
                    <tr>
                        <th>#</th>
                        ${this._sortTh('Atom 1', 'bonds', 'atom1')}
                        ${this._sortTh('Atom 2', 'bonds', 'atom2')}
                        ${this._sortTh('Distance (Å)', 'bonds', 'distance')}
                        <th>Source</th>
                        <th>Action</th>
                    </tr>
                </thead>
                <tbody>
        `;

        sortedBonds.forEach((b, idx) => {
            const source = b.manual ? 'manual' : 'auto';

            const action = b.manual
                ? `<button class="btn-small btn-danger manual-bond-remove" data-i="${b.i}" data-j="${b.j}">remove</button>`
                : '';

            html += `
                <tr data-i="${b.i}" data-j="${b.j}">
                    <td>${idx + 1}</td>
                    <td>${b.labelI}</td>
                    <td>${b.labelJ}</td>
                    <td>${b.dist.toFixed(4)}</td>
                    <td><span class="source-badge ${source}">${source}</span></td>
                    <td class="manual-bond-action-cell">${action}</td>
                </tr>
            `;
        });

        html += `
                </tbody>
            </table>
        `;

        bondWrap.innerHTML = html;

        this._bindSortHeaders(bondWrap, 'bonds', () => {
            this.renderBonds(bondWrap, summaryWrap, statsWrap, bonds);
        });

        bondWrap.querySelectorAll('tr[data-i]').forEach(row => {
            row.addEventListener('click', () => {
                const i = parseInt(row.dataset.i, 10);
                const j = parseInt(row.dataset.j, 10);

                this._selectedBondRow = this._selectRow(
                    row,
                    this._selectedBondRow,
                    sel => {
                        if (this._onBondClick) {
                            this._onBondClick(sel ? i : null, sel ? j : null);
                        }
                    },
                    row
                );
            });
        });

        bondWrap.querySelectorAll('.manual-bond-remove').forEach(btn => {
            btn.addEventListener('click', e => {
                e.stopPropagation();

                const i = parseInt(btn.dataset.i, 10);
                const j = parseInt(btn.dataset.j, 10);

                if (this._onManualBondRemove) {
                    this._onManualBondRemove(i, j);
                }
            });
        });

        // Summary by bond type
        let sh = '<div class="table-label">Summary</div>';

        sh += '<table class="data-table"><thead><tr>'
            + '<th>Bond</th><th>Count</th><th>Min (Å)</th><th>Max (Å)</th><th>Mean (Å)</th><th>Std dev (Å)</th>'
            + '</tr></thead><tbody>';

        const sortedGroupEntries = Object.entries(groups).sort(([a], [b]) =>
            Chem.compareGroupTypeKeys(
                Chem.groupTypeSortKey(a.split('–')),
                Chem.groupTypeSortKey(b.split('–'))
            )
        );

        for (const [key, dists] of sortedGroupEntries) {
            const s = Chem.stats(dists);

            sh += `<tr><td>${key}</td><td>${s.n}</td>
                <td>${s.min.toFixed(4)}</td><td>${s.max.toFixed(4)}</td>
                <td>${s.mean.toFixed(4)}</td><td>${s.std.toFixed(4)}</td></tr>`;
        }

        sh += '</tbody></table>';
        summaryWrap.innerHTML = sh;

        // No global statistics over mixed bond types.
        statsWrap.innerHTML = '';
    },

    // --- Angles table ---
    renderAngles(angleWrap, summaryWrap, statsWrap, angles) {
        this._selectedAngleRow = null;

        const sortedAngles = this._sortRows('angles', angles, this._angleColumns);

        const groups = {};

        for (const a of angles) {
            const key = Chem.orderAngleLabel(a.elA, a.elB, a.elC).join('–');

            if (!groups[key]) groups[key] = [];
            groups[key].push(a.angle);
        }

        let html = `<div class="table-label">Bond angles (${angles.length})</div>`;

        if (angles.length === 0) {
            html += '<div style="color:var(--text-muted);font-size:13px;padding:8px 0">No angles match current filter.</div>';

            angleWrap.innerHTML = html;
            summaryWrap.innerHTML = '';
            statsWrap.innerHTML = '';

            return;
        }

        html += `
            <table class="data-table">
                <thead>
                    <tr>
                        <th>#</th>
                        ${this._sortTh('Atom A', 'angles', 'atomA')}
                        ${this._sortTh('Atom B', 'angles', 'atomB')}
                        ${this._sortTh('Atom C', 'angles', 'atomC')}
                        ${this._sortTh('Angle (°)', 'angles', 'angle')}
                    </tr>
                </thead>
                <tbody>
        `;

        sortedAngles.forEach((a, idx) => {
            html += `
                <tr data-ia="${a.iA}" data-ib="${a.iB}" data-ic="${a.iC}">
                    <td>${idx + 1}</td>
                    <td>${a.labelA}</td>
                    <td>${a.labelB}</td>
                    <td>${a.labelC}</td>
                    <td>${a.angle.toFixed(3)}</td>
                </tr>
            `;
        });

        html += `
                </tbody>
            </table>
        `;

        angleWrap.innerHTML = html;

        this._bindSortHeaders(angleWrap, 'angles', () => {
            this.renderAngles(angleWrap, summaryWrap, statsWrap, angles);
        });

        angleWrap.querySelectorAll('tr[data-ia]').forEach(row => {
            row.addEventListener('click', () => {
                const atoms = [
                    parseInt(row.dataset.ia, 10),
                    parseInt(row.dataset.ib, 10),
                    parseInt(row.dataset.ic, 10),
                ];

                this._selectedAngleRow = this._selectRow(
                    row,
                    this._selectedAngleRow,
                    sel => {
                        if (this._onAngleClick) {
                            this._onAngleClick(sel ? atoms : null);
                        }
                    },
                    row
                );
            });
        });

        // Summary by angle type
        let sh = '<div class="table-label">Summary</div>';

        sh += '<table class="data-table"><thead><tr>'
            + '<th>Angle type</th><th>Count</th><th>Min (°)</th><th>Max (°)</th><th>Mean (°)</th><th>Std dev (°)</th>'
            + '</tr></thead><tbody>';

        const sortedGroupEntries = Object.entries(groups).sort(([a], [b]) =>
            Chem.compareGroupTypeKeys(
                Chem.groupTypeSortKey(a.split('–')),
                Chem.groupTypeSortKey(b.split('–'))
            )
        );

        for (const [key, vals] of sortedGroupEntries) {
            const s = Chem.stats(vals);

            sh += `<tr><td>${key}</td><td>${s.n}</td>
                <td>${s.min.toFixed(3)}</td><td>${s.max.toFixed(3)}</td>
                <td>${s.mean.toFixed(3)}</td><td>${s.std.toFixed(3)}</td></tr>`;
        }

        sh += '</tbody></table>';
        summaryWrap.innerHTML = sh;

        // No global statistics over mixed angle types.
        statsWrap.innerHTML = '';
    },

};