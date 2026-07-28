// app.ring.js — saved-ring system (Cremer-Pople puckering analysis)

Object.assign(App, {

    // --- Saved-ring helpers ---

    _getRingById(id) {
        return this.savedRings.find(ring => String(ring.id) === String(id)) || null;
    },

    _getRingAtoms(ring) {
        if (!ring || !ring.atomIndices) return [];

        // Order matters: atomIndices is stored in ring-connectivity order
        // (the order the atoms were selected in), NOT sorted by index.
        return ring.atomIndices
            .map(idx => this._getAtomByIndex(idx))
            .filter(Boolean);
    },

    _isRingInvalid(ring) {
        if (!ring || !ring.atomIndices) return true;

        return ring.atomIndices.some(idx => this.excludedAtoms.has(Number(idx)));
    },

    _ringConformationLabel(result) {
        if (!result || !result.classification) return '—';

        const c = result.classification;
        if (c.symbol === '—') return c.family;
        return c.approximate ? `${c.family} (${c.symbol}, approx.)` : `${c.family} (${c.symbol})`;
    },

    // --- Saved-ring actions ---

    // atoms: optional explicit atom array (ring connectivity order).
    // Falls back to the current central selection.
    // Returns the created ring object, or null if not applicable.
    saveCurrentRing(atoms) {
        atoms = atoms || this._getSelectedAtoms();

        if (atoms.length !== 5 && atoms.length !== 6) return null;

        const result = Chem.calcRingPucker(atoms);
        if (!result) return null;

        const ringNumber = this._nextRingId;
        const id = `ring_${ringNumber}`;

        this._nextRingId += 1;

        const ring = {
            id,
            name: `Ring ${ringNumber}`,
            atomIndices: atoms.map(atom => atom.index),
            result,
        };

        this.savedRings.push(ring);

        this._renderRingAnalysis();

        return ring;
    },

    removeSavedRing(id) {
        this.savedRings = this.savedRings.filter(
            ring => String(ring.id) !== String(id)
        );

        if (String(this.activeRingDetailsId) === String(id)) {
            this.activeRingDetailsId = null;
        }

        this._renderRingAnalysis();
    },

    toggleRingDetails(id) {
        if (String(this.activeRingDetailsId) === String(id)) {
            this.activeRingDetailsId = null;
        } else {
            this.activeRingDetailsId = id;
        }

        this._renderRingAnalysis();
    },

    // Builds a small HTML summary of a ring result, used both for the
    // live selection preview and appended to the "Save current plane/ring"
    // output message.
    _renderRingSummaryHtml(result, atoms) {
        if (!result) return '';

        const label = atoms && atoms.length
            ? atoms.map(a => a.label).join('–')
            : '';

        let html = `
            <div style="margin-top:6px">
                <div style="color:var(--text-muted)">Ring puckering (Cremer-Pople)${label ? `: ${label}` : ''}</div>
                <div>
                    Conformation:
                    <span class="result-value">${this._ringConformationLabel(result)}</span>
                </div>
                <div style="margin-top:2px;color:var(--text-muted)">
                    Q = ${result.Q.toFixed(4)} Å
                    ${result.N === 6 ? `, θ = ${result.theta.toFixed(2)}°` : ''},
                    φ₂ = ${result.phi2.toFixed(2)}°
                </div>
            </div>
        `;

        return html;
    },

    // --- Ring tab rendering ---

    _renderRingAnalysis() {
        this._renderSavedRingsTable();
        this._renderSavedRingDetails();
    },

    _renderSavedRingsTable() {
        const container = document.getElementById('saved-rings-wrap');
        if (!container) return;

        if (!this.savedRings.length) {
            container.innerHTML = `
                <div class="result-box">
                    No saved rings yet. Select 5 or 6 atoms in ring order
                    and click <b>Save current plane/ring</b>.
                </div>
            `;
            return;
        }

        let html = `
            <div class="table-label">Saved rings (${this.savedRings.length})</div>
            <table class="data-table">
                <thead>
                    <tr>
                        <th>#</th>
                        <th>Name</th>
                        <th>Size</th>
                        <th>Atoms</th>
                        <th>Q (Å)</th>
                        <th>θ (°)</th>
                        <th>φ₂ (°)</th>
                        <th>Conformation</th>
                        <th>Status</th>
                        <th>Action</th>
                    </tr>
                </thead>
                <tbody>
        `;

        this.savedRings.forEach((ring, idx) => {
            const atoms = this._getRingAtoms(ring);
            const invalid = this._isRingInvalid(ring);
            const result = ring.result;

            const excludedAtomLabels = atoms
                .filter(atom => this.excludedAtoms.has(atom.index))
                .map(atom => atom.label);

            let status = 'valid';

            if (invalid) {
                status = excludedAtomLabels.length
                    ? `invalid: excluded ${excludedAtomLabels.join(', ')}`
                    : 'invalid';
            }

            html += `
                <tr class="${invalid ? 'inactive' : ''}">
                    <td>${idx + 1}</td>
                    <td>${ring.name}</td>
                    <td>${result.N}</td>
                    <td>${atoms.map(atom => atom.label).join(', ')}</td>
                    <td>${result.Q.toFixed(4)}</td>
                    <td>${result.N === 6 ? result.theta.toFixed(2) : '—'}</td>
                    <td>${result.phi2.toFixed(2)}</td>
                    <td>${this._ringConformationLabel(result)}</td>
                    <td>${status}</td>
                    <td>
                        <button
                            class="btn-small ring-details"
                            data-id="${ring.id}"
                        >
                            ${String(this.activeRingDetailsId) === String(ring.id) ? 'hide details' : 'details'}
                        </button>
                        <button
                            class="btn-small btn-danger ring-remove"
                            data-id="${ring.id}"
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

        container.querySelectorAll('.ring-details').forEach(btn => {
            btn.addEventListener('click', e => {
                e.stopPropagation();
                this.toggleRingDetails(btn.dataset.id);
            });
        });

        container.querySelectorAll('.ring-remove').forEach(btn => {
            btn.addEventListener('click', e => {
                e.stopPropagation();
                this.removeSavedRing(btn.dataset.id);
            });
        });
    },

    _renderSavedRingDetails() {
        const container = document.getElementById('saved-ring-details-wrap');
        if (!container) return;

        if (!this.activeRingDetailsId) {
            container.innerHTML = '';
            return;
        }

        const ring = this._getRingById(this.activeRingDetailsId);

        if (!ring) {
            container.innerHTML = '';
            this.activeRingDetailsId = null;
            return;
        }

        const atoms = this._getRingAtoms(ring);
        const result = ring.result;
        const invalid = this._isRingInvalid(ring);
        const centroid = result.centroid;
        const normal = result.normal;

        let html = `
            <div class="table-label">Ring details — ${ring.name}</div>
            <div class="result-box" style="margin-bottom:10px">
                <div>
                    <b>Status:</b> ${invalid ? 'invalid' : 'valid'}
                </div>
                <div style="margin-top:4px;color:var(--text-muted)">
                    Ring atoms (in order): ${atoms.map(atom => atom.label).join(' – ')}
                </div>
                <div style="margin-top:4px;color:var(--text-muted)">
                    Puckering amplitude Q: ${result.Q.toFixed(4)} Å
                </div>
                ${result.N === 6 ? `
                    <div style="margin-top:4px;color:var(--text-muted)">
                        q₂ = ${result.q2.toFixed(4)} Å,
                        q₃ = ${result.q3.toFixed(4)} Å,
                        θ = ${result.theta.toFixed(2)}°,
                        φ₂ = ${result.phi2.toFixed(2)}°
                    </div>
                ` : `
                    <div style="margin-top:4px;color:var(--text-muted)">
                        q₂ = ${result.q2.toFixed(4)} Å,
                        φ₂ = ${result.phi2.toFixed(2)}°
                    </div>
                `}
                <div style="margin-top:4px;color:var(--text-muted)">
                    Conformation: <b>${this._ringConformationLabel(result)}</b>
                </div>
                <div style="margin-top:4px;color:var(--text-muted)">
                    Mean-plane centroid:
                    (${centroid.x.toFixed(4)}, ${centroid.y.toFixed(4)}, ${centroid.z.toFixed(4)})
                </div>
                <div style="margin-top:4px;color:var(--text-muted)">
                    Mean-plane normal:
                    (${normal.x.toFixed(4)}, ${normal.y.toFixed(4)}, ${normal.z.toFixed(4)})
                </div>
                ${result.classification && result.classification.approximate ? `
                    <div style="margin-top:6px;color:var(--text-soft);font-size:12px">
                        Note: the family (chair / boat / twist-boat / envelope /
                        half-chair) uses equal 45°/60° bands around the canonical
                        Cremer-Pople reference latitudes (the same 0°/45°/90°/135°/180°
                        grid used e.g. in Protti et al., ChemPlusChem 2026, 91,
                        e70192), and is an approximation rather than an exact match
                        to one of the 38 canonical IUPAC forms.
                    </div>
                ` : ''}
            </div>
        `;

        html += `
            <table class="data-table">
                <thead>
                    <tr>
                        <th>Atom</th>
                        <th>Displacement from mean plane z (Å)</th>
                    </tr>
                </thead>
                <tbody>
        `;

        atoms.forEach((atom, i) => {
            const z = result.zDisplacements[i];
            const excluded = this.excludedAtoms.has(atom.index);

            html += `
                <tr class="${excluded ? 'inactive' : ''}">
                    <td>${atom.label}</td>
                    <td>${z !== undefined ? z.toFixed(4) : '—'}</td>
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
