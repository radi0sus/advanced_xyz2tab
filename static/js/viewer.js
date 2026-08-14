// viewer.js — 3Dmol wrapper

// --- Axes gizmo helpers (ported from mo-viewer's "Show axes" feature) ---
// A small 2D canvas overlay drawn on top of the 3Dmol canvas, showing the
// molecule-frame X/Y/Z unit vectors as colored arrows that rotate together
// with the model. Kept as plain module-scope helpers (no `this`) since they
// only do 2D canvas math; Viewer just supplies the live view quaternion.
const GIZMO_HOME = {
    x: { x: 1, y: 0, z: 0 },
    y: { x: 0, y: 1, z: 0 },
    z: { x: 0, y: 0, z: 1 },
};
const GIZMO_COLORS = { x: '#e6483c', y: '#2fae4e', z: '#2f8fe6' };

// Translucent halo color for selected atoms (matches xyzalign's styling).
const SELECTION_COLOR = '#00d4ff';

// Uniform atom sphere radius, except hydrogens are drawn a bit smaller —
// matches the usual convention in molecular viewers.
const DEFAULT_ATOM_RADIUS = 0.22;
const HYDROGEN_ATOM_RADIUS = 0.16;

function getAtomRadius(el) {
    return el === 'H' ? HYDROGEN_ATOM_RADIUS : DEFAULT_ATOM_RADIUS;
}

function gizmoQuatRotate(q, v) {
    const tx = 2 * (q.y * v.z - q.z * v.y);
    const ty = 2 * (q.z * v.x - q.x * v.z);
    const tz = 2 * (q.x * v.y - q.y * v.x);
    return {
        x: v.x + q.w * tx + (q.y * tz - q.z * ty),
        y: v.y + q.w * ty + (q.z * tx - q.x * tz),
        z: v.z + q.w * tz + (q.x * ty - q.y * tx),
    };
}

function drawAxesTriad(ctx, q, cx, cy, len, style) {
    const { lineWidth, headLen, fontSize, labelPad } = style;

    const axes = ['x', 'y', 'z'].map(key => ({
        key,
        rotated: gizmoQuatRotate(q, GIZMO_HOME[key]),
        color: GIZMO_COLORS[key],
    }));

    // Draw back-to-front so nearer axes overlap farther ones.
    axes.sort((a, b) => a.rotated.z - b.rotated.z);

    for (const axis of axes) {
        const endX = cx + axis.rotated.x * len;
        const endY = cy - axis.rotated.y * len;
        const depth = (axis.rotated.z + 1) / 2; // 0 (far) .. 1 (near)
        const alpha = 0.55 + depth * 0.45;

        // Cap the arrowhead length to a fraction of this axis's own
        // projected (screen-space) length, so a strongly foreshortened
        // axis doesn't have its head swallow the whole shaft.
        const projLen = Math.hypot(endX - cx, endY - cy);
        const effHeadLen = Math.min(headLen, projLen * 0.45);
        const angle = Math.atan2(endY - cy, endX - cx);
        const shaftEndX = endX - effHeadLen * Math.cos(angle);
        const shaftEndY = endY - effHeadLen * Math.sin(angle);

        ctx.globalAlpha = alpha;
        ctx.strokeStyle = axis.color;
        ctx.fillStyle = axis.color;
        ctx.lineWidth = lineWidth;

        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(shaftEndX, shaftEndY);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(endX, endY);
        ctx.lineTo(
            endX - effHeadLen * Math.cos(angle - Math.PI / 6),
            endY - effHeadLen * Math.sin(angle - Math.PI / 6)
        );
        ctx.lineTo(
            endX - effHeadLen * Math.cos(angle + Math.PI / 6),
            endY - effHeadLen * Math.sin(angle + Math.PI / 6)
        );
        ctx.closePath();
        ctx.fill();

        ctx.font = `600 ${fontSize}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const labelX = cx + axis.rotated.x * (len + labelPad);
        const labelY = cy - axis.rotated.y * (len + labelPad);
        ctx.fillText(axis.key.toUpperCase(), labelX, labelY);
    }

    ctx.globalAlpha = 1;
}

// Patcht ein einzelnes GLShape so, dass es nach jeder internen
// Neu-Erzeugung (globj wird bei JEDEM viewer.render() neu aufgerufen
// und baut das Material komplett neu, auch depthWrite wird dabei
// wieder auf true zurückgesetzt) depthWrite selbst wieder deaktiviert.
function _disableDepthWrite(shape) {
    const origGlobj = shape.globj.bind(shape);
    shape.globj = function (group, exts) {
        origGlobj(group, exts);
        if (shape.renderedShapeObj) {
            shape.renderedShapeObj.children.forEach(child => {
                if (child.material) child.material.depthWrite = false;
            });
        }
    };
}

const Viewer = {

    _viewer: null,
    _model: null,
    _atoms: null,
    _bonds: null,
    _showAtomLabels: false,
    _showBondLabels: false,
    _highlightedAtoms: new Set(),
    _highlightShapes: [],
    _activeElements: null,
    _excludedAtoms: new Set(),
    _plane1Data: null,
    _plane2Data: null,
    _showPlanes: true,
    _onAtomClick: null,
    _renderTimer: null,
    _hasZoomed: false,
    _needsInitialZoomFit: false,

    // Axes gizmo + element legend overlays, both default ON
    _showAxes: true,
    _showLegend: true,
    _gizmoCanvas: null,
    _gizmoCtx: null,

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

        this._viewer.setViewChangeCallback(() => this._drawGizmo());

        this.applyThemeBackground();

        // Reflect default-on state of the axes/legend toggles right away.
        this.setShowAxes(this._showAxes);
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
        this._needsInitialZoomFit = true;

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

    setShowAxes(enabled) {
        this._showAxes = enabled;

        if (!this._gizmoCanvas) {
            this._gizmoCanvas = document.getElementById('axes-gizmo');
            this._gizmoCtx = this._gizmoCanvas ? this._gizmoCanvas.getContext('2d') : null;
        }

        if (this._gizmoCanvas) {
            this._gizmoCanvas.classList.toggle('visible', enabled);
        }

        if (enabled) this._drawGizmo();
    },

    setShowLegend(enabled) {
        this._showLegend = enabled;
        this._renderLegend();
    },

    setShowPlanes(enabled) {
        this._showPlanes = enabled;
        this._scheduleFullRender();
    },

    _drawGizmo() {
        if (!this._showAxes || !this._gizmoCtx || !this._viewer) return;

        const w = this._gizmoCanvas.width;
        const h = this._gizmoCanvas.height;
        const cx = w / 2;
        const cy = h / 2;
        const len = Math.min(w, h) * 0.27;

        const view = this._viewer.getView();
        // getView(): [posX, posY, posZ, dist, q.x, q.y, q.z, q.w, ...]
        const q = { x: view[4], y: view[5], z: view[6], w: view[7] };

        this._gizmoCtx.clearRect(0, 0, w, h);
        drawAxesTriad(this._gizmoCtx, q, cx, cy, len, {
            lineWidth: 2.5,
            headLen: 7,
            fontSize: 11,
            labelPad: 13,
        });
    },

    // Element color legend, built from whichever atoms are currently
    // visible in the 3D viewer (respects element/exclude filters).
    _renderLegend() {
        const el = document.getElementById('viewer-legend');
        if (!el) return;

        if (!this._showLegend || !this._visibleAtoms || !this._visibleAtoms.length) {
            el.innerHTML = '';
            return;
        }

        const elements = [...new Set(this._visibleAtoms.map(a => a.element))];
        const priority = { C: 0, H: 1 };

        elements.sort((a, b) => {
            const pa = priority[a] ?? 2;
            const pb = priority[b] ?? 2;
            if (pa !== pb) return pa - pb;
            return a.localeCompare(b);
        });

        el.innerHTML = elements
            .map(s => `<div class="viewer-legend-item"><span class="viewer-legend-swatch" style="background:${Parser.getColor(s)}"></span><span>${s}</span></div>`)
            .join('');
    },

    // 3Dmol's zoomTo() fits the model's bounding sphere with zero padding,
    // so depending on the container's aspect ratio the molecule can end up
    // touching (or slightly exceeding) the top/bottom or left/right edges.
    // Zooming back out by a small factor afterwards adds a consistent
    // margin on all sides.
    _zoomToFit() {
        if (!this._viewer) return;
        this._viewer.zoomTo();
        this._viewer.zoom(0.8);
    },

    resetView() {
        if (this._viewer) {
            this._zoomToFit();
            this._viewer.render();
        }
    },

    resize() {
        if (!this._viewer) return;

        if (typeof this._viewer.resize === 'function') {
            this._viewer.resize();
        }

        // The container can still have been hidden (display:none, zero
        // size) at the moment _fullRender() first called zoomTo(), which
        // leaves the camera fit to the wrong aspect ratio/size and can
        // crop part of the molecule. Re-fit once here, after layout has
        // settled to its real on-screen size, but only for the initial
        // load — not on every later resize (e.g. panel dragging), so we
        // don't clobber the user's own pan/zoom.
        if (this._needsInitialZoomFit) {
            this._needsInitialZoomFit = false;
            this._zoomToFit();
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

    // Removes any previously drawn selection halo shapes from the scene.
    _clearHighlightShapes() {
        if (!this._viewer) return;

        for (const shape of this._highlightShapes) {
            this._viewer.removeShape(shape);
        }

        this._highlightShapes = [];
    },

    // Draws a translucent solid sphere + wireframe outline around each
    // selected atom, leaving the atom's own element color/size untouched
    // (matches xyzalign's selection styling).
    _drawSelectionHalos() {
        if (!this._viewer || !this._atoms) return;
    
        this._clearHighlightShapes();
    
        for (const atomIndex of this._highlightedAtoms) {
            const atom = this._atoms[atomIndex];
            if (!atom) continue;
    
            const center = { x: atom.x, y: atom.y, z: atom.z };
    
            const solid = this._viewer.addSphere({
                center, radius: 0.34, color: SELECTION_COLOR, opacity: 0.45,
            });
            _disableDepthWrite(solid);
            this._highlightShapes.push(solid);
    
            const wire = this._viewer.addSphere({
                center, radius: 0.38, color: SELECTION_COLOR, wireframe: true, opacity: 0.9,
            });
            _disableDepthWrite(wire);
            this._highlightShapes.push(wire);
        }
    },
    
    // Apply highlight only — fast, no model rebuild, no zoomTo
    _applyHighlight() {
        if (!this._model || !this._viewer) return;

        const model = this._model;
        //const visible = this._visibleAtoms || [];
        const visible = this._visibleAtoms && this._visibleAtoms.length
            ? this._visibleAtoms
            : [];

        // Keep every atom at its plain element color/size — selection is
        // shown via a halo sphere instead of recoloring the atom itself.
        const elements = [...new Set(visible.map(a => a.element))];

        for (const el of elements) {
            model.setStyle(
                { elem: el },
                { sphere: { radius: getAtomRadius(el), color: Parser.getColor(el) } }
            );
        }

        this._drawSelectionHalos();

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
                { sphere: { radius: getAtomRadius(el), color: Parser.getColor(el) } }
            );
        }

        // Selection is drawn as a halo sphere, not by recoloring the atom.
        this._highlightShapes = [];
        this._drawSelectionHalos();

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
        if (this._showPlanes) {
            if (this._plane1Data) {
                this._drawPlane(this._plane1Data, '#4a90d9');
            }

            if (this._plane2Data) {
                this._drawPlane(this._plane2Data, '#d94a4a');
            }
        }

        // zoomTo only on first load, not on style updates
        if (!this._hasZoomed) {
            this._zoomToFit();
            this._hasZoomed = true;
        }

        viewer.render();

        this._renderLegend();
        this._drawGizmo();
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

        const planeShape = this._viewer.addCustom({
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
        // Prevent this translucent quad from writing to the depth buffer —
        // otherwise, depending on view angle, it can get sorted before
        // other transparent shapes (e.g. the selection halo) and either
        // block them or get fully culled by their depth writes.
        _disableDepthWrite(planeShape);

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

    async getPNG() {
        if (!this._viewer) return null;

        const baseUri = this._viewer.pngURI();

        // Nothing to composite — return the plain render as-is.
        if (!this._showAxes && !(this._showLegend && this._visibleAtoms && this._visibleAtoms.length)) {
            return baseUri;
        }

        try {
            return await this._composeExportImage(baseUri);
        } catch (err) {
            console.error('PNG export: overlay compositing failed, using plain render', err);
            return baseUri;
        }
    },

    // Bakes the axes gizmo and/or element legend into a copy of the
    // rendered PNG, so the exported image matches what's shown on screen.
    async _composeExportImage(baseUri) {
        const img = await new Promise((resolve, reject) => {
            const image = new Image();
            image.onload = () => resolve(image);
            image.onerror = reject;
            image.src = baseUri;
        });

        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);

        // Scale overlay sizes/positions from on-screen CSS pixels to the
        // exported image's (often higher-DPI) pixel size.
        const outer = document.getElementById('viewer-outer');
        const cssRect = outer ? outer.getBoundingClientRect() : null;
        const scale = cssRect && cssRect.width > 0
            ? img.width / cssRect.width
            : (window.devicePixelRatio || 1);

        if (this._showAxes) {
            this._drawGizmoOnExport(ctx, scale);
        }

        if (this._showLegend && this._visibleAtoms && this._visibleAtoms.length) {
            this._drawLegendOnExport(ctx, scale);
        }

        return canvas.toDataURL('image/png');
    },

    _drawGizmoOnExport(ctx, scale) {
        if (!this._viewer) return;

        const pad = 8 * scale;
        const size = 108 * scale;
        const cx = ctx.canvas.width - pad - size / 2;
        const cy = pad + size / 2;
        const len = size * 0.27;

        const view = this._viewer.getView();
        const q = { x: view[4], y: view[5], z: view[6], w: view[7] };

        drawAxesTriad(ctx, q, cx, cy, len, {
            lineWidth: 2.5 * scale,
            headLen: 7 * scale,
            fontSize: 11 * scale,
            labelPad: 13 * scale,
        });
    },

    _drawLegendOnExport(ctx, scale) {
        const elements = [...new Set(this._visibleAtoms.map(a => a.element))];
        const priority = { C: 0, H: 1 };

        elements.sort((a, b) => {
            const pa = priority[a] ?? 2;
            const pb = priority[b] ?? 2;
            if (pa !== pb) return pa - pb;
            return a.localeCompare(b);
        });

        const pad = 8 * scale;
        const boxPadX = 10 * scale;
        const boxPadY = 6 * scale;
        const rowH = 15 * scale;
        const swatchR = 5 * scale;
        const fontSize = 11.5 * scale;
        const gap = 6 * scale;

        ctx.font = `${fontSize}px sans-serif`;

        let maxTextW = 0;
        for (const el of elements) {
            maxTextW = Math.max(maxTextW, ctx.measureText(el).width);
        }

        const boxW = boxPadX * 2 + swatchR * 2 + gap + maxTextW;
        const boxH = boxPadY * 2 + rowH * elements.length;
        const boxX = pad;
        const boxY = ctx.canvas.height - pad - boxH;

        ctx.save();
        ctx.fillStyle = 'rgba(30,30,26,0.85)';
        this._roundRectPath(ctx, boxX, boxY, boxW, boxH, 6 * scale);
        ctx.fill();

        elements.forEach((el, i) => {
            const rowY = boxY + boxPadY + rowH * i + rowH / 2;
            const swatchCx = boxX + boxPadX + swatchR;

            ctx.beginPath();
            ctx.fillStyle = Parser.getColor(el);
            ctx.arc(swatchCx, rowY, swatchR, 0, Math.PI * 2);
            ctx.fill();
            ctx.lineWidth = Math.max(1, scale);
            ctx.strokeStyle = 'rgba(255,255,255,0.5)';
            ctx.stroke();

            ctx.fillStyle = '#f0f0ec';
            ctx.textBaseline = 'middle';
            ctx.textAlign = 'left';
            ctx.fillText(el, swatchCx + swatchR + gap, rowY);
        });

        ctx.restore();
    },

    _roundRectPath(ctx, x, y, w, h, r) {
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.arcTo(x + w, y, x + w, y + h, r);
        ctx.arcTo(x + w, y + h, x, y + h, r);
        ctx.arcTo(x, y + h, x, y, r);
        ctx.arcTo(x, y, x + w, y, r);
        ctx.closePath();
    },
};