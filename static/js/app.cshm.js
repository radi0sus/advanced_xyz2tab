// app.cshm.js — saved Continuous Shape Measure (CShM) system
//
// Any atom can be a "central atom" — not just metals. CN (coordination
// number) is simply the number of atoms currently bonded to it in
// `this.filteredBonds` (auto-detected + manual bonds, with excluded atoms
// and hidden/inactive elements already taken out — the same bond set the
// bond/angle tables and the viewer use). CShM is defined for CN 2–6 (see
// cshm.js), so anything outside that range is not eligible.

Object.assign(App, {

    // --- Neighbor lookup (shared by preview + save + validity) ---

    // Returns { neighbors: [atom, ...], cn } for the atoms currently bonded
    // to `atom` according to this.filteredBonds (respects both atom
    // exclusion and the active-element filter). Neighbor order is stable
    // (sorted by index) but otherwise irrelevant — calcCShM tries all
    // permutations anyway.
    _getCShMNeighborInfo(atom) {
        if (!atom) return null;

        const idx = Number(atom.index);
        const neighborIdx = new Set();

        (this.filteredBonds || []).forEach(bond => {
            if (Number(bond.i) === idx) neighborIdx.add(Number(bond.j));
            else if (Number(bond.j) === idx) neighborIdx.add(Number(bond.i));
        });

        const neighbors = [...neighborIdx]
            .map(i => this._getAtomByIndex(i))
            .filter(Boolean)
            .sort((a, b) => a.index - b.index);

        return { neighbors, cn: neighbors.length };
    },

    _rankCShMResults(results) {
        return Object.entries(results)
            .map(([label, cshm]) => ({
                label,
                name: CShM.IDEAL_SHAPES[label] ? CShM.IDEAL_SHAPES[label].name : label,
                cshm,
            }))
            .sort((a, b) => a.cshm - b.cshm);
    },

    // Green/orange/red rating for a CShM S value. Thresholds follow common
    // literature practice (e.g. Alvarez et al.): below ~3 the closest shape
    // is a reliable assignment, up to ~15 it's still informative despite
    // real distortion, and above that the "closest" label stops being
    // meaningful (several shapes may fit similarly badly).
    _cshmRatingClass(s) {
        if (!Number.isFinite(s)) return '';
        if (s < 3) return 'cshm-rating-good';
        if (s < 15) return 'cshm-rating-medium';
        return 'cshm-rating-poor';
    },

    // --- Saved-CShM helpers ---

    _getCShMById(id) {
        return this.savedCShM.find(entry => String(entry.id) === String(id)) || null;
    },

    // A saved CShM result becomes invalid if the central atom or any of the
    // originally bonded neighbor atoms is excluded/hidden, OR if the set of
    // atoms currently bonded to the central atom no longer matches the set
    // that was used at save time (tolerance change, manual bond added or
    // removed, exclusion, ...). This mirrors _isRingInvalid's two-level
    // check (atom availability + live connectivity).
    _isCShMInvalid(entry) {
        if (!entry) return true;

        if (this._isAtomUnavailable(entry.centralAtomIndex)) return true;
        if (entry.ligandIndices.some(idx => this._isAtomUnavailable(idx))) return true;

        const central = this._getAtomByIndex(entry.centralAtomIndex);
        if (!central) return true;

        const info = this._getCShMNeighborInfo(central);
        const currentKey = info.neighbors.map(a => a.index).sort((a, b) => a - b).join(',');
        const savedKey = entry.ligandIndices.slice().sort((a, b) => a - b).join(',');

        return currentKey !== savedKey;
    },

    _cshmInvalidDetails(entry) {
        const allIdx = [entry.centralAtomIndex, ...entry.ligandIndices];

        const unavailableAtomLabels = allIdx
            .map(idx => this._unavailableAtomInfo(idx))
            .filter(Boolean)
            .map(info => `${info.label} (${info.reason})`);

        let connectivityChanged = false;

        const central = this._getAtomByIndex(entry.centralAtomIndex);
        if (central) {
            const info = this._getCShMNeighborInfo(central);
            const currentKey = info.neighbors.map(a => a.index).sort((a, b) => a - b).join(',');
            const savedKey = entry.ligandIndices.slice().sort((a, b) => a - b).join(',');
            connectivityChanged = currentKey !== savedKey;
        }

        return { unavailableAtomLabels, connectivityChanged };
    },

    // --- Saved-CShM actions ---

    // Uses the current central selection (must be exactly 1 atom with a
    // CN of 2–6). Returns the created entry, or null if not applicable.
    saveSelectedCShM() {
        const atoms = this._getSelectedAtoms();
        if (atoms.length !== 1) return null;

        const central = atoms[0];
        const info = this._getCShMNeighborInfo(central);

        if (!info || info.cn < 2 || info.cn > 6) {
            this._showSelectionOutput(`
                <div class="selection-output-title">CShM</div>
                <div style="color:var(--text-soft);font-size:12px">
                    CShM needs 2–6 bonded neighbors on the selected atom
                    (found ${info ? info.cn : 0} for ${central.label}).
                </div>
            `);
            return null;
        }

        const results = CShM.calcCShM(central, info.neighbors);
        const ranked = this._rankCShMResults(results);
        if (!ranked.length) return null;

        const volume = (typeof CShM.calcPolyhedralVolume === 'function')
            ? CShM.calcPolyhedralVolume(central, info.neighbors)
            : null;

        const tau = (typeof CShM.calcTauIndices === 'function')
            ? CShM.calcTauIndices(central, info.neighbors)
            : null;

        const number = this._nextCShMId;
        this._nextCShMId += 1;

        const entry = {
            id: `cshm_${number}`,
            name: `CShM ${number}`,
            centralAtomIndex: central.index,
            ligandIndices: info.neighbors.map(a => a.index),
            cn: info.cn,
            ranked,
            volume,
            tau,
        };

        this.savedCShM.push(entry);

        this._renderCShMAnalysis();

        this._showSelectionOutput(this._renderCShMSummaryHtml(ranked, info, central, volume, tau));

        this._finishSelectionAction();

        return entry;
    },

    removeSavedCShM(id) {
        this.savedCShM = this.savedCShM.filter(entry => String(entry.id) !== String(id));

        if (String(this.activeCShMDetailsId) === String(id)) {
            this.activeCShMDetailsId = null;
        }

        this._renderCShMAnalysis();
    },

    toggleCShMDetails(id) {
        if (String(this.activeCShMDetailsId) === String(id)) {
            this.activeCShMDetailsId = null;
        } else {
            this.activeCShMDetailsId = id;
        }

        this._renderCShMAnalysis();
    },

    _renderTauHtml(tau) {
        if (!tau) return '';

        if (Number.isFinite(tau.tau4)) {
            return `
                <div style="margin-top:2px">
                    τ₄ = <span class="result-value">${tau.tau4.toFixed(2)}</span>
                    &nbsp;&nbsp;
                    τ₄' = <span class="result-value">${tau.tau4Prime.toFixed(2)}</span>
                </div>
            `;
        }

        if (Number.isFinite(tau.tau5)) {
            return `
                <div style="margin-top:2px">
                    τ₅ = <span class="result-value">${tau.tau5.toFixed(2)}</span>
                </div>
            `;
        }

        return '';
    },

    // Small HTML summary used both for the live single-atom selection
    // preview and the output shown right after "Save CShM".
    _renderCShMSummaryHtml(ranked, info, atom, volume, tau) {
        if (!ranked || !ranked.length) return '';

        const best = ranked[0];
        const neighborLabels = info.neighbors.map(a => a.label).join(', ');

        let html = `
            <div class="selection-output-title">CShM${atom ? `: ${atom.label}` : ''}</div>
            <div style="margin-bottom:3px;color:var(--text-muted)">
                CN = ${info.cn} (${neighborLabels})
            </div>
            ${this._renderTauHtml(tau)}
            <div>
                Closest shape:
                <span class="result-value">${best.name} (${best.label})</span>
                — S = <span class="${this._cshmRatingClass(best.cshm)}">${best.cshm.toFixed(3)}</span>
            </div>
        `;

        if (Number.isFinite(volume)) {
            html += `
                <div style="margin-top:2px">
                    Polyhedral volume: <span class="result-value">${volume.toFixed(4)} Å³</span>
                </div>
            `;
        }

        if (ranked.length > 1) {
            html += `
                <div style="margin-top:4px;color:var(--text-muted);font-size:12px">
                    Next: ${ranked.slice(1, 3).map(r => `${r.name} (${r.cshm.toFixed(3)})`).join(', ')}
                </div>
            `;
        }

        return html;
    },

    // --- CShM tab rendering ---

    _renderCShMAnalysis() {
        this._renderSavedCShMTable();
        this._renderSavedCShMDetails();
    },

    _renderSavedCShMTable() {
        const container = document.getElementById('saved-cshm-wrap');
        if (!container) return;

        this._selectedCShMRow = null;

        if (!this.savedCShM.length) {
            container.innerHTML = `
                <div class="result-box">
                    No saved CShM results yet. Select a single atom with
                    2–6 bonded neighbors and click <b>Save CShM</b>.
                </div>
            `;
            return;
        }

        let html = `
            <div class="table-label">Saved CShM results (${this.savedCShM.length})</div>
            <table class="data-table">
                <thead>
                    <tr>
                        <th>#</th>
                        <th>Name</th>
                        <th>Central atom</th>
                        <th>CN</th>
                        <th>Neighbors</th>
                        <th>Closest shape</th>
                        <th>S</th>
                        <th>V /Å³</th>
                        <th>Status</th>
                        <th>Action</th>
                    </tr>
                </thead>
                <tbody>
        `;

        this.savedCShM.forEach((entry, idx) => {
            const central = this._getAtomByIndex(entry.centralAtomIndex);
            const neighbors = entry.ligandIndices.map(i => this._getAtomByIndex(i)).filter(Boolean);
            const invalid = this._isCShMInvalid(entry);
            const best = entry.ranked[0];

            let status = 'valid';

            if (invalid) {
                const { unavailableAtomLabels, connectivityChanged } = this._cshmInvalidDetails(entry);
                const reasons = [];

                if (unavailableAtomLabels.length) {
                    reasons.push(unavailableAtomLabels.join(', '));
                }

                if (connectivityChanged) {
                    reasons.push('bonded neighbors changed');
                }

                status = reasons.length ? `invalid: ${reasons.join('; ')}` : 'invalid';
            }

            const allIdx = [entry.centralAtomIndex, ...entry.ligandIndices];

            html += `
                <tr class="${invalid ? 'inactive' : ''}" data-id="${entry.id}" data-atoms="${allIdx.join(',')}">
                    <td>${idx + 1}</td>
                    <td>${entry.name}</td>
                    <td>${central ? central.label : '(removed)'}</td>
                    <td>${entry.cn}</td>
                    <td>${neighbors.map(a => a.label).join(', ')}</td>
                    <td>${best.name} (${best.label})</td>
                    <td><span class="${this._cshmRatingClass(best.cshm)}">${best.cshm.toFixed(3)}</span></td>
                    <td>${Number.isFinite(entry.volume) ? entry.volume.toFixed(4) : '—'}</td>
                    <td>${status}</td>
                    <td>
                        <button
                            class="btn-small cshm-details"
                            data-id="${entry.id}"
                        >
                            ${String(this.activeCShMDetailsId) === String(entry.id) ? 'hide details' : 'details'}
                        </button>
                        <button
                            class="btn-small btn-danger cshm-remove"
                            data-id="${entry.id}"
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

        container.querySelectorAll('tr[data-atoms]').forEach(row => {
            row.addEventListener('click', () => {
                const atomIndices = row.dataset.atoms
                    .split(',')
                    .filter(Boolean)
                    .map(Number);

                this._selectedCShMRow = Tables._selectRow(
                    row,
                    this._selectedCShMRow,
                    sel => {
                        this._setHighlightedAtoms(sel ? new Set(atomIndices) : new Set());
                    },
                    row
                );
            });
        });

        container.querySelectorAll('.cshm-details').forEach(btn => {
            btn.addEventListener('click', e => {
                e.stopPropagation();
                this.toggleCShMDetails(btn.dataset.id);
            });
        });

        container.querySelectorAll('.cshm-remove').forEach(btn => {
            btn.addEventListener('click', e => {
                e.stopPropagation();
                this.removeSavedCShM(btn.dataset.id);
            });
        });
    },

    _renderSavedCShMDetails() {
        const container = document.getElementById('saved-cshm-details-wrap');
        if (!container) return;

        if (!this.activeCShMDetailsId) {
            container.innerHTML = '';
            return;
        }

        const entry = this._getCShMById(this.activeCShMDetailsId);

        if (!entry) {
            container.innerHTML = '';
            this.activeCShMDetailsId = null;
            return;
        }

        const central = this._getAtomByIndex(entry.centralAtomIndex);
        const neighbors = entry.ligandIndices.map(i => this._getAtomByIndex(i)).filter(Boolean);
        const invalid = this._isCShMInvalid(entry);
        const invalidDetails = invalid ? this._cshmInvalidDetails(entry) : null;
        const best = entry.ranked[0];

        let html = `
            <div class="table-label">CShM details — ${entry.name}</div>
            <div class="result-box" style="margin-bottom:10px">
                <div>
                    <b>Status:</b> ${invalid ? 'invalid' : 'valid'}
                </div>
                ${invalidDetails && invalidDetails.unavailableAtomLabels.length ? `
                    <div style="margin-top:4px;color:var(--text-soft);font-size:12px">
                        Unavailable atom(s): ${invalidDetails.unavailableAtomLabels.join(', ')}
                    </div>
                ` : ''}
                ${invalidDetails && invalidDetails.connectivityChanged ? `
                    <div style="margin-top:4px;color:var(--text-soft);font-size:12px">
                        The bonded neighbors of ${central ? central.label : 'the central atom'}
                        have changed since this result was saved (bond
                        tolerance, a manual bond, or an exclusion changed).
                    </div>
                ` : ''}
                <div style="margin-top:4px;color:var(--text-muted)">
                    Central atom: ${central ? central.label : '(removed)'}
                </div>
                <div style="margin-top:4px;color:var(--text-muted)">
                    CN = ${entry.cn}: ${neighbors.map(a => a.label).join(', ')}
                </div>
                ${this._renderTauHtml(entry.tau)}
                <div style="margin-top:4px;color:var(--text-muted)">
                    Closest shape: <b>${best.name} (${best.label})</b>, S = <span class="${this._cshmRatingClass(best.cshm)}">${best.cshm.toFixed(3)}</span>
                </div>
                ${Number.isFinite(entry.volume) ? `
                    <div style="margin-top:4px;color:var(--text-muted)">
                        Polyhedral volume: <b>${entry.volume.toFixed(4)} Å³</b>
                    </div>
                ` : ''}
            </div>
        `;

        html += `
            <table class="data-table">
                <thead>
                    <tr>
                        <th>Shape</th>
                        <th>Symbol</th>
                        <th>S (CShM)</th>
                    </tr>
                </thead>
                <tbody>
        `;

        entry.ranked.forEach(r => {
            const isBest = r.label === best.label;
            const ratingClass = this._cshmRatingClass(r.cshm);

            html += `
                <tr${isBest ? ' style="font-weight:600"' : ''}>
                    <td>${r.name}${isBest ? ' ←' : ''}</td>
                    <td>${r.label}</td>
                    <td><span class="${ratingClass}">${r.cshm.toFixed(3)}</span></td>
                </tr>
            `;
        });

        html += `
                </tbody>
            </table>
        `;

        container.innerHTML = html;
    },
});
