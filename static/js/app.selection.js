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

        // New saved-plane workflow.
        // The methods are implemented in app.geometry.js in the next step.
        bind('btn-save-current-plane', () => {
            if (typeof this.saveCurrentPlane === 'function') {
                this.saveCurrentPlane();
            }
        });

        bind('btn-save-plane-distance', () => {
            if (typeof this.saveDistancesToActivePlane === 'function') {
                this.saveDistancesToActivePlane();
            }
        });

        // Legacy buttons, if still present in older HTML.
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

    _finishSelectionAction(options = {}) {
        const preserveOutput = options.preserveOutput === true;

        this.selection = [];

        if (preserveOutput) {
            this._setHighlightedAtoms(new Set());
            this._renderSelectionToolbar();
            return;
        }

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

        const hasSaveCurrentPlane =
            typeof this.saveCurrentPlane === 'function';

        const hasSaveDistancesToActivePlane =
            typeof this.saveDistancesToActivePlane === 'function';

        const activePlane = typeof this._getActivePlane === 'function'
            ? this._getActivePlane()
            : null;

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

        // New plane workflow.
        // Save current plane needs at least 3 selected atoms and a geometry implementation.
        setDisabled(
            'btn-save-current-plane',
            n < 3 || !hasSaveCurrentPlane
        );

        // Save distance to active plane needs at least 1 atom, an active plane,
        // and a geometry implementation.
        setDisabled(
            'btn-save-plane-distance',
            n < 1 || !activePlane || !hasSaveDistancesToActivePlane
        );

        // Legacy buttons, if present.
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

        const activePlane = typeof this._getActivePlane === 'function'
            ? this._getActivePlane()
            : null;

        if (atoms.length === 1) {
            const a = atoms[0];

            let html = `
                <div class="selection-output-title">Current selection</div>
                <div>Selected atom: <span class="result-value">${a.label}</span></div>
            `;

            if (activePlane && typeof this._distanceAtomToPlane === 'function') {
                const d = this._distanceAtomToPlane(a, activePlane.result);

                html += `
                    <table style="margin-top:6px">
                        <tbody>
                            <tr>
                                <td>Distance to active plane</td>
                                <td>${activePlane.name}</td>
                                <td>${d.toFixed(4)} Å</td>
                            </tr>
                        </tbody>
                    </table>
                `;
            }

            this._showSelectionOutput(html);
            return;
        }

        if (atoms.length === 2) {
            const d = Chem.distance(atoms[0], atoms[1]);

            let html = `
                <div class="selection-output-title">Distance preview</div>
                <div style="margin-bottom:3px;color:var(--text-muted)">
                    ${atoms[0].label}–${atoms[1].label}
                </div>
                <div>
                    Distance:
                    <span class="result-value">${d.toFixed(4)} Å</span>
                </div>
            `;

            if (
                activePlane &&
                typeof this._renderPlaneDistancePreviewTable === 'function'
            ) {
                html += this._renderPlaneDistancePreviewTable(atoms, activePlane);
            }

            this._showSelectionOutput(html);
            return;
        }

        if (atoms.length === 3) {
            const angle = Chem.calcAngle(atoms[0], atoms[1], atoms[2]);
            const plane = Chem.calcPlane(atoms);

            let html = `
                <div class="selection-output-title">Angle / plane preview</div>
                <div style="margin-bottom:3px;color:var(--text-muted)">
                    ${atoms.map(a => a.label).join('–')}
                </div>
                <div>
                    Angle:
                    <span class="result-value">${angle.toFixed(3)}°</span>
                </div>
                ${plane ? `<div style="margin-top:4px;color:var(--text-muted)">Plane RMSD: ${plane.rmsd.toFixed(4)} Å</div>` : ''}
            `;

            if (plane && activePlane) {
                const planeAngle = Chem.angleBetweenPlanes(activePlane.result, plane);

                html += `
                    <div style="margin-top:4px;color:var(--text-muted)">
                        Angle to active plane ${activePlane.name}:
                        <span class="result-value">${planeAngle.toFixed(3)}°</span>
                    </div>
                `;
            }

            this._showSelectionOutput(html);
            return;
        }

        if (atoms.length === 4) {
            const angle = Chem.calcDihedral(...atoms);
            const plane = Chem.calcPlane(atoms);

            let html = `
                <div class="selection-output-title">Dihedral / plane preview</div>
                <div style="margin-bottom:3px;color:var(--text-muted)">
                    ${atoms.map(a => a.label).join('–')}
                </div>
                <div>
                    Dihedral:
                    <span class="result-value">${angle.toFixed(3)}°</span>
                </div>
                ${plane ? `<div style="margin-top:4px;color:var(--text-muted)">Plane RMSD: ${plane.rmsd.toFixed(4)} Å</div>` : ''}
            `;

            if (plane && activePlane) {
                const planeAngle = Chem.angleBetweenPlanes(activePlane.result, plane);

                html += `
                    <div style="margin-top:4px;color:var(--text-muted)">
                        Angle to active plane ${activePlane.name}:
                        <span class="result-value">${planeAngle.toFixed(3)}°</span>
                    </div>
                `;
            }

            this._showSelectionOutput(html);
            return;
        }

        if (atoms.length >= 5) {
            const plane = Chem.calcPlane(atoms);

            let html = `
                <div class="selection-output-title">Plane preview</div>
                <div style="margin-bottom:3px;color:var(--text-muted)">
                    ${atoms.length} selected atoms
                </div>
                ${plane ? `<div>Plane RMSD: <span class="result-value">${plane.rmsd.toFixed(4)} Å</span></div>` : ''}
            `;

            if (plane && activePlane) {
                const planeAngle = Chem.angleBetweenPlanes(activePlane.result, plane);

                html += `
                    <div style="margin-top:4px;color:var(--text-muted)">
                        Angle to active plane ${activePlane.name}:
                        <span class="result-value">${planeAngle.toFixed(3)}°</span>
                    </div>
                `;
            }

            this._showSelectionOutput(html);
        }
    },
});