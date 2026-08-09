// markdown.js — Markdown export for xyz2tab

const Markdown = {

    toMarkdown(data) {
        const {
            parsed,
            bonds = [],
            angles = [],
            allBonds = bonds,

            manualDistances = [],
            manualAngles = [],
            manualDihedrals = [],

            savedPlanes = [],
            activePlaneId = null,
            savedPlaneDistances = [],
            savedPlaneAngles = [],

            savedRings = [],

            savedCShM = [],

            symmetryResult = null,
            symmetryRaw = null,
            symmetryTolerance = null,
            symmetrySkippedAuto = false,

            excludedAtoms = new Set(),
            activeElements = new Set(),
            tolerancePct = null,
            atomIndexStart = 0,
        } = data;

        const lines = [];

        const {
            formula,
            fw,
            natoms,
            elCount,
            massFractions,
            atoms = [],
            comment,
        } = parsed;

        const collator = new Intl.Collator(undefined, {
            numeric: true,
            sensitivity: 'base',
        });

        const atomMap = new Map(atoms.map(atom => [Number(atom.index), atom]));

        const getAtom = idx => atomMap.get(Number(idx)) || null;

        const getPlane = id =>
            savedPlanes.find(plane => String(plane.id) === String(id)) || null;

        const mdCell = value => String(value ?? '')
            .replace(/\|/g, '\\|')
            .replace(/\r?\n/g, ' ');

        const atomLabel = idx => {
            const atom = getAtom(idx);
            return atom ? atom.label : String(idx);
        };

        // Mirrors Tables._unavailableInfo / the HTML "Status" column for
        // manual distances/angles/dihedrals: an atom counts as unavailable
        // if it's explicitly excluded, or its element is hidden by the
        // active-element filter.
        const measurementStatus = selectedAtoms => {
            const unavailable = selectedAtoms
                .map(atom => Tables._unavailableInfo(atom, excludedAtoms, activeElements))
                .filter(Boolean);

            return unavailable.length
                ? `invalid: ${unavailable.map(u => `${u.label} (${u.reason})`).join(', ')}`
                : 'valid';
        };

        const planeName = id => {
            const plane = getPlane(id);
            return plane ? plane.name : '(removed)';
        };

        const planeAtoms = plane => {
            if (!plane || !plane.atomIndices) return [];

            return plane.atomIndices
                .map(idx => getAtom(idx))
                .filter(Boolean);
        };

        const isAtomUnavailable = idx => {
            idx = Number(idx);
            if (excludedAtoms.has(idx)) return true;

            const atom = getAtom(idx);
            if (!atom) return true;

            return activeElements && activeElements.size > 0 && !activeElements.has(atom.element);
        };

        const isPlaneInvalid = plane => {
            if (!plane || !plane.atomIndices) return true;

            return plane.atomIndices.some(idx => isAtomUnavailable(idx));
        };

        const ringAtoms = ring => {
            if (!ring || !ring.atomIndices) return [];

            return ring.atomIndices
                .map(idx => getAtom(idx))
                .filter(Boolean);
        };

        const bondKey = (i, j) => {
            i = Number(i);
            j = Number(j);
            return i < j ? `${i}-${j}` : `${j}-${i}`;
        };

        const ringBondSet = new Set(allBonds.map(b => bondKey(b.i, b.j)));

        // Checks whether the ring atoms (in saved connectivity order) still
        // form a closed ring of bonds: atom[0]-atom[1], ..., atom[N-1]-atom[0].
        const checkRingConnectivity = atomsForRing => {
            if (!atomsForRing || atomsForRing.length < 3) return { ok: false, missing: [] };

            const missing = [];

            for (let k = 0; k < atomsForRing.length; k++) {
                const a = atomsForRing[k];
                const b = atomsForRing[(k + 1) % atomsForRing.length];

                if (!ringBondSet.has(bondKey(a.index, b.index))) {
                    missing.push([a.label, b.label]);
                }
            }

            return { ok: missing.length === 0, missing };
        };

        const isRingInvalid = ring => {
            if (!ring || !ring.atomIndices) return true;

            if (ring.atomIndices.some(idx => isAtomUnavailable(idx))) {
                return true;
            }

            return !checkRingConnectivity(ringAtoms(ring)).ok;
        };

        // Neighbor lookup for saved CShM entries — same "bonded neighbors,
        // respecting exclusion and the active-element filter" logic as
        // App._getCShMNeighborInfo (uses `bonds`, i.e. filteredBonds, not
        // the unfiltered `allBonds`), but self-contained here since the
        // exporter doesn't call back into App.
        const cshmNeighborIndices = centralIdx => {
            const idx = Number(centralIdx);
            const neighborIdx = new Set();

            bonds.forEach(bond => {
                if (Number(bond.i) === idx) neighborIdx.add(Number(bond.j));
                else if (Number(bond.j) === idx) neighborIdx.add(Number(bond.i));
            });

            return [...neighborIdx].sort((a, b) => a - b);
        };

        const isCShMInvalid = entry => {
            if (!entry) return true;

            if (isAtomUnavailable(entry.centralAtomIndex)) return true;
            if (entry.ligandIndices.some(idx => isAtomUnavailable(idx))) return true;
            if (!getAtom(entry.centralAtomIndex)) return true;

            const currentKey = cshmNeighborIndices(entry.centralAtomIndex).join(',');
            const savedKey = entry.ligandIndices.slice().sort((a, b) => a - b).join(',');

            return currentKey !== savedKey;
        };

        const ringConformationLabel = result => {
            if (!result || !result.classification) return '—';

            const c = result.classification;
            if (c.symbol === '—') return c.family;
            return c.approximate ? `${c.family} (${c.symbol}, approx.)` : `${c.family} (${c.symbol})`;
        };

        const distanceAtomToPlane = (atom, planeResult) => {
            const { normal, centroid } = planeResult;

            return (
                normal.x * (atom.x - centroid.x) +
                normal.y * (atom.y - centroid.y) +
                normal.z * (atom.z - centroid.z)
            );
        };

        const bondType = bond => Chem.orderBondLabel(bond.elI, bond.elJ).join('–');

        const angleType = angle => Chem.orderAngleLabel(angle.elA, angle.elB, angle.elC).join('–');

        // Export order mirrors whatever is currently sorted/shown in the
        // HTML tables (Tables._sortRows falls back to the given array's
        // original order when no column sort is active).
        const sortedBonds = Tables._sortRows('bonds', bonds, Tables._bondColumns);
        const sortedAngles = Tables._sortRows('angles', angles, Tables._angleColumns);

        const sortedPlaneDistances = [...savedPlaneDistances].sort((a, b) => {
            const planeCmp = collator.compare(planeName(a.planeId), planeName(b.planeId));
            if (planeCmp !== 0) return planeCmp;

            return collator.compare(atomLabel(a.atomIndex), atomLabel(b.atomIndex));
        });

        const sortedPlaneAngles = [...savedPlaneAngles].sort((a, b) => {
            const planeACmp = collator.compare(planeName(a.planeAId), planeName(b.planeAId));
            if (planeACmp !== 0) return planeACmp;

            return collator.compare(planeName(a.planeBId), planeName(b.planeBId));
        });

        const formattedFormula = Format.chemicalFormula(formula);

        lines.push(`# xyz2tab — ${formattedFormula}`);
        lines.push('');

        // --- Molecular information ---
        lines.push('## Molecular Information');
        lines.push('');

        if (comment) {
            lines.push(`**Comment:** ${mdCell(comment)}`);
            lines.push('');
        }

        lines.push(`**Formula:** ${mdCell(formattedFormula)}  `);
        lines.push(`**Formula weight:** ${fw.toFixed(3)} g/mol  `);
        lines.push(`**Atoms:** ${natoms}  `);

        if (typeof Dosy !== 'undefined' && atoms.length >= 2) {
            const est = Dosy.calcEstimate(atoms);
            lines.push(`**Van der Waals volume:** ${est.volume.toFixed(1)} Å³ (voxel grid, Alvarez 2013 radii, ${est.gridSpacing.toFixed(3)} Å spacing)  `);
            lines.push(`**r_eq (uncorrected):** ${est.r0.toFixed(2)} Å (vdW-volume-equivalent sphere radius — a geometric proxy, not the empirical hydrodynamic radius)  `);
            lines.push(`**r_eq (Perrin-corrected):** ${est.rEqCorrected.toFixed(2)} Å (${est.shape}, p = ${est.p.toFixed(2)}, F = ${est.F.toFixed(3)})  `);
            lines.push(`**r_g (grid-based radius of gyration):** ${est.rg.toFixed(2)} Å → gyration-based r_e = ${est.rGyrationEff.toFixed(2)} Å (Miyamoto/Shimono cross-check, independent of Perrin)`);
        }

        lines.push('');

        lines.push('| Element | Count | At. weight | Mass fraction % |');
        lines.push('|---------|-------|------------|-----------------|');

        const els = Object.keys(elCount).sort((a, b) => {
            if (a === 'C') return -1;
            if (b === 'C') return 1;
            if (a === 'H') return -1;
            if (b === 'H') return 1;
            return collator.compare(a, b);
        });

        for (const el of els) {
            const aw = Parser.atomicWeights[el] || 0;

            lines.push(
                `| ${mdCell(el)} | ${elCount[el]} | ${aw.toFixed(3)} | ${(massFractions[el] || 0).toFixed(2)} |`
            );
        }

        lines.push('');

        // --- Settings / filters ---
        lines.push('## Settings');
        lines.push('');

        lines.push(`**Covalent radius tolerance:** ${tolerancePct !== null ? tolerancePct.toFixed(1) + ' %' : 'n/a'}  `);
        lines.push(`**Atom label index:** from ${atomIndexStart}  `);

        if (activeElements) {
            const activeElementsText = activeElements.size > 0
                ? [...activeElements].sort((a, b) => collator.compare(a, b)).join(', ')
                : 'none';

            lines.push(`**Active elements:** ${activeElementsText}  `);
        }

        if (excludedAtoms && excludedAtoms.size > 0) {
            const excludedLabels = [...excludedAtoms]
                .map(idx => atomLabel(idx))
                .sort((a, b) => collator.compare(a, b))
                .join(', ');

            lines.push(`**Excluded atoms:** ${excludedLabels}`);
        } else {
            lines.push('**Excluded atoms:** none');
        }

        lines.push('');

        // --- Manual distances ---
        if (manualDistances.length > 0) {
            lines.push('## Manual Distances');
            lines.push('');
            lines.push('| # | Atoms | Distance (Å) | Status |');
            lines.push('|---|-------|--------------|--------|');

            const sortedManualDistances = Tables._sortRows(
                'manualDistances',
                manualDistances,
                Tables._manualDistanceColumns(atoms)
            );

            sortedManualDistances.forEach((m, i) => {
                const selectedAtoms = (m.atoms || [])
                    .map(idx => getAtom(idx))
                    .filter(Boolean);

                if (selectedAtoms.length !== 2) return;

                const d = Chem.distance(selectedAtoms[0], selectedAtoms[1]);

                lines.push(
                    `| ${i + 1} | ${mdCell(selectedAtoms.map(a => a.label).join('–'))} | ${d.toFixed(4)} | ${measurementStatus(selectedAtoms)} |`
                );
            });

            lines.push('');
        }

        // --- Bond lengths ---
        if (sortedBonds.length > 0) {
            lines.push('## Bond Lengths');
            lines.push('');
            lines.push('| # | Atom 1 | Atom 2 | Distance (Å) | Source |');
            lines.push('|---|--------|--------|--------------|--------|');

            sortedBonds.forEach((b, i) => {
                lines.push(
                    `| ${i + 1} | ${mdCell(b.labelI)} | ${mdCell(b.labelJ)} | ${b.dist.toFixed(4)} | ${b.manual ? 'manual' : 'auto'} |`
                );
            });

            lines.push('');

            const bondGroups = {};

            for (const b of sortedBonds) {
                const key = bondType(b);

                if (!bondGroups[key]) {
                    bondGroups[key] = [];
                }

                bondGroups[key].push(b.dist);
            }

            lines.push('### Bond Summary');
            lines.push('');
            lines.push('| Bond | Count | Min (Å) | Max (Å) | Mean (Å) | Std dev (Å) |');
            lines.push('|------|-------|---------|---------|----------|-------------|');

            Object.entries(bondGroups)
                .sort(([a], [b]) => Chem.compareGroupTypeKeys(
                    Chem.groupTypeSortKey(a.split('–')),
                    Chem.groupTypeSortKey(b.split('–'))
                ))
                .forEach(([key, values]) => {
                    const s = Chem.stats(values);

                    lines.push(
                        `| ${mdCell(key)} | ${s.n} | ${s.min.toFixed(4)} | ${s.max.toFixed(4)} | ${s.mean.toFixed(4)} | ${s.std.toFixed(4)} |`
                    );
                });

            lines.push('');
        }

        // --- Manual angles ---
        if (manualAngles.length > 0) {
            lines.push('## Manual Angles');
            lines.push('');
            lines.push('| # | Atoms | Angle (°) | Status |');
            lines.push('|---|-------|-----------|--------|');

            const sortedManualAngles = Tables._sortRows(
                'manualAngles',
                manualAngles,
                Tables._manualAngleColumns(atoms)
            );

            sortedManualAngles.forEach((m, i) => {
                const selectedAtoms = (m.atoms || [])
                    .map(idx => getAtom(idx))
                    .filter(Boolean);

                if (selectedAtoms.length !== 3) return;

                const angle = Chem.calcAngle(
                    selectedAtoms[0],
                    selectedAtoms[1],
                    selectedAtoms[2]
                );

                lines.push(
                    `| ${i + 1} | ${mdCell(selectedAtoms.map(a => a.label).join('–'))} | ${angle.toFixed(3)} | ${measurementStatus(selectedAtoms)} |`
                );
            });

            lines.push('');
        }

        // --- Automatic bond angles ---
        if (sortedAngles.length > 0) {
            lines.push('## Bond Angles');
            lines.push('');
            lines.push('| # | Atom A | Atom B | Atom C | Angle (°) |');
            lines.push('|---|--------|--------|--------|-----------|');

            sortedAngles.forEach((a, i) => {
                lines.push(
                    `| ${i + 1} | ${mdCell(a.labelA)} | ${mdCell(a.labelB)} | ${mdCell(a.labelC)} | ${a.angle.toFixed(3)} |`
                );
            });

            lines.push('');

            const angleGroups = {};

            for (const a of sortedAngles) {
                const key = angleType(a);

                if (!angleGroups[key]) {
                    angleGroups[key] = [];
                }

                angleGroups[key].push(a.angle);
            }

            lines.push('### Angle Summary');
            lines.push('');
            lines.push('| Angle type | Count | Min (°) | Max (°) | Mean (°) | Std dev (°) |');
            lines.push('|------------|-------|---------|---------|----------|-------------|');

            Object.entries(angleGroups)
                .sort(([a], [b]) => Chem.compareGroupTypeKeys(
                    Chem.groupTypeSortKey(a.split('–')),
                    Chem.groupTypeSortKey(b.split('–'))
                ))
                .forEach(([key, values]) => {
                    const s = Chem.stats(values);

                    lines.push(
                        `| ${mdCell(key)} | ${s.n} | ${s.min.toFixed(3)} | ${s.max.toFixed(3)} | ${s.mean.toFixed(3)} | ${s.std.toFixed(3)} |`
                    );
                });

            lines.push('');
        }

        // --- Manual dihedrals ---
        if (manualDihedrals.length > 0) {
            lines.push('## Manual Dihedrals');
            lines.push('');
            lines.push('| # | Atoms | Dihedral (°) | Status |');
            lines.push('|---|-------|--------------|--------|');

            const sortedManualDihedrals = Tables._sortRows(
                'manualDihedrals',
                manualDihedrals,
                Tables._manualDihedralColumns(atoms)
            );

            sortedManualDihedrals.forEach((m, i) => {
                const selectedAtoms = (m.atoms || [])
                    .map(idx => getAtom(idx))
                    .filter(Boolean);

                if (selectedAtoms.length !== 4) return;

                const angle = Chem.calcDihedral(...selectedAtoms);

                lines.push(
                    `| ${i + 1} | ${mdCell(selectedAtoms.map(a => a.label).join('–'))} | ${angle.toFixed(3)} | ${measurementStatus(selectedAtoms)} |`
                );
            });

            lines.push('');
        }

        // --- Saved planes ---
        if (savedPlanes.length > 0) {
            lines.push('## Saved Planes');
            lines.push('');

            lines.push('| # | Active | Name | Atoms | n | RMSD (Å) | Normal vector | Status |');
            lines.push('|---|--------|------|-------|---|----------|---------------|--------|');

            savedPlanes.forEach((plane, i) => {
                const atomsForPlane = planeAtoms(plane);
                const normal = plane.result.normal;
                const active = String(plane.id) === String(activePlaneId) ? 'yes' : '';
                const invalid = isPlaneInvalid(plane);

                const unavailable = atomsForPlane
                    .map(atom => Tables._unavailableInfo(atom, excludedAtoms, activeElements))
                    .filter(Boolean);

                const status = invalid
                    ? (unavailable.length ? `invalid: ${unavailable.map(u => `${u.label} (${u.reason})`).join(', ')}` : 'invalid')
                    : 'valid';

                lines.push(
                    `| ${i + 1} | ${active} | ${mdCell(plane.name)} | ${mdCell(atomsForPlane.map(a => a.label).join(', '))} | ${atomsForPlane.length} | ${plane.result.rmsd.toFixed(4)} | (${normal.x.toFixed(4)}, ${normal.y.toFixed(4)}, ${normal.z.toFixed(4)}) | ${mdCell(status)} |`
                );
            });

            lines.push('');

            for (const plane of savedPlanes) {
                const atomsForPlane = planeAtoms(plane);

                if (!plane.result || atomsForPlane.length < 3) continue;

                lines.push(`### ${mdCell(plane.name)} — defining atom distances`);
                lines.push('');
                lines.push('| Atom | Distance to plane (Å) |');
                lines.push('|------|-----------------------|');

                atomsForPlane
                    .sort((a, b) => collator.compare(a.label, b.label))
                    .forEach(atom => {
                        const d = distanceAtomToPlane(atom, plane.result);
                        lines.push(`| ${mdCell(atom.label)} | ${d.toFixed(4)} |`);
                    });

                lines.push('');
            }
        }

        // --- Saved plane distances ---
        if (sortedPlaneDistances.length > 0) {
            lines.push('## Saved Plane Distances');
            lines.push('');

            lines.push('| # | Plane | Atom | Distance (Å) | Status |');
            lines.push('|---|-------|------|--------------|--------|');

            sortedPlaneDistances.forEach((m, i) => {
                const plane = getPlane(m.planeId);
                const atom = getAtom(m.atomIndex);

                const planeInvalid = plane ? isPlaneInvalid(plane) : true;
                const atomInfo = atom ? Tables._unavailableInfo(atom, excludedAtoms, activeElements) : null;
                const atomUnavailable = !atom || atomInfo !== null;

                let status = 'valid';

                if (!plane) {
                    status = 'invalid: plane removed';
                } else if (!atom) {
                    status = 'invalid: atom missing';
                } else if (planeInvalid && atomUnavailable) {
                    status = `invalid: plane and atom ${atomInfo.reason}`;
                } else if (planeInvalid) {
                    status = 'invalid: plane';
                } else if (atomUnavailable) {
                    status = `invalid: atom ${atomInfo.reason}`;
                }

                lines.push(
                    `| ${i + 1} | ${mdCell(plane ? plane.name : '(removed)')} | ${mdCell(atom ? atom.label : m.atomIndex)} | ${m.distance.toFixed(4)} | ${mdCell(status)} |`
                );
            });

            lines.push('');
        }

        // --- Saved plane angles ---
        if (sortedPlaneAngles.length > 0) {
            lines.push('## Saved Plane Angles');
            lines.push('');

            lines.push('| # | Plane A | Plane B | Angle (°) | Status |');
            lines.push('|---|---------|---------|-----------|--------|');

            sortedPlaneAngles.forEach((m, i) => {
                const planeA = getPlane(m.planeAId);
                const planeB = getPlane(m.planeBId);

                const planeAInvalid = planeA ? isPlaneInvalid(planeA) : true;
                const planeBInvalid = planeB ? isPlaneInvalid(planeB) : true;

                let status = 'valid';

                if (!planeA || !planeB) {
                    status = 'invalid: plane removed';
                } else if (planeAInvalid && planeBInvalid) {
                    status = 'invalid: both planes';
                } else if (planeAInvalid) {
                    status = `invalid: ${planeA.name}`;
                } else if (planeBInvalid) {
                    status = `invalid: ${planeB.name}`;
                }

                lines.push(
                    `| ${i + 1} | ${mdCell(planeA ? planeA.name : '(removed)')} | ${mdCell(planeB ? planeB.name : '(removed)')} | ${m.angle.toFixed(3)} | ${mdCell(status)} |`
                );
            });

            lines.push('');
        }

        // --- Saved rings (Cremer-Pople puckering analysis) ---
        if (savedRings.length > 0) {
            lines.push('## Ring Analysis (Cremer-Pople)');
            lines.push('');

            lines.push('| # | Name | Size | Atoms | Q (Å) | θ (°) | φ₂ (°) | Conformation | Status |');
            lines.push('|---|------|------|-------|-------|-------|--------|--------------|--------|');

            savedRings.forEach((ring, i) => {
                const atomsForRing = ringAtoms(ring);
                const result = ring.result;
                const invalid = isRingInvalid(ring);

                let status = 'valid';

                if (invalid) {
                    const unavailableLabels = atomsForRing
                        .map(atom => Tables._unavailableInfo(atom, excludedAtoms, activeElements))
                        .filter(Boolean)
                        .map(info => `${info.label} (${info.reason})`);

                    const missingBonds = checkRingConnectivity(atomsForRing).missing
                        .map(([a, b]) => `${a}–${b}`);

                    const reasons = [];

                    if (unavailableLabels.length) {
                        reasons.push(unavailableLabels.join(', '));
                    }

                    if (missingBonds.length) {
                        reasons.push(`missing bond ${missingBonds.join(', ')}`);
                    }

                    status = reasons.length ? `invalid: ${reasons.join('; ')}` : 'invalid';
                }

                lines.push(
                    `| ${i + 1} | ${mdCell(ring.name)} | ${result.N} | ${mdCell(atomsForRing.map(a => a.label).join(', '))} | ${result.Q.toFixed(4)} | ${result.N === 6 ? result.theta.toFixed(2) : '—'} | ${result.phi2.toFixed(2)} | ${mdCell(ringConformationLabel(result))} | ${mdCell(status)} |`
                );
            });

            lines.push('');
            lines.push(
                '*Family assignment (chair / boat / twist-boat / envelope / ' +
                'half-chair) uses equal 45°/60° bands around the canonical ' +
                'Cremer-Pople reference latitudes (the 0/45/90/135/180 grid used ' +
                'e.g. in Protti et al., ChemPlusChem 2026, 91, e70192) and is an ' +
                'approximation rather than an exact match to one of the 38 ' +
                'canonical IUPAC forms.*'
            );
            lines.push('');

            for (const ring of savedRings) {
                const atomsForRing = ringAtoms(ring);
                const result = ring.result;

                if (!result || !result.zDisplacements) continue;

                lines.push(`### ${mdCell(ring.name)} — atom displacements from mean plane`);
                lines.push('');
                lines.push('| Atom | z (Å) |');
                lines.push('|------|-------|');

                atomsForRing.forEach((atom, idx) => {
                    const z = result.zDisplacements[idx];
                    lines.push(`| ${mdCell(atom.label)} | ${z !== undefined ? z.toFixed(4) : '—'} |`);
                });

                lines.push('');
            }
        }

        // --- Saved CShM (Continuous Shape Measures) ---
        if (savedCShM.length > 0) {
            lines.push('## Continuous Shape Measures (CShM)');
            lines.push('');

            lines.push('| # | Name | Central atom | CN | Neighbors | Closest shape | S | V /Å³ | Status |');
            lines.push('|---|------|---------------|----|-----------|----------------|---|-------|--------|');

            savedCShM.forEach((entry, i) => {
                const central = getAtom(entry.centralAtomIndex);
                const neighbors = entry.ligandIndices.map(idx => getAtom(idx)).filter(Boolean);
                const invalid = isCShMInvalid(entry);
                const best = entry.ranked[0];

                let status = 'valid';

                if (invalid) {
                    const allIdx = [entry.centralAtomIndex, ...entry.ligandIndices];

                    const unavailableLabels = allIdx
                        .map(idx => {
                            const atom = getAtom(idx);
                            return atom ? Tables._unavailableInfo(atom, excludedAtoms, activeElements) : null;
                        })
                        .filter(Boolean)
                        .map(info => `${info.label} (${info.reason})`);

                    const currentKey = cshmNeighborIndices(entry.centralAtomIndex).join(',');
                    const savedKey = entry.ligandIndices.slice().sort((a, b) => a - b).join(',');
                    const connectivityChanged = currentKey !== savedKey;

                    const reasons = [];

                    if (unavailableLabels.length) {
                        reasons.push(unavailableLabels.join(', '));
                    }

                    if (connectivityChanged) {
                        reasons.push('bonded neighbors changed');
                    }

                    status = reasons.length ? `invalid: ${reasons.join('; ')}` : 'invalid';
                }

                lines.push(
                    `| ${i + 1} | ${mdCell(entry.name)} | ${mdCell(central ? central.label : '(removed)')} | ${entry.cn} | ${mdCell(neighbors.map(a => a.label).join(', '))} | ${mdCell(`${best.name} (${best.label})`)} | ${best.cshm.toFixed(3)} | ${Number.isFinite(entry.volume) ? entry.volume.toFixed(4) : '—'} | ${mdCell(status)} |`
                );
            });

            lines.push('');

            for (const entry of savedCShM) {
                lines.push(`### ${mdCell(entry.name)}`);
                lines.push('');

                if (entry.tau) {
                    lines.push('#### Geometry indices');
                    lines.push('');

                    if (Number.isFinite(entry.tau.tau4)) {
                        lines.push(`τ₄ = ${entry.tau.tau4.toFixed(2)}, τ₄' = ${entry.tau.tau4Prime.toFixed(2)}`);
                    } else if (Number.isFinite(entry.tau.tau5)) {
                        lines.push(`τ₅ = ${entry.tau.tau5.toFixed(2)}`);
                    }

                    lines.push('');
                }

                lines.push('#### Full shape ranking');
                lines.push('');
                lines.push('| Shape | Symbol | S (CShM) |');
                lines.push('|-------|--------|----------|');

                entry.ranked.forEach((r, idx) => {
                    lines.push(`| ${mdCell(r.name)}${idx === 0 ? ' (closest)' : ''} | ${mdCell(r.label)} | ${r.cshm.toFixed(3)} |`);
                });

                lines.push('');
            }
        }

        // --- Point group symmetry (last section, not prominent) ---
        if (symmetryResult) {
            lines.push('## Point Group Symmetry');
            lines.push('');
            lines.push(`**Point group:** ${Format.pointGroupHtml(symmetryResult.pointGroup)}  `);
            lines.push(`**Tolerance:** ${symmetryTolerance.toFixed(3)} Å`);
            lines.push('');

            if (symmetryResult.elements && symmetryResult.elements.length) {
                lines.push('| Element | Error (Å) |');
                lines.push('|---------|-----------|');

                for (const el of symmetryResult.elements) {
                    lines.push(`| ${Format.symmetryElementLabel(el)} | ${el.error.toFixed(4)} |`);
                }

                lines.push('');
            }

            if (symmetryRaw) {
                const candidates = Symmetry.rankCandidates(symmetryRaw);
                const seen = new Set();
                lines.push('**Scoring — candidate groups** (fixed ranking, independent of tolerance; the assigned group is marked):');
                lines.push('');
                lines.push('| Group | Error (Å) |');
                lines.push('|-------|-----------|');
                for (const c of candidates) {
                    if (seen.has(c.name)) continue;
                    seen.add(c.name);
                    const mark = c.name === symmetryResult.pointGroup ? ' ←' : '';
                    lines.push(`| ${Format.pointGroupHtml(c.name)}${mark} | ${c.error.toFixed(4)} |`);
                }
                lines.push('');
            }

            const cubicNames = ['T', 'Th', 'O', 'Td', 'Oh'].map(g => Format.pointGroupHtml(g)).join('/');
            lines.push(
                `_Approximate, geometry-only detection; best-effort for cubic ` +
                `groups (${cubicNames}), icosahedral (${Format.pointGroupHtml('I')}/${Format.pointGroupHtml('Ih')}) not covered._`
            );
            lines.push('');
        } else if (symmetrySkippedAuto) {
            lines.push('## Point Group Symmetry');
            lines.push('');
            lines.push('_Not computed automatically (atom count above threshold) — ' +
                'run the analysis manually in the Symmetry tab before exporting to include it here._');
            lines.push('');
        }

        return lines.join('\n');
    },
};
