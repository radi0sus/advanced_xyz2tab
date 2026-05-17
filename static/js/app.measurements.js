// app.measurements.js — manual distances, bonds, angles and dihedrals

Object.assign(App, {

    _newMeasurementId(prefix) {
        const id = `${prefix}_${this._nextMeasurementId}`;
        this._nextMeasurementId += 1;
        return id;
    },

    saveSelectedDistance() {
        const atoms = this._getSelectedAtoms();
        if (atoms.length !== 2) return;

        this.manualDistances.push({
            id: this._newMeasurementId('dist'),
            atoms: [atoms[0].index, atoms[1].index],
        });

        this._renderTables();

        this._showSelectionOutput(`
            <div class="selection-output-title">Saved distance</div>
            <div>
                ${atoms[0].label}–${atoms[1].label}:
                <span class="result-value">${Chem.distance(atoms[0], atoms[1]).toFixed(4)} Å</span>
            </div>
        `);

        this._finishSelectionAction();
    },

    addSelectedBond() {
        const atoms = this._getSelectedAtoms();
        if (atoms.length !== 2) return;

        const a = atoms[0];
        const b = atoms[1];

        const key = this._bondKey(a.index, b.index);

        const existsInCurrentBonds = this.allBonds.some(
            bond => this._bondKey(bond.i, bond.j) === key
        );

        const existsManual = this.manualContacts.some(
            contact => this._bondKey(contact.i, contact.j) === key
        );

        let message;

        if (existsInCurrentBonds || existsManual) {
            message = 'Bond already exists:';
        } else {
            this.manualContacts.push({
                i: a.index,
                j: b.index,
            });

            message = 'Added manual bond:';
        }

        this.recalcBonds();

        this._showSelectionOutput(`
            <div class="selection-output-title">Manual bond</div>
            <div>
                ${message}
                <span class="result-value">${a.label}–${b.label}</span>
            </div>
            <div style="margin-top:3px;color:var(--text-muted)">
                Manual bonds are included in bond statistics and angle detection.
            </div>
        `);

        this._finishSelectionAction();
    },

    saveSelectedAngle() {
        const atoms = this._getSelectedAtoms();
        if (atoms.length !== 3) return;

        this.manualAngles.push({
            id: this._newMeasurementId('ang'),
            atoms: atoms.map(a => a.index),
        });

        this._renderTables();

        const angle = Chem.calcAngle(atoms[0], atoms[1], atoms[2]);

        this._showSelectionOutput(`
            <div class="selection-output-title">Saved angle</div>
            <div style="margin-bottom:3px;color:var(--text-muted)">
                ${atoms.map(a => a.label).join('–')}
            </div>
            <div>
                Angle:
                <span class="result-value">${angle.toFixed(3)}°</span>
            </div>
        `);

        this._finishSelectionAction();
    },

    saveSelectedDihedral() {
        const atoms = this._getSelectedAtoms();
        if (atoms.length !== 4) return;

        this.manualDihedrals.push({
            id: this._newMeasurementId('dih'),
            atoms: atoms.map(a => a.index),
        });

        // Keep old single-result state compatible
        this.dihedralAtoms = atoms;
        this.dihedralAngle = Chem.calcDihedral(...atoms);
        this._updateChips('dihedral');

        this._renderTables();

        Tables.renderDihedral(
            document.getElementById('dihedral-result'),
            this.dihedralAngle,
            this.dihedralAtoms
        );

        this._showSelectionOutput(`
            <div class="selection-output-title">Saved dihedral</div>
            <div style="margin-bottom:3px;color:var(--text-muted)">
                ${atoms.map(a => a.label).join('–')}
            </div>
            <div>
                Dihedral:
                <span class="result-value">${this.dihedralAngle.toFixed(3)}°</span>
            </div>
        `);

        this._finishSelectionAction();
    },

    removeManualBond(i, j) {
        const key = this._bondKey(i, j);

        const before = this.manualContacts.length;

        this.manualContacts = this.manualContacts.filter(
            contact => this._bondKey(contact.i, contact.j) !== key
        );

        if (this.manualContacts.length === before) return;

        this.recalcBonds();

        const a = this.parsed.atoms[i];
        const b = this.parsed.atoms[j];

        this._showSelectionOutput(`
            <div class="selection-output-title">Manual bond removed</div>
            <div>
                Removed manual bond:
                <span class="result-value">${a.label}–${b.label}</span>
            </div>
        `);

        this._clearSelection();
    },

    removeManualDistance(id) {
        this.manualDistances = this.manualDistances.filter(m => String(m.id) !== String(id));
        this._renderTables();
    },

    removeManualAngle(id) {
        this.manualAngles = this.manualAngles.filter(m => String(m.id) !== String(id));
        this._renderTables();
    },

    removeManualDihedral(id) {
        this.manualDihedrals = this.manualDihedrals.filter(m => String(m.id) !== String(id));
        this._renderTables();
    },

    _bondKey(i, j) {
        i = Number(i);
        j = Number(j);

        return i < j ? `${i}-${j}` : `${j}-${i}`;
    },

    _mergeManualContacts(autoBonds) {
        const atoms = this.parsed.atoms;
        const result = [...autoBonds];

        const existing = new Set(
            autoBonds.map(b => this._bondKey(b.i, b.j))
        );

        for (const contact of this.manualContacts) {
            const key = this._bondKey(contact.i, contact.j);

            if (this.excludedAtoms.has(contact.i) || this.excludedAtoms.has(contact.j)) {
                continue;
            }

            if (existing.has(key)) continue;

            const a = atoms[contact.i];
            const b = atoms[contact.j];

            if (!a || !b) continue;

            result.push({
                i: a.index,
                j: b.index,
                labelI: a.label,
                labelJ: b.label,
                elI: a.element,
                elJ: b.element,
                dist: Chem.distance(a, b),
                manual: true,
            });

            existing.add(key);
        }

        // Mark auto bonds explicitly
        for (const bond of result) {
            if (bond.manual !== true) bond.manual = false;
        }

        return result;
    },

    _purgeManualMeasurementsWithExcludedAtoms() {
        const hasExcluded = m =>
            (m.atoms || []).some(idx => this.excludedAtoms.has(Number(idx)));

        this.manualDistances = this.manualDistances.filter(m => !hasExcluded(m));
        this.manualAngles = this.manualAngles.filter(m => !hasExcluded(m));
        this.manualDihedrals = this.manualDihedrals.filter(m => !hasExcluded(m));
    },
});
