// chem.js — bond detection, angles, dihedral, best-fit plane

const Chem = {

    // --- Distance ---
    distance(a, b) {
        const dx = a.x - b.x, dy = a.y - b.y, dz = a.z - b.z;
        return Math.sqrt(dx*dx + dy*dy + dz*dz);
    },

    // --- Bond detection ---
    // tolerance in percent (e.g. 8 = 8%)
    findBonds(atoms, tolerancePct) {
        const tol = 1 + tolerancePct / 100;
        const bonds = [];
        for (let i = 0; i < atoms.length; i++) {
            for (let j = i + 1; j < atoms.length; j++) {
                const ri = Parser.getCovRadius(atoms[i].element);
                const rj = Parser.getCovRadius(atoms[j].element);
                const maxDist = (ri + rj) * tol;
                const dist = this.distance(atoms[i], atoms[j]);
                if (dist <= maxDist) {
                    bonds.push({
                        i: atoms[i].index,
                        j: atoms[j].index,
                        labelI: atoms[i].label,
                        labelJ: atoms[j].label,
                        elI: atoms[i].element,
                        elJ: atoms[j].element,
                        dist,
                    });
                }
            }
        }
        return bonds;
    },

    // Filter bonds by active elements (both atoms must match an active element)
    filterBonds(bonds, activeElements) {
        if (!activeElements || activeElements.size === 0) return bonds;
        return bonds.filter(b =>
            activeElements.has(b.elI) && activeElements.has(b.elJ)
        );
    },

    // --- Angles ---
    // For each atom B that is bonded to at least 2 others, compute A-B-C angles
    findAngles(atoms, bonds) {
        // Build adjacency: atomIndex -> list of bonded atom indices
        const adj = {};
        for (const atom of atoms) adj[atom.index] = [];
        for (const bond of bonds) {
            adj[bond.i].push(bond.j);
            adj[bond.j].push(bond.i);
        }

        const angles = [];
        const atomMap = {};
        for (const a of atoms) atomMap[a.index] = a;

        for (const atom of atoms) {
            const neighbors = adj[atom.index];
            if (neighbors.length < 2) continue;
            // All pairs of neighbors
            for (let p = 0; p < neighbors.length; p++) {
                for (let q = p + 1; q < neighbors.length; q++) {
                    const A = atomMap[neighbors[p]];
                    const B = atom;
                    const C = atomMap[neighbors[q]];
                    const angle = this.calcAngle(A, B, C);
                    angles.push({
                        iA: A.index, iB: B.index, iC: C.index,
                        labelA: A.label, labelB: B.label, labelC: C.label,
                        elA: A.element, elB: B.element, elC: C.element,
                        angle,
                    });
                }
            }
        }
        return angles;
    },

    filterAngles(angles, activeElements) {
        if (!activeElements || activeElements.size === 0) return angles;
        return angles.filter(a =>
            activeElements.has(a.elA) &&
            activeElements.has(a.elB) &&
            activeElements.has(a.elC)
        );
    },

    calcAngle(A, B, C) {
        const v1 = { x: A.x-B.x, y: A.y-B.y, z: A.z-B.z };
        const v2 = { x: C.x-B.x, y: C.y-B.y, z: C.z-B.z };
        const dot = v1.x*v2.x + v1.y*v2.y + v1.z*v2.z;
        const m1 = Math.sqrt(v1.x**2 + v1.y**2 + v1.z**2);
        const m2 = Math.sqrt(v2.x**2 + v2.y**2 + v2.z**2);
        return Math.acos(Math.max(-1, Math.min(1, dot / (m1*m2)))) * 180 / Math.PI;
    },

    // --- Dihedral angle (A-B-C-D) ---
    // Returns signed torsion angle in degrees in the range [-180, 180].
    calcDihedral(A, B, C, D) {
        // Vectors along the central B-C bond convention.
        const b0 = this._vec(B, A); // A - B
        const b1 = this._vec(B, C); // C - B
        const b2 = this._vec(C, D); // D - C

        const b1len = Math.sqrt(b1.x ** 2 + b1.y ** 2 + b1.z ** 2);

        if (b1len === 0) {
            return Number.NaN;
        }

        const b1n = {
            x: b1.x / b1len,
            y: b1.y / b1len,
            z: b1.z / b1len,
        };

        // Project b0 and b2 onto the plane perpendicular to b1.
        const b0Dot = this._dot(b0, b1n);
        const b2Dot = this._dot(b2, b1n);

        const v = {
            x: b0.x - b0Dot * b1n.x,
            y: b0.y - b0Dot * b1n.y,
            z: b0.z - b0Dot * b1n.z,
        };

        const w = {
            x: b2.x - b2Dot * b1n.x,
            y: b2.y - b2Dot * b1n.y,
            z: b2.z - b2Dot * b1n.z,
        };

        const x = this._dot(v, w);
        const y = this._dot(this._cross(b1n, v), w);

        return Math.atan2(y, x) * 180 / Math.PI;
    },

    // --- Best-fit plane via covariance matrix + power iteration ---
    // Finds the eigenvector with the SMALLEST eigenvalue of the 3x3 covariance
    // matrix of centered atom coordinates — that is the plane normal.
    // No external library needed.
    calcPlane(atoms) {
        if (atoms.length < 3) return null;

        // Centroid
        const cx = atoms.reduce((s,a) => s+a.x, 0) / atoms.length;
        const cy = atoms.reduce((s,a) => s+a.y, 0) / atoms.length;
        const cz = atoms.reduce((s,a) => s+a.z, 0) / atoms.length;

        // 3x3 covariance matrix (symmetric)
        let xx=0,xy=0,xz=0,yy=0,yz=0,zz=0;
        for (const a of atoms) {
            const dx=a.x-cx, dy=a.y-cy, dz=a.z-cz;
            xx+=dx*dx; xy+=dx*dy; xz+=dx*dz;
            yy+=dy*dy; yz+=dy*dz; zz+=dz*dz;
        }
        const C = [[xx,xy,xz],[xy,yy,yz],[xz,yz,zz]];

        // Get all three eigenvectors via Jacobi iterations
        const { vectors, values } = this._jacobi3x3(C);

        // Normal = eigenvector with smallest eigenvalue
        let minIdx = 0;
        if (values[1] < values[minIdx]) minIdx = 1;
        if (values[2] < values[minIdx]) minIdx = 2;
        const normal = { x: vectors[minIdx][0], y: vectors[minIdx][1], z: vectors[minIdx][2] };

        // Distances of each atom to the plane
        const distances = atoms.map(a =>
            normal.x*(a.x-cx) + normal.y*(a.y-cy) + normal.z*(a.z-cz)
        );

        // RMSD
        const rmsd = Math.sqrt(distances.reduce((s,d) => s+d*d, 0) / atoms.length);

        return { normal, centroid: {x:cx, y:cy, z:cz}, rmsd, distances };
    },

    // Jacobi eigenvalue algorithm for 3x3 symmetric matrix
    // Returns { values: [e0,e1,e2], vectors: [[v0x,v0y,v0z], ...] }
    _jacobi3x3(A) {
        // Copy
        const a = A.map(r => [...r]);
        // Eigenvectors start as identity
        const v = [[1,0,0],[0,1,0],[0,0,1]];

        for (let iter = 0; iter < 100; iter++) {
            // Find largest off-diagonal element
            let p=0, q=1, max=Math.abs(a[0][1]);
            if (Math.abs(a[0][2]) > max) { p=0; q=2; max=Math.abs(a[0][2]); }
            if (Math.abs(a[1][2]) > max) { p=1; q=2; max=Math.abs(a[1][2]); }
            if (max < 1e-12) break;

            // Jacobi rotation
            const theta = (a[q][q] - a[p][p]) / (2*a[p][q]);
            const t = Math.sign(theta) / (Math.abs(theta) + Math.sqrt(1 + theta*theta));
            const c = 1 / Math.sqrt(1 + t*t);
            const s = t * c;

            // Update matrix
            const app = a[p][p], aqq = a[q][q], apq = a[p][q];
            a[p][p] = app - t*apq;
            a[q][q] = aqq + t*apq;
            a[p][q] = 0; a[q][p] = 0;
            for (let r = 0; r < 3; r++) {
                if (r !== p && r !== q) {
                    const arp = a[r][p], arq = a[r][q];
                    a[r][p] = c*arp - s*arq;
                    a[p][r] = a[r][p];
                    a[r][q] = s*arp + c*arq;
                    a[q][r] = a[r][q];
                }
            }
            // Update eigenvectors
            for (let r = 0; r < 3; r++) {
                const vrp = v[r][p], vrq = v[r][q];
                v[r][p] = c*vrp - s*vrq;
                v[r][q] = s*vrp + c*vrq;
            }
        }

        // Eigenvalues are diagonal, eigenvectors are columns of v
        return {
            values: [a[0][0], a[1][1], a[2][2]],
            vectors: [[v[0][0],v[1][0],v[2][0]],
                      [v[0][1],v[1][1],v[2][1]],
                      [v[0][2],v[1][2],v[2][2]]],
        };
    },

    // Angle between two planes (via normals)
    angleBetweenPlanes(plane1, plane2) {
        const n1 = plane1.normal, n2 = plane2.normal;
        const dot = n1.x*n2.x + n1.y*n2.y + n1.z*n2.z;
        const m1 = Math.sqrt(n1.x**2 + n1.y**2 + n1.z**2);
        const m2 = Math.sqrt(n2.x**2 + n2.y**2 + n2.z**2);
        let angle = Math.acos(Math.max(-1, Math.min(1, Math.abs(dot) / (m1*m2)))) * 180 / Math.PI;
        return angle;
    },

    // --- Statistics ---
    stats(values) {
        if (!values.length) return null;
        const n = values.length;
        const sorted = [...values].sort((a,b) => a-b);
        const mean = values.reduce((s,v) => s+v, 0) / n;
        const variance = values.reduce((s,v) => s + (v-mean)**2, 0) / n;
        const std = Math.sqrt(variance);
        const median = n % 2 === 0
            ? (sorted[n/2-1] + sorted[n/2]) / 2
            : sorted[Math.floor(n/2)];
        return { n, min: sorted[0], max: sorted[n-1], mean, median, std };
    },

    // --- Helpers ---
    _vec(A, B) { return { x:B.x-A.x, y:B.y-A.y, z:B.z-A.z }; },
    _cross(a, b) { return { x:a.y*b.z-a.z*b.y, y:a.z*b.x-a.x*b.z, z:a.x*b.y-a.y*b.x }; },
    _dot(a, b) { return a.x*b.x + a.y*b.y + a.z*b.z; },
};