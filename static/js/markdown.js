// markdown.js — Markdown export for xyz2tab

const Markdown = {

    toMarkdown(data) {
        const {
            parsed,
            bonds = [],
            angles = [],

            manualDistances = [],
            manualAngles = [],
            manualDihedrals = [],

            savedPlanes = [],
            activePlaneId = null,
            savedPlaneDistances = [],
            savedPlaneAngles = [],

            dihedralAtoms = [],
            dihedralAngle = null,

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

        const isPlaneInvalid = plane => {
            if (!plane || !plane.atomIndices) return true;

            return plane.atomIndices.some(idx => excludedAtoms.has(Number(idx)));
        };

        const distanceAtomToPlane = (atom, planeResult) => {
            const { normal, centroid } = planeResult;

            return (
                normal.x * (atom.x - centroid.x) +
                normal.y * (atom.y - centroid.y) +
                normal.z * (atom.z - centroid.z)
            );
        };

        const bondType = bond => {
            const els = [bond.elI, bond.elJ].sort((a, b) => collator.compare(a, b));
            return els.join('–');
        };

        const angleType = angle => {
            return [angle.elA, angle.elB, angle.elC].join('–');
        };

        const sortedBonds = [...bonds].sort((a, b) => {
            const typeCmp = collator.compare(bondType(a), bondType(b));
            if (typeCmp !== 0) return typeCmp;

            const distCmp = a.dist - b.dist;
            if (distCmp !== 0) return distCmp;

            const labelICmp = collator.compare(a.labelI, b.labelI);
            if (labelICmp !== 0) return labelICmp;

            return collator.compare(a.labelJ, b.labelJ);
        });

        const sortedAngles = [...angles].sort((a, b) => {
            const typeCmp = collator.compare(angleType(a), angleType(b));
            if (typeCmp !== 0) return typeCmp;

            const angleCmp = a.angle - b.angle;
            if (angleCmp !== 0) return angleCmp;

            const labelACmp = collator.compare(a.labelA, b.labelA);
            if (labelACmp !== 0) return labelACmp;

            const labelBCmp = collator.compare(a.labelB, b.labelB);
            if (labelBCmp !== 0) return labelBCmp;

            return collator.compare(a.labelC, b.labelC);
        });

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

        lines.push(`# xyz2tab — ${formula}`);
        lines.push('');

        // --- Molecular information ---
        lines.push('## Molecular Information');
        lines.push('');

        if (comment) {
            lines.push(`**Comment:** ${mdCell(comment)}`);
            lines.push('');
        }

        lines.push(`**Formula:** ${mdCell(formula)}  `);
        lines.push(`**Formula weight:** ${fw.toFixed(3)} g/mol  `);
        lines.push(`**Atoms:** ${natoms}`);
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
            lines.push('| # | Atoms | Distance (Å) |');
            lines.push('|---|-------|--------------|');

            manualDistances.forEach((m, i) => {
                const selectedAtoms = (m.atoms || [])
                    .map(idx => getAtom(idx))
                    .filter(Boolean);

                if (selectedAtoms.length !== 2) return;

                const d = Chem.distance(selectedAtoms[0], selectedAtoms[1]);

                lines.push(
                    `| ${i + 1} | ${mdCell(selectedAtoms.map(a => a.label).join('–'))} | ${d.toFixed(4)} |`
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
                .sort(([a], [b]) => collator.compare(a, b))
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
            lines.push('| # | Atoms | Angle (°) |');
            lines.push('|---|-------|-----------|');

            manualAngles.forEach((m, i) => {
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
                    `| ${i + 1} | ${mdCell(selectedAtoms.map(a => a.label).join('–'))} | ${angle.toFixed(3)} |`
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
                .sort(([a], [b]) => collator.compare(a, b))
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
            lines.push('| # | Atoms | Dihedral (°) |');
            lines.push('|---|-------|--------------|');

            manualDihedrals.forEach((m, i) => {
                const selectedAtoms = (m.atoms || [])
                    .map(idx => getAtom(idx))
                    .filter(Boolean);

                if (selectedAtoms.length !== 4) return;

                const angle = Chem.calcDihedral(...selectedAtoms);

                lines.push(
                    `| ${i + 1} | ${mdCell(selectedAtoms.map(a => a.label).join('–'))} | ${angle.toFixed(3)} |`
                );
            });

            lines.push('');
        }

        // --- Current dihedral result, only if not already saved as manual dihedral ---
        if (
            manualDihedrals.length === 0 &&
            dihedralAngle !== null &&
            dihedralAtoms &&
            dihedralAtoms.length === 4
        ) {
            lines.push('## Current Dihedral Result');
            lines.push('');
            lines.push(`**Atoms:** ${mdCell(dihedralAtoms.map(a => a.label).join(' – '))}  `);
            lines.push(`**Dihedral:** ${dihedralAngle.toFixed(3)}°`);
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

                const excludedLabels = atomsForPlane
                    .filter(atom => excludedAtoms.has(atom.index))
                    .map(atom => atom.label);

                const status = invalid
                    ? (excludedLabels.length ? `invalid: excluded ${excludedLabels.join(', ')}` : 'invalid')
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
                const atomExcluded = atom ? excludedAtoms.has(atom.index) : true;

                let status = 'valid';

                if (!plane) {
                    status = 'invalid: plane removed';
                } else if (!atom) {
                    status = 'invalid: atom missing';
                } else if (planeInvalid && atomExcluded) {
                    status = 'invalid: plane and atom excluded';
                } else if (planeInvalid) {
                    status = 'invalid: plane';
                } else if (atomExcluded) {
                    status = 'invalid: atom excluded';
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

        return lines.join('\n');
    },
};
