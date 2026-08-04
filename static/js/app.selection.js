// app.selection.js — central atom selection and toolbar preview

Object.assign(App, {

    _bindSelectionToolbar() {
        const bind = (id, fn) => {
            const el = document.getElementById(id);
            if (el) el.addEventListener('click', fn);
        };

        bind('btn-selection-undo', () => this._undoSelection());
        bind('btn-selection-clear', () => this._clearSelection());

        bind('btn-save-cshm', () => this.saveSelectedCShM());
        bind('btn-save-distance', () => this.saveSelectedDistance());
        bind('btn-add-bond', () => this.addSelectedBond());
        bind('btn-save-angle', () => this.saveSelectedAngle());
        bind('btn-save-dihedral', () => this.saveSelectedDihedral());

        bind('btn-save-current-plane', () => {
            const atoms = this._getSelectedAtoms();
            const n = atoms.length;
            const ringEligible = n === 5 || n === 6;

            let ringHtml = '';

            if (ringEligible && typeof this.saveCurrentRing === 'function') {
                const ring = this.saveCurrentRing(atoms);

                if (ring && typeof this._renderRingSummaryHtml === 'function') {
                    ringHtml = this._renderRingSummaryHtml(ring.result);
                } else if (this.lastRingRejection && !this.lastRingRejection.ok) {
                    const missingLabel = this.lastRingRejection.missing
                        .map(([a, b]) => `${a}–${b}`)
                        .join(', ');

                    ringHtml = `
                        <div style="margin-top:6px">
                            <div style="color:var(--text-muted)">Ring puckering (Cremer-Pople)</div>
                            <div style="color:var(--text-soft);font-size:12px">
                                Not a bonded ring — missing bond(s): ${missingLabel}.
                                Select atoms in ring (bond) order, or add the
                                missing bond(s) with "add bond" first.
                            </div>
                        </div>
                    `;
                }
            }

            if (typeof this.saveCurrentPlane === 'function') {
                this.saveCurrentPlane(ringHtml);
            }
        });

        bind('btn-save-plane-distance', () => {
            if (typeof this.saveDistancesToActivePlane === 'function') {
                this.saveDistancesToActivePlane();
            }
        });
    },

    _toggleCentralSelection(idx) {
        idx = Number(idx);

        if (this.excludedAtoms && this.excludedAtoms.has(idx)) return;

        const pos = this.selection.findIndex(atomIdx => Number(atomIdx) === idx);

        if (pos >= 0) {
            this.selection.splice(pos, 1);
        } else {
            this.selection.push(idx);
            this._scrollToAtomIdx = idx;
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

    // An atom is unavailable for geometry analysis (planes, rings, manual
    // distances/angles/dihedrals) if it's either explicitly excluded, or
    // its element is currently hidden via the element filter. Both make the
    // atom unusable the same way, unlike the earlier code which only ever
    // checked `excludedAtoms` and treated a hidden element as still "valid".
    _unavailableAtomInfo(idx) {
        idx = Number(idx);
        const atom = this._getAtomByIndex(idx);

        if (!atom) return { label: `#${idx}`, reason: 'missing' };
        if (this.excludedAtoms.has(idx)) return { label: atom.label, reason: 'excluded' };

        if (this.activeElements && this.activeElements.size > 0 && !this.activeElements.has(atom.element)) {
            return { label: atom.label, reason: 'hidden' };
        }

        return null;
    },

    _isAtomUnavailable(idx) {
        return this._unavailableAtomInfo(idx) !== null;
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

        // Save CShM only makes sense for a single central atom with a
        // CN (bonded-neighbor count) of 2-6 — see app.cshm.js.
        const cshmInfo = (n === 1 && typeof this._getCShMNeighborInfo === 'function')
            ? this._getCShMNeighborInfo(atoms[0])
            : null;

        const cshmEligible = !!cshmInfo && cshmInfo.cn >= 2 && cshmInfo.cn <= 6;

        setDisabled('btn-save-cshm', !(n === 1 && cshmEligible));

        setDisabled('btn-save-distance', n !== 2);
        setDisabled('btn-add-bond', n !== 2);

        setDisabled('btn-save-angle', n !== 3);
        setDisabled('btn-save-dihedral', n !== 4);

        setDisabled(
            'btn-save-current-plane',
            n < 3 || !hasSaveCurrentPlane
        );

        const saveCurrentPlaneBtn = document.getElementById('btn-save-current-plane');
        if (saveCurrentPlaneBtn) {
            saveCurrentPlaneBtn.textContent = (n === 5 || n === 6)
                ? 'Save current plane/ring'
                : 'Save current plane';
        }

        setDisabled(
            'btn-save-plane-distance',
            n < 1 || !activePlane || !hasSaveDistancesToActivePlane
        );
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

            if (typeof this._getCShMNeighborInfo === 'function') {
                const cshmInfo = this._getCShMNeighborInfo(a);

                if (cshmInfo && cshmInfo.cn >= 2 && cshmInfo.cn <= 6 && typeof CShM !== 'undefined') {
                    const results = CShM.calcCShM(a, cshmInfo.neighbors);
                    const ranked = this._rankCShMResults(results);
                    const volume = (typeof CShM.calcPolyhedralVolume === 'function')
                        ? CShM.calcPolyhedralVolume(a, cshmInfo.neighbors)
                        : null;

                    html += this._renderCShMSummaryHtml(ranked, cshmInfo, a, volume);
                } else if (cshmInfo && cshmInfo.cn > 0) {
                    html += `
                        <div style="margin-top:6px">
                            <div style="color:var(--text-muted)">CShM</div>
                            <div style="color:var(--text-soft);font-size:12px">
                                Needs 2–6 bonded neighbors (found ${cshmInfo.cn}) — not eligible.
                            </div>
                        </div>
                    `;
                }
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
            const sizeEligible = atoms.length === 5 || atoms.length === 6;

            const connectivity = sizeEligible && typeof this._checkRingConnectivity === 'function'
                ? this._checkRingConnectivity(atoms)
                : null;

            const ringEligible = sizeEligible && (!connectivity || connectivity.ok);
            const ringResult = ringEligible ? Chem.calcRingPucker(atoms) : null;

            let html = `
                <div class="selection-output-title">
                    ${sizeEligible ? 'Plane / ring preview' : 'Plane preview'}
                </div>
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

            if (ringResult && typeof this._renderRingSummaryHtml === 'function') {
                html += this._renderRingSummaryHtml(ringResult);
            }

            this._showSelectionOutput(html);
        }
    },
});