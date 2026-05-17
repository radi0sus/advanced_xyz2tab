> [!TIP]
> **advanced_xyz2tab** is available as a static browser-based web app for interactive `.xyz` structure analysis, including 3D molecular visualization, bond and angle tables, saved planes, atom-to-plane distances, plane angles, manual measurements, and Markdown/PNG export.  
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
  - manual distances
  - manual angles
  - manual dihedrals
- Adjustable covalent-radius tolerance for automatic bond detection
- Manual graph-active bonds
- Atom-wise exclusion from analysis
- Element filter for active elements
- Saved active-plane workflow
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
- CSV and JSON export are not yet implemented.
- Analysis state is currently stored only during the active browser session.
