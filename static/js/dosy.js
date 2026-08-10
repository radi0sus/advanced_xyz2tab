// dosy.js — DOSY-related size estimates: van der Waals volume (voxel grid,
// numerically matched against MoloVol's grid alignment/voxel classification
// algorithm — see README), an equivalent-sphere radius r_eq derived purely
// from that volume, and the standard (IUPAC) radius of gyration r_g. r_eq is
// a geometric proxy — NOT the experimentally meaningful "hydrodynamic
// radius" (which is, by definition, whatever radius makes measured D match
// Stokes-Einstein) — this is deliberately not called r_H anywhere in the
// tool to avoid implying it's calibrated against real diffusion data.
//
// No exclusions are applied here — always uses every atom of the currently
// loaded .xyz file.

const Dosy = {

    // --- Van der Waals volume via voxel grid (MoloVol-style) ---
    // Marks, per atom, only the voxels inside that atom's own bounding box
    // (not the whole grid), so cost scales with atom count x sphere size,
    // not with total grid size.
    // --- Van der Waals volume via MoloVol-compatible voxel grid ---
    calcVdwVolume(atoms, targetSpacing = 0.2, maxVoxels = 20_000_000) {
        if (!atoms.length) {
            return {
                volume: 0,
                gridSpacing: targetSpacing,
                voxelCount: 0
            };
        }
    
        const h = targetSpacing;
        const radii = atoms.map(a => Parser.getVdwRadius(a.element));
    
        /*
         * MoloVol:
         *
         *   setBoundaries(atoms, r_probe + 2*grid_size)
         *
         * followed by
         *
         *   cart_min -= (add_space + max_radius)
         *   cart_max += (add_space + max_radius)
         *
         * and finally alignment of cart_min to the grid origin.
         *
         * For a pure vdW calculation we use r_probe = 0.
         */
        let minX = Infinity, minY = Infinity, minZ = Infinity;
        let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
        let maxRadius = 0;
    
        for (let i = 0; i < atoms.length; i++) {
            const a = atoms[i];
            const r = radii[i];
    
            minX = Math.min(minX, a.x);
            minY = Math.min(minY, a.y);
            minZ = Math.min(minZ, a.z);
    
            maxX = Math.max(maxX, a.x);
            maxY = Math.max(maxY, a.y);
            maxZ = Math.max(maxZ, a.z);
    
            maxRadius = Math.max(maxRadius, r);
        }
    
        // MoloVol: add_space = r_probe + 2*grid_size
        // For vdW: r_probe = 0
        const addSpace = 2 * h;
    
        minX -= addSpace + maxRadius;
        minY -= addSpace + maxRadius;
        minZ -= addSpace + maxRadius;
    
        maxX += addSpace + maxRadius;
        maxY += addSpace + maxRadius;
        maxZ += addSpace + maxRadius;
    
        /*
         * MoloVol aligns the lower boundary with the Cartesian origin:
         *
         *   cart_min -= fmod(cart_min, grid_size)
         *
         * i.e. the first voxel boundary lies on an integer multiple
         * of h relative to (0,0,0).
         */
        const align = x => {
            const q = x / h;
            const nearest = Math.round(q);
    
            // equivalent to MoloVol's custom_fmod handling for ordinary
            // floating-point coordinates
            if (Math.abs(q - nearest) < 1e-10) {
                return nearest * h;
            }
    
            return Math.floor(q) * h;
        };
    
        minX = align(minX);
        minY = align(minY);
        minZ = align(minZ);
    
        /*
         * The maximum boundary is determined from the actual MoloVol
         * grid dimensions.  MoloVol first determines how many bottom-level
         * voxels are needed, then builds the octree from that.
         *
         * For the actual bottom level this gives:
         *
         *   n = ceil(size / h)
         *
         * and the grid extends to min + n*h.
         */
        const nx = Math.ceil((maxX - minX) / h);
        const ny = Math.ceil((maxY - minY) / h);
        const nz = Math.ceil((maxZ - minZ) / h);
    
        if (nx * ny * nz > maxVoxels) {
            // Keep the old safety mechanism, but do NOT silently change
            // the requested spacing in normal calculations.
            console.warn(
                `MoloVol-compatible vdW grid would contain ` +
                `${nx * ny * nz} voxels at ${h} Å spacing.`
            );
        }
    
        /*
         * MoloVol evaluates voxel centers.
         *
         * The first voxel center is:
         *
         *   origin + h * (0.5 + index)
         *
         * as shown in Space::assignAtomVsCore().
         */
        const grid = new Uint8Array(nx * ny * nz);
    
        const strideX = ny * nz;
        const strideY = nz;
    
        for (let i = 0; i < atoms.length; i++) {
            const a = atoms[i];
            const r = radii[i];
            const r2 = r * r;
    
            /*
             * Restrict the search to voxels whose centers can possibly
             * be inside this sphere.
             */
            const ixMin = Math.max(
                0,
                Math.ceil((a.x - r - minX) / h - 0.5)
            );
    
            const ixMax = Math.min(
                nx - 1,
                Math.floor((a.x + r - minX) / h - 0.5)
            );
    
            const iyMin = Math.max(
                0,
                Math.ceil((a.y - r - minY) / h - 0.5)
            );
    
            const iyMax = Math.min(
                ny - 1,
                Math.floor((a.y + r - minY) / h - 0.5)
            );
    
            const izMin = Math.max(
                0,
                Math.ceil((a.z - r - minZ) / h - 0.5)
            );
    
            const izMax = Math.min(
                nz - 1,
                Math.floor((a.z + r - minZ) / h - 0.5)
            );
    
            for (let ix = ixMin; ix <= ixMax; ix++) {
                const vx = minX + (ix + 0.5) * h;
                const dx = vx - a.x;
                const dx2 = dx * dx;
    
                if (dx2 > r2) continue;
    
                for (let iy = iyMin; iy <= iyMax; iy++) {
                    const vy = minY + (iy + 0.5) * h;
                    const dy = vy - a.y;
                    const dxy2 = dx2 + dy * dy;
    
                    if (dxy2 > r2) continue;
    
                    const base = ix * strideX + iy * strideY;
    
                    for (let iz = izMin; iz <= izMax; iz++) {
                        const vz = minZ + (iz + 0.5) * h;
                        const dz = vz - a.z;
    
                        if (dxy2 + dz * dz <= r2) {
                            grid[base + iz] = 1;
                        }
                    }
                }
            }
        }
    
        let count = 0;
    
        for (let i = 0; i < grid.length; i++) {
            count += grid[i];
        }

        /*
         * MoloVol's surface area: marching cubes over the SAME voxel grid
         * (a voxel's "type" here is just our solid/1 vs. empty/0), using the
         * semi-empirical per-configuration area weights of Lindblad (2005,
         * Image and Vision Computing 23, 111-122) — the exact lookup table
         * MoloVol itself uses (see space.cpp, SurfaceLUT). Each "m-cube" is
         * bounded by 8 neighboring voxel centers; its 8 solid/empty states
         * are packed into a config byte with bit = z + 2y + 4x (x,y,z in
         * {0,1}), mapped through a 256->15 "type" table, then to an area
         * contribution for that type. Total surface = sum(contributions) *
         * grid_size^2. Voxels outside the grid never occur here because the
         * same boundary padding used for the volume grid already guarantees
         * every cube touching the grid edge is entirely empty.
         */
        let surface = 0;
        for (let ix = 0; ix < nx - 1; ix++) {
            for (let iy = 0; iy < ny - 1; iy++) {
                const base = ix * strideX + iy * strideY;
                const baseX = (ix + 1) * strideX + iy * strideY;
                const baseY = ix * strideX + (iy + 1) * strideY;
                const baseXY = (ix + 1) * strideX + (iy + 1) * strideY;
                for (let iz = 0; iz < nz - 1; iz++) {
                    // bit = z + 2y + 4x, for (x,y,z) corner offsets in {0,1}
                    const config =
                        (grid[base + iz]) |
                        (grid[base + iz + 1] << 1) |
                        (grid[baseY + iz] << 2) |
                        (grid[baseY + iz + 1] << 3) |
                        (grid[baseX + iz] << 4) |
                        (grid[baseX + iz + 1] << 5) |
                        (grid[baseXY + iz] << 6) |
                        (grid[baseXY + iz + 1] << 7);
                    if (config === 0 || config === 255) continue; // fully empty or fully solid: no local surface
                    surface += this._surfaceAreaByType[this._surfaceConfigToType[config]];
                }
            }
        }
        surface *= h * h;

        return {
            volume: count * h * h * h,
            surfaceArea: surface,
            gridSpacing: h,
            voxelCount: count
        };
    },

    // Marching-cubes lookup tables, copied verbatim from MoloVol's
    // SurfaceLUT (src/space.cpp): a 256-entry config->type map, and the
    // semi-empirical area weight per type (Lindblad 2005, see README
    // citations) — the same table MoloVol itself uses, not the alternative
    // "theoretical" weights it keeps commented out in its own source.
    _surfaceConfigToType: [1,2,2,3,2,3,4,6,2,4,3,6,3,6,6,9,2,3,4,6,4,6,8,10,5,7,7,13,7,13,11,6,2,4,3,6,5,7,7,13,4,8,6,10,7,11,13,6,3,6,6,9,7,13,11,6,7,11,13,6,12,7,7,3,2,4,5,7,3,6,7,13,4,8,7,11,6,10,13,6,3,6,7,13,6,9,11,6,7,11,12,7,13,6,7,3,4,8,7,11,7,11,12,7,8,14,11,8,11,8,7,4,6,10,13,6,13,6,7,3,11,8,7,4,7,4,5,2,2,5,4,7,4,7,8,11,3,7,6,13,6,13,10,6,4,7,8,11,8,11,14,8,7,12,11,7,11,7,8,4,3,7,6,13,7,12,11,7,6,11,9,6,13,7,6,3,6,13,10,6,11,7,8,4,13,7,6,3,7,5,4,2,3,7,7,12,6,13,11,7,6,11,13,7,9,6,6,3,6,13,11,7,10,6,8,4,13,7,7,5,6,3,4,2,6,11,13,7,13,7,7,5,10,8,6,4,6,4,3,2,9,6,6,3,6,3,4,2,6,4,3,2,3,2,2,1],
    _surfaceAreaByType: [0,0,0.636,0.669,1.272,1.272,0.5537,1.305,1.908,0.927,0.4222,1.1897,1.338,1.5731,2.544],

    // --- Radius of gyration (standard/IUPAC definition) ---
    // Mass-weighted over atom positions (nuclei), matching the classical
    // polymer-physics/IUPAC definition (Rg^2 = (1/M) sum m_i |r_i-r_cm|^2)
    // and the convention used by LAMMPS' compute_gyration, GROMACS' gmx
    // gyrate, and OVITO.
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

    // --- Combined DOSY estimate ---
    // No exclusions: always uses every atom in the currently loaded file.
    calcEstimate(atoms) {
        const { volume, surfaceArea, gridSpacing } = this.calcVdwVolume(atoms);
        const r0 = Math.cbrt((3 * volume) / (4 * Math.PI));
        const rg = this.calcRadiusOfGyration(atoms);

        return {
            volume,
            surfaceArea,
            gridSpacing,
            r0,
            rg,
        };
    },

    // --- Diffusion coefficient estimates ---
    // Two independent routes to a predicted D, both from the same vdW
    // volume, for exactly the three solvents Urbank & Vondung (2026,
    // Chem. Eur. J., e71471) fitted their semiempirical model for — CDCl3
    // is not covered by their data set, so it is deliberately not offered
    // here rather than guessed at.
    //
    //   naive:    plug r_eq (the bare vdW-volume-equivalent sphere radius)
    //             directly into Stokes-Einstein. This is the classical,
    //             shape/solvation-blind approach discussed at length in the
    //             README, and is included mainly as a contrast — expect it
    //             to run systematically low (see the cyclopentane/THF-d8
    //             and anthracene cross-checks in the README).
    //   vondung:  first predict the empirical hydrodynamic radius via the
    //             paper's fitted power law rH = a * VvdW^b (solvent- and
    //             fit-specific a, b), THEN apply Stokes-Einstein to that.
    //             This is the approach the paper itself validates against
    //             real DOSY data, with the "err" fraction below being their
    //             own reported relative error for that solvent.
    //
    // Viscosities (eta, Pa*s) are Holz reference values, exactly as used by
    // the paper's own calculator spreadsheet — reusing them (rather than a
    // different literature source) keeps the naive/vondung comparison an
    // apples-to-apples test of the radius model, not the viscosity source.
    solventParams: {
        'THF-d8':     { a: 0.163, b: 0.57,  eta: 0.00048567605047843566, err: 0.11 },
        'C6D6':       { a: 0.112, b: 0.599, eta: 0.0006263140442965048,  err: 0.09 },
        'Toluene-d8': { a: 0.100, b: 0.65,  eta: 0.0005844627740395051,  err: 0.12 },
    },

    kB: 1.380649e-23, // J/K
    T_DEFAULT: 298.15, // K — fixed, matching the typical DOSY measurement temperature

    calcDiffusionEstimates(volume, rEq) {
        const results = {};
        for (const [solvent, p] of Object.entries(this.solventParams)) {
            const rHVondung = p.a * Math.pow(volume, p.b); // Å
            const dVondung = this.kB * this.T_DEFAULT / (6 * Math.PI * p.eta * rHVondung * 1e-10);
            const dNaive = this.kB * this.T_DEFAULT / (6 * Math.PI * p.eta * rEq * 1e-10);
            results[solvent] = { rHVondung, dVondung, dNaive, err: p.err };
        }
        return results;
    },
};
