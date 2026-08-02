> [!TIP]
> **advanced_xyz2tab** is available as a static browser-based web app for interactive `.xyz` structure analysis, including 3D molecular visualization, bond and angle tables, saved planes, atom-to-plane distances, plane angles, Cremer-Pople ring puckering analysis, approximate point group symmetry detection, manual measurements, and Markdown/PNG export.  
> 👉 Try it here: https://radi0sus.github.io/advanced_xyz2tab/  
> 👉 Original CLI tool: https://github.com/radi0sus/xyz2tab

# advanced_xyz2tab

`advanced_xyz2tab` is a browser-based web application for analysing molecular structures from `.xyz` files. It is a port and further development of the original Python command-line tool `xyz2tab`.

The app runs locally in the browser. Open `index.html`, load an `.xyz` file, and analyse the structure interactively.

No installation and no Python environment are required for normal use.

## Features

- Load `.xyz` molecular structures directly in the browser
- Interactive 3D molecular viewer using 3Dmol.js
- Calculation of:
  - sum formula
  - formula weight
  - atom list
  - bond lengths
  - bond angle tables
  - grouped bond summaries
  - grouped angle summaries
  - best-fit planes
  - atom distances to saved planes
  - angles between saved planes
  - Cremer-Pople ring puckering parameters (Q, θ, φ₂) for 5- and 6-membered rings
  - approximate ring conformation classification (chair, boat, twist-boat, envelope, half-chair, twist)
  - approximate molecular point group symmetry, with a tolerance-adjustable, per-element error score
  - manual distances
  - manual angles
  - manual dihedrals
- Adjustable covalent-radius tolerance for automatic bond detection
- Manual graph-active bonds
- Atom-wise exclusion from analysis
- Element filter for active elements
- Saved active-plane workflow
- Saved ring puckering analysis workflow
- Markdown export
- PNG export of the 3D viewer
- Light/dark theme via system preference
- Resizable viewer and table panels

## Quick start

Download or clone the repository and open:

```text
index.html
```

in a modern web browser.

Then drag and drop an `.xyz` file into the app or use the `Open .xyz` button.

The application runs locally in the browser. Molecular data are not uploaded to a server.

## XYZ file format

The app expects standard XYZ files:

```xyz
3
water
O  0.000000  0.000000  0.000000
H  0.758602  0.000000  0.504284
H -0.758602  0.000000  0.504284
```

The first line contains the number of atoms.  
The second line is treated as comment.  
The remaining lines must contain:

```text
Element  x  y  z
```

Coordinates are assumed to be Cartesian coordinates in Å.

## Atom labels

Atoms are labelled as:

```text
Element + position in XYZ file
```

Examples:

```text
Fe0
N1
C2
```

By default, indexing starts from `0`, following ORCA quantum-chemistry conventions.  
The index selector in the header can switch labels to start from `1`.

Changing the label index only affects displayed labels and exported labels. It does not change the molecular geometry.

## Bond detection

Bonds are detected from covalent radii:

```text
distance(A–B) <= (rA + rB) × tolerance
```

The tolerance can be adjusted interactively with the `Cov. radius +` slider.  
The default value is `8 %`.

Bond detection based on covalent radii is heuristic. For unusual structures, metal complexes, weak contacts, or strongly distorted geometries, manual adjustment may be necessary.

## Manual distances vs manual bonds

The app distinguishes between manual distance measurements and manual bonds.

### Save distance

`Save distance` stores a distance measurement only.

It:

- appears in the `Manual distances` table
- does not affect the bond graph
- does not affect bond summaries
- does not create angles

### Add bond

`Add bond` creates a graph-active manual bond.

It:

- appears in the bond table with source `manual`
- is included in grouped bond summaries
- influences automatic angle detection
- is drawn in the 3D viewer
- can be removed from the bond table

## Selection workflow

Atoms can be selected either in the 3D viewer or in the atom list.  
The order of selection is preserved and displayed as selection chips.

Available actions depend on the number of selected atoms.

### Two atoms

- `Save distance`
- `Add bond`

### Three atoms

- `Save angle`
- `Save current plane`

### Four atoms

- `Save dihedral`
- `Save current plane`

### Five or more atoms

- `Save current plane`

### Exactly five or six atoms, selected in ring order

- `Save current plane/ring` (saves both the best-fit plane and a Cremer-Pople ring puckering analysis)

If an active saved plane exists, selecting one or more atoms additionally enables:

- `Save dist. to active plane`

## Manual measurements

The app stores several kinds of manual measurements:

```text
manual distances
manual angles
manual dihedrals
manual bonds
```

Manual distances, angles and dihedrals are independent saved measurements.

Manual bonds are different: they are graph-active and are included in bond and angle analysis.

## Saved planes

The web app uses a saved-plane workflow instead of fixed `Plane 1` and `Plane 2` command-line options.

### Basic workflow

1. Select three or more atoms.
2. Click `Save current plane`.
3. The saved plane becomes the active reference plane.
4. Select one or more atoms.
5. Click `Save dist. to active plane` to save signed distances to the active plane.
6. Save another plane to automatically save the angle to the previously active plane.
7. Use the plane table to change the active plane or save additional plane angles.

The Plane tab contains:

- active plane information
- saved planes
- saved plane distances
- saved plane angles

Saved planes are not deleted automatically if an atom is excluded. Instead, planes and dependent measurements are marked as invalid if they involve excluded atoms.

## Ring puckering analysis (Cremer-Pople)

The `Ring analysis` tab computes Cremer-Pople ring puckering parameters for 5- and 6-membered rings, based on:

> D. Cremer, J. A. Pople, *J. Am. Chem. Soc.* **1975**, *97*, 1354-1358.

### Basic workflow

1. Select exactly 5 or 6 atoms **in ring connectivity order** (the order they were selected in, not sorted by atom index).
2. The selection toolbar button becomes `Save current plane/ring`.
3. A live preview of the puckering parameters and conformation is shown while atoms are selected.
4. Click `Save current plane/ring` to store both a best-fit plane and a ring puckering analysis entry.
5. Saved rings appear in the `Ring analysis` tab, with an expandable per-atom out-of-plane displacement table.

### Reported parameters

- 6-membered rings: total puckering amplitude `Q`, polar angle `θ`, phase angle `φ₂`
- 5-membered rings: puckering amplitude `q₂` (reported as `Q`), phase angle `φ₂`

### Conformation classification

Rings are assigned to one of the standard general conformation families:

- 6-membered rings: Chair (C), Boat (B), Twist-boat (S), Envelope (E), Half-chair (H)
- 5-membered rings: Envelope (E), Twist (T)

The 6-ring classification uses equal 45°/60° bands around the canonical Cremer-Pople reference latitudes (θ = 0°/45°/90°/135°/180°), the same grid used for example in the pyranoside mapping of:

> F. Protti, L. Toma, G. Zanoni, E. Casali, *ChemPlusChem* **2026**, *91*, e70192 (CALPUCK).

This is an approximation to the general conformation family and not an exact match to one of the 38 canonical IUPAC reference forms. The 5-ring classification (Envelope vs. Twist, every 18° along the pseudorotation phase) follows the standard Altona-Sundaralingam convention and is exact for that family assignment.

Rings with negligible puckering amplitude (`Q` &lt; 0.05 Å) are reported as "Planar".

Saved rings are not deleted automatically if an atom is excluded, or if a manual bond that was part of the ring's connectivity is removed again. Instead, they are marked as invalid (with the reason — excluded atom(s) and/or missing bond(s) — shown in the ring table and details), the same way as saved planes.

## Point group symmetry

The `Symmetry` tab runs an approximate, geometry-only point group detection directly in the browser (no external library, no server round-trip).

Rather than a strict yes/no test, every candidate symmetry element (rotation axis, mirror plane, inversion center, improper rotation) gets a continuous error value in Å: how well that operation actually maps the structure onto itself. A tolerance slider then decides which elements count as "present", and the standard textbook decision tree (main axis → perpendicular C₂'s? → σh? → σv/σd? → ...) is used to assign a point group from there.

### Workflow

- Computed automatically on load for structures up to 300 active atoms.
- Above that, use the `Analyze symmetry` button (avoids slowing down loading for large structures).
- Respects the current atom exclusion and active-element filter — excluded/hidden atoms are left out of the calculation, so you can e.g. hide peripheral ligand atoms and check the symmetry of just the metal core.
- Recomputation is lazy, not instant: excluding an atom or toggling an element doesn't immediately re-run the (expensive) detection. It's marked stale and only actually recomputed the next time it's needed — when the Symmetry tab is opened, or a Markdown export is generated — so filtering stays responsive even on larger structures.
- Adjust the tolerance slider to see how sensitive the assignment is to distortion; the defining elements and their individual error values are shown alongside the assigned group.

### Scope

- Solid: `C1`, `Cs`, `Ci`, `Cn`, `Cnv`, `Cnh`, `Dn`, `Dnh`, `Dnd`, `S2n` (n = 1–8), and the linear groups `C∞v`/`D∞h`.
- Best effort: the cubic groups `T`, `Th`, `O`, `Td`, `Oh`. Their defining axes generally do not pass through any atom (they run through face/edge midpoints of the ligand polyhedron instead), so they require an additional combinatorial candidate search that is capped for cost reasons on very large ligand sets.
- Out of scope: icosahedral (`Ih`).

### Known limitations

- The cubic branch additionally requires a full "D2 rotational core" (3 mutually perpendicular C₂ axes) before it is even considered, to avoid falsely classifying non-cubic (e.g. trigonally distorted, D3/D3d-type) coordination complexes as cubic just because a coincidentally-passing C3-like axis is found (any roughly-octahedral 6-ligand arrangement can produce such axes through alternating "face" directions, independent of the true molecular symmetry).
- The `Dnd` vs. `Dnh` distinction, and the tetrahedral/octahedral sub-classification (`T`/`Th`/`O`/`Td`/`Oh`), rely on the presence/absence of specific elements rather than a full character-table match, and can be sensitive to real-world distortion.
- As with the ring puckering analysis, this is an approximation intended for quick, interactive orientation, not a substitute for a dedicated symmetry package for publication-grade classification.

## Atom exclusion

Atoms can be excluded individually in the atom list.

Excluded atoms:

- remain visible in the atom list
- are hidden in the 3D viewer
- are ignored in automatic bond detection
- are ignored in automatic angle detection
- cannot be selected
- invalidate saved planes if they are defining atoms
- invalidate saved plane distances or plane angles where relevant

Exclusions can be reset with `Reset exclusions`.

## Element filter

The element filter controls which elements are active for displayed bond and angle analysis.

Element filtering and atom exclusion are independent.

Inactive elements:

- remain visible in the atom list
- are greyed out
- cannot be selected
- do not automatically become excluded atoms

## 3D viewer

The molecular viewer is powered by 3Dmol.js.

Viewer controls include:

- reset view
- toggle atom labels
- toggle bond length labels

The viewer reflects:

- active element filter
- atom exclusions
- highlighted selections
- graph-active manual bonds
- active saved plane

## Export

### Markdown export

The Markdown export includes, depending on available data:

- molecular information
- settings
- manual distances
- bond lengths
- grouped bond summaries
- manual angles
- bond angles
- grouped angle summaries
- manual dihedrals
- saved planes
- saved plane distances
- saved plane angles
- saved rings (Cremer-Pople parameters and per-atom out-of-plane displacements), with the same "invalid: excluded ..." / "invalid: missing bond ..." status as in the app
- point group symmetry (assigned group and defining elements with their error, at the currently selected tolerance) — last, not prominent

Bond and angle summaries are grouped by bond type or angle type and include:

- count
- minimum
- maximum
- mean
- standard deviation

The export uses a fixed logical sorting:

- bonds are sorted by bond type and distance
- angles are sorted by angle type and angle
- saved plane distances are sorted by plane and atom
- saved plane angles are sorted by plane names
- saved rings remain in saved order
- manual measurements remain in saved order

### PNG export

The current 3D viewer image can be exported as PNG.

## Differences from the original Python CLI tool

The original Python `xyz2tab` script is a command-line program with options for excluding atoms/elements, including contacts, calculating dihedrals, defining two planes, sorting tables and plotting molecules.

This browser version implements many of the same ideas interactively, but not always with identical semantics.

Important differences:

- The web app uses interactive atom selection instead of command-line atom arguments.
- Saved planes are managed as a list with one active reference plane.
- Manual distances are pure measurements.
- Manual bonds are graph-active and influence angle detection.
- Atom exclusion is reversible and affects viewer, selection and automatic analysis.
- Element filtering is interactive and independent of atom exclusion.
- Markdown export is generated from the current app state.
- The 3D viewer uses 3Dmol.js instead of matplotlib.

## Scientific notes

Distances are reported in Å.  
Angles are reported in degrees.

Signed distances to planes depend on the orientation of the plane normal. The sign is meaningful only relative to that normal direction; the absolute value gives the geometric distance from the plane.

Angles between saved planes are acute interplanar angles. They are useful for comparing plane orientations, but they are not always equivalent to signed torsion angles.

## 3Dmol.js citation

This application uses [3Dmol.js](https://3dmol.csb.pitt.edu/) for molecular visualization.

3Dmol.js is licensed under a permissive BSD open-source license.

Please cite:

> Rego, N. and Koes, D. (2015).  
> 3Dmol.js: molecular visualization with WebGL.  
> *Bioinformatics*, 31(8), 1322–1324.  
> https://academic.oup.com/bioinformatics/article/31/8/1322/213186

## License

This project is licensed under the BSD 3-Clause License.

See `LICENSE` for details.

## Known limitations

- XYZ files containing multiple structures are not explicitly supported.
- Bond detection is based on covalent radii and may require manual correction.
- Saved plane names are currently generated automatically.
- Plane tables are currently not sortable.
- Ring puckering conformation classification is an approximate, band-based assignment to the general conformation family, not an exact match to canonical IUPAC reference forms.
- Point group symmetry detection is approximate and geometry-only; icosahedral (Ih) is not covered, and the cubic groups (T/Th/O/Td/Oh) are best-effort (see "Point group symmetry" above).
- CSV and JSON export are not yet implemented.
- Analysis state is currently stored only during the active browser session.
