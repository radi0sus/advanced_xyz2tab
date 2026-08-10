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
        const { volume, surfaceArea, gridSpacing } = this.calcVdwVolume(atoms);
        const r0 = Math.cbrt((3 * volume) / (4 * Math.PI));
        const rg = this.calcRadiusOfGyration(atoms);
        const { p, shape } = this.calcAspectRatio(atoms);
        const F = this.calcPerrinFactor(p);

        return {
            volume,
            surfaceArea,
            gridSpacing,
            r0,
            rg,
            p,
            shape,
            F,
            rPerrin: F * r0,
        };
    },

    // --- Diffusion coefficient estimates (Urbank & Vondung route) ---
    // Two/three routes to a predicted D, all from the same vdW volume, for
    // exactly the three solvents Urbank & Vondung (2026, Chem. Eur. J.,
    // e71471) fitted their semiempirical model for — CDCl3 is not covered
    // by their data set, so no coefficients for it are guessed at here
    // (it's available via the separate SEGWE route below instead).
    //
    //   r_eq:      plug r_eq (the bare vdW-volume-equivalent sphere radius)
    //              directly into Stokes-Einstein. This is the classical,
    //              shape/solvation-blind approach discussed at length in the
    //              README, and is included mainly as a contrast — expect it
    //              to run systematically low (see the cyclopentane/THF-d8
    //              and anthracene cross-checks in the README).
    //   r_eq,Perrin: same, but with r_eq scaled by the Perrin shape factor
    //              F(p) first (see calcPerrinFactor). Corrects for
    //              anisotropy only, not for the solvation/continuum gap —
    //              tends to help most for distinctly elongated/flattened
    //              molecules.
    //   vondung:   first predict the empirical hydrodynamic radius via the
    //              paper's fitted power law rH = a * VvdW^b (solvent- and
    //              fit-specific a, b), THEN apply Stokes-Einstein to that.
    //              This is the approach the paper itself validates against
    //              real DOSY data, with the "err" fraction below being
    //              their own reported relative error for that solvent. The
    //              predicted quantity is Dx,norm (Urbank & Vondung's own
    //              Stalke-normalized D, see README), not a raw D.
    //
    // Viscosities (eta, Pa*s) are Holz reference values, exactly as used by
    // the paper's own calculator spreadsheet — reusing them (rather than a
    // different literature source) keeps the r_eq/Perrin/vondung comparison
    // an apples-to-apples test of the radius model, not the viscosity
    // source. These are deliberately NOT shared with the SEGWE solvent data
    // below, which uses its own, differently-sourced solvent parameters.
    solventParams: {
        'THF-d8':     { a: 0.163, b: 0.57,  eta: 0.00048567605047843566, err: 0.11 },
        'C6D6':       { a: 0.112, b: 0.599, eta: 0.0006263140442965048,  err: 0.09 },
        'Toluene-d8': { a: 0.100, b: 0.65,  eta: 0.0005844627740395051,  err: 0.12 },
        'CDCl3':      { a: 0.000, b: 0.00,  eta: 0.0005442929550000000,  err: 0.00 },
    },

    kB: 1.380649e-23, // J/K
    T_DEFAULT: 298.15, // K — fixed, matching the typical DOSY measurement temperature

    calcDiffusionEstimates(volume, rEq, rPerrin) {
        const results = {};
        for (const [solvent, p] of Object.entries(this.solventParams)) {
            const rHVondung = p.a * Math.pow(volume, p.b); // Å
            const dVondung = this.kB * this.T_DEFAULT / (6 * Math.PI * p.eta * rHVondung * 1e-10);
            const dNaive = this.kB * this.T_DEFAULT / (6 * Math.PI * p.eta * rEq * 1e-10);
            const dPerrin = this.kB * this.T_DEFAULT / (6 * Math.PI * p.eta * rPerrin * 1e-10);
            results[solvent] = { rHVondung, dVondung, dNaive, dPerrin, err: p.err };
        }
        return results;
    },

    // --- Diffusion coefficient estimate (SEGWE route) ---
    // Stokes-Einstein-Gierer-Wirtz Estimation: Evans, Dal Poggetto, Nilsson
    // & Morris (2018, see README citations). Needs only the molecular
    // weight (not the 3D structure at all) — both solute and solvent are
    // reduced to a "radius from MW" via an assumed generic molecular
    // density, then corrected for their size mismatch via the classical
    // Gierer-Wirtz microviscosity factor. Solvent data (molar mass and
    // Arrhenius viscosity parameters A, B with eta(T) = A*exp(B/T)) are
    // copied from the method's own reference spreadsheet and are entirely
    // separate from the Holz values used above — do not mix the two.
    segweSolvents: {
        'CDCl3':      { mw: 120.38, A: 2.860296998215918e-05, B: 877.553 },
        'THF-d8':     { mw: 80.16,  A: 2.207863851312019e-05, B: 930.4 },
        'C6D6':       { mw: 84.15,  A: 9.455632143229191e-06, B: 1256.41 },
        'Toluene-d8': { mw: 100.19, A: 1.5038454560622864e-05, B: 1099.36 },
    },

    // Generic assumed molecular density (same constant used for both
    // solute and solvent "radius from MW" in the reference spreadsheet) —
    // not a real physical density, just the fitted proportionality that
    // makes the MW-only radius estimate work across their calibration set.
    _segweGenericDensity: 627, // kg/m^3 (as used in the source spreadsheet)

    _segweRadiusFromMw(mwGmol) {
        const V = (mwGmol * 0.001) / (6.022e23 * this._segweGenericDensity); // m^3
        return Math.cbrt(3 * V / (4 * Math.PI)); // m
    },

    calcSegweEstimate(mwGmol) {
        const rSolute = this._segweRadiusFromMw(mwGmol);
        const results = {};
        for (const [solvent, p] of Object.entries(this.segweSolvents)) {
            const rSolvent = this._segweRadiusFromMw(p.mw);
            const eta = p.A * Math.exp(p.B / this.T_DEFAULT);
            const alpha = rSolvent / rSolute;
            const fGW = 1 / (1.5 * alpha + 1 / (1 + alpha));
            const d = this.kB * this.T_DEFAULT / (6 * Math.PI * fGW * eta * rSolute);
            results[solvent] = { d };
        }
        return results;
    },
};
