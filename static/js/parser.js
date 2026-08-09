// parser.js — parses .xyz file content into atom list

const Parser = {

    // Atomic weights (g/mol)
    atomicWeights: {
        H:1.008,He:4.003,Li:6.941,Be:9.012,B:10.811,C:12.011,N:14.007,O:15.999,
        F:18.998,Ne:20.180,Na:22.990,Mg:24.305,Al:26.982,Si:28.086,P:30.974,
        S:32.065,Cl:35.453,Ar:39.948,K:39.098,Ca:40.078,Sc:44.956,Ti:47.867,
        V:50.942,Cr:51.996,Mn:54.938,Fe:55.845,Co:58.933,Ni:58.693,Cu:63.546,
        Zn:65.38,Ga:69.723,Ge:72.630,As:74.922,Se:78.971,Br:79.904,Kr:83.798,
        Rb:85.468,Sr:87.62,Y:88.906,Zr:91.224,Nb:92.906,Mo:95.96,Tc:98,
        Ru:101.07,Rh:102.906,Pd:106.42,Ag:107.868,Cd:112.411,In:114.818,
        Sn:118.710,Sb:121.760,Te:127.60,I:126.904,Xe:131.293,Cs:132.905,
        Ba:137.327,La:138.905,Ce:140.116,Pr:140.908,Nd:144.242,Pm:145,
        Sm:150.36,Eu:151.964,Gd:157.25,Tb:158.925,Dy:162.500,Ho:164.930,
        Er:167.259,Tm:168.934,Yb:173.054,Lu:174.967,Hf:178.49,Ta:180.948,
        W:183.84,Re:186.207,Os:190.23,Ir:192.217,Pt:195.084,Au:196.967,
        Hg:200.592,Tl:204.383,Pb:207.2,Bi:208.980,Po:209,At:210,Rn:222,
        Fr:223,Ra:226,Ac:227,Th:232.038,Pa:231.036,U:238.029,
    },

    // Covalent radii in Angstrom (Alvarez 2008)
    covRadii: {
        H:0.31,He:0.28,Li:1.28,Be:0.96,B:0.84,C:0.76,N:0.71,O:0.66,
        F:0.57,Ne:0.58,Na:1.66,Mg:1.41,Al:1.21,Si:1.11,P:1.07,S:1.05,
        Cl:1.02,Ar:1.06,K:2.03,Ca:1.76,Sc:1.70,Ti:1.60,V:1.53,Cr:1.39,
        Mn:1.61,Fe:1.52,Co:1.50,Ni:1.24,Cu:1.32,Zn:1.22,Ga:1.22,Ge:1.20,
        As:1.19,Se:1.20,Br:1.20,Kr:1.16,Rb:2.20,Sr:1.95,Y:1.90,Zr:1.75,
        Nb:1.64,Mo:1.54,Tc:1.47,Ru:1.46,Rh:1.42,Pd:1.39,Ag:1.45,Cd:1.44,
        In:1.42,Sn:1.39,Sb:1.39,Te:1.38,I:1.39,Xe:1.40,Cs:2.44,Ba:2.15,
        La:2.07,Ce:2.04,Pr:2.03,Nd:2.01,Pm:1.99,Sm:1.98,Eu:1.98,Gd:1.96,
        Tb:1.94,Dy:1.92,Ho:1.92,Er:1.89,Tm:1.90,Yb:1.87,Lu:1.87,Hf:1.75,
        Ta:1.70,W:1.62,Re:1.51,Os:1.44,Ir:1.41,Pt:1.36,Au:1.36,Hg:1.32,
        Tl:1.45,Pb:1.46,Bi:1.48,Po:1.40,At:1.50,Rn:1.50,
    },

    // Van der Waals radii in Angstrom (Alvarez 2013, Dalton Trans. 42, 8617–8636)
    // — same source used by MoloVol as its default radii set, so vdW volumes
    // computed with this table should be directly comparable to MoloVol
    // output for the same grid resolution.
    vdwRadii: {
        H:1.20,He:1.43,Li:2.12,Be:1.98,B:1.91,C:1.77,N:1.66,O:1.50,
        F:1.46,Ne:1.58,Na:2.50,Mg:2.51,Al:2.25,Si:2.19,P:1.90,S:1.89,
        Cl:1.82,Ar:1.83,K:2.73,Ca:2.62,Sc:2.58,Ti:2.46,V:2.42,Cr:2.45,
        Mn:2.45,Fe:2.44,Co:2.40,Ni:2.40,Cu:2.38,Zn:2.39,Ga:2.32,Ge:2.29,
        As:1.88,Se:1.82,Br:1.86,Kr:2.25,Rb:3.21,Sr:2.84,Y:2.75,Zr:2.52,
        Nb:2.56,Mo:2.45,Tc:2.44,Ru:2.46,Rh:2.44,Pd:2.15,Ag:2.53,Cd:2.49,
        In:2.43,Sn:2.42,Sb:2.47,Te:1.99,I:2.04,Xe:2.06,Cs:3.48,Ba:3.03,
        La:2.98,Ce:2.88,Pr:2.92,Nd:2.95,Sm:2.90,Eu:2.87,Gd:2.83,Tb:2.79,
        Dy:2.87,Ho:2.81,Er:2.83,Tm:2.79,Yb:2.80,Lu:2.74,Hf:2.63,Ta:2.53,
        W:2.57,Re:2.49,Os:2.48,Ir:2.41,Pt:2.29,Au:2.32,Hg:2.45,Tl:2.47,
        Pb:2.60,Bi:2.54,Ac:2.80,Th:2.93,Pa:2.88,U:2.71,Np:2.82,Pu:2.81,
        Am:2.83,Cm:3.05,Bk:3.40,Cf:3.05,Es:2.70,
    },

    // Element colors for 3DMol (CPK-like)
    elementColors: {
        H:'#ffffff',C:'#404040',N:'#3050f8',O:'#ff0d0d',F:'#90e050',
        Cl:'#1ff01f',Br:'#a62929',I:'#940094',S:'#ffff30',P:'#ff8000',
        Fe:'#e06633',Cu:'#c88033',Zn:'#7d80b0',Co:'#f090a0',Ni:'#50d050',
        Mn:'#9c7ac7',Cr:'#8a99c7',Ti:'#bfc2c7',Ca:'#3dff00',Na:'#ab5cf2',
        Mg:'#8aff00',Al:'#bfa6a6',Si:'#f0c8a0',default:'#ff69b4',
    },

    labelAtoms(atoms, startIndex = 0) {
        const offset = parseInt(startIndex, 10) || 0;

        for (const atom of atoms) {
            atom.labelIndex = atom.index + offset;
            atom.label = atom.element + atom.labelIndex;
        }
    },

    parse(text) {
        const lines = text.trim().split(/\r?\n/);
        if (lines.length < 3) throw new Error('Invalid .xyz file');

        const natoms = parseInt(lines[0].trim(), 10);
        if (isNaN(natoms)) throw new Error('First line must be atom count');

        const comment = lines[1] || '';
        const atoms = [];

        // Count elements for indexed labels (e.g. Fe1, N2, N3)
        const elCount = {};

        for (let i = 2; i < 2 + natoms; i++) {
            const line = lines[i];
            if (!line) continue;
            const parts = line.trim().split(/\s+/);
            if (parts.length < 4) continue;

            const el = parts[0];
            // Capitalize properly: FE -> Fe, fe -> Fe
            const element = el.charAt(0).toUpperCase() + el.slice(1).toLowerCase();

            elCount[element] = (elCount[element] || 0) + 1;

            atoms.push({
                index: atoms.length,       // 0-based
                element,
                x: parseFloat(parts[1]),
                y: parseFloat(parts[2]),
                z: parseFloat(parts[3]),
            });
        }

        // Assign labels like the original Python tool:
        // element + global XYZ atom index, e.g. Fe0, N1, N2, C3
        this.labelAtoms(atoms, 0);

        // Molecular formula (Hill order: C first, H second, rest alphabetical)
        const formula = this._hillFormula(elCount);

        // Formula weight
        let fw = 0;
        for (const [el, cnt] of Object.entries(elCount)) {
            fw += (this.atomicWeights[el] || 0) * cnt;
        }

        // Mass fractions
        const massFractions = {};
        for (const [el, cnt] of Object.entries(elCount)) {
            massFractions[el] = ((this.atomicWeights[el] || 0) * cnt / fw) * 100;
        }

        return { natoms, comment, atoms, formula, fw, elCount, massFractions };
    },

    // --- Format-sniffing dispatcher ---
    // Used for file loads and paste, so both accept .xyz and .mol/.sdf
    // content without the caller needing to know the format up front.
    // Extension (when available) is the primary signal; content sniffing is
    // the fallback for paste (no filename) or a mismatched/missing extension.
    parseAuto(text, filename = '') {
        const ext = (filename.split('.').pop() || '').toLowerCase();

        if (ext === 'sdf' || ext === 'mol') return this.parseSDF(text);
        if (ext === 'xyz') return this.parseLenient(text);

        // No usable extension: sniff the content. An .xyz's first non-blank
        // line is a bare atom count; a .mol/.sdf's 4th line (the counts
        // line) contains "V2000"/"V3000", which never appears in .xyz.
        if (/\bV[23]000\b/.test(text.slice(0, 2000))) return this.parseSDF(text);
        return this.parseLenient(text);
    },
    // Lenient variant used for the "Paste .xyz" modal. It tolerates things a
    // strict file parser shouldn't have to (stray blank lines anywhere,
    // a missing/omitted atom-count or comment header), but is STRICT about
    // each atom line actually being "element x y z" — it will not silently
    // accept "x y z" (no element) or "element x y" (missing z, i.e. a
    // truncated/cut-off line) the way a naive split-and-skip parser might.
    parseLenient(text) {
        const rawLines = text.split(/\r?\n/);

        // Drop fully blank lines but remember original line numbers for
        // error messages, so extra blank padding never breaks parsing.
        const lines = [];
        rawLines.forEach((line, idx) => {
            if (line.trim() !== '') lines.push({ text: line, lineNo: idx + 1 });
        });

        if (lines.length === 0) throw new Error('No data found.');

        const elementRe = /^[A-Za-z]{1,3}$/;
        const numberRe = /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/;

        let dataLines = lines;
        let comment = '';

        // Standard header: first non-blank line is a bare integer atom count.
        // Use that declared count to disambiguate whether the *next* line is
        // a comment or already the first atom — some pasted snippets omit
        // the (technically optional) comment line entirely, going straight
        // from "N" to "element x y z". Blindly assuming line 2 is always the
        // comment would then eat the first atom.
        if (/^\d+$/.test(lines[0].text.trim())) {
            const declaredCount = parseInt(lines[0].text.trim(), 10);
            const remaining = lines.length - 1;

            if (remaining === declaredCount) {
                // No comment line: count immediately followed by N atom lines.
                dataLines = lines.slice(1);
            } else if (remaining - 1 === declaredCount) {
                // Standard: count, comment, N atom lines.
                comment = lines[1] ? lines[1].text : '';
                dataLines = lines.slice(2);
            } else {
                // Count doesn't cleanly match either layout (typo'd header,
                // extra/missing lines, etc.) — fall back to checking whether
                // line 2 itself looks like a valid "element x y z" atom line;
                // if so it can't be a comment, so don't consume it as one.
                const probe = lines[1] ? lines[1].text.trim().split(/\s+/) : [];
                const looksLikeAtom = probe.length === 4
                    && elementRe.test(probe[0])
                    && [probe[1], probe[2], probe[3]].every(v => numberRe.test(v));

                if (looksLikeAtom) {
                    dataLines = lines.slice(1);
                } else {
                    comment = lines[1] ? lines[1].text : '';
                    dataLines = lines.slice(2);
                }
            }
        }

        if (dataLines.length === 0) throw new Error('No atom coordinate lines found.');

        const atoms = [];
        const elCount = {};

        for (const { text: raw, lineNo } of dataLines) {
            const parts = raw.trim().split(/\s+/);

            if (parts.length === 3) {
                if (numberRe.test(parts[0])) {
                    throw new Error(`Line ${lineNo}: found "x y z" but no element symbol — expected "element x y z".`);
                }
                throw new Error(`Line ${lineNo}: found "element x y" — the z coordinate is missing (truncated?). Expected "element x y z".`);
            }
            if (parts.length < 3) {
                throw new Error(`Line ${lineNo}: expected "element x y z" (4 columns), found ${parts.length}.`);
            }
            if (parts.length > 4) {
                throw new Error(`Line ${lineNo}: expected "element x y z" (4 columns), found ${parts.length} — remove any extra columns.`);
            }

            const [el, xs, ys, zs] = parts;

            if (!elementRe.test(el)) {
                throw new Error(`Line ${lineNo}: "${el}" doesn't look like an element symbol — expected "element x y z".`);
            }
            if (![xs, ys, zs].every(v => numberRe.test(v))) {
                throw new Error(`Line ${lineNo}: "${xs} ${ys} ${zs}" — x, y and z must all be numbers.`);
            }

            const element = el.charAt(0).toUpperCase() + el.slice(1).toLowerCase();
            elCount[element] = (elCount[element] || 0) + 1;

            atoms.push({
                index: atoms.length,
                element,
                x: parseFloat(xs),
                y: parseFloat(ys),
                z: parseFloat(zs),
            });
        }

        this.labelAtoms(atoms, 0);

        const formula = this._hillFormula(elCount);

        let fw = 0;
        for (const [el, cnt] of Object.entries(elCount)) {
            fw += (this.atomicWeights[el] || 0) * cnt;
        }

        const massFractions = {};
        for (const [el, cnt] of Object.entries(elCount)) {
            massFractions[el] = ((this.atomicWeights[el] || 0) * cnt / fw) * 100;
        }

        return { natoms: atoms.length, comment, atoms, formula, fw, elCount, massFractions };
    },

    _hillFormula(elCount) {
        const els = Object.keys(elCount);
        const order = [];
        if (elCount['C']) { order.push('C'); }
        if (elCount['H']) { order.push('H'); }
        const rest = els.filter(e => e !== 'C' && e !== 'H').sort();
        order.push(...rest);
        return order.map(e => elCount[e] > 1 ? e + elCount[e] : e).join('');
    },

    // Shared by parse/parseLenient/parseSDF: labels atoms, derives the Hill
    // formula, formula weight, and mass fractions from a finished atom list.
    _finalize(atoms, elCount, comment, extra = {}) {
        this.labelAtoms(atoms, 0);

        const formula = this._hillFormula(elCount);

        let fw = 0;
        for (const [el, cnt] of Object.entries(elCount)) {
            fw += (this.atomicWeights[el] || 0) * cnt;
        }

        const massFractions = {};
        for (const [el, cnt] of Object.entries(elCount)) {
            massFractions[el] = ((this.atomicWeights[el] || 0) * cnt / fw) * 100;
        }

        return { natoms: atoms.length, comment, atoms, formula, fw, elCount, massFractions, ...extra };
    },

    // --- MOL/SDF (V2000) parser ---
    // Reads the CTAB (connection table) of a .mol file, or the first
    // molecule record of a (possibly multi-structure) .sdf file such as a
    // PubChem "3D conformer" export. Only atom coordinates + elements are
    // used — bonds are ignored, since the rest of the tool already derives
    // connectivity itself from covalent radii, exactly as it does for .xyz
    // input. SDF data-item tags (the "> <TAG>" blocks after M  END) are not
    // parsed; only the CTAB matters here.
    //
    // A .sdf/.mol file can encode a flat 2D depiction (all z == 0) rather
    // than a real 3D geometry — common for structures fetched without
    // explicitly requesting a 3D conformer. Every downstream calculation in
    // this tool (bond angles, CShM, symmetry, DOSY volumes...) needs real
    // 3D coordinates, so this is flagged via the returned `is2D` flag rather
    // than silently producing a degenerate flat "molecule".
    parseSDF(text) {
        const rawLines = text.split(/\r?\n/);

        // Only the first molecule record is loaded — same "one structure
        // per file" model as .xyz. A multi-compound SDF (several records
        // separated by "$$$$") is noted via `extraRecords` so the caller can
        // warn that the rest of the file was ignored.
        const delimIdx = rawLines.findIndex(l => l.trim() === '$$$$');
        const block = delimIdx === -1 ? rawLines : rawLines.slice(0, delimIdx);
        const extraRecords = delimIdx === -1
            ? 0
            : rawLines.slice(delimIdx + 1).some(l => l.trim() !== '') ? 1 : 0;

        if (block.length < 4) throw new Error('Not a valid .mol/.sdf file (missing header).');

        const countsLine = block[3] || '';
        // Fixed-width per the CTAB spec (3 chars per count field), but fall
        // back to whitespace splitting for files that don't pad exactly —
        // common with files written by non-MDL-conforming tools.
        let natoms = parseInt(countsLine.slice(0, 3), 10);
        if (isNaN(natoms)) {
            const parts = countsLine.trim().split(/\s+/);
            natoms = parseInt(parts[0], 10);
        }
        if (isNaN(natoms)) throw new Error('Could not read atom count from the counts line.');

        const atomLines = block.slice(4, 4 + natoms);
        if (atomLines.length < natoms) throw new Error('File ends before all atom lines were read — truncated .mol/.sdf?');

        const atoms = [];
        const elCount = {};
        let maxAbsZ = 0;

        for (const line of atomLines) {
            // Atom line: x(10) y(10) z(10) element(3) ... (whitespace-
            // tolerant split works for the vast majority of real files).
            const parts = line.trim().split(/\s+/);
            if (parts.length < 4) continue;

            const x = parseFloat(parts[0]);
            const y = parseFloat(parts[1]);
            const z = parseFloat(parts[2]);
            const el = parts[3];
            if (!isFinite(x) || !isFinite(y) || !isFinite(z) || !el) continue;

            maxAbsZ = Math.max(maxAbsZ, Math.abs(z));

            const element = el.charAt(0).toUpperCase() + el.slice(1).toLowerCase();
            elCount[element] = (elCount[element] || 0) + 1;
            atoms.push({ index: atoms.length, element, x, y, z });
        }

        if (atoms.length === 0) throw new Error('No atoms found in the .mol/.sdf CTAB.');

        // Two 2D signals, in order of trust:
        // 1) The MDL "dimensional code" on the program line — PubChem/OEChem
        //    etc. reliably write it as a "2D"/"3D" suffix (e.g.
        //    "-OEChem-08092607053D"), which is NOT bounded by \b since
        //    digits and letters are both word characters — check the line
        //    ending directly instead.
        // 2) A z==0 fallback, used only when no dimension code is present.
        //    This must be an EXACT-zero check, not a small tolerance: a real
        //    3D conformer of a genuinely (near-)planar molecule (e.g.
        //    aniline) can have out-of-plane deviations as small as 1e-4 Å,
        //    which a "< 1e-3" tolerance would misflag as 2D. An actual 2D
        //    depiction writes a literal 0.0000 for every atom with no
        //    exceptions, so exact equality is the correct discriminator.
        const dimCode = (block[1] || '').trim().match(/([23])D\s*$/i);
        const is2D = dimCode ? dimCode[1] === '2' : maxAbsZ === 0;

        const comment = (block[1] || '').trim();

        return this._finalize(atoms, elCount, comment, { is2D, extraRecords });
    },

    getCovRadius(element) {
        return this.covRadii[element] || 1.5;
    },

    // Fallback of 2.0 Å matches the historical CSD default for elements
    // Alvarez didn't cover (Pm, Po, At, Rn, Fr, Ra, Fm and heavier) — see
    // Alvarez, Dalton Trans. 2013, 42, 8617.
    getVdwRadius(element) {
        return this.vdwRadii[element] || 2.0;
    },

    getColor(element) {
        return this.elementColors[element] || this.elementColors['default'];
    },
};
