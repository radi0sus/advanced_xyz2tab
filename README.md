> [!TIP]
> **advanced_xyz2tab** is available as a static browser-based web app for interactive `.xyz` structure analysis, including 3D molecular visualization, bond and angle
  tables, saved planes, atom-to-plane distances, plane angles, Cremer-Pople ring puckering analysis, Continuous Shape Measures (CShM) with polyhedral volume,
  approximate point group symmetry detection, manual measurements, and Markdown/PNG export.
> 👉 Try it here: https://radi0sus.github.io/advanced_xyz2tab/  
> 👉 Original CLI tool: https://github.com/radi0sus/xyz2tab

# advanced_xyz2tab

`advanced_xyz2tab` is a browser-based web application for analysing molecular structures from `.xyz` files. It is a port and further development of the original Python
command-line tool `xyz2tab`.

The app runs locally in the browser. Open `index.html`, load an `.xyz` file, and analyse the structure interactively.

No installation and no Python environment are required for normal use.

## Features

- Load `.xyz`, `.mol`, or `.sdf` molecular structures directly in the browser (including PubChem SDF exports, with a warning for flat 2D depictions)
- **Paste XYZ or MOL/SDF data from clipboard** — paste text directly (`Ctrl+V`/`Cmd+V`) into a modal instead of loading a file, for quickly trying out coordinates copied
  from somewhere else
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
  - Cremer-Pople ring puckering parameters (Q, $\theta$, $\phi_2$) for 5- and 6-membered rings
  - approximate ring conformation classification (chair, boat, twist-boat, envelope, half-chair, twist)
  - Evans & Boeyens conformational decomposition (normalized % share of the nearest primitive symmetric forms)
  - Continuous Shape Measures (CShM) for any bonded coordination sphere (CN 2–6), against the ideal reference polyhedra, plus polyhedral volume and
    $\tau_4$, $\tau_4\prime$, $\tau_5$ geometry indices (CN 4/5)
  - approximate molecular point group symmetry, with a tolerance-adjustable, per-element error score
  - manual distances
  - manual angles
  - manual dihedrals
  - DOSY-related size estimates: van der Waals volume and surface area, equivalent-sphere radius ($r_{eq}$ — a geometric proxy, not the empirical hydrodynamic radius), and
    standard radius of gyration ($r_g$)
- **Mesh view**: live 3D rendering of the van der Waals surface, SASA, the $r_{eq}$, $r_{eq}$,Perrin, $r_g$ equivalent spheres, or the actual Perrin equivalent ellipsoid, as a
  translucent mesh/sphere in the viewer
- Adjustable covalent-radius tolerance for automatic bond detection
- Manual graph-active bonds
- Atom-wise exclusion from analysis
- Element filter for active elements
- Saved active-plane workflow
- Saved ring puckering analysis workflow
- Saved CShM workflow with polyhedral volume
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

Alternatively, click `Paste .xyz`, then click into the field and press `Ctrl+V`/`Cmd+V` to paste xyz text directly — it loads automatically as soon as you paste.

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

### Pasted data

The `Paste .xyz` modal accepts the same format, but is more forgiving about surrounding whitespace:

- extra/stray blank lines anywhere are ignored
- the atom-count and comment header lines are optional — pasting just the `Element x y z` lines works too

Each atom line is still validated strictly: it must be `Element x y z` (exactly 4 columns). Lines with only 3 columns — either `x y z` (missing element) or `Element x y`
(missing z, e.g. a truncated/cut-off line) — are rejected with a specific error message and line number rather than silently accepted or dropped.

### MOL / SDF input

`.mol` and `.sdf` files (V2000 CTAB format) are also accepted — via drag-and-drop, `Open file`, or paste — so a structure downloaded directly from PubChem (or exported
from most other chemistry software) doesn't need an external XYZ conversion step first. Only atom coordinates and elements are read; bonds in the file are ignored, since
the tool already derives connectivity itself from covalent radii, the same way it does for `.xyz` input. If an `.sdf` contains several $$$$-separated records, only the
first is loaded, with a warning that the rest was ignored.

**2D depictions:** a `.mol`/`.sdf` can encode a flat 2D depiction (all z = 0) rather than a real 3D conformer — this happens when a structure is fetched without
explicitly requesting 3D coordinates (e.g. PubChem's default 2D structure download, as opposed to its separate "3D Conformer" download). Since every geometry-dependent
feature here (bond angles, CShM, symmetry, the DOSY size estimates, ...) needs real 3D coordinates, such a file loads with a warning rather than silently producing
degenerate, meaningless results.

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

$Distance(A–B) <= (r_A + r_B) × tolerance$  


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

> Dieter Cremer,  John A. Pople,  
> "A General Definition of Ring Puckering Coordinates",  
> *J. Am. Chem. Soc.* **1975**, *97*, 1354-1358.  
> https://doi.org/10.1021/ja00839a011  

### Basic workflow

1. Select exactly 5 or 6 atoms **in ring connectivity order** (the order they were selected in, not sorted by atom index).
2. The selection toolbar button becomes `Save current plane/ring`.
3. A live preview of the puckering parameters and conformation is shown while atoms are selected.
4. Click `Save current plane/ring` to store both a best-fit plane and a ring puckering analysis entry.
5. Saved rings appear in the `Ring analysis` tab, with an expandable per-atom out-of-plane displacement table.

### Reported parameters

- 6-membered rings: total puckering amplitude $Q$, polar angle $\theta$, phase angle $\phi_2$
- 5-membered rings: puckering amplitude $q_2$ (reported as $Q$), phase angle $\phi_2$

### Conformation classification

Rings are assigned to one of the standard general conformation families:

- 6-membered rings: Chair (C), Boat (B), Twist-boat (S), Envelope (E), Half-chair (H)
- 5-membered rings: Envelope (E), Twist (T)

The 6-ring classification uses equal 45°/60° bands around the canonical Cremer-Pople reference latitudes ($\theta$ = 0°/45°/90°/135°/180°), the same grid used for example
in the pyranoside mapping of:

> Filippo Protti, Lucio Toma, Giuseppe Zanoni, Emanuele Casali,  
> "CALPUCK: An Open Python Tool for Cremer–Pople Ring Puckering Analysis Including a New 2D Mapping of Seven-Membered Rings",  
> *ChemPlusChem* **2026**, *91*, e70192.  
> https://doi.org/10.1002/cplu.70192  

This is an approximation to the general conformation family and not an exact match to one of the 38 canonical IUPAC reference forms. The 5-ring classification (Envelope
vs. Twist, every 18° along the pseudorotation phase) follows the standard Altona-Sundaralingam convention and is exact for that family assignment.

Rings with negligible puckering amplitude ($Q$ &lt; 0.05 Å) are reported as "Planar".

Saved rings are not deleted automatically if an atom is excluded, or if a manual bond that was part of the ring's connectivity is removed again. Instead, they are marked
as invalid (with the reason — excluded atom(s) and/or missing bond(s) — shown in the ring table and details), the same way as saved planes.

**Note for 5-membered rings:**   
- Inverting the absolute configuration transforms $\phi_2$ into $180° + \phi_2$.  
- A cyclic forward shift of the pivot atom from atom 1 to atom 2 transforms $\phi_2$ into $\phi_2 + 144°$.  
- Changing the sense of rotation transforms $\phi_2$ into $180° - \phi_2$.  

**Note for 6-membered rings:**   
- Inverting the absolute configuration transforms $\theta$ into $180° - \theta$ and $\phi_2$ into $180° + \phi_2$.  
- A cyclic forward shift of the pivot atom from atom 1 to atom 2 transforms $\theta$ into $180° - \theta$ and $\phi_2$ into $\phi_2 + 120°$.  
- Changing the sense of rotation transforms $\theta$ into $180°- \theta$ and $\phi_2$ into $180° - \phi_2$, and vice versa.  

### Graphical conformation map

Below the ring table, the `Ring analysis` tab plots every saved ring on two diagrams — one for 6-membered rings, one for 5-membered rings — using the same 
classification described above (not the Evans-Boeyens decomposition below).

- **6-membered rings**: a Cartesian $\phi_2$ (x-axis) vs. $\theta$ (y-axis) map, essentially an equirectangular ("unrolled") projection of the Cremer-Pople sphere.
Both chair poles ($\theta$ = 0° and $\theta$ = 180°) become the top and bottom edges of the rectangle instead of collapsing to a single point, as they would on a polar plot.  
- **5-membered rings**: a single horizontal $\phi_2$ band.  

The layout of shaded classification zones and background conformer letters (C/E/H/B/S, or E/T for 5-rings) is inspired by the diagrams from Protti et al.
Points are colored and numbered to match the ring table, clickable to highlight the corresponding ring atoms in the 3D view, and are kept at their exact computed position — 
identical rings render exactly on top of each other. Nearly-planar rings ($Q$ &lt; 0.05 Å) are marked with a dashed "P" circle instead of a filled marker, 
since $\theta$/$\phi_2$ are not meaningfully defined at that amplitude. Both diagrams can be exported together as PNG via a single button below them.

### Evans & Boeyens conformational decomposition

In addition to the nearest-neighbor classification above, each saved ring's details panel (and the Markdown export) reports an independent, exact decomposition based on:

> Deborah G. Evans, Jan C. A. Boeyens,  
> "Conformational Analysis of Ring Pucker",  
> *Acta Cryst.* **1989**, *B45*, 581-590.  
> https://doi.org/10.1107/S0108768189008190  

Rather than snapping the ring to the single nearest classical form, this expresses its actual $(q_2, \phi_2[, q_3])$ exactly as a normalized linear combination 
of the nearest primitive symmetric forms — e.g. "91.7% Chair + 7.8% Boat ($\phi$=0°) + 0.6% Twist-boat ($\phi$=330°)" for a 6-ring, 
or "23.4% Envelope ($\phi$=252°) + 76.6% Twist ($\phi$=270°)" for a 5-ring. The fractions always sum to 100% and are independent of ring numbering and puckering amplitude.

For 6-membered rings this is the Chair ($B_{2u}$) mode plus the nearest Boat/Twist-boat ($E_2$) phase pair; for 5-membered rings it is the nearest Envelope/Twist ($E_2$) phase pair only, 
since the $B_{2u}$ mode only exists for even-membered rings. This is deliberately kept separate from the classification above — no shared thresholds, no shared diagram — and is 
not shown for nearly-planar rings ($Q$ &lt; 0.05 Å) or for 7-/8-membered rings, which are outside its current scope.

The implementation was cross-checked against all worked examples in the paper and against PLATON's Fortran implementation of the same method:

> Anthony L. Spek,  
> "Single-crystal structure validation with the program PLATON",  
> *J. Appl. Cryst.* **2003**, *36*, 7-11.  
> https://doi.org/10.1107/S0021889802022112

## Continuous Shape Measures (CShM)

The `CShM` tab computes Continuous Shape Measures for the coordination sphere of any single atom based on:

> Mark Pinsky, David Avnir,  
> "Continuous Symmetry Measures. 5. The Classical Polyhedra",  
> *Inorganic Chemistry* **1998**, *37*, 5575-5582.  
> https://doi.org/10.1021/ic9804925  

> Santiago Alvarez, Pere Alemany, David Casanova, Jordi Cirera, Miquel Llunell, David Avnir,  
> "Shape maps and polyhedral interconversion paths in transition metal chemistry",  
> *Coordination Chemistry Reviews* **2005**, *249*, 1693-1708.  
> https://doi.org/10.1016/j.ccr.2005.03.031

The ideal reference polyhedra (coordinates) follow the same set used by `cosymlib` and related CShM tools:

> https://github.com/GrupEstructuraElectronicaSimetria/cosymlib/blob/master/cosymlib/shape/ideal_structures_center.yaml

### Basic workflow

1. Select exactly one atom.
2. All atoms currently bonded to it (automatic + manual bonds, CN 2-6) are used as the coordination sphere — the button is only enabled in that CN range.
3. A live preview of the CN, the closest-matching reference shape and its S value, and the polyhedral volume is shown while the atom is selected. For CN 4 or 5, the τ
   geometry indices (see below) are shown as well.
4. Click `Save CShM` (in the selection toolbar, after `Save dist. to active plane`) to store the full ranking against every reference shape for that CN.
5. Saved results appear in the `CShM` tab, with an expandable per-entry ranking table.

### Reported values

- $S$: the CShM value for each candidate reference shape, lower is a better fit; the lowest value across all candidates for that CN is the assigned "closest shape".
- $V$ /Å³: polyhedral volume — the convex-hull volume of the central atom plus its ligand positions.
- $\tau_4$, $\tau_4\prime$ (CN 4 only), $\tau_5$ (CN 5 only): geometry indices based on the two largest L-M-L angles at the central atom, based on:

  > Lei Yang, Douglas R. Powell, Robert P. Houser,  
  > "Structural variation in copper(i) complexes with pyridylmethylamide ligands: structural analysis with a new four-coordinate geometry index, $\tau_4$",  
  > *Dalton Transactions* **2007**, 955-964.  
  > https://doi.org/10.1039/B617136B
  
  > Andrzej Okuniewski, Damian Rosiak, Jarosław Chojnacki, Barbara Becker,  
  > "Coordination polymers and molecular structures among complexes of mercury(II) halides with selected 1-benzoylthioureas",  
  > *Polyhedron* **2015**, *90*, 47-57.  
  > https://doi.org/10.1016/j.poly.2015.01.035
  
  > Anthony W. Addison, T. Nageswara Rao, Jan Reedijk, Jacobus van Rijn, Gerrit C. Verschoor,  
  > "Synthesis, structure, and spectroscopic properties of copper(II) compounds containing nitrogen-sulphur donor ligands; the crystal and molecular structure of
    aqua[1,7-bis(N-methylbenzimidazol-2′-yl)-2,6-dithiaheptane]copper(II) perchlorate",
  > *Journal of the Chemical Society, Dalton Transactions* **1984**, 1349-1356.  
  > https://doi.org/10.1039/DT9840001349

  $\tau_4$ and $\tau_4\prime$ range from 0 (square planar) to 1 (tetrahedral); $\tau_5$ ranges from 0 (square pyramidal) to 1 (trigonal bipyramidal). They are not shown
  for any other CN and are not part of the saved-results overview table (kept in the live preview and the per-entry details instead, to avoid a table column that would
  be empty for most CNs).

### Rating colors

$S$ values are colored to give a quick visual read on how reliable the shape assignment is:

- **green** — $S$ &lt; 3: clearly identifiable shape, distortion is minor.
- **orange** — 3 ≤ $S$ &lt; 15: noticeably distorted but the closest shape is still informative.
- **red** — $S$ ≥ 15: distortion is large enough that the "closest shape" label is not a reliable assignment on its own (other candidates may fit similarly badly).

These thresholds are a practical convention (not a fixed literature standard) and can be off for unusual coordination spheres —
always check the full ranking, not just the top hit.

Saved CShM results are not deleted automatically if an atom is excluded, or if the set of atoms bonded to the central atom changes (tolerance, manual bond, exclusion,
...). Instead, they are marked as invalid (with the reason shown in the table and details), the same way as saved rings and planes.

## Point group symmetry

The `Symmetry` tab runs an approximate, geometry-only point group detection directly in the browser (no external library, no server round-trip).

Rather than a strict yes/no test, every candidate symmetry element (rotation axis, mirror plane, inversion center, improper rotation) gets a continuous error value in Å:
how well that operation actually maps the structure onto itself. A tolerance slider then decides which elements count as "present", and the standard textbook decision
tree (main axis → perpendicular $C_2$'s? → $\sigma_h$? → $\sigma_v$ / $\sigma_d$? → ...) is used to assign a point group from there.

### Workflow

- Computed automatically on load for structures up to 300 active atoms.
- Above that, use the `Analyze symmetry` button (avoids slowing down loading for large structures).
- Respects the current atom exclusion and active-element filter — excluded/hidden atoms are left out of the calculation, so you can e.g. hide peripheral ligand atoms and
  check the symmetry of just the metal core.
- Recomputation is lazy, not instant: excluding an atom or toggling an element doesn't immediately re-run the (expensive) detection. It's marked stale and only actually
  recomputed the next time it's needed — when the Symmetry tab is opened, or a Markdown export is generated — so filtering stays responsive even on larger structures.
- Adjust the tolerance slider to see how sensitive the assignment is to distortion; the defining elements and their individual error values are shown alongside the assigned group.

### Scope

- Solid: $C_1$, $C_s$, $C_i$, $C_n$, $C_{nv}$, $C_{nh}$, $D_n$, $D_{nh}$, $D_{nd}$, $S_{2n}$ (n = 1–8), the linear groups $C_{\infty v}$, $D_{\infty h}$, and $K_h$ for the
  degenerate single-atom (or coincident-point) case — a lone atom has no distinguished axis at all, so it's the full spherical symmetry group,
  not $D_{\infty h}$.
- Best effort: the cubic groups $T$, $T_h$, $O$, $T_d$, $O_h$. Their defining axes generally do not pass through any atom (they run through face/edge midpoints of the ligand
  polyhedron instead), so they require an additional combinatorial candidate search that is capped for cost reasons on very large ligand sets.
- Out of scope: icosahedral ($I$, $I_h$) — rare in practice for this tool's typical inputs, and the added complexity (candidate generation through face/edge midpoints
  of a 12-vertex polyhedron, plus false-positive guarding comparable to what the cubic groups needed) wasn't judged worth it over a small number of real-world cases.

### Known limitations

- The cubic branch additionally requires a full $D_2$ rotational core (3 mutually perpendicular $C_2$ axes) before it is even considered, to avoid falsely classifying
  non-cubic (e.g. trigonally distorted, $D_3$, $D_3d$-type) coordination complexes as cubic just because a coincidentally-passing $C_3$-like axis is found (any
  roughly-octahedral 6-ligand arrangement can produce such axes through alternating "face" directions, independent of the true molecular symmetry).
- The $D_{nd}$ vs. $D_{nh}$ distinction, and the tetrahedral/octahedral sub-classification ($T$, $T_h$, $O$, $T_d$, $O_h$), rely on the presence/absence of specific elements
  rather than a full character-table match, and can be sensitive to real-world distortion.
- As with the ring puckering analysis, this is an approximation intended for quick, interactive orientation, not a substitute for a dedicated symmetry package for
  publication-grade classification.

## DOSY size estimates and other properties

The `Molecular information` panel additionally shows size estimates relevant for DOSY (diffusion-ordered NMR spectroscopy) and other properties, computed from every 
atom of the currently loaded structure (azom or element exclusions are not applied here):

- Van der Waals volume — the volume of the union of atomic van der Waals spheres, computed on a voxel grid (default spacing 0.2 Å, automatically coarsened for very
  large/spread-out structures to keep memory bounded). Atomic radii are taken from Alvarez (2013), the same default radii set used by [MoloVol](https://molovol.com);
  the grid boundary padding, origin alignment, and voxel classification follow MoloVol's algorithm directly (see its `space.cpp`/`voxel.cpp`), so results match a
  MoloVol calculation at the same grid resolution.
- Van der Waals surface area — the surface area of that same voxelized shape, via marching cubes on the identical grid: each 2×2×2 neighborhood of voxel centers
  ("m-cube") is classified into one of 256 solid/empty configurations, mapped to one of 15 area-contribution weights, and summed. The 256→15 lookup table and its
  semi-empirical weights are copied from MoloVol's own `SurfaceLUT` (`space.cpp`), so results match MoloVol at the same grid resolution here too.
- Solvent accessible surface area (SASA) — MoloVol's "Probe Accessible Surface": the surface traced by the *center* of a spherical probe (default radius
  1.4 Å, i.e. water) rolling around the van der Waals surface. Geometrically, that surface is exactly the van der Waals surface of every atomic radius inflated by 
  the probe radius (a probe rolling around a union of spheres traces out the union of spheres grown by the probe radius), so no separate algorithm is needed: 
  it is the same voxel grid/marching-cubes routine above, just re-run with $r_i \to r_i + r_{probe}$.
- $r_{eq}$ — the radius of a sphere with the same volume as the van der Waals volume, $r_0 = (3V/4\pi)^{1/3}$. This is a purely geometric quantity, deliberately *not*
  called $r_H$ or "hydrodynamic radius": it is not calibrated against, or derived from, any diffusion measurement — it only says how big the bare, solvent-free molecule
  is.
- $r_{eq}$ (Perrin-corrected) — $r_0$ scaled by the Perrin translational friction factor $F(p) = f/f_0$, the ratio of the actual friction of a spheroid to that of a
  sphere of equal volume, as a function of the aspect ratio $p$ alone. The aspect ratio is obtained from the geometric gyration tensor of the atom positions (each atom
  additionally contributing its own van der Waals radius isotropically, so that exactly planar structures don't produce a degenerate, infinitely thin equivalent
  ellipsoid), classified as prolate or oblate from which pair of eigenvalues is closer together. $F(p)$ is computed from the exact Kim & Karrila resistance functions
  for prolate/oblate spheroids, orientation-averaged as $D = (D_{\parallel} + 2D_{\perp})/3$ — the isotropic average relevant for a molecule tumbling freely in
  solution. This corrects for shape only, not for the solvent-dependent gap described below — it tends to matter most for distinctly elongated or flattened molecules,
  where the bare-sphere assumption behind $r_{eq}$ is weakest. Based on the Perrin parameter $p$ (aspect ratio), `Geometry` gives a suggestion for the molecular shape 
  defined by Stalke et al.: Compact Spheres (`CS`), Dissipated Spheres and Ellipsoids (`DSE`) or Extended Discs (`ED`).
- $r_{g}$ (radius of gyration) — the standard, mass-weighted radius of gyration computed from atom positions, $R_g^2 = (1/M)\cdot\sum m_i|r_i-r_{cm}|^2$ (IUPAC Gold
  Book definition; matches LAMMPS' `compute_gyration`, GROMACS' `gmx gyrate`, and OVITO). Shown as an independent, easily externally-verified geometric reference value
  alongside $r_{eq}$. Note that plugging $r_g$ itself into Stokes–Einstein is not appropriate: $r_g$ measures where the atomic nuclei sit, not the van der Waals surface the
  solvent actually has to move around, and comes out noticeably smaller than $r_{eq}$ as a result.

### Why this isn't called "hydrodynamic radius"

The hydrodynamic radius, properly speaking, is an *empirical* quantity: whatever radius makes a measured $D$ fit Stokes–Einstein for a given solvent and temperature.
$r_{eq}$ is the reverse — a purely geometric radius from the structure alone, with no reference to any measured $D$. The two aren't interchangeable, and how far apart they
land depends heavily on the size of the solute relative to the solvent, not on some fixed correction factor. Small, compact solutes checked against literature $D$ in
solvents of comparable size (cyclopentane in THF-d₈, benzene self-diffusion, anthracene in hexane/hexadecane — see Meyer & Nickel, 1980, in citations) come out with
$r_{eq}$ anywhere from ~1.5× to ~2.9× too large. But that gap isn't universal: alanine in water, where the solvent is far smaller than the solute, comes out within ~10% of
the literature $D$. Anthracene doesn't even have *one* "true" empirical radius to compare against — Meyer & Nickel fit Stokes–Einstein separately per solvent and get 2.32
Å in hexane but only 1.28 Å in hexadecane for the same molecule.

This is expected, not a bug: the stick-boundary continuum assumption behind Stokes–Einstein breaks down once the solute is comparable in size to the solvent, and how
badly it breaks down depends on that size ratio — which a purely geometric, solvent-independent radius can never capture. Treat $r_{eq}$ as a rough, solvent-independent
size proxy for comparing structures to each other, not as a stand-in for a real DOSY-derived hydrodynamic radius — and expect it to track experimental values better for
solutes much larger than their solvent, and worse when the two are comparably sized.

### What this deliberately does not include

- **No probe-excluded void volume.** MoloVol's "molecular volume" (van der Waals volume + void volume inaccessible to a probe sphere, roughly analogous to the Connolly
  surface) requires a probe radius, which is itself a solvent-size parameter. The van der Waals volume was kept as the parameter-free default rather than reintroducing
  a solvent-size choice through a different door.
- **No explicit solvation shell.** The estimates describe the bare solute; as shown above, this is only part of why $r_{eq}$ differs from an experimental hydrodynamic radius.

## Diffusion coefficient ($D$) estimate

Below the size estimates, the panel predicts a diffusion coefficient $D$ at 298.15 K from **four** independent routes, shown side by side for **THF-d₈, benzene-d₆,
toluene-d₈, and CDCl₃** (all values in 10⁻⁹ m²·s⁻¹):

The four prediction columns are:
- $D$ from $r_{eq}$ — bare $r_{eq}$, plugged directly into Stokes–Einstein; solvent data: Holz reference viscosities
- $D$ from $r_{eq}$, Perrin — Perrin-shape-corrected $r_{eq}$ (see above), into Stokes–Einstein; solvent data: Holz reference viscosities
- $D_{x,norm}$ — $r_H = a\cdot V_{vdW}^b$, fitted per-solvent by Urbank & Vondung (2026); solvent data: Holz reference viscosities
- $D (SEGWE)$ — Stokes–Einstein–Gierer–Wirtz Estimation from MW alone (Evans, Dal Poggetto, Nilsson & Morris, 2018); solvent data: its own Arrhenius-fitted solvent set

$D$ from $r_{eq}$ / $r_{eq}$, Perrin: are the classical, shape-blind (and shape-corrected) calculations discussed above, shown mainly as a contrast — expect the
uncorrected version in particular to run systematically low (e.g. −28% for cyclopentane in THF-d₈ against the literature value). The Perrin-corrected column tends to
close part of that gap for distinctly elongated/flattened molecules, but does not touch the solvent-size-ratio gap itself (see "Why this isn't called hydrodynamic radius"
above) — for compact, near-spherical molecules the two columns are nearly identical.

$D_{x,norm}$: is the model Urbank & Vondung validate against real DOSY data (9–12% reported error, depending on solvent; the cyclopentane/THF-d₈ check above comes
out at only −5%). The label matters: $a$ and $b$ were fitted against their own diffusion coefficients *after* normalization, $D_{x,norm}$ — 
the normalized-diffusion-coefficient method of Neufeld & Stalke (2015, see citations), where $D_x$ and $D_{ref}$ are the diffusion coefficients of the analyte and an
internal reference compound measured together in the same sample, and $D_{ref,fix}$ is that reference compound's fixed literature value. This one-reference correction
removes run-to-run variation (gradient/temperature calibration etc.) without needing an external, independently-calibrated viscosity for every measurement. Consequently,
inverting the fit here predicts $D_{x,norm}$, not a raw, unnormalized $D$ — a raw DOSY measurement of your own compound isn't directly comparable to this column unless you
normalize it the same way first (an internal reference in the same sample, per Neufeld & Stalke and Step 3 of Urbank & Vondung's step-by-step guide).   

CDCl₃ for $D_{x,norm}$: Urbank & Vondung's own 2026 model was fitted for THF-d₈, C₆D₆, and Toluene-d₈ only — CDCl₃ was not part of their 
molecule data set. The $a$ and $b$ parameters used here for CDCl₃ ($a$ = 0.2195, $b$ = 0.4873) are a fit of the same functional form 
derived from 16 reference compounds whose van-der-Waals volumes were computed with the $V_{vdW}$ routine in this tool and whose hydrodynamic radii were 
back-calculated from $D_{x,norm}$ values published by Bachmann et al. (*Chem. Eur. J.* **2016**, *22*, 8462-8465, Table S9). 
Fit quality: $R^2$ = 0.889, mean absolute relative residual ≈ 5.2% ($n$ = 16, spanning CS/DSE/ED shape classes, $V_{vdW}$ ≈ 79 – 374 Å³). 
This CDCl₃ value should be treated as a rough estimate.

$D (SEGWE)$: (Stokes–Einstein–Gierer–Wirtz Estimation) needs only the molecular weight, not the 3D structure — both solute and an assumed-spherical solvent molecule are
reduced to a radius via a generic, MW-only "radius from mass" relationship (fitted across their calibration set, not a real density), then combined through the classical
Gierer–Wirtz microviscosity factor $f = [1.5\cdot(r_{solvent}/r_{solute}) + (1+r_{solvent}/r_{solute})^{-1}]^{-1}$, $D = kT/(6\pi f\cdot\eta\cdot r_{solute})$. The paper
reports ~15% RMS error overall, and the method is validated for small molecules (<1000 g/mol) containing only light elements (sulfur or lighter) — heavier elements
(transition metals, lanthanides/actinides, etc.) are outside its tested range, so treat this column with extra caution for organometallic/coordination complexes.  
The SEGWE solvent parameters (molar mass, Arrhenius viscosity $\eta(T) = A\cdot\exp(B/T)$) are entirely separate from the Holz values used in the other three columns.

No solvent database beyond these four solvents is bundled, and no temperature dependence is offered in the interface (298.15 K only, though SEGWE's underlying model does
support it) — this stays a small, fixed set of size-based estimates for solvents commonly used in DOSY, not a general-purpose diffusion calculator.

### Citations

Van der Waals radii and volume:

> Santiago Alvarez,  
> "A cartography of the van der Waals territories",  
> *Dalton Transactions* **2013**, *42*, 8617–8636.  
> https://doi.org/10.1039/C3DT50599E

> Jasmin B. Maglic, Roy Lavendomme,  
> "MoloVol: an easy-to-use program for analyzing cavities, volumes and surface areas of chemical structures",  
> *Journal of Applied Crystallography* **2022**, *55*, 1033–1044.  
> https://doi.org/10.1107/S1600576722004988

Waals surface area (also as used by MoloVol, above):

> Joakim Lindblad,  
> "Surface area estimation of digitized 3D objects using weighted local configurations",  
> *Image and Vision Computing* **2005**, *23*, 111–122.  
> https://doi.org/10.1016/j.imavis.2004.06.012

Perrin-corrected $r_{eq}$:

> Francis Perrin,  
> "Mouvement brownien d'un ellipsoide (I). Dispersion diélectrique pour des molécules ellipsoidales",  
> *Journal de Physique et le Radium* **1934**, *5*, 497–511.  
> https://doi.org/10.1051/jphysrad:01934005010049700

> Francis Perrin,  
> "Mouvement Brownien d'un ellipsoide (II). Rotation libre et dépolarisation des fluorescences. Translation et diffusion de molécules ellipsoidales",  
> *Journal de Physique et le Radium* **1936**, *7*, 1–11.  
> https://doi.org/10.1051/jphysrad:01936007010100

> Sangtae Kim, Seppo J. Karrila,  
> *Microhydrodynamics: Principles and Selected Applications*,  
> Butterworth-Heinemann, Boston, **1991**. (Table 3.4/3.6, translational resistance functions for prolate/oblate spheroids — the closed-form expressions this
  implementation's $F(p)$ is derived from.)

The radius of gyration follows the standard IUPAC definition, matching the convention of OVITO (and LAMMPS/GROMACS, see above):

> IUPAC Gold Book,  
> "radius of gyration",  
> https://doi.org/10.1351/goldbook.R05121

> Alexander Stukowski,  
> "Visualization and analysis of atomistic simulation data with OVITO – the Open Visualization Tool",  
> *Modelling and Simulation in Materials Science and Engineering* **2010**, *18*, 015012.  
> https://doi.org/10.1088/0965-0393/18/1/015012

The $D_{x,norm}$ estimate and background on why a naive Stokes–Einstein hydrodynamic radius from molecular size can be a poor proxy for the
DOSY-measured value:

> Christian Urbank, Lisa Vondung,  
> "Accurate Molecular Size Determination by Diffusion Ordered NMR Spectroscopy Based on an Improved Diffusion Model",  
> *Chemistry – A European Journal* **2026**, e71471.  
> https://doi.org/10.1002/chem.71471

The $D_{x,norm}$ normalization convention that Urbank & Vondung's model was fitted against:

> Roman Neufeld, Dietmar Stalke,  
> "Accurate molecular weight determination of small molecules via DOSY-NMR by using external calibration curves with normalized diffusion coefficients",  
> *Chemical Science* **2015**, *6*, 3354–3364.  
> https://doi.org/10.1039/C5SC00670H

The Holz viscosities reference used for the $D$ from $r_{eq}$ / $r_{eq}$, Perrin
columns, and by Urbank & Vondung for their own fit:

> Manfred Holz, Stefan R. Heil, Antonio Sacco,  
> "Temperature-dependent self-diffusion coefficients of water and six selected molecular liquids for calibration in accurate 1H NMR PFG measurements",  
> *Physical Chemistry Chemical Physics* **2000**, *2*, 4740–4742.  
> https://doi.org/10.1039/B005319H

The $D (SEGWE)$ estimate:

> Robert Evans, Guilherme Dal Poggetto, Mathias Nilsson, Gareth A. Morris,  
> "Improving the Interpretation of Small Molecule Diffusion Coefficients",  
> *Analytical Chemistry* **2018**, *90*, 3987–3994.  
> https://doi.org/10.1021/acs.analchem.7b05032

> E. Georg Meyer, Bernhard Nickel,  
> "Diffusion Coefficients of Aromatic Hydrocarbons in Their Lowest Triplet State: Anthracene in Hexane, Octane, Hexadecane, Perfluorohexane, and Methylcyclohexane; Pyrene
  and 9,10-Diphenylanthracene in Hexane",
> *Zeitschrift für Naturforschung A* **1980**, *35a*, 503–520. (Source of the anthracene per-solvent fitted-radius comparison above.)  
> https://doi.org/10.1515/zna-1980-0507

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
- toggle saved planes
- toggle Mesh view, with a dropdown to pick the displayed representation (see "Mesh view" below)

The viewer reflects:

- active element filter
- atom exclusions
- highlighted selections
- graph-active manual bonds
- active saved plane

## Mesh view

The `Mesh view` toggle in the 3D viewer displays one geometric representation at a time, picked from the dropdown next to it:

- **Van der Waals surface** / **SASA** — the same isosurface the "DOSY size estimates" $V$ numbers above are computed from, rendered live as a translucent mesh: a
  signed-distance field ($f(p) = \min_i(|p-\text{atom}_i| - r_i)$, probe-inflated for SASA) is built on an interactive-resolution voxel grid and handed to 3Dmol.js's own
  marching-cubes isosurface renderer. This render grid is independent from, and coarser than, the fine grid used for the reported $V$ values, so the mesh stays
  interactive on larger structures without affecting the reported numbers.
- **$r_{eq}$** / **$r_{eq}$ Perrin (sphere)** / **$r_g$** — the corresponding equivalent-sphere radius from "DOSY size estimates" above, drawn as a sphere: $r_{eq}$ and $r_{eq}$,
  Perrin centered on the geometric centroid, $r_g$ on the mass-weighted center.
- **Perrin ellipsoid** — the actual equivalent spheroid the Perrin shape correction is based on, rather than just its scalar radius: a prolate or oblate ellipsoid of
  revolution with the same volume as the van der Waals volume, aspect ratio $p$, and orientation taken from the principal axis of the geometric gyration tensor (see
  "DOSY size estimates" above).

Every mode respects the current element filter and atom exclusions, like the rest of the viewer, and is drawn as a translucent fill plus a wireframe outline.

## Export

### Markdown export

The Markdown export includes, depending on available data:

- molecular information
- DOSY size estimates (van der Waals volume and surface area, $r_{eq}$, Perrin-corrected $r_{eq}$, $r_g$) and $D$ predictions for THF-d₈/benzene-d₆/toluene-d₈/CDCl₃ (naive and
  Perrin-corrected Stokes–Einstein, the Urbank & Vondung semiempirical model, and the SEGWE model)
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
- saved CShM results (full shape ranking and polyhedral volume), with the same invalid-status handling
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

The original Python `xyz2tab` script is a command-line program with options for excluding atoms/elements, including contacts, calculating dihedrals, defining two planes,
sorting tables and plotting molecules.

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

Signed distances to planes depend on the orientation of the plane normal. The sign is meaningful only relative to that normal direction; the absolute value gives the
geometric distance from the plane.

Angles between saved planes are acute interplanar angles. They are useful for comparing plane orientations, but they are not always equivalent to signed torsion angles.

## 3Dmol.js 

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
- Point group symmetry detection is approximate and geometry-only; icosahedral ($I$, $I_h$) is not covered, and the cubic groups ($T$, $T_h$, $O$, $T_d$, $O_h$) are best-effort (see "Point
  group symmetry" above).
- CShM is currently implemented for CN 2-6 only; the `Save CShM` button is disabled outside that range.
- $\tau_4$, $\tau_4\prime$ and $\tau_5$ are only computed (and shown) for CN 4 and CN 5, respectively; they are not part of the saved-results overview table, only the
  live preview and per-entry details.
- Polyhedral volume ($V$ /Å³) uses a small browser-side convex-hull routine and may differ from SciPy/Qhull in degenerate or near-planar cases.
- CShM rating colors (green/orange/red) use a practical threshold convention, not a fixed literature standard.
- CSV and JSON export are not yet implemented.
- Analysis state is currently stored only during the active browser session.
- DOSY size estimates use the van der Waals volume only, not MoloVol's probe-dependent "molecular volume" (void-filled); no solvation shell is modeled and no diffusion
  coefficient is calculated (see "DOSY size estimates" above for the reasoning). The resulting $r_{eq}$ is a geometric proxy, not the empirical hydrodynamic radius.
