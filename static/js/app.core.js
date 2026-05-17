// app.core.js — App state, setup, filtering, callbacks

const App = {

    // State
    parsed: null,
    allBonds: [],
    allAngles: [],
    filteredBonds: [],
    filteredAngles: [],
    activeElements: new Set(),
    tolerancePct: 8,
    _highlightedAtoms: new Set(),
    atomListSearch: '',
    excludedAtoms: new Set(),
    atomIndexStart: 0,

    // Central selection
    selection: [],

    // Manual analysis edits / saved measurements
    manualContacts: [],      // statistically active manual bonds
    manualDistances: [],     // saved distance measurements, NOT active in bond graph
    manualAngles: [],        // saved angle measurements
    manualDihedrals: [],     // saved dihedral measurements
    _nextMeasurementId: 1,

    // Plane/dihedral result state
    plane1Atoms: [],
    plane2Atoms: [],
    plane1Result: null,
    plane2Result: null,
    planeAngle: null,
    dihedralAtoms: [],
    dihedralAngle: null,

    init() {
        // File input
        document.getElementById('file-input').addEventListener('change', e => {
            if (e.target.files[0]) this.loadFile(e.target.files[0]);
        });

        // Drag & drop
        const dropzone = document.getElementById('dropzone');

        dropzone.addEventListener('dragover', e => {
            e.preventDefault();
            dropzone.classList.add('drag-over');
        });

        dropzone.addEventListener('dragleave', () => {
            dropzone.classList.remove('drag-over');
        });

        dropzone.addEventListener('drop', e => {
            e.preventDefault();
            dropzone.classList.remove('drag-over');

            if (e.dataTransfer.files[0]) {
                this.loadFile(e.dataTransfer.files[0]);
            }
        });

        // Tabs
        document.querySelectorAll('.tab').forEach(tab => {
            tab.addEventListener('click', () => {
                document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
                document.querySelectorAll('.tab-content').forEach(tc => tc.classList.remove('active'));

                tab.classList.add('active');
                document.getElementById('tab-' + tab.dataset.tab).classList.add('active');
            });
        });

        // Viewer controls
        document.getElementById('btn-reset-view').addEventListener('click', () => {
            Viewer.resetView();
        });

        document.getElementById('btn-toggle-atom-labels').addEventListener('click', e => {
            const on = Viewer.toggleAtomLabels();
            e.target.classList.toggle('active', on);
        });

        document.getElementById('btn-toggle-bond-labels').addEventListener('click', e => {
            const on = Viewer.toggleBondLabels();
            e.target.classList.toggle('active', on);
        });

        // Atom label index start: 0 or 1
        const atomIndexStartSelect = document.getElementById('atom-index-start');

        if (atomIndexStartSelect) {
            this.atomIndexStart = parseInt(atomIndexStartSelect.value, 10) || 0;

            atomIndexStartSelect.addEventListener('change', e => {
                this.atomIndexStart = parseInt(e.target.value, 10) || 0;
                this._applyAtomIndexStart();
            });
        }

        // Selection / geometry toolbar
        this._bindSelectionToolbar();

        // Atom list search
        const atomListSearch = document.getElementById('atom-list-search');

        if (atomListSearch) {
            atomListSearch.addEventListener('input', e => {
                this.atomListSearch = e.target.value;
                this._renderAtomList();
            });
        }

        // Reset atom exclusions
        const resetExclusionsBtn = document.getElementById('btn-reset-exclusions');

        if (resetExclusionsBtn) {
            resetExclusionsBtn.addEventListener('click', () => {
                this.resetAtomExclusions();
            });
        }

        // Radius slider
        document.getElementById('radius-slider').addEventListener('input', e => {
            this.tolerancePct = parseFloat(e.target.value);
            document.getElementById('radius-value').textContent = this.tolerancePct.toFixed(1) + ' %';
            this.recalcBonds();
        });

        // Plane clear buttons
        document.getElementById('btn-plane1-clear').addEventListener('click', () => {
            this.clearPlane(1);
        });

        document.getElementById('btn-plane2-clear').addEventListener('click', () => {
            this.clearPlane(2);
        });

        // Dihedral clear button
        document.getElementById('btn-dihedral-clear').addEventListener('click', () => {
            this.clearDihedral();
        });

        // Export
        document.getElementById('btn-export-md').addEventListener('click', () => {
            this.exportMd();
        });

        document.getElementById('btn-export-png').addEventListener('click', () => {
            this.exportPng();
        });

        // Callbacks
        Tables.setAtomClickCallback(idx => this.onAtomClick(idx));
        Tables.setAtomExcludeCallback((idx, excluded) => this.onAtomExclude(idx, excluded));

        Tables.setBondClickCallback((i, j) => this.onBondClick(i, j));
        Tables.setAngleClickCallback(atoms => this.onAngleClick(atoms));

        Tables.setManualBondRemoveCallback((i, j) => this.removeManualBond(i, j));
        Tables.setManualDistanceRemoveCallback(id => this.removeManualDistance(id));
        Tables.setManualAngleRemoveCallback(id => this.removeManualAngle(id));
        Tables.setManualDihedralRemoveCallback(id => this.removeManualDihedral(id));

        Viewer.setAtomClickCallback(idx => this.onAtomClick(idx));

        // Init viewer
        Viewer.init('viewer-container');

        // Theme + resizable layout
        this._initThemeSync();
        this._initPanelResizers();
    },

    loadFile(file) {
        const reader = new FileReader();

        reader.onload = e => {
            try {
                this.parsed = Parser.parse(e.target.result);
                this.setup();
            } catch (err) {
                alert('Error parsing .xyz file: ' + err.message);
            }
        };

        reader.readAsText(file);
    },

    setup() {
        const { atoms, formula, fw, natoms } = this.parsed;

        // Apply current atom label numbering mode
        Parser.labelAtoms(atoms, this.atomIndexStart);

        // Show main layout
        document.getElementById('dropzone').classList.add('hidden');
        document.getElementById('main-layout').classList.remove('hidden');

        // Info bar
        document.getElementById('info-formula').textContent = formula;
        document.getElementById('info-fw').textContent = fw.toFixed(2) + ' g/mol';
        document.getElementById('info-natoms').textContent = natoms + ' atoms';

        // Enable export buttons
        document.getElementById('btn-export-md').disabled = false;
        document.getElementById('btn-export-png').disabled = false;

        // Element toggles
        const elements = [...new Set(atoms.map(a => a.element))].sort();
        this.activeElements = new Set(elements);
        this._buildElementToggles(elements);

        // Reset central selection, exclusions and manual data for new file
        this.selection = [];
        this.excludedAtoms = new Set();

        this.manualContacts = [];
        this.manualDistances = [];
        this.manualAngles = [];
        this.manualDihedrals = [];
        this._nextMeasurementId = 1;

        // Reset plane/dihedral state
        this.plane1Atoms = [];
        this.plane2Atoms = [];
        this.plane1Result = null;
        this.plane2Result = null;
        this.planeAngle = null;
        this.dihedralAtoms = [];
        this.dihedralAngle = null;

        // Clear old viewer planes if a previous file had planes
        Viewer.clearPlane(1);
        Viewer.clearPlane(2);

        // Clear result areas
        this._updateChips('plane1');
        this._updateChips('plane2');
        this._updateChips('dihedral');

        document.getElementById('plane1-result').innerHTML = '';
        document.getElementById('plane2-result').innerHTML = '';
        document.getElementById('plane2-to-plane1-result').innerHTML = '';
        document.getElementById('plane-angle-result').innerHTML = '';
        document.getElementById('dihedral-result').innerHTML = '';

        this._showSelectionOutput('');
        this._renderSelectionToolbar();

        // Initial bond & angle calculation
        this.recalcBonds();

        // Info table
        Tables.renderInfo(document.getElementById('info-table-wrap'), this.parsed);

        // Viewer
        Viewer.load(atoms, this.allBonds, this.activeElements, this.excludedAtoms);

        // Atom list
        this.atomListSearch = '';
        const atomSearchInput = document.getElementById('atom-list-search');
        if (atomSearchInput) atomSearchInput.value = '';

        this._setHighlightedAtoms(new Set());
        this._renderAtomList();

        // Resize once after layout becomes visible
        requestAnimationFrame(() => Viewer.resize());
    },

    _applyAtomIndexStart() {
        if (!this.parsed || !this.parsed.atoms) return;

        // Relabel atoms
        Parser.labelAtoms(this.parsed.atoms, this.atomIndexStart);

        // Rebuild bonds/angles because labels are copied into bond/angle objects
        this.recalcBonds();

        // Refresh geometry labels and result tables
        this._refreshGeometryResults();

        // Refresh manual measurement tables
        this._renderTables();

        // Refresh atom list and selection chips
        this._renderAtomList();
        this._renderSelectionToolbar();
        this._updateSelectionPreview();
    },

    _buildElementToggles(elements) {
        const container = document.getElementById('element-toggles');
        container.innerHTML = '';

        for (const el of elements) {
            const btn = document.createElement('button');
            btn.className = 'el-toggle active';
            btn.textContent = el;
            btn.dataset.el = el;

            btn.addEventListener('click', () => {
                const active = btn.classList.toggle('active');

                if (active) {
                    this.activeElements.add(el);
                } else {
                    this.activeElements.delete(el);
                }

                this.applyFilter();
            });

            container.appendChild(btn);
        }
    },

    _getActiveAtoms() {
        if (!this.parsed || !this.parsed.atoms) return [];

        return this.parsed.atoms.filter(atom => !this.excludedAtoms.has(atom.index));
    },

    recalcBonds() {
        const atoms = this._getActiveAtoms();

        const autoBonds = Chem.findBonds(atoms, this.tolerancePct);

        this.allBonds = this._mergeManualContacts(autoBonds);
        this.allAngles = Chem.findAngles(atoms, this.allBonds);

        this.applyFilter();
    },

    applyFilter() {
        this.filteredBonds = Chem.filterBonds(this.allBonds, this.activeElements);
        this.filteredAngles = Chem.filterAngles(this.allAngles, this.activeElements);

        // Remove atoms from current selection/highlight if their element is inactive
        if (this.parsed && this.parsed.atoms) {
            const activeIdx = new Set(
                this.parsed.atoms
                    .filter(atom => this.activeElements.has(atom.element))
                    .map(atom => atom.index)
            );

            this.selection = this.selection.filter(idx => activeIdx.has(idx));

            this._highlightedAtoms = new Set(
                [...this._highlightedAtoms].filter(idx => activeIdx.has(idx))
            );
        }

        this._renderTables();

        Viewer.updateBonds(this.filteredBonds, this.activeElements, this.excludedAtoms);

        this._renderSelectionToolbar();
        this._renderAtomList();
        this._updateSelectionPreview();
    },

    _renderTables() {
        const atoms = this.parsed ? this.parsed.atoms : [];

        Tables.renderManualDistances(
            document.getElementById('manual-distances-wrap'),
            this.manualDistances,
            atoms,
        );

        Tables.renderBonds(
            document.getElementById('bonds-table-wrap'),
            document.getElementById('bonds-summary-wrap'),
            document.getElementById('bonds-stats-wrap'),
            this.filteredBonds,
        );

        Tables.renderManualAngles(
            document.getElementById('manual-angles-wrap'),
            this.manualAngles,
            atoms,
        );

        Tables.renderAngles(
            document.getElementById('angles-table-wrap'),
            document.getElementById('angles-summary-wrap'),
            document.getElementById('angles-stats-wrap'),
            this.filteredAngles,
        );

        Tables.renderManualDihedrals(
            document.getElementById('manual-dihedrals-wrap'),
            this.manualDihedrals,
            atoms,
        );
    },

    // --- Atom list / highlighting ---

    _renderAtomList() {
        if (!this.parsed || !this.parsed.atoms) return;

        Tables.renderAtomList(
            document.getElementById('atom-list-wrap'),
            this.parsed.atoms,
            this.atomListSearch,
            this._highlightedAtoms,
            this.excludedAtoms,
            this.activeElements,
        );

        const resetBtn = document.getElementById('btn-reset-exclusions');
        if (resetBtn) {
            resetBtn.disabled = this.excludedAtoms.size === 0;
        }
    },

    _setHighlightedAtoms(indexSet) {
        this._highlightedAtoms = indexSet ? new Set(indexSet) : new Set();

        Viewer.highlightAtoms(this._highlightedAtoms);
        this._renderAtomList();
    },

    resetAtomExclusions() {
        if (!this.excludedAtoms || this.excludedAtoms.size === 0) return;

        this.excludedAtoms = new Set();

        // Clear current selection/highlight because previously invisible atoms may reappear.
        this.selection = [];
        this._highlightedAtoms = new Set();

        // Recalculate bonds and angles with all atoms.
        this.recalcBonds();

        // Refresh geometry result areas.
        // Previously cleared planes/dihedrals are not restored automatically.
        this._refreshGeometryResults();

        // Refresh UI.
        this._syncSelectionHighlight();
        this._renderAtomList();
    },

    // --- Click callbacks ---

    onAtomExclude(idx, excluded) {
        idx = Number(idx);

        if (excluded) {
            this.excludedAtoms.add(idx);
        } else {
            this.excludedAtoms.delete(idx);
        }

        // Remove excluded atoms from current central selection
        this.selection = this.selection.filter(atomIdx => !this.excludedAtoms.has(Number(atomIdx)));

        // Remove excluded atoms from current highlight
        this._highlightedAtoms = new Set(
            [...this._highlightedAtoms].filter(atomIdx => !this.excludedAtoms.has(Number(atomIdx)))
        );

        // If a plane contains an excluded atom, clear that plane.
        if (this.plane1Atoms.some(atom => this.excludedAtoms.has(atom.index))) {
            this.plane1Atoms = [];
            this.plane1Result = null;
            Viewer.clearPlane(1);
        }

        if (this.plane2Atoms.some(atom => this.excludedAtoms.has(atom.index))) {
            this.plane2Atoms = [];
            this.plane2Result = null;
            Viewer.clearPlane(2);
        }

        // If current dihedral contains an excluded atom, clear it.
        if (this.dihedralAtoms.some(atom => this.excludedAtoms.has(atom.index))) {
            this.dihedralAtoms = [];
            this.dihedralAngle = null;
        }

        // Remove saved manual measurements containing excluded atoms.
        this._purgeManualMeasurementsWithExcludedAtoms();

        // Recalculate bonds and angles without excluded atoms.
        this.recalcBonds();

        // Refresh geometry result areas.
        this._refreshGeometryResults();

        // Sync selection toolbar, highlights and atom list.
        this._syncSelectionHighlight();
        this._renderAtomList();
    },

    onAtomClick(idx) {
        idx = Number(idx);

        if (this.excludedAtoms.has(idx)) return;

        const atom = this._getAtomByIndex(idx);
        if (!atom) return;

        if (this.activeElements && !this.activeElements.has(atom.element)) return;

        this._toggleCentralSelection(idx);
    },

    onBondClick(i, j) {
        // Table row selection highlights atoms, but does not alter central selection.
        if (i === null) {
            this._setHighlightedAtoms(new Set());
        } else {
            this._setHighlightedAtoms(new Set([Number(i), Number(j)]));
        }
    },

    onAngleClick(atoms) {
        // Table row selection highlights atoms, but does not alter central selection.
        if (!atoms) {
            this._setHighlightedAtoms(new Set());
        } else {
            this._setHighlightedAtoms(new Set(atoms.map(Number)));
        }
    },
};
