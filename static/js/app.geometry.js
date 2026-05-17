// app.geometry.js — saved-plane system and dihedral result handling

Object.assign(App, {

    // --- Saved-plane helpers ---

    _newPlaneMeasurementId(prefix) {
        const id = `${prefix}_${this._nextPlaneMeasurementId}`;
        this._nextPlaneMeasurementId += 1;
        return id;
    },

    _getPlaneById(id) {
        return this.savedPlanes.find(plane => String(plane.id) === String(id)) || null;
    },

    _getPlaneAtoms(plane) {
        if (!plane || !plane.atomIndices) return [];

        return plane.atomIndices
            .map(idx => this._getAtomByIndex(idx))
            .filter(Boolean);
    },

    _isPlaneInvalid(plane) {
        if (!plane || !plane.atomIndices) return true;

        return plane.atomIndices.some(idx => this.excludedAtoms.has(Number(idx)));
    },

    _getActivePlane() {
        const plane = this._getPlaneById(this.activePlaneId);

        if (!plane) return null;
        if (this._isPlaneInvalid(plane)) return null;

        return plane;
    },

    _distanceAtomToPlane(atom, planeOrResult) {
        const result = planeOrResult && planeOrResult.result
            ? planeOrResult.result
            : planeOrResult;

        if (!atom || !result) return Number.NaN;

        const { normal, centroid } = result;

        return (
            normal.x * (atom.x - centroid.x) +
            normal.y * (atom.y - centroid.y) +
            normal.z * (atom.z - centroid.z)
        );
    },

    _planeAngleKey(planeAId, planeBId) {
        const a = String(planeAId);
        const b = String(planeBId);

        return a < b ? `${a}__${b}` : `${b}__${a}`;
    },

    _renderPlaneDistancePreviewTable(atoms, plane) {
        if (!plane || !atoms || !atoms.length) return '';

        let html = `
            <table style="margin-top:6px">
                <tbody>
        `;

        for (const atom of atoms) {
            const d = this._distanceAtomToPlane(atom, plane.result);

            html += `
                <tr>
                    <td>${atom.label}</td>
                    <td>${plane.name}</td>
                    <td>${d.toFixed(4)} Å</td>
                </tr>
            `;
        }

        html += `
                </tbody>
            </table>
        `;

        return html;
    },

    // --- Saved-plane actions ---

    saveCurrentPlane() {
        const atoms = this._getSelectedAtoms();

        if (atoms.length < 3) return;

        const result = Chem.calcPlane(atoms);
        if (!result) return;

        const previousActivePlane = this._getActivePlane();

        const planeNumber = this._nextPlaneId;
        const id = `plane_${planeNumber}`;

        this._nextPlaneId += 1;

        const plane = {
            id,
            name: `Plane ${planeNumber}`,
            atomIndices: atoms.map(atom => atom.index),
            result,
        };

        this.savedPlanes.push(plane);

        let angleToPrevious = null;
        let angleWasSaved = false;

        if (previousActivePlane) {
            angleToPrevious = Chem.angleBetweenPlanes(
                previousActivePlane.result,
                plane.result
            );

            const key = this._planeAngleKey(previousActivePlane.id, plane.id);

            const exists = this.savedPlaneAngles.some(
                measurement => measurement.key === key
            );

            if (!exists) {
                this.savedPlaneAngles.push({
                    id: this._newPlaneMeasurementId('pangle'),
                    key,
                    planeAId: previousActivePlane.id,
                    planeBId: plane.id,
                    angle: angleToPrevious,
                });

                angleWasSaved = true;
            }
        }

        this.activePlaneId = plane.id;

        this._renderPlaneManagement();

        this._showSelectionOutput(`
            <div class="selection-output-title">Saved current plane</div>
            <div>
                <span class="result-value">${plane.name}</span>
                saved from ${atoms.length} atoms.
            </div>
            <div style="margin-top:3px;color:var(--text-muted)">
                RMSD: ${result.rmsd.toFixed(4)} Å
            </div>
            ${angleToPrevious !== null ? `
                <div style="margin-top:3px;color:var(--text-muted)">
                    Angle to previous active plane:
                    <span class="result-value">${angleToPrevious.toFixed(3)}°</span>
                    ${angleWasSaved ? '(saved)' : ''}
                </div>
            ` : ''}
        `);

        this._finishSelectionAction({ preserveOutput: true });
    },

    saveDistancesToActivePlane() {
        const atoms = this._getSelectedAtoms();
        if (!atoms.length) return;

        const activePlane = this._getActivePlane();
        if (!activePlane) return;

        for (const atom of atoms) {
            this.savedPlaneDistances.push({
                id: this._newPlaneMeasurementId('pdist'),
                planeId: activePlane.id,
                atomIndex: atom.index,
                distance: this._distanceAtomToPlane(atom, activePlane.result),
            });
        }

        this._renderPlaneManagement();

        this._showSelectionOutput(`
            <div class="selection-output-title">Saved plane distance${atoms.length > 1 ? 's' : ''}</div>
            <div>
                Saved ${atoms.length} atom distance${atoms.length > 1 ? 's' : ''}
                to <span class="result-value">${activePlane.name}</span>.
            </div>
        `);

        this._finishSelectionAction({ preserveOutput: true });
    },

    setActivePlane(id) {
        const plane = this._getPlaneById(id);
        if (!plane) return;
        if (this._isPlaneInvalid(plane)) return;

        this.activePlaneId = plane.id;

        this._renderPlaneManagement();
        this._renderSelectionToolbar();
        this._updateSelectionPreview();
    },

    removeSavedPlane(id) {
        this.savedPlanes = this.savedPlanes.filter(
            plane => String(plane.id) !== String(id)
        );

        this.savedPlaneDistances = this.savedPlaneDistances.filter(
            measurement => String(measurement.planeId) !== String(id)
        );

        this.savedPlaneAngles = this.savedPlaneAngles.filter(
            measurement =>
                String(measurement.planeAId) !== String(id) &&
                String(measurement.planeBId) !== String(id)
        );

        if (String(this.activePlaneId) === String(id)) {
            const nextValidPlane = this.savedPlanes.find(
                plane => !this._isPlaneInvalid(plane)
            );

            this.activePlaneId = nextValidPlane ? nextValidPlane.id : null;
        }

        this._renderPlaneManagement();
        this._renderSelectionToolbar();
        this._updateSelectionPreview();
    },

    removeSavedPlaneDistance(id) {
        this.savedPlaneDistances = this.savedPlaneDistances.filter(
            measurement => String(measurement.id) !== String(id)
        );

        this._renderPlaneManagement();
    },

    saveAngleToActivePlane(otherPlaneId) {
        const activePlane = this._getActivePlane();
        const otherPlane = this._getPlaneById(otherPlaneId);

        if (!activePlane || !otherPlane) return;
        if (String(activePlane.id) === String(otherPlane.id)) return;
        if (this._isPlaneInvalid(otherPlane)) return;

        const key = this._planeAngleKey(activePlane.id, otherPlane.id);

        const exists = this.savedPlaneAngles.some(
            measurement => measurement.key === key
        );

        if (exists) return;

        const angle = Chem.angleBetweenPlanes(
            activePlane.result,
            otherPlane.result
        );

        this.savedPlaneAngles.push({
            id: this._newPlaneMeasurementId('pangle'),
            key,
            planeAId: activePlane.id,
            planeBId: otherPlane.id,
            angle,
        });

        this._renderPlaneManagement();

        this._showSelectionOutput(`
            <div class="selection-output-title">Saved plane angle</div>
            <div>
                ${activePlane.name} / ${otherPlane.name}:
                <span class="result-value">${angle.toFixed(3)}°</span>
            </div>
        `);
    },

    removeSavedPlaneAngle(id) {
        this.savedPlaneAngles = this.savedPlaneAngles.filter(
            measurement => String(measurement.id) !== String(id)
        );

        this._renderPlaneManagement();
    },

    // --- Plane tab rendering ---

    _renderPlaneManagement() {
        this._renderCurrentPlanePreview();
        this._renderSavedPlanesTable();
        this._renderSavedPlaneDistancesTable();
        this._renderSavedPlaneAnglesTable();
        this._syncActivePlaneViewer();
    },

    _renderCurrentPlanePreview() {
        const container = document.getElementById('current-plane-preview');
        if (!container) return;

        const activePlane = this._getActivePlane();

        if (!activePlane) {
            container.innerHTML = `
                <div class="table-label">Active plane</div>
                <div class="result-box" style="margin-bottom:10px">
                    No active plane. Select at least three atoms and click
                    <b>Save current plane</b>.
                </div>
            `;
            return;
        }

        const atoms = this._getPlaneAtoms(activePlane);
        const normal = activePlane.result.normal;

        container.innerHTML = `
            <div class="table-label">Active plane</div>
            <div class="result-box" style="margin-bottom:10px">
                <div>
                    Active:
                    <span class="result-value">${activePlane.name}</span>
                </div>
                <div style="margin-top:4px;color:var(--text-muted)">
                    Atoms: ${atoms.map(atom => atom.label).join(', ')}
                </div>
                <div style="margin-top:4px;color:var(--text-muted)">
                    RMSD: ${activePlane.result.rmsd.toFixed(4)} Å
                </div>
                <div style="margin-top:4px;color:var(--text-muted)">
                    Normal:
                    (${normal.x.toFixed(4)}, ${normal.y.toFixed(4)}, ${normal.z.toFixed(4)})
                </div>
            </div>
        `;
    },

    _renderSavedPlanesTable() {
        const container = document.getElementById('saved-planes-wrap');
        if (!container) return;

        if (!this.savedPlanes.length) {
            container.innerHTML = '';
            return;
        }

        const activePlane = this._getActivePlane();

        let html = `
            <div class="table-label">Saved planes (${this.savedPlanes.length})</div>
            <table class="data-table">
                <thead>
                    <tr>
                        <th>#</th>
                        <th>Active</th>
                        <th>Name</th>
                        <th>Atoms</th>
                        <th>n</th>
                        <th>RMSD (Å)</th>
                        <th>Status</th>
                        <th>Action</th>
                    </tr>
                </thead>
                <tbody>
        `;

        this.savedPlanes.forEach((plane, idx) => {
            const atoms = this._getPlaneAtoms(plane);
            const invalid = this._isPlaneInvalid(plane);
            const isActive = String(this.activePlaneId) === String(plane.id) && !invalid;

            const excludedAtomLabels = atoms
                .filter(atom => this.excludedAtoms.has(atom.index))
                .map(atom => atom.label);

            let status = 'valid';

            if (invalid) {
                status = excludedAtomLabels.length
                    ? `invalid: excluded ${excludedAtomLabels.join(', ')}`
                    : 'invalid';
            }

            let angleExists = false;

            if (activePlane && !isActive) {
                const key = this._planeAngleKey(activePlane.id, plane.id);

                angleExists = this.savedPlaneAngles.some(
                    measurement => measurement.key === key
                );
            }

            html += `
                <tr class="${invalid ? 'inactive' : ''}">
                    <td>${idx + 1}</td>
                    <td>${isActive ? '●' : ''}</td>
                    <td>${plane.name}</td>
                    <td>${atoms.map(atom => atom.label).join(', ')}</td>
                    <td>${atoms.length}</td>
                    <td>${plane.result.rmsd.toFixed(4)}</td>
                    <td>${status}</td>
                    <td>
                        <button
                            class="btn-small plane-set-active"
                            data-id="${plane.id}"
                            ${invalid || isActive ? 'disabled' : ''}
                        >
                            set active
                        </button>
                        <button
                            class="btn-small plane-save-angle"
                            data-id="${plane.id}"
                            ${invalid || !activePlane || isActive || angleExists ? 'disabled' : ''}
                        >
                            save angle
                        </button>
                        <button
                            class="btn-small btn-danger plane-remove"
                            data-id="${plane.id}"
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

        container.querySelectorAll('.plane-set-active').forEach(btn => {
            btn.addEventListener('click', e => {
                e.stopPropagation();
                this.setActivePlane(btn.dataset.id);
            });
        });

        container.querySelectorAll('.plane-save-angle').forEach(btn => {
            btn.addEventListener('click', e => {
                e.stopPropagation();
                this.saveAngleToActivePlane(btn.dataset.id);
            });
        });

        container.querySelectorAll('.plane-remove').forEach(btn => {
            btn.addEventListener('click', e => {
                e.stopPropagation();
                this.removeSavedPlane(btn.dataset.id);
            });
        });
    },

    _renderSavedPlaneDistancesTable() {
        const container = document.getElementById('saved-plane-distances-wrap');
        if (!container) return;

        if (!this.savedPlaneDistances || !this.savedPlaneDistances.length) {
            container.innerHTML = '';
            return;
        }

        let html = `
            <div class="table-label">Saved plane distances (${this.savedPlaneDistances.length})</div>
            <table class="data-table">
                <thead>
                    <tr>
                        <th>#</th>
                        <th>Plane</th>
                        <th>Atom</th>
                        <th>Distance (Å)</th>
                        <th>Status</th>
                        <th>Action</th>
                    </tr>
                </thead>
                <tbody>
        `;

        this.savedPlaneDistances.forEach((measurement, idx) => {
            const plane = this._getPlaneById(measurement.planeId);
            const atom = this._getAtomByIndex(measurement.atomIndex);

            const planeInvalid = plane ? this._isPlaneInvalid(plane) : true;
            const atomExcluded = atom ? this.excludedAtoms.has(atom.index) : true;

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

            const invalid = status !== 'valid';

            html += `
                <tr class="${invalid ? 'inactive' : ''}">
                    <td>${idx + 1}</td>
                    <td>${plane ? plane.name : '(removed)'}</td>
                    <td>${atom ? atom.label : measurement.atomIndex}</td>
                    <td>${measurement.distance.toFixed(4)}</td>
                    <td>${status}</td>
                    <td>
                        <button
                            class="btn-small btn-danger plane-distance-remove"
                            data-id="${measurement.id}"
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

        container.querySelectorAll('.plane-distance-remove').forEach(btn => {
            btn.addEventListener('click', e => {
                e.stopPropagation();
                this.removeSavedPlaneDistance(btn.dataset.id);
            });
        });
    },

    _renderSavedPlaneAnglesTable() {
        const container = document.getElementById('saved-plane-angles-wrap');
        if (!container) return;

        if (!this.savedPlaneAngles || !this.savedPlaneAngles.length) {
            container.innerHTML = '';
            return;
        }

        let html = `
            <div class="table-label">Saved plane angles (${this.savedPlaneAngles.length})</div>
            <table class="data-table">
                <thead>
                    <tr>
                        <th>#</th>
                        <th>Plane A</th>
                        <th>Plane B</th>
                        <th>Angle (°)</th>
                        <th>Status</th>
                        <th>Action</th>
                    </tr>
                </thead>
                <tbody>
        `;

        this.savedPlaneAngles.forEach((measurement, idx) => {
            const planeA = this._getPlaneById(measurement.planeAId);
            const planeB = this._getPlaneById(measurement.planeBId);

            const planeAInvalid = planeA ? this._isPlaneInvalid(planeA) : true;
            const planeBInvalid = planeB ? this._isPlaneInvalid(planeB) : true;

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

            const invalid = status !== 'valid';

            html += `
                <tr class="${invalid ? 'inactive' : ''}">
                    <td>${idx + 1}</td>
                    <td>${planeA ? planeA.name : '(removed)'}</td>
                    <td>${planeB ? planeB.name : '(removed)'}</td>
                    <td>${measurement.angle.toFixed(3)}</td>
                    <td>${status}</td>
                    <td>
                        <button
                            class="btn-small btn-danger plane-angle-remove"
                            data-id="${measurement.id}"
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

        container.querySelectorAll('.plane-angle-remove').forEach(btn => {
            btn.addEventListener('click', e => {
                e.stopPropagation();
                this.removeSavedPlaneAngle(btn.dataset.id);
            });
        });
    },

    _syncActivePlaneViewer() {
        const activePlane = this._getActivePlane();

        if (!activePlane) {
            Viewer.clearPlane(1);
            Viewer.clearPlane(2);
            return;
        }

        Viewer.setPlane(1, activePlane.result, this._getPlaneAtoms(activePlane));
        Viewer.clearPlane(2);
    },

    // --- Dihedral ---

    _updateChips(type) {
        if (type !== 'dihedral') return;

        const container = document.getElementById('dihedral-chips');
        if (!container) return;

        container.innerHTML = '';

        for (const atom of this.dihedralAtoms) {
            const chip = document.createElement('span');
            chip.className = 'chip';

            chip.innerHTML = `
                ${atom.label}
                <span class="chip-remove" data-idx="${atom.index}">×</span>
            `;

            chip.querySelector('.chip-remove').addEventListener('click', () => {
                this._removeAtomFromResult('dihedral', atom.index);
            });

            container.appendChild(chip);
        }
    },

    _removeAtomFromResult(type, idx) {
        idx = Number(idx);

        if (type === 'dihedral') {
            this.dihedralAtoms = this.dihedralAtoms.filter(a => a.index !== idx);
            this.dihedralAngle = this.dihedralAtoms.length === 4
                ? Chem.calcDihedral(...this.dihedralAtoms)
                : null;
        }

        this._refreshGeometryResults();
    },

    _refreshGeometryResults() {
        this._updateChips('dihedral');

        Tables.renderDihedral(
            document.getElementById('dihedral-result'),
            this.dihedralAngle,
            this.dihedralAtoms
        );

        if (typeof this._renderPlaneManagement === 'function') {
            this._renderPlaneManagement();
        }

        this._renderSelectionToolbar();
    },

    clearDihedral() {
        this.dihedralAtoms = [];
        this.dihedralAngle = null;

        this._refreshGeometryResults();
        this._clearSelection();
    },
});