// dosy.js — DOSY-related size estimates: van der Waals volume (voxel grid,
// Alvarez 2013 radii — same default radii set as MoloVol, so volumes should
// be directly comparable at matching grid resolution), and an equivalent-
// sphere radius r_eq derived purely from that volume/shape — NOT the
// experimentally meaningful "hydrodynamic radius" (which is, by definition,
// whatever radius makes measured D match Stokes-Einstein). r_eq is only a
// geometric proxy and is systematically too large for small, non-spherical
// solutes (see README) — this is deliberately not called r_H anywhere in
// the tool to avoid implying it's calibrated against real diffusion data.
//
// No exclusions are applied here — always uses every atom of the currently
// loaded .xyz file.

const Dosy = {

    // --- Van der Waals volume via voxel grid (MoloVol-style) ---
    // Marks, per atom, only the voxels inside that atom's own bounding box
    // (not the whole grid), so cost scales with atom count x sphere size,
    // not with total grid size.
    calcVdwVolume(atoms, targetSpacing = 0.2, maxVoxels = 20_000_000) {
        if (!atoms.length) return { volume: 0, gridSpacing: targetSpacing, voxelCount: 0 };

        const radii = atoms.map(a => Parser.getVdwRadius(a.element));

        let minX = Infinity, minY = Infinity, minZ = Infinity;
        let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
        atoms.forEach((a, i) => {
            const r = radii[i];
            minX = Math.min(minX, a.x - r); maxX = Math.max(maxX, a.x + r);
            minY = Math.min(minY, a.y - r); maxY = Math.max(maxY, a.y + r);
            minZ = Math.min(minZ, a.z - r); maxZ = Math.max(maxZ, a.z + r);
        });

        const dimX = maxX - minX, dimY = maxY - minY, dimZ = maxZ - minZ;

        // Coarsen the grid automatically for very large/spread-out structures
        // so memory stays bounded, rather than failing or freezing the tab.
        let h = targetSpacing;
        let nx, ny, nz;
        do {
            nx = Math.max(1, Math.ceil(dimX / h) + 2);
            ny = Math.max(1, Math.ceil(dimY / h) + 2);
            nz = Math.max(1, Math.ceil(dimZ / h) + 2);
            if (nx * ny * nz <= maxVoxels) break;
            h *= 1.15;
        } while (true);

        const grid = new Uint8Array(nx * ny * nz);
        const strideX = ny * nz, strideY = nz;

        atoms.forEach((a, i) => {
            const r = radii[i];
            const r2 = r * r;

            // Voxel-index range covering this atom's sphere, clamped to grid.
            const ixMin = Math.max(0, Math.floor((a.x - r - minX) / h));
            const ixMax = Math.min(nx - 1, Math.ceil((a.x + r - minX) / h));
            const iyMin = Math.max(0, Math.floor((a.y - r - minY) / h));
            const iyMax = Math.min(ny - 1, Math.ceil((a.y + r - minY) / h));
            const izMin = Math.max(0, Math.floor((a.z - r - minZ) / h));
            const izMax = Math.min(nz - 1, Math.ceil((a.z + r - minZ) / h));

            for (let ix = ixMin; ix <= ixMax; ix++) {
                const vx = minX + (ix + 0.5) * h;
                const dx = vx - a.x, dx2 = dx * dx;
                if (dx2 > r2) continue;
                for (let iy = iyMin; iy <= iyMax; iy++) {
                    const vy = minY + (iy + 0.5) * h;
                    const dy = vy - a.y, dy2 = dy * dy;
                    if (dx2 + dy2 > r2) continue;
                    const base = ix * strideX + iy * strideY;
                    for (let iz = izMin; iz <= izMax; iz++) {
                        const vz = minZ + (iz + 0.5) * h;
                        const dz = vz - a.z;
                        if (dx2 + dy2 + dz * dz <= r2) grid[base + iz] = 1;
                    }
                }
            }
        });

        let count = 0;
        for (let k = 0; k < grid.length; k++) count += grid[k];

        return { volume: count * h * h * h, gridSpacing: h, voxelCount: nx * ny * nz };
    },

    // --- Shape (aspect ratio) from the geometric gyration tensor ---
    // Unweighted atom-center positions (every atom counts equally, not
    // mass-weighted), but each atom additionally contributes its own vdW
    // radius isotropically (self-gyration of a uniform sphere = r^2/5),
    // i.e. the molecule is treated as a union of vdW spheres rather than a
    // cloud of points. Without this, exactly planar molecules (e.g.
    // square-planar PtCl4, or any perfectly flat ring system) would have a
    // zero eigenvalue perpendicular to the plane and an (unphysically)
    // infinitely thin equivalent ellipsoid, blowing up the Perrin factor.
    // For a uniform ellipsoid with semi-axes (a,b,c), the gyration-tensor
    // eigenvalue along an axis equals (semi-axis)^2 / 5, so the ratio of the
    // axial to the (averaged) equatorial eigenvalue, square rooted, is
    // exactly the Perrin aspect ratio p = axial/equatorial — independent of
    // the 1/5 constant and of absolute size.
    calcAspectRatio(atoms) {
        const n = atoms.length;
        if (n < 2) return { p: 1, shape: 'sphere' };

        let cx = 0, cy = 0, cz = 0;
        for (const a of atoms) { cx += a.x; cy += a.y; cz += a.z; }
        cx /= n; cy /= n; cz /= n;

        let xx = 0, yy = 0, zz = 0, xy = 0, xz = 0, yz = 0;
        for (const a of atoms) {
            const dx = a.x - cx, dy = a.y - cy, dz = a.z - cz;
            const rSelf2 = Parser.getVdwRadius(a.element) ** 2 / 5;
            xx += dx * dx + rSelf2; yy += dy * dy + rSelf2; zz += dz * dz + rSelf2;
            xy += dx * dy; xz += dx * dz; yz += dy * dz;
        }
        xx /= n; yy /= n; zz /= n; xy /= n; xz /= n; yz /= n;

        const { values } = Chem._jacobi3x3([[xx, xy, xz], [xy, yy, yz], [xz, yz, zz]]);
        const sorted = [...values].sort((a, b) => b - a).map(v => Math.max(v, 0));
        const [l1, l2, l3] = sorted;

        const d12 = l1 - l2, d23 = l2 - l3;
        let shape, lAx, lEq;
        if (d23 <= d12) {
            // The two smaller eigenvalues are closer together -> those two
            // form the equatorial plane, the largest is the unique (longer)
            // axis -> prolate (cigar-shaped).
            shape = 'prolate'; lAx = l1; lEq = (l2 + l3) / 2;
        } else {
            // The two larger eigenvalues are closer together -> those two
            // form the (longer) equatorial plane, the smallest is the
            // unique (shorter) axis -> oblate (disc-shaped).
            shape = 'oblate'; lAx = l3; lEq = (l1 + l2) / 2;
        }

        const p = lEq > 1e-10 ? Math.sqrt(lAx / lEq) : 1;
        return { p, shape };
    },

    // --- Radius of gyration (standard/IUPAC definition) ---
    // Mass-weighted over atom positions (nuclei), matching the classical
    // polymer-physics/IUPAC definition (Rg^2 = (1/M) sum m_i |r_i-r_cm|^2)
    // and the convention used by LAMMPS' compute_gyration, GROMACS' gmx
    // gyrate, and OVITO. This is a genuinely different quantity from a
    // volumetric/grid-based "radius of gyration of the filled vdW shape"
    // (as used e.g. by Miyamoto & Shimono, Molecules 2020) — that
    // definition was tried here previously and dropped: it isn't the
    // standard meaning of the term, isn't reproducible without knowing
    // their exact grid parameters, and gave a result substantially larger
    // than this standard Rg for the same structure.
    calcRadiusOfGyration(atoms) {
        let M = 0, cx = 0, cy = 0, cz = 0;
        for (const a of atoms) {
            const m = Parser.atomicWeights[a.element] || 0;
            M += m; cx += m * a.x; cy += m * a.y; cz += m * a.z;
        }
        if (M <= 0) return 0;
        cx /= M; cy /= M; cz /= M;

        let s = 0;
        for (const a of atoms) {
            const m = Parser.atomicWeights[a.element] || 0;
            const dx = a.x - cx, dy = a.y - cy, dz = a.z - cz;
            s += m * (dx * dx + dy * dy + dz * dz);
        }
        return Math.sqrt(s / M);
    },

    // --- Perrin translational shape factor F(p) = f/f0 ---
    // f0 = friction of a sphere of the same volume; F is size-independent,
    // a function of the aspect ratio p alone. Derived from the exact
    // Kim & Karrila (1991, Table 3.4/3.6) resistance functions for prolate/
    // oblate spheroids, orientation-averaged as D_avg = (D_par + 2 D_perp)/3
    // (the isotropic average relevant for a freely tumbling molecule in
    // solution, as used e.g. in Ortega & Garcia de la Torre's treatments).
    calcPerrinFactor(p) {
        if (!isFinite(p) || Math.abs(p - 1) < 1e-3) return 1;

        if (p > 1) {
            // Prolate: axial semi-axis c = p * a (equatorial), e = eccentricity.
            const e = Math.sqrt(1 - 1 / (p * p));
            const e3 = e * e * e;
            const L = Math.log((1 + e) / (1 - e));

            const muPar = (3 / 8) * (-2 * e + (1 + e * e) * L) / e3;
            const muPerp = (3 / 16) * (2 * e + (3 * e * e - 1) * L) / e3;
            const gPar = 1 / muPar, gPerp = 1 / muPerp;

            // Equivalent-sphere radius r0, in units of the axial semi-axis c:
            // volume = (4/3)pi a^2 c = (4/3)pi c^3 / p^2  =>  r0 = c / p^(2/3)
            const g0 = 1 / Math.pow(p, 2 / 3);

            const gEff = 3 / (1 / gPar + 2 / gPerp);
            return gEff / g0;
        }

        // Oblate: r = p = c/a < 1 (c = axial/short, a = equatorial/long).
        const r = p;
        const s = Math.sqrt(1 - r * r);
        const acot = Math.atan(s / r); // arccot(r/s)

        const Fpar = Math.pow(r, -1 / 3) * ((4 / 3) * s ** 3) / ((1 - 2 * r * r) * acot + r * s);
        const Fperp = Math.pow(r, -1 / 3) * ((8 / 3) * s ** 3) / ((3 - 2 * r * r) * acot - r * s);

        // Here ζ0 = 6πηL already equals the sphere-of-same-volume friction
        // by construction (Kim & Karrila's constant-volume normalisation),
        // so Fpar/Fperp are already ζ/ζ0 — no separate g0 division needed.
        return 3 / (1 / Fpar + 2 / Fperp);
    },

    // --- Combined DOSY estimate ---
    // No exclusions: always uses every atom in the currently loaded file.
    calcEstimate(atoms) {
        const { volume, gridSpacing } = this.calcVdwVolume(atoms);
        const r0 = Math.cbrt((3 * volume) / (4 * Math.PI));
        const { p, shape } = this.calcAspectRatio(atoms);
        const F = this.calcPerrinFactor(p);
        const rg = this.calcRadiusOfGyration(atoms);

        return {
            volume,
            gridSpacing,
            r0,
            p,
            shape,
            F,
            rEqCorrected: F * r0,
            rg,
        };
    },
};
