// app.selection.js — central atom selection and toolbar preview

Object.assign(App, {

    _bindSelectionToolbar() {
        const bind = (id, fn) => {
            const el = document.getElementById(id);
            if (el) el.addEventListener('click', fn);
        };

        bind('btn-selection-undo', () => this._undoSelection());
        bind('btn-selection-clear', () => this._clearSelection());

        bind('btn-save-distance', () => this.saveSelectedDistance());
        bind('btn-add-bond', () => this.addSelectedBond());
        bind('btn-save-angle', () => this.saveSelectedAngle());
        bind('btn-save-dihedral', () => this.saveSelectedDihedral());

        bind('btn-set-plane1', () => this._setPlaneFromCentralSelection(1));
        bind('btn-set-plane2', () => this._setPlaneFromCentralSelection(2));

        bind('btn-dist-plane1', () => this._measureSelectionToPlane(1));
        bind('btn-dist-plane2', () => this._measureSelectionToPlane(2));
    },

    _toggleCentralSelection(idx) {
        idx = Number(idx);

        if (this.excludedAtoms && this.excludedAtoms.has(idx)) return;

        const pos = this.selection.findIndex(atomIdx => Number(atomIdx) === idx);

        if (pos >= 0) {
            this.selection.splice(pos, 1);
        } else {
            this.selection.push(idx);
        }

        this._syncSelectionHighlight();
    },

    _undoSelection() {
        if (!this.selection.length) return;

        this.selection.pop();
        this._syncSelectionHighlight();
    },

    _clearSelection() {
        this.selection = [];
        this._syncSelectionHighlight();
    },

    _finishSelectionAction() {
        this.selection = [];
        this._syncSelectionHighlight();
    },

    _syncSelectionHighlight() {
        const cleanSelection = this.selection
            .map(idx => Number(idx))
            .filter(idx => !this.excludedAtoms || !this.excludedAtoms.has(idx));

        this.selection = cleanSelection;

        this._setHighlightedAtoms(new Set(cleanSelection));
        this._renderSelectionToolbar();
        this._updateSelectionPreview();
    },

    _getAtomByIndex(idx) {
        if (!this.parsed || !this.parsed.atoms) return null;

        return this.parsed.atoms.find(a => a.index === Number(idx)) || null;
    },

    _getSelectedAtoms() {
        return this.selection
            .map(idx => this._getAtomByIndex(idx))
            .filter(Boolean);
    },

    _renderSelectionToolbar() {
        const chips = document.getElementById('selection-chips');
        if (!chips) return;

        const atoms = this._getSelectedAtoms();

        if (!atoms.length) {
            chips.innerHTML = `<span style="color:var(--text-soft);font-size:12px">No atoms selected</span>`;
        } else {
            chips.innerHTML = atoms.map((atom, i) => `
                <span class="selection-chip">
                    <span class="selection-chip-index">${i + 1}</span>
                    ${atom.label}
                    <span class="selection-chip-remove" data-idx="${atom.index}">×</span>
                </span>
            `).join('');

            chips.querySelectorAll('.selection-chip-remove').forEach(el => {
                el.addEventListener('click', e => {
                    e.stopPropagation();

                    const idx = parseInt(el.dataset.idx, 10);
                    const pos = this.selection.findIndex(atomIdx => Number(atomIdx) === idx);

                    if (pos >= 0) {
                        this.selection.splice(pos, 1);
                        this._syncSelectionHighlight();
                    }
                });
            });
        }

        const n = atoms.length;

        const setDisabled = (id, disabled) => {
            const btn = document.getElementById(id);
            if (btn) btn.disabled = disabled;
        };

        setDisabled('btn-selection-undo', n === 0);
        setDisabled('btn-selection-clear', n === 0);

        setDisabled('btn-save-distance', n !== 2);
        setDisabled('btn-add-bond', n !== 2);

        setDisabled('btn-save-angle', n !== 3);
        setDisabled('btn-save-dihedral', n !== 4);

        setDisabled('btn-set-plane1', n < 3);
        setDisabled('btn-set-plane2', n < 3);

        setDisabled('btn-dist-plane1', n < 1 || !this.plane1Result);
        setDisabled('btn-dist-plane2', n < 1 || !this.plane2Result);
    },

    _showSelectionOutput(html) {
        const out = document.getElementById('selection-output');
        if (!out) return;

        if (!html) {
            out.innerHTML = '';
            out.classList.add('hidden');
            return;
        }

        out.innerHTML = html;
        out.classList.remove('hidden');
    },

    _updateSelectionPreview() {
        const atoms = this._getSelectedAtoms();

        if (!atoms.length) {
            this._showSelectionOutput('');
            return;
        }

        if (atoms.length === 1) {
            const a = atoms[0];

            let html = `
                <div class="selection-output-title">Current selection</div>
                <div>Selected atom: <span class="result-value">${a.label}</span></div>
            `;

            if (this.plane1Result || this.plane2Result) {
                html += '<table style="margin-top:6px"><tbody>';

                if (this.plane1Result) {
                    const d = this._distanceAtomToPlane(a, this.plane1Result);
                    html += `<tr><td>Distance to Plane 1</td><td>${d.toFixed(4)} Å</td></tr>`;
                }

                if (this.plane2Result) {
                    const d = this._distanceAtomToPlane(a, this.plane2Result);
                    html += `<tr><td>Distance to Plane 2</td><td>${d.toFixed(4)} Å</td></tr>`;
                }

                html += '</tbody></table>';
            }

            this._showSelectionOutput(html);
            return;
        }

        if (atoms.length === 2) {
            const d = Chem.distance(atoms[0], atoms[1]);

            this._showSelectionOutput(`
                <div class="selection-output-title">Distance preview</div>
                <div style="margin-bottom:3px;color:var(--text-muted)">
                    ${atoms[0].label}–${atoms[1].label}
                </div>
                <div>
                    Distance:
                    <span class="result-value">${d.toFixed(4)} Å</span>
                </div>
            `);
            return;
        }

        if (atoms.length === 3) {
            const angle = Chem.calcAngle(atoms[0], atoms[1], atoms[2]);
            const plane = Chem.calcPlane(atoms);

            this._showSelectionOutput(`
                <div class="selection-output-title">Angle preview</div>
                <div style="margin-bottom:3px;color:var(--text-muted)">
                    ${atoms.map(a => a.label).join('–')}
                </div>
                <div>
                    Angle:
                    <span class="result-value">${angle.toFixed(3)}°</span>
                </div>
                ${plane ? `<div style="margin-top:4px;color:var(--text-muted)">Plane RMSD: ${plane.rmsd.toFixed(4)} Å</div>` : ''}
            `);
            return;
        }

        if (atoms.length === 4) {
            const angle = Chem.calcDihedral(...atoms);
            const plane = Chem.calcPlane(atoms);

            this._showSelectionOutput(`
                <div class="selection-output-title">Dihedral preview</div>
                <div style="margin-bottom:3px;color:var(--text-muted)">
                    ${atoms.map(a => a.label).join('–')}
                </div>
                <div>
                    Dihedral:
                    <span class="result-value">${angle.toFixed(3)}°</span>
                </div>
                ${plane ? `<div style="margin-top:4px;color:var(--text-muted)">Plane RMSD: ${plane.rmsd.toFixed(4)} Å</div>` : ''}
            `);
            return;
        }

        if (atoms.length >= 5) {
            const plane = Chem.calcPlane(atoms);

            this._showSelectionOutput(`
                <div class="selection-output-title">Plane preview</div>
                <div style="margin-bottom:3px;color:var(--text-muted)">
                    ${atoms.length} selected atoms
                </div>
                ${plane ? `<div>Plane RMSD: <span class="result-value">${plane.rmsd.toFixed(4)} Å</span></div>` : ''}
            `);
        }
    },
});
