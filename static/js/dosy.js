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
    
        return {
            volume: count * h * h * h,
            gridSpacing: h,
            voxelCount: count
        };
    },

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
        const { volume, gridSpacing } = this.calcVdwVolume(atoms);
        const r0 = Math.cbrt((3 * volume) / (4 * Math.PI));
        const rg = this.calcRadiusOfGyration(atoms);

        return {
            volume,
            gridSpacing,
            r0,
            rg,
        };
    },
};
