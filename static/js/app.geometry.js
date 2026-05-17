// app.geometry.js — legacy Plane 1/2 and dihedral result handling

Object.assign(App, {

    _measureSelectionToPlane(num) {
        const atoms = this._getSelectedAtoms();
        if (!atoms.length) return;

        const plane = num === 1 ? this.plane1Result : this.plane2Result;
        if (!plane) return;

        let html = `
            <div class="selection-output-title">
                Distances to Plane ${num}
            </div>
            <table>
                <thead>
                    <tr>
                        <th>Atom</th>
                        <th>Distance / Å</th>
                    </tr>
                </thead>
                <tbody>
        `;

        for (const atom of atoms) {
            const d = this._distanceAtomToPlane(atom, plane);

            html += `
                <tr>
                    <td>${atom.label}</td>
                    <td>${d.toFixed(4)}</td>
                </tr>
            `;
        }

        html += `
                </tbody>
            </table>
        `;

        this._showSelectionOutput(html);
        this._finishSelectionAction();
    },

    _setPlaneFromCentralSelection(num) {
        const atoms = this._getSelectedAtoms();
        if (atoms.length < 3) return;

        const plane = Chem.calcPlane(atoms);
        if (!plane) return;

        if (num === 1) {
            this.plane1Atoms = atoms;
            this.plane1Result = plane;
            this._updateChips('plane1');
        } else {
            this.plane2Atoms = atoms;
            this.plane2Result = plane;
            this._updateChips('plane2');
        }

        this.planeAngle = (this.plane1Result && this.plane2Result)
            ? Chem.angleBetweenPlanes(this.plane1Result, this.plane2Result)
            : null;

        this._refreshGeometryResults();

        this._showSelectionOutput(`
            <div class="selection-output-title">Plane ${num}</div>
            <div style="margin-bottom:3px;color:var(--text-muted)">
                ${atoms.map(a => a.label).join(', ')}
            </div>
            <div>
                RMSD:
                <span class="result-value">${plane.rmsd.toFixed(4)} Å</span>
            </div>
        `);

        this._finishSelectionAction();
    },

    _distanceAtomToPlane(atom, plane) {
        const { normal, centroid } = plane;

        return (
            normal.x * (atom.x - centroid.x) +
            normal.y * (atom.y - centroid.y) +
            normal.z * (atom.z - centroid.z)
        );
    },

    _updateChips(type) {
        let list;
        let containerId;
        let chipClass;

        if (type === 'plane1') {
            list = this.plane1Atoms;
            containerId = 'plane1-chips';
            chipClass = '';
        }

        if (type === 'plane2') {
            list = this.plane2Atoms;
            containerId = 'plane2-chips';
            chipClass = 'plane2';
        }

        if (type === 'dihedral') {
            list = this.dihedralAtoms;
            containerId = 'dihedral-chips';
            chipClass = '';
        }

        const container = document.getElementById(containerId);
        if (!container) return;

        container.innerHTML = '';

        for (const atom of list) {
            const chip = document.createElement('span');
            chip.className = 'chip' + (chipClass ? ' ' + chipClass : '');

            chip.innerHTML = `
                ${atom.label}
                <span class="chip-remove ${chipClass}" data-idx="${atom.index}">×</span>
            `;

            chip.querySelector('.chip-remove').addEventListener('click', () => {
                this._removeAtomFromResult(type, atom.index);
            });

            container.appendChild(chip);
        }
    },

    _removeAtomFromResult(type, idx) {
        idx = Number(idx);

        if (type === 'plane1') {
            this.plane1Atoms = this.plane1Atoms.filter(a => a.index !== idx);
            this.plane1Result = this.plane1Atoms.length >= 3
                ? Chem.calcPlane(this.plane1Atoms)
                : null;
        }

        if (type === 'plane2') {
            this.plane2Atoms = this.plane2Atoms.filter(a => a.index !== idx);
            this.plane2Result = this.plane2Atoms.length >= 3
                ? Chem.calcPlane(this.plane2Atoms)
                : null;
        }

        if (type === 'dihedral') {
            this.dihedralAtoms = this.dihedralAtoms.filter(a => a.index !== idx);
            this.dihedralAngle = this.dihedralAtoms.length === 4
                ? Chem.calcDihedral(...this.dihedralAtoms)
                : null;
        }

        this._refreshGeometryResults();
    },

    _refreshGeometryResults() {
        this.planeAngle = (this.plane1Result && this.plane2Result)
            ? Chem.angleBetweenPlanes(this.plane1Result, this.plane2Result)
            : null;

        this._updateChips('plane1');
        this._updateChips('plane2');
        this._updateChips('dihedral');

        Tables.renderPlaneDistances(
            document.getElementById('plane1-result'),
            this.plane1Result,
            this.plane1Atoms,
            'Plane 1'
        );

        Tables.renderPlaneDistances(
            document.getElementById('plane2-result'),
            this.plane2Result,
            this.plane2Atoms,
            'Plane 2'
        );

        Tables.renderPlane2ToPlane1(
            document.getElementById('plane2-to-plane1-result'),
            this.plane1Result,
            this.plane2Atoms
        );

        Tables.renderPlaneAngle(
            document.getElementById('plane-angle-result'),
            this.planeAngle
        );

        Tables.renderDihedral(
            document.getElementById('dihedral-result'),
            this.dihedralAngle,
            this.dihedralAtoms
        );

        Viewer.setPlane(1, this.plane1Result, this.plane1Atoms);
        Viewer.setPlane(2, this.plane2Result, this.plane2Atoms);

        this._renderSelectionToolbar();
    },

    clearPlane(num) {
        if (num === 1) {
            this.plane1Atoms = [];
            this.plane1Result = null;
            Viewer.clearPlane(1);
        } else {
            this.plane2Atoms = [];
            this.plane2Result = null;
            Viewer.clearPlane(2);
        }

        this._refreshGeometryResults();
        this._clearSelection();
    },

    clearDihedral() {
        this.dihedralAtoms = [];
        this.dihedralAngle = null;

        this._refreshGeometryResults();
        this._clearSelection();
    },
});
