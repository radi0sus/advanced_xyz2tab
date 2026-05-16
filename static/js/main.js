// main.js — orchestrates everything

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

    _initThemeSync() {
        // Apply current OS theme to 3Dmol background
        Viewer.applyThemeBackground();

        // React to OS theme changes
        const mq = window.matchMedia('(prefers-color-scheme: dark)');

        const onThemeChange = () => {
            Viewer.applyThemeBackground();
        };

        if (mq.addEventListener) {
            mq.addEventListener('change', onThemeChange);
        } else if (mq.addListener) {
            // Older Safari
            mq.addListener(onThemeChange);
        }

        // Keep 3Dmol canvas in sync with browser resizing
        window.addEventListener('resize', () => {
            Viewer.resize();
        });
    },

    _initPanelResizers() {
        const root = document.documentElement;

        const mainLayout = document.getElementById('main-layout');
        const viewerPanel = document.getElementById('viewer-panel');
        const tablePanel = document.getElementById('table-panel');

        const layoutResizer = document.getElementById('layout-resizer');
        const viewerAtomResizer = document.getElementById('viewer-atom-resizer');
        const atomListPanel = document.getElementById('atom-list-panel');

        if (!mainLayout || !viewerPanel || !tablePanel) return;

        // Restore saved sizes
        const savedViewerWidth = localStorage.getItem('xyz2tab.viewerPanelWidth');
        const savedAtomListHeight = localStorage.getItem('xyz2tab.atomListHeight');

        if (savedViewerWidth) {
            root.style.setProperty('--viewer-panel-width', savedViewerWidth);
        }

        if (savedAtomListHeight) {
            root.style.setProperty('--atom-list-height', savedAtomListHeight);
        }

        let resizeFrame = null;

        const scheduleViewerResize = () => {
            if (resizeFrame) cancelAnimationFrame(resizeFrame);

            resizeFrame = requestAnimationFrame(() => {
                Viewer.resize();
                resizeFrame = null;
            });
        };

        // Horizontal resizing: left panel / right panel
        if (layoutResizer) {
            layoutResizer.addEventListener('mousedown', e => {
                e.preventDefault();

                layoutResizer.classList.add('resizing');
                document.body.classList.add('resizing', 'resizing-horizontal');

                const onMouseMove = ev => {
                    const rect = mainLayout.getBoundingClientRect();

                    let pct = ((ev.clientX - rect.left) / rect.width) * 100;

                    // Reasonable limits
                    pct = Math.max(25, Math.min(75, pct));

                    const value = pct.toFixed(2) + '%';

                    root.style.setProperty('--viewer-panel-width', value);
                    scheduleViewerResize();
                };

                const onMouseUp = () => {
                    layoutResizer.classList.remove('resizing');
                    document.body.classList.remove('resizing', 'resizing-horizontal');

                    const value = getComputedStyle(root)
                        .getPropertyValue('--viewer-panel-width')
                        .trim();

                    localStorage.setItem('xyz2tab.viewerPanelWidth', value);

                    document.removeEventListener('mousemove', onMouseMove);
                    document.removeEventListener('mouseup', onMouseUp);

                    Viewer.resize();
                };

                document.addEventListener('mousemove', onMouseMove);
                document.addEventListener('mouseup', onMouseUp);
            });
        }

        // Vertical resizing: 3D viewer / atom list
        if (viewerAtomResizer && atomListPanel) {
            viewerAtomResizer.addEventListener('mousedown', e => {
                e.preventDefault();

                viewerAtomResizer.classList.add('resizing');
                document.body.classList.add('resizing', 'resizing-vertical');

                const onMouseMove = ev => {
                    const panelRect = viewerPanel.getBoundingClientRect();

                    // Atom list is below the resizer.
                    // Dragging resizer down makes atom list smaller.
                    let height = panelRect.bottom - ev.clientY;

                    const minHeight = 80;
                    const maxHeight = Math.max(120, panelRect.height * 0.55);

                    height = Math.max(minHeight, Math.min(maxHeight, height));

                    const value = Math.round(height) + 'px';

                    root.style.setProperty('--atom-list-height', value);
                    scheduleViewerResize();
                };

                const onMouseUp = () => {
                    viewerAtomResizer.classList.remove('resizing');
                    document.body.classList.remove('resizing', 'resizing-vertical');

                    const value = getComputedStyle(root)
                        .getPropertyValue('--atom-list-height')
                        .trim();

                    localStorage.setItem('xyz2tab.atomListHeight', value);

                    document.removeEventListener('mousemove', onMouseMove);
                    document.removeEventListener('mouseup', onMouseUp);

                    Viewer.resize();
                };

                document.addEventListener('mousemove', onMouseMove);
                document.addEventListener('mouseup', onMouseUp);
            });
        }
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

    // --- Central selection / geometry toolbar ---

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

    _distanceAtomToPlane(atom, plane) {
        const { normal, centroid } = plane;

        return (
            normal.x * (atom.x - centroid.x) +
            normal.y * (atom.y - centroid.y) +
            normal.z * (atom.z - centroid.z)
        );
    },

    _newMeasurementId(prefix) {
        const id = `${prefix}_${this._nextMeasurementId}`;
        this._nextMeasurementId += 1;
        return id;
    },

    // --- Save manual measurements / add manual bonds ---

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

    _purgeManualMeasurementsWithExcludedAtoms() {
        const hasExcluded = m =>
            (m.atoms || []).some(idx => this.excludedAtoms.has(Number(idx)));

        this.manualDistances = this.manualDistances.filter(m => !hasExcluded(m));
        this.manualAngles = this.manualAngles.filter(m => !hasExcluded(m));
        this.manualDihedrals = this.manualDihedrals.filter(m => !hasExcluded(m));
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

    // --- Result chips ---

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

    // --- Export ---

    exportMd() {
        const md = Tables.toMarkdown(
            this.parsed,
            this.filteredBonds,
            this.filteredAngles,
            this.plane1Atoms,
            this.plane1Result,
            this.plane2Atoms,
            this.plane2Result,
            this.planeAngle,
            this.dihedralAtoms,
            this.dihedralAngle,
        );

        const blob = new Blob([md], { type: 'text/markdown' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = (this.parsed.formula || 'xyz2tab') + '.md';
        a.click();

        URL.revokeObjectURL(url);
    },

    exportPng() {
        const uri = Viewer.getPNG();
        if (!uri) return;

        const a = document.createElement('a');
        a.href = uri;
        a.download = (this.parsed.formula || 'xyz2tab') + '.png';
        a.click();
    },
};

document.addEventListener('DOMContentLoaded', () => App.init());