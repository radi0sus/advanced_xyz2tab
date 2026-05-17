// tables.js — renders bond, angle, info and geometry tables

const Tables = {

    _onBondClick: null,
    _onAngleClick: null,
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

    setManualBondRemoveCallback(fn) { this._onManualBondRemove = fn; },
    setManualDistanceRemoveCallback(fn) { this._onManualDistanceRemove = fn; },
    setManualAngleRemoveCallback(fn) { this._onManualAngleRemove = fn; },
    setManualDihedralRemoveCallback(fn) { this._onManualDihedralRemove = fn; },

    // Track currently selected row per table
    _selectedBondRow: null,
    _selectedAngleRow: null,

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
        const { formula, fw, elCount, massFractions, natoms, comment } = parsed;

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
        html += `<div class="result-box" style="margin-top:8px">
            <div style="margin-bottom:4px"><b>Formula:</b> ${formula}</div>
            <div style="margin-bottom:4px"><b>Formula weight:</b> ${fw.toFixed(3)} g/mol</div>
            <div style="margin-bottom:4px"><b>Atoms:</b> ${natoms}</div>
            ${comment ? `<div><b>Comment:</b> ${comment}</div>` : ''}
        </div>`;

        container.innerHTML = html;
    },

    // --- Atom list under viewer ---
    renderAtomList(
        container,
        atoms,
        searchQuery = '',
        selectedAtoms = new Set(),
        excludedAtoms = new Set(),
        activeElements = null
    ) {
        if (!container) return;

        const q = (searchQuery || '').trim().toLowerCase();

        let shownAtoms = atoms || [];

        if (q) {
            shownAtoms = shownAtoms.filter(atom => {
                const haystack = [
                    atom.label,
                    atom.element,
                    atom.index,
                    atom.labelIndex ?? atom.index,
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
                    <td class="atom-element-cell">${atom.element}</td>
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
    },

    // --- Manual distances: saved measurements, NOT part of bond graph/statistics ---
    renderManualDistances(container, manualDistances, atoms) {
        if (!container) return;

        if (!manualDistances || manualDistances.length === 0) {
            container.innerHTML = '';
            return;
        }

        const sortedDistances = this._sortRows('manualDistances', manualDistances, {
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
        });

        let html = `
            <div class="table-label">Manual distances (${manualDistances.length})</div>
            <table class="data-table manual-measurement-table">
                <thead>
                    <tr>
                        <th>#</th>
                        ${this._sortTh('Atoms', 'manualDistances', 'atoms')}
                        ${this._sortTh('Distance (Å)', 'manualDistances', 'distance')}
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

            html += `
                <tr>
                    <td>${idx + 1}</td>
                    <td>${a.label}–${b.label}</td>
                    <td>${d.toFixed(4)}</td>
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
            this.renderManualDistances(container, manualDistances, atoms);
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
    renderManualAngles(container, manualAngles, atoms) {
        if (!container) return;

        if (!manualAngles || manualAngles.length === 0) {
            container.innerHTML = '';
            return;
        }

        const sortedAngles = this._sortRows('manualAngles', manualAngles, {
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
        });

        let html = `
            <div class="table-label">Manual angles (${manualAngles.length})</div>
            <table class="data-table manual-measurement-table">
                <thead>
                    <tr>
                        <th>#</th>
                        ${this._sortTh('Atoms', 'manualAngles', 'atoms')}
                        ${this._sortTh('Angle (°)', 'manualAngles', 'angle')}
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

            html += `
                <tr>
                    <td>${idx + 1}</td>
                    <td>${a.label}–${b.label}–${c.label}</td>
                    <td>${angle.toFixed(3)}</td>
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
            this.renderManualAngles(container, manualAngles, atoms);
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
    renderManualDihedrals(container, manualDihedrals, atoms) {
        if (!container) return;

        if (!manualDihedrals || manualDihedrals.length === 0) {
            container.innerHTML = '';
            return;
        }

        const sortedDihedrals = this._sortRows('manualDihedrals', manualDihedrals, {
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
        });

        let html = `
            <div class="table-label">Manual dihedrals (${manualDihedrals.length})</div>
            <table class="data-table manual-measurement-table">
                <thead>
                    <tr>
                        <th>#</th>
                        ${this._sortTh('Atoms', 'manualDihedrals', 'atoms')}
                        ${this._sortTh('Dihedral (°)', 'manualDihedrals', 'dihedral')}
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

            html += `
                <tr>
                    <td>${idx + 1}</td>
                    <td>${labels}</td>
                    <td>${angle.toFixed(3)}</td>
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
            this.renderManualDihedrals(container, manualDihedrals, atoms);
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

        const sortedBonds = this._sortRows('bonds', bonds, {
            atom1: {
                type: 'text',
                get: b => b.labelI,
            },
            atom2: {
                type: 'text',
                get: b => b.labelJ,
            },
            distance: {
                type: 'number',
                get: b => b.dist,
            },
        });

        const groups = {};

        for (const b of bonds) {
            const key = [b.elI, b.elJ].sort().join('–');

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

        for (const [key, dists] of Object.entries(groups)) {
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

        const sortedAngles = this._sortRows('angles', angles, {
            atomA: {
                type: 'text',
                get: a => a.labelA,
            },
            atomB: {
                type: 'text',
                get: a => a.labelB,
            },
            atomC: {
                type: 'text',
                get: a => a.labelC,
            },
            angle: {
                type: 'number',
                get: a => a.angle,
            },
        });

        const groups = {};

        for (const a of angles) {
            const key = [a.elA, a.elB, a.elC].join('–');

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

        for (const [key, vals] of Object.entries(groups)) {
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

    // --- Dihedral single-result box ---
    renderDihedral(container, angle, atoms) {
        if (angle === null || atoms.length < 4) {
            container.innerHTML = '';
            return;
        }

        const labels = atoms.map(a => a.label).join(' – ');

        container.innerHTML = `
            <div class="result-box">
                <div style="margin-bottom:4px;color:var(--text-muted);font-size:12px">${labels}</div>
                <div>Dihedral angle: <span class="result-value">${angle.toFixed(3)}°</span></div>
            </div>`;
    },

    // --- Markdown export ---
    toMarkdown(data) {
        const {
            parsed,
            bonds = [],
            angles = [],

            manualDistances = [],
            manualAngles = [],
            manualDihedrals = [],

            savedPlanes = [],
            activePlaneId = null,
            savedPlaneDistances = [],
            savedPlaneAngles = [],

            dihedralAtoms = [],
            dihedralAngle = null,

            excludedAtoms = new Set(),
            activeElements = new Set(),
            tolerancePct = null,
            atomIndexStart = 0,
        } = data;

        const lines = [];
        const { formula, fw, natoms, elCount, massFractions, atoms = [], comment } = parsed;

        const atomMap = new Map(atoms.map(atom => [Number(atom.index), atom]));

        const getAtom = idx => atomMap.get(Number(idx)) || null;

        const getPlane = id =>
            savedPlanes.find(plane => String(plane.id) === String(id)) || null;

        const mdCell = value => String(value ?? '')
            .replace(/\|/g, '\\|')
            .replace(/\r?\n/g, ' ');

        const atomLabel = idx => {
            const atom = getAtom(idx);
            return atom ? atom.label : String(idx);
        };

        const planeAtoms = plane => {
            if (!plane || !plane.atomIndices) return [];

            return plane.atomIndices
                .map(idx => getAtom(idx))
                .filter(Boolean);
        };

        const isPlaneInvalid = plane => {
            if (!plane || !plane.atomIndices) return true;

            return plane.atomIndices.some(idx => excludedAtoms.has(Number(idx)));
        };

        const distanceAtomToPlane = (atom, planeResult) => {
            const { normal, centroid } = planeResult;

            return (
                normal.x * (atom.x - centroid.x) +
                normal.y * (atom.y - centroid.y) +
                normal.z * (atom.z - centroid.z)
            );
        };

        lines.push(`# xyz2tab — ${formula}`);
        lines.push('');

        // --- Molecular information ---
        lines.push('## Molecular Information');
        lines.push('');

        if (comment) {
            lines.push(`**Comment:** ${mdCell(comment)}`);
            lines.push('');
        }

        lines.push(`**Formula:** ${mdCell(formula)}  `);
        lines.push(`**Formula weight:** ${fw.toFixed(3)} g/mol  `);
        lines.push(`**Atoms:** ${natoms}`);
        lines.push('');

        lines.push('| Element | Count | At. weight | Mass fraction % |');
        lines.push('|---------|-------|------------|-----------------|');

        const els = Object.keys(elCount).sort((a, b) => {
            if (a === 'C') return -1;
            if (b === 'C') return 1;
            if (a === 'H') return -1;
            if (b === 'H') return 1;
            return a.localeCompare(b);
        });

        for (const el of els) {
            const aw = Parser.atomicWeights[el] || 0;
            lines.push(`| ${mdCell(el)} | ${elCount[el]} | ${aw.toFixed(3)} | ${(massFractions[el] || 0).toFixed(2)} |`);
        }

        lines.push('');

        // --- Settings / filters ---
        lines.push('## Settings');
        lines.push('');

        lines.push(`**Covalent radius tolerance:** ${tolerancePct !== null ? tolerancePct.toFixed(1) + ' %' : 'n/a'}  `);
        lines.push(`**Atom label index:** from ${atomIndexStart}  `);

        if (activeElements && activeElements.size > 0) {
            lines.push(`**Active elements:** ${[...activeElements].sort().join(', ')}  `);
        }

        if (excludedAtoms && excludedAtoms.size > 0) {
            const excludedLabels = [...excludedAtoms]
                .map(idx => atomLabel(idx))
                .join(', ');

            lines.push(`**Excluded atoms:** ${excludedLabels}`);
        } else {
            lines.push('**Excluded atoms:** none');
        }

        lines.push('');

        // --- Manual distances ---
        if (manualDistances.length > 0) {
            lines.push('## Manual Distances');
            lines.push('');
            lines.push('| # | Atoms | Distance (Å) |');
            lines.push('|---|-------|--------------|');

            manualDistances.forEach((m, i) => {
                const selectedAtoms = (m.atoms || [])
                    .map(idx => getAtom(idx))
                    .filter(Boolean);

                if (selectedAtoms.length !== 2) return;

                const d = Chem.distance(selectedAtoms[0], selectedAtoms[1]);

                lines.push(`| ${i + 1} | ${selectedAtoms.map(a => a.label).join('–')} | ${d.toFixed(4)} |`);
            });

            lines.push('');
        }

        // --- Bond lengths ---
        if (bonds.length > 0) {
            lines.push('## Bond Lengths');
            lines.push('');
            lines.push('| # | Atom 1 | Atom 2 | Distance (Å) | Source |');
            lines.push('|---|--------|--------|--------------|--------|');

            bonds.forEach((b, i) => {
                lines.push(`| ${i + 1} | ${mdCell(b.labelI)} | ${mdCell(b.labelJ)} | ${b.dist.toFixed(4)} | ${b.manual ? 'manual' : 'auto'} |`);
            });

            lines.push('');

            // Bond summary by element pair
            const bondGroups = {};

            for (const b of bonds) {
                const key = [b.elI, b.elJ].sort().join('–');

                if (!bondGroups[key]) {
                    bondGroups[key] = [];
                }

                bondGroups[key].push(b.dist);
            }

            lines.push('### Bond Summary');
            lines.push('');
            lines.push('| Bond | Count | Min (Å) | Max (Å) | Mean (Å) | Std dev (Å) |');
            lines.push('|------|-------|---------|---------|----------|-------------|');

            for (const [key, values] of Object.entries(bondGroups)) {
                const s = Chem.stats(values);

                lines.push(`| ${mdCell(key)} | ${s.n} | ${s.min.toFixed(4)} | ${s.max.toFixed(4)} | ${s.mean.toFixed(4)} | ${s.std.toFixed(4)} |`);
            }

            lines.push('');
        }

        // --- Manual angles ---
        if (manualAngles.length > 0) {
            lines.push('## Manual Angles');
            lines.push('');
            lines.push('| # | Atoms | Angle (°) |');
            lines.push('|---|-------|-----------|');

            manualAngles.forEach((m, i) => {
                const selectedAtoms = (m.atoms || [])
                    .map(idx => getAtom(idx))
                    .filter(Boolean);

                if (selectedAtoms.length !== 3) return;

                const angle = Chem.calcAngle(
                    selectedAtoms[0],
                    selectedAtoms[1],
                    selectedAtoms[2]
                );

                lines.push(`| ${i + 1} | ${selectedAtoms.map(a => a.label).join('–')} | ${angle.toFixed(3)} |`);
            });

            lines.push('');
        }

        // --- Automatic bond angles ---
        if (angles.length > 0) {
            lines.push('## Bond Angles');
            lines.push('');
            lines.push('| # | Atom A | Atom B | Atom C | Angle (°) |');
            lines.push('|---|--------|--------|--------|-----------|');

            angles.forEach((a, i) => {
                lines.push(`| ${i + 1} | ${mdCell(a.labelA)} | ${mdCell(a.labelB)} | ${mdCell(a.labelC)} | ${a.angle.toFixed(3)} |`);
            });

            lines.push('');

            // Angle summary by element sequence
            const angleGroups = {};

            for (const a of angles) {
                const key = [a.elA, a.elB, a.elC].join('–');

                if (!angleGroups[key]) angleGroups[key] = [];
                angleGroups[key].push(a.angle);
            }

            lines.push('### Angle Summary');
            lines.push('');
            lines.push('| Angle type | Count | Min (°) | Max (°) | Mean (°) | Std dev (°) |');
            lines.push('|------------|-------|---------|---------|----------|-------------|');

            for (const [key, values] of Object.entries(angleGroups)) {
                const s = Chem.stats(values);

                lines.push(`| ${mdCell(key)} | ${s.n} | ${s.min.toFixed(3)} | ${s.max.toFixed(3)} | ${s.mean.toFixed(3)} | ${s.std.toFixed(3)} |`);
            }

            lines.push('');
        }

        // --- Manual dihedrals ---
        if (manualDihedrals.length > 0) {
            lines.push('## Manual Dihedrals');
            lines.push('');
            lines.push('| # | Atoms | Dihedral (°) |');
            lines.push('|---|-------|--------------|');

            manualDihedrals.forEach((m, i) => {
                const selectedAtoms = (m.atoms || [])
                    .map(idx => getAtom(idx))
                    .filter(Boolean);

                if (selectedAtoms.length !== 4) return;

                const angle = Chem.calcDihedral(...selectedAtoms);

                lines.push(`| ${i + 1} | ${selectedAtoms.map(a => a.label).join('–')} | ${angle.toFixed(3)} |`);
            });

            lines.push('');
        }

        // --- Current dihedral result, only if not already saved as manual dihedral ---
        if (
            manualDihedrals.length === 0 &&
            dihedralAngle !== null &&
            dihedralAtoms &&
            dihedralAtoms.length === 4
        ) {
            lines.push('## Current Dihedral Result');
            lines.push('');
            lines.push(`**Atoms:** ${dihedralAtoms.map(a => a.label).join(' – ')}  `);
            lines.push(`**Dihedral:** ${dihedralAngle.toFixed(3)}°`);
            lines.push('');
        }

        // --- Saved planes ---
        if (savedPlanes.length > 0) {
            lines.push('## Saved Planes');
            lines.push('');

            lines.push('| # | Active | Name | Atoms | n | RMSD (Å) | Normal vector | Status |');
            lines.push('|---|--------|------|-------|---|----------|---------------|--------|');

            savedPlanes.forEach((plane, i) => {
                const atomsForPlane = planeAtoms(plane);
                const normal = plane.result.normal;
                const active = String(plane.id) === String(activePlaneId) ? 'yes' : '';
                const invalid = isPlaneInvalid(plane);

                const excludedLabels = atomsForPlane
                    .filter(atom => excludedAtoms.has(atom.index))
                    .map(atom => atom.label);

                const status = invalid
                    ? (excludedLabels.length ? `invalid: excluded ${excludedLabels.join(', ')}` : 'invalid')
                    : 'valid';

                lines.push(
                    `| ${i + 1} | ${active} | ${mdCell(plane.name)} | ${mdCell(atomsForPlane.map(a => a.label).join(', '))} | ${atomsForPlane.length} | ${plane.result.rmsd.toFixed(4)} | (${normal.x.toFixed(4)}, ${normal.y.toFixed(4)}, ${normal.z.toFixed(4)}) | ${mdCell(status)} |`
                );
            });

            lines.push('');

            for (const plane of savedPlanes) {
                const atomsForPlane = planeAtoms(plane);

                if (!plane.result || atomsForPlane.length < 3) continue;

                lines.push(`### ${plane.name} — defining atom distances`);
                lines.push('');
                lines.push('| Atom | Distance to plane (Å) |');
                lines.push('|------|-----------------------|');

                atomsForPlane.forEach(atom => {
                    const d = distanceAtomToPlane(atom, plane.result);
                    lines.push(`| ${atom.label} | ${d.toFixed(4)} |`);
                });

                lines.push('');
            }
        }

        // --- Saved plane distances ---
        if (savedPlaneDistances.length > 0) {
            lines.push('## Saved Plane Distances');
            lines.push('');

            lines.push('| # | Plane | Atom | Distance (Å) | Status |');
            lines.push('|---|-------|------|--------------|--------|');

            savedPlaneDistances.forEach((m, i) => {
                const plane = getPlane(m.planeId);
                const atom = getAtom(m.atomIndex);

                const planeInvalid = plane ? isPlaneInvalid(plane) : true;
                const atomExcluded = atom ? excludedAtoms.has(atom.index) : true;

                let status = 'valid';

                if (!plane) {
                    status = 'invalid: plane removed';
                } else if (!atom) {
                    status = 'invalid: atom missing';
                } else if (planeInvalid && atomExcluded) {
                    status = 'invalid: plane and atom excluded';
                } else if (planeInvalid) {
                    status = 'invalid: plane';
                } else if (atomExcluded) {
                    status = 'invalid: atom excluded';
                }

                lines.push(`| ${i + 1} | ${mdCell(plane ? plane.name : '(removed)')} | ${mdCell(atom ? atom.label : m.atomIndex)} | ${m.distance.toFixed(4)} | ${mdCell(status)} |`);
            });

            lines.push('');
        }

        // --- Saved plane angles ---
        if (savedPlaneAngles.length > 0) {
            lines.push('## Saved Plane Angles');
            lines.push('');

            lines.push('| # | Plane A | Plane B | Angle (°) | Status |');
            lines.push('|---|---------|---------|-----------|--------|');

            savedPlaneAngles.forEach((m, i) => {
                const planeA = getPlane(m.planeAId);
                const planeB = getPlane(m.planeBId);

                const planeAInvalid = planeA ? isPlaneInvalid(planeA) : true;
                const planeBInvalid = planeB ? isPlaneInvalid(planeB) : true;

                let status = 'valid';

                if (!planeA || !planeB) {
                    status = 'invalid: plane removed';
                } else if (planeAInvalid && planeBInvalid) {
                    status = 'invalid: both planes';
                } else if (planeAInvalid) {
                    status = `invalid: ${planeA.name}`;
                } else if (planeBInvalid) {
                    status = `invalid: ${planeB.name}`;
                }

                lines.push(`| ${i + 1} | ${mdCell(planeA ? planeA.name : '(removed)')} | ${mdCell(planeB ? planeB.name : '(removed)')} | ${m.angle.toFixed(3)} | ${mdCell(status)} |`);
            });

            lines.push('');
        }

        return lines.join('\n');
    },
};