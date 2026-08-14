// volumes.js — Van der Waals / SASA isosurface geometry (Gaussian-cube text
// for 3Dmol.js's addVolumetricData) and the three equivalent-sphere
// representations (r_eq, r_eq,Perrin, r_g).
//
// Numeric authority stays with dosy.js: Dosy.calcVdwVolume (fine, MoloVol-
// matched 0.2 A grid), Dosy.calcRadiusOfGyration, Dosy.calcAspectRatio and
// Dosy.calcPerrinFactor are the values that get displayed anywhere in the
// tool (including the little result label next to the viewer toggle). This
// module only concerns itself with the GEOMETRY shown in the 3D viewer —
// the isosurface mesh, or the sphere center/radius — which is built on a
// separate, coarser grid sized for interactive rendering, not for the
// numeric report.
//
// Isosurface strategy: build a per-voxel scalar field
//     f(p) = min_i( |p - atom_i| - r_i )
// (negative inside the union of — possibly probe-inflated — atomic
// spheres, 0 at the boundary, positive outside), serialize it as a
// Gaussian cube file, and hand it to 3Dmol.js's own isosurface/marching-
// cubes renderer via viewer.addVolumetricData(cubeText, 'cube',
// {isoval: 0, ...}) — confirmed API, see GLViewer.addVolumetricData. This
// reuses 3Dmol's own, already-exercised marching-cubes code instead of
// hand-rolling triangle generation here.
//
// Cube-format note: this project's cube files use the "negative grid
// count => already Angstrom" convention that 3Dmol.js's CUBE parser
// recognizes (see src/parsers/CUBE.ts: convFactor is 1 when the nx count
// on the grid-vector line is negative), so no Bohr conversion is needed —
// every coordinate below is already in the same Angstrom frame as the
// loaded structure.
//
// Known simplification: unlike Dosy.calcVdwVolume's SASA number (which
// flood-fills to exclude solvent-inaccessible interior cavities), the SASA
// *mesh* here is the raw probe-inflated sphere-union surface. For the vast
// majority of coordination/organometallic structures (no fully enclosed
// cage) this is visually identical to the flood-fill-corrected surface;
// only the reported SASA number (always from Dosy) is flood-fill-correct.

const Volumes = {

    // Default grid spacing for the interactive render mesh (deliberately
    // coarser than Dosy's 0.2 A numeric grid — this one has to redraw
    // interactively as elements/exclusions change).
    RENDER_SPACING: 0.45,

    MAX_FIELD_VOXELS: 1_600_000,

    // --- Signed "distance to union-of-inflated-spheres" field ---
    // Mirrors dosy.js's own bounding-box/per-atom-window approach (each
    // atom only visits voxels in its own padded box, not the whole grid),
    // so cost scales with atom count x sphere size, not total grid size.
    _buildField(atoms, radiusFn, spacing) {
        if (!atoms.length) return null;

        const marginVoxels = 3; // extra voxels of field beyond each atom's own radius, for a smooth crossing
        let h = spacing;

        let minX = Infinity, minY = Infinity, minZ = Infinity;
        let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

        const radii = atoms.map(a => radiusFn(a));

        for (let i = 0; i < atoms.length; i++) {
            const a = atoms[i], r = radii[i];
            minX = Math.min(minX, a.x - r); maxX = Math.max(maxX, a.x + r);
            minY = Math.min(minY, a.y - r); maxY = Math.max(maxY, a.y + r);
            minZ = Math.min(minZ, a.z - r); maxZ = Math.max(maxZ, a.z + r);
        }

        const pad = (marginVoxels + 1) * h;
        minX -= pad; minY -= pad; minZ -= pad;
        maxX += pad; maxY += pad; maxZ += pad;

        let nx = Math.max(2, Math.ceil((maxX - minX) / h));
        let ny = Math.max(2, Math.ceil((maxY - minY) / h));
        let nz = Math.max(2, Math.ceil((maxZ - minZ) / h));

        // Coarsen automatically rather than hang on a large/spread-out
        // structure — mirrors the safety net in Dosy.calcVdwVolume.
        while (nx * ny * nz > this.MAX_FIELD_VOXELS) {
            h *= 1.25;
            nx = Math.max(2, Math.ceil((maxX - minX) / h));
            ny = Math.max(2, Math.ceil((maxY - minY) / h));
            nz = Math.max(2, Math.ceil((maxZ - minZ) / h));
        }

        const FAR = 1e3; // unambiguously "outside" (isoval is 0)
        const field = new Float32Array(nx * ny * nz).fill(FAR);

        const strideX = ny * nz;
        const strideY = nz;

        for (let i = 0; i < atoms.length; i++) {
            const a = atoms[i];
            const r = radii[i];
            const rBox = r + marginVoxels * h;

            const ixMin = Math.max(0, Math.floor((a.x - rBox - minX) / h));
            const ixMax = Math.min(nx - 1, Math.ceil((a.x + rBox - minX) / h));
            const iyMin = Math.max(0, Math.floor((a.y - rBox - minY) / h));
            const iyMax = Math.min(ny - 1, Math.ceil((a.y + rBox - minY) / h));
            const izMin = Math.max(0, Math.floor((a.z - rBox - minZ) / h));
            const izMax = Math.min(nz - 1, Math.ceil((a.z + rBox - minZ) / h));

            for (let ix = ixMin; ix <= ixMax; ix++) {
                const vx = minX + ix * h;
                const dx = vx - a.x;
                const dx2 = dx * dx;

                for (let iy = iyMin; iy <= iyMax; iy++) {
                    const vy = minY + iy * h;
                    const dy = vy - a.y;
                    const dxy2 = dx2 + dy * dy;
                    const base = ix * strideX + iy * strideY;

                    for (let iz = izMin; iz <= izMax; iz++) {
                        const vz = minZ + iz * h;
                        const dz = vz - a.z;

                        const d = Math.sqrt(dxy2 + dz * dz) - r;
                        const idx = base + iz;
                        if (d < field[idx]) field[idx] = d;
                    }
                }
            }
        }

        return { field, nx, ny, nz, minX, minY, minZ, h };
    },

    // --- Serialize a field as a Gaussian cube, already in Angstrom ---
    // (negative grid counts signal "already Angstrom" to 3Dmol's parser —
    // see the module header note above).
    _toCube(gridResult, comment) {
        const { field, nx, ny, nz, minX, minY, minZ, h } = gridResult;
        const f6 = v => v.toFixed(6);

        const lines = [
            comment,
            'Generated by xyz2tab (Volumes module)',
            `1 ${f6(minX)} ${f6(minY)} ${f6(minZ)}`,
            `${-nx} ${f6(h)} 0.000000 0.000000`,
            `${-ny} 0.000000 ${f6(h)} 0.000000`,
            `${-nz} 0.000000 0.000000 ${f6(h)}`,
            // Single dummy H atom — the isosurface itself doesn't read
            // this, it's only present to keep the cube header spec-valid.
            `1 0.000000 ${f6(minX)} ${f6(minY)} ${f6(minZ)}`,
        ];

        const strideX = ny * nz;
        const strideY = nz;
        const row = [];

        for (let ix = 0; ix < nx; ix++) {
            for (let iy = 0; iy < ny; iy++) {
                const base = ix * strideX + iy * strideY;
                for (let iz = 0; iz < nz; iz++) {
                    row.push(field[base + iz].toPrecision(5));
                    if (row.length === 6) { lines.push(row.join(' ')); row.length = 0; }
                }
            }
        }
        if (row.length) lines.push(row.join(' '));

        return lines.join('\n');
    },

    // --- Public: isosurface cube text for a given mode id ---
    // mode: 'vdw_surface' | 'sasa'
    buildIsosurfaceCube(atoms, mode, spacing = this.RENDER_SPACING) {
        const probe = mode === 'sasa' ? Dosy.SASA_PROBE_RADIUS : 0;
        const radiusFn = a => Parser.getVdwRadius(a.element) + probe;
        const grid = this._buildField(atoms, radiusFn, spacing);
        if (!grid) return null;
        return this._toCube(grid, mode);
    },

    // --- Centers ---
    geometricCenter(atoms) {
        const n = atoms.length;
        if (!n) return { x: 0, y: 0, z: 0 };
        let x = 0, y = 0, z = 0;
        for (const a of atoms) { x += a.x; y += a.y; z += a.z; }
        return { x: x / n, y: y / n, z: z / n };
    },

    massWeightedCenter(atoms) {
        let M = 0, x = 0, y = 0, z = 0;
        for (const a of atoms) {
            const m = Parser.atomicWeights[a.element] || 0;
            M += m; x += m * a.x; y += m * a.y; z += m * a.z;
        }
        if (M <= 0) return this.geometricCenter(atoms);
        return { x: x / M, y: y / M, z: z / M };
    },

    // --- Public: sphere geometry for the r_eq / r_eq,Perrin (sphere) / r_g
    // modes. Returns { center, radius } or null.
    buildSphere(atoms, mode) {
        if (!atoms.length) return null;

        if (mode === 'r_g') {
            const rg = Dosy.calcRadiusOfGyration(atoms);
            return { center: this.massWeightedCenter(atoms), radius: rg };
        }

        if (mode === 'r_eq') {
            const { volume } = Dosy.calcVdwVolume(atoms);
            const r0 = Math.cbrt((3 * volume) / (4 * Math.PI));
            return { center: this.geometricCenter(atoms), radius: r0 };
        }

        if (mode === 'r_eq_perrin_sphere') {
            return { center: this.geometricCenter(atoms), radius: this.getPerrinRadius(atoms) };
        }

        return null;
    },

    // The scalar r_eq,Perrin value (same number Dosy uses for the DOSY/MW
    // estimate) — this IS the radius of the r_eq,Perrin sphere above, and
    // is also what the Perrin ellipsoid's semi-axes are built from.
    getPerrinRadius(atoms) {
        if (!atoms.length) return 0;
        const { volume } = Dosy.calcVdwVolume(atoms);
        const r0 = Math.cbrt((3 * volume) / (4 * Math.PI));
        const { p } = Dosy.calcAspectRatio(atoms);
        return Dosy.calcPerrinFactor(p) * r0;
    },

    // --- Public: the actual Perrin equivalent spheroid (ellipsoid of
    // revolution) — same volume as the vdW-volume sphere, aspect ratio p
    // and orientation from the geometric gyration tensor (Dosy.calcAspectRatio).
    // a^2 * c = r0^3 (volume-matched), c = p * a  =>  a = r0/p^(1/3),
    // c = r0*p^(2/3). Centered at the geometric center, same as r_eq.
    buildEllipsoid(atoms) {
        if (!atoms.length) return null;

        const { volume } = Dosy.calcVdwVolume(atoms);
        const r0 = Math.cbrt((3 * volume) / (4 * Math.PI));
        const { p, axis } = Dosy.calcAspectRatio(atoms);

        const aEq = r0 / Math.cbrt(p);
        const cAx = r0 * Math.cbrt(p * p);

        return { center: this.geometricCenter(atoms), axis, aEq, cAx };
    },

    // --- Triangle mesh (3Dmol addCustom convention: vertexArr/normalArr/
    // faceArr of {x,y,z} / flat indices) for a spheroid: two equal
    // "equatorial" semi-axes aEq, one unique "axial" semi-axis cAx along
    // `axis` (unit vector), centered at `center`.
    buildSpheroidMesh(center, axis, aEq, cAx, lonSegments = 24, latSegments = 14) {
        // Rotation mapping local +z to `axis` (Rodrigues' formula).
        const al = Math.hypot(axis.x, axis.y, axis.z) || 1;
        const t = { x: axis.x / al, y: axis.y / al, z: axis.z / al };
        const dot = t.z; // dot(z-hat, t)

        let rot;
        if (dot > 0.999999) {
            rot = v => v;
        } else if (dot < -0.999999) {
            rot = v => ({ x: v.x, y: -v.y, z: -v.z });
        } else {
            // axis of rotation = z-hat x t = (-t.y, t.x, 0)
            const axLen = Math.hypot(t.y, t.x) || 1;
            const u = { x: -t.y / axLen, y: t.x / axLen, z: 0 };
            const angle = Math.acos(Math.max(-1, Math.min(1, dot)));
            const s = Math.sin(angle), c = Math.cos(angle), ic = 1 - c;
            const m = [
                [c + u.x * u.x * ic,        u.x * u.y * ic - u.z * s,  u.x * u.z * ic + u.y * s],
                [u.y * u.x * ic + u.z * s,  c + u.y * u.y * ic,        u.y * u.z * ic - u.x * s],
                [u.z * u.x * ic - u.y * s,  u.z * u.y * ic + u.x * s,  c + u.z * u.z * ic],
            ];
            rot = v => ({
                x: m[0][0] * v.x + m[0][1] * v.y + m[0][2] * v.z,
                y: m[1][0] * v.x + m[1][1] * v.y + m[1][2] * v.z,
                z: m[2][0] * v.x + m[2][1] * v.y + m[2][2] * v.z,
            });
        }

        const vertexArr = [];
        const normalArr = [];

        // Standard lat-long unit-sphere tessellation, scaled to
        // (aEq, aEq, cAx) in the local frame, then rotated + translated.
        for (let iLat = 0; iLat <= latSegments; iLat++) {
            const theta = Math.PI * iLat / latSegments; // 0..pi
            const sinT = Math.sin(theta), cosT = Math.cos(theta);

            for (let iLon = 0; iLon <= lonSegments; iLon++) {
                const phi = 2 * Math.PI * iLon / lonSegments; // 0..2pi
                const ux = sinT * Math.cos(phi), uy = sinT * Math.sin(phi), uz = cosT;

                const local = { x: ux * aEq, y: uy * aEq, z: uz * cAx };
                const wl = rot(local);
                vertexArr.push({ x: center.x + wl.x, y: center.y + wl.y, z: center.z + wl.z });

                // Normal transforms by the inverse-transpose of the
                // (diagonal) scale, i.e. by (1/aEq, 1/aEq, 1/cAx); the
                // rotation itself is orthonormal so it applies unchanged.
                const nLocal = { x: ux / aEq, y: uy / aEq, z: uz / cAx };
                const nr = rot(nLocal);
                const nLen = Math.hypot(nr.x, nr.y, nr.z) || 1;
                normalArr.push({ x: nr.x / nLen, y: nr.y / nLen, z: nr.z / nLen });
            }
        }

        const faceArr = [];
        const stride = lonSegments + 1;
        for (let iLat = 0; iLat < latSegments; iLat++) {
            for (let iLon = 0; iLon < lonSegments; iLon++) {
                const a = iLat * stride + iLon;
                const b = a + stride;
                const c = a + 1;
                const d = b + 1;
                faceArr.push(a, b, c, b, d, c);
            }
        }

        return { vertexArr, normalArr, faceArr };
    },

    // --- Mode metadata shared by the dropdown (app.volumes.js) and the
    // viewer overlay (viewer.js). Every kind is drawn as a translucent
    // solid + wireframe outline pair, styled identically in viewer.js —
    // this list only decides which geometry a mode maps to.
    MODES: [
        { id: 'vdw_surface',        label: 'Van der Waals Surface',      kind: 'isosurface', color: '#4a90d9' },
        { id: 'sasa',               label: 'SASA',                       kind: 'isosurface', color: '#e0a030' },
        { id: 'r_eq',               label: 'r_eq (geom. center)',        kind: 'sphere',      color: '#8ac926' },
        { id: 'r_eq_perrin',        label: 'Perrin ellipsoid',           kind: 'ellipsoid',   color: '#c968e0' },
        { id: 'r_eq_perrin_sphere', label: 'r_eq Perrin (sphere)',       kind: 'sphere',      color: '#c968e0' },
        { id: 'r_g',                label: 'r_g (mass-weighted center)', kind: 'sphere',      color: '#e05a5a' },
    ],

    getMode(id) {
        return this.MODES.find(m => m.id === id) || this.MODES[0];
    },
};
