// viewer.js — 3Dmol wrapper

const Viewer = {

    _viewer: null,
    _model: null,
    _atoms: null,
    _bonds: null,
    _showAtomLabels: false,
    _showBondLabels: false,
    _highlightedAtoms: new Set(),
    _activeElements: null,
    _excludedAtoms: new Set(),
    _plane1Data: null,
    _plane2Data: null,
    _onAtomClick: null,
    _renderTimer: null,
    _hasZoomed: false,

    // visibleAtoms array kept in sync — maps 3Dmol model index -> app atom
    _visibleAtoms: [],

    // Maps original app atom.index -> 3Dmol model index
    _indexToModelIndex: {},

    setAtomClickCallback(fn) {
        this._onAtomClick = fn;
    },

    init(containerId) {
        const el = document.getElementById(containerId);

        const css = getComputedStyle(document.documentElement);
        let bg = css.getPropertyValue('--viewer-bg').trim() || '#1a1a1a';

        if (bg.startsWith('#')) {
            bg = '0x' + bg.slice(1);
        }

        this._viewer = $3Dmol.createViewer(el, {
            backgroundColor: bg,
            antialias: true,
        });

        this.applyThemeBackground();
    },

    // Called once per file load
    load(atoms, bonds, activeElements, excludedAtoms = new Set()) {
        this._atoms = atoms;
        this._bonds = bonds;
        this._activeElements = activeElements || null;
        this._excludedAtoms = excludedAtoms ? new Set(excludedAtoms) : new Set();

        this._highlightedAtoms = new Set();
        this._visibleAtoms = [];
        this._indexToModelIndex = {};
        this._hasZoomed = false;

        this._fullRender();
    },

    // Called when filter/element toggle changes — full rebuild needed
    updateBonds(bonds, activeElements, excludedAtoms = new Set()) {
        this._bonds = bonds;
        this._activeElements = activeElements || null;
        this._excludedAtoms = excludedAtoms ? new Set(excludedAtoms) : new Set();

        this._scheduleFullRender();
    },

    // Called when highlight changes — only restyle, no model rebuild
    highlightAtoms(indexSet) {
        this._highlightedAtoms = indexSet ? new Set(indexSet) : new Set();
        this._applyHighlight();
    },

    clearHighlight() {
        this._highlightedAtoms = new Set();
        this._applyHighlight();
    },

    toggleAtomLabels() {
        this._showAtomLabels = !this._showAtomLabels;
        this._scheduleFullRender();
        return this._showAtomLabels;
    },

    toggleBondLabels() {
        this._showBondLabels = !this._showBondLabels;
        this._scheduleFullRender();
        return this._showBondLabels;
    },

    resetView() {
        if (this._viewer) {
            this._viewer.zoomTo();
            this._viewer.render();
        }
    },

    resize() {
        if (!this._viewer) return;

        if (typeof this._viewer.resize === 'function') {
            this._viewer.resize();
        }

        this._viewer.render();
    },

    applyThemeBackground() {
        if (!this._viewer) return;

        const css = getComputedStyle(document.documentElement);
        let color = css.getPropertyValue('--viewer-bg').trim();

        if (!color) color = '#1a1a1a';

        // 3Dmol accepts 0xRRGGBB reliably.
        if (color.startsWith('#')) {
            color = '0x' + color.slice(1);
        }

        if (typeof this._viewer.setBackgroundColor === 'function') {
            this._viewer.setBackgroundColor(color);
        }

        this._viewer.render();
    },

    setPlane(planeNum, planeResult, atoms) {
        if (planeNum === 1) {
            this._plane1Data = planeResult ? { planeResult, atoms } : null;
        }
        if (planeNum === 2) {
            this._plane2Data = planeResult ? { planeResult, atoms } : null;
        }
        this._scheduleFullRender();
    },

    clearPlane(planeNum) {
        if (planeNum === 1) this._plane1Data = null;
        if (planeNum === 2) this._plane2Data = null;
        this._scheduleFullRender();
    },

    _scheduleFullRender() {
        if (this._renderTimer) clearTimeout(this._renderTimer);
        this._renderTimer = setTimeout(() => this._fullRender(), 150);
    },

    // Apply highlight only — fast, no model rebuild, no zoomTo
    _applyHighlight() {
        if (!this._model || !this._viewer) return;

        const model = this._model;
        //const visible = this._visibleAtoms || [];
        const visible = this._visibleAtoms && this._visibleAtoms.length
            ? this._visibleAtoms
            : [];

        // Reset all visible atoms to default element colors first
        const elements = [...new Set(visible.map(a => a.element))];

        for (const el of elements) {
            model.setStyle(
                { elem: el },
                { sphere: { radius: 0.22, color: Parser.getColor(el) } }
            );
        }

        // Apply highlight using 3Dmol's 0-based model index, not serial.
        // This avoids wrong atom mapping such as Fe0 -> N0.
        if (this._highlightedAtoms.size > 0) {
            for (const atomIndex of this._highlightedAtoms) {
                const modelIndex = this._indexToModelIndex[atomIndex];

                if (modelIndex !== undefined) {
                    model.setStyle(
                        { index: modelIndex },
                        { sphere: { radius: 0.32, color: '#ffdd44' } }
                    );
                }
            }
        }

        this._viewer.render();
    },

    _fullRender() {
        const viewer = this._viewer;
        if (!viewer || !this._atoms) return;

        viewer.removeAllModels();
        viewer.removeAllShapes();
        viewer.removeAllLabels();

        this._model = null;

        // Visible atoms
        const visibleAtoms = this._atoms.filter(a => {
            const elementVisible = this._activeElements
                ? this._activeElements.has(a.element)
                : true;

            const atomVisible = !this._excludedAtoms.has(a.index);

            return elementVisible && atomVisible;
        });

        // Keep visible atoms in sync for click mapping and highlight reset
        this._visibleAtoms = visibleAtoms;


        // Map original app atom.index -> 3Dmol model index.
        // Important: 3Dmol model index is 0-based.
        this._indexToModelIndex = {};
        visibleAtoms.forEach((a, modelIndex) => {
            this._indexToModelIndex[a.index] = modelIndex;
        });

        const visibleIdx = new Set(visibleAtoms.map(a => a.index));

        // Visible bonds
        const visibleBonds = (this._bonds || []).filter(
            b => visibleIdx.has(b.i) && visibleIdx.has(b.j)
        );

        // XYZ string
        const xyzLines = [visibleAtoms.length.toString(), 'xyz2tab'];

        for (const a of visibleAtoms) {
            xyzLines.push(`${a.element} ${a.x} ${a.y} ${a.z}`);
        }

        const model = viewer.addModel(xyzLines.join('\n'), 'xyz');
        this._model = model;

        // Color by element
        const elements = [...new Set(visibleAtoms.map(a => a.element))];

        for (const el of elements) {
            model.setStyle(
                { elem: el },
                { sphere: { radius: 0.22, color: Parser.getColor(el) } }
            );
        }

        // Highlighted atoms using 3Dmol's 0-based model index, not serial
        if (this._highlightedAtoms.size > 0) {
            for (const atomIndex of this._highlightedAtoms) {
                const modelIndex = this._indexToModelIndex[atomIndex];

                if (modelIndex !== undefined) {
                    model.setStyle(
                        { index: modelIndex },
                        { sphere: { radius: 0.32, color: '#ffdd44' } }
                    );
                }
            }
        }

        // Bonds as cylinders
        for (const bond of visibleBonds) {
            const a = this._atoms[bond.i];
            const b = this._atoms[bond.j];

            if (!a || !b) continue;

            viewer.addCylinder({
                start: { x: a.x, y: a.y, z: a.z },
                end:   { x: b.x, y: b.y, z: b.z },
                radius: 0.07,
                color: '#aaaaaa',
                fromCap: 1,
                toCap: 1,
            });
        }

        // Atom name labels
        if (this._showAtomLabels) {
            for (const atom of visibleAtoms) {
                viewer.addLabel(atom.label, {
                    position: { x: atom.x, y: atom.y, z: atom.z },
                    fontSize: 11,
                    fontColor: 'white',
                    backgroundColor: 'black',
                    backgroundOpacity: 0.6,
                    borderThickness: 0,
                    inFront: true,
                });
            }
        }

        // Bond length labels
        if (this._showBondLabels) {
            for (const bond of visibleBonds) {
                const a = this._atoms[bond.i];
                const b = this._atoms[bond.j];

                if (!a || !b) continue;

                viewer.addLabel(bond.dist.toFixed(3), {
                    position: {
                        x: (a.x + b.x) / 2,
                        y: (a.y + b.y) / 2,
                        z: (a.z + b.z) / 2,
                    },
                    fontSize: 10,
                    fontColor: '#ffdd88',
                    backgroundColor: 'black',
                    backgroundOpacity: 0.5,
                    borderThickness: 0,
                    inFront: true,
                });
            }
        }

        // Click handler — use 3Dmol's 0-based atom.index, not serial.
        // atom.index maps to the atom position inside the currently loaded visible XYZ model.
        model.setClickable({}, true, (atom) => {
            if (!atom) return;

            const modelIndex = atom.index;
            const atomObj = visibleAtoms[modelIndex];

            if (!atomObj) return;

            if (this._onAtomClick) {
                this._onAtomClick(atomObj.index);
            }
        });

        // Planes
        if (this._plane1Data) {
            this._drawPlane(this._plane1Data, '#4a90d9');
        }

        if (this._plane2Data) {
            this._drawPlane(this._plane2Data, '#d94a4a');
        }

        // zoomTo only on first load, not on style updates
        if (!this._hasZoomed) {
            viewer.zoomTo();
            this._hasZoomed = true;
        }

        viewer.render();
    },

    _drawPlane({ planeResult, atoms }, color) {
        if (!planeResult || !atoms || atoms.length < 3) return;

        const { normal, centroid } = planeResult;
        const n = normal;
        const c = centroid;

        let maxR = 0;

        for (const atom of atoms) {
            const dx = atom.x - c.x;
            const dy = atom.y - c.y;
            const dz = atom.z - c.z;

            const pn = dx * n.x + dy * n.y + dz * n.z;

            const px = dx - pn * n.x;
            const py = dy - pn * n.y;
            const pz = dz - pn * n.z;

            maxR = Math.max(maxR, Math.sqrt(px * px + py * py + pz * pz));
        }

        maxR = Math.max(maxR + 0.7, 1.5);

        // Build two perpendicular vectors u and v inside the plane
        let u = Math.abs(n.x) > 0.9
            ? { x: 0, y: 1, z: 0 }
            : { x: 1, y: 0, z: 0 };

        const ud = u.x * n.x + u.y * n.y + u.z * n.z;

        u = {
            x: u.x - ud * n.x,
            y: u.y - ud * n.y,
            z: u.z - ud * n.z,
        };

        const ul = Math.sqrt(u.x ** 2 + u.y ** 2 + u.z ** 2);

        if (ul === 0) return;

        u = {
            x: u.x / ul,
            y: u.y / ul,
            z: u.z / ul,
        };

        const v = {
            x: n.y * u.z - n.z * u.y,
            y: n.z * u.x - n.x * u.z,
            z: n.x * u.y - n.y * u.x,
        };

        const corners = [
            {
                x: c.x + maxR * (+u.x + v.x),
                y: c.y + maxR * (+u.y + v.y),
                z: c.z + maxR * (+u.z + v.z),
            },
            {
                x: c.x + maxR * (-u.x + v.x),
                y: c.y + maxR * (-u.y + v.y),
                z: c.z + maxR * (-u.z + v.z),
            },
            {
                x: c.x + maxR * (-u.x - v.x),
                y: c.y + maxR * (-u.y - v.y),
                z: c.z + maxR * (-u.z - v.z),
            },
            {
                x: c.x + maxR * (+u.x - v.x),
                y: c.y + maxR * (+u.y - v.y),
                z: c.z + maxR * (+u.z - v.z),
            },
        ];

        this._viewer.addCustom({
            vertexArr: [
                corners[0],
                corners[1],
                corners[2],
                corners[0],
                corners[2],
                corners[3],
            ],
            normalArr: [n, n, n, n, n, n],
            faceArr: [0, 1, 2, 3, 4, 5],
            color,
            opacity: 0.25,
        });

        for (const [a, b] of [[0, 1], [1, 2], [2, 3], [3, 0]]) {
            this._viewer.addCylinder({
                start: corners[a],
                end: corners[b],
                radius: 0.03,
                color,
                fromCap: 0,
                toCap: 0,
            });
        }
    },

    getPNG() {
        return this._viewer ? this._viewer.pngURI() : null;
    },
};