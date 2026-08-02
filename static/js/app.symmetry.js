// app.symmetry.js — point-group symmetry detection: state, wiring, rendering.
// Lives in its own tab (see index.html).
//
// Symmetry.detect() is the expensive part, so it does NOT re-run on every
// single atom-exclusion or element-filter click (that would make toggling
// feel laggy on larger structures). Instead, those actions only flag the
// result as stale via _markSymmetryDirty(); the actual recompute happens
// lazily, the next time it's actually needed:
//   - the Symmetry tab is opened (_ensureSymmetryFresh(), hooked in app.core.js)
//   - a Markdown export is generated (exportMd(), app.export.js)

Object.assign(App, {

    // State
    symmetryRaw: null,          // expensive detect() result, cached per loaded file
    symmetryTolerance: 0.10,    // Angstrom; only affects pass/fail coloring + group choice
    symmetrySkippedAuto: false, // true if atom count exceeded the auto-run threshold
    symmetryDirty: false,       // true if exclusions/active elements changed since last detect()

    // The atom set symmetry detection should actually run on: respects both
    // atom exclusion and the active-element filter, consistent with what's
    // currently visible/active elsewhere in the app (bonds, angles, viewer).
    _getSymmetryAtoms() {
        if (!this.parsed || !this.parsed.atoms) return [];

        return this.parsed.atoms.filter(atom =>
            !this.excludedAtoms.has(atom.index) &&
            (!this.activeElements || this.activeElements.has(atom.element))
        );
    },

    // Called once per loaded file, from setup().
    _runSymmetryAnalysis() {
        this.symmetryRaw = null;
        this.symmetrySkippedAuto = false;
        this.symmetryDirty = false;

        const atoms = this._getSymmetryAtoms();

        if (atoms.length > Symmetry.MAX_ATOMS_AUTO) {
            this.symmetrySkippedAuto = true;
            this._renderSymmetry();
            return;
        }

        this.symmetryRaw = Symmetry.detect(atoms);
        this._renderSymmetry();
    },

    // Manual trigger for large structures (button in the Symmetry tab).
    _runSymmetryAnalysisManual() {
        if (!this.parsed) return;
        this.symmetryRaw = Symmetry.detect(this._getSymmetryAtoms());
        this.symmetrySkippedAuto = false;
        this.symmetryDirty = false;
        this._renderSymmetry();
    },

    // Cheap: just flags the current result as stale. Called whenever the
    // active atom set changes (atom exclusion, element filter toggles).
    _markSymmetryDirty() {
        if (!this.symmetryRaw && !this.symmetrySkippedAuto) return; // nothing to go stale yet
        this.symmetryDirty = true;
    },

    // Recomputes only if needed (dirty, or never run yet). Cheap no-op
    // otherwise. Call this right before the Symmetry tab is shown, or
    // before a Markdown export that includes symmetry data.
    _ensureSymmetryFresh() {
        if (!this.parsed) return;

        if (this.symmetryDirty || (!this.symmetryRaw && !this.symmetrySkippedAuto)) {
            this._runSymmetryAnalysis();
        }
    },

    _renderSymmetry() {
        const container = document.getElementById('symmetry-wrap');
        if (!container) return;

        if (this.symmetrySkippedAuto) {
            const atomCount = this._getSymmetryAtoms().length;
            container.innerHTML = `
                <div class="table-label">Point group symmetry</div>
                <div class="result-box">
                    Skipped automatically for ${atomCount} active atoms
                    (threshold: ${Symmetry.MAX_ATOMS_AUTO}) to avoid slowing
                    down loading. You can still run it manually below.
                    <div style="margin-top:8px">
                        <button id="btn-symmetry-analyze" class="btn-small">Analyze symmetry</button>
                    </div>
                </div>
            `;
            const btn = document.getElementById('btn-symmetry-analyze');
            if (btn) btn.addEventListener('click', () => this._runSymmetryAnalysisManual());
            return;
        }

        if (!this.symmetryRaw) {
            container.innerHTML = '';
            return;
        }

        const classified = Symmetry.classify(this.symmetryRaw, this.symmetryTolerance);
        container.innerHTML = Tables.renderSymmetryShell(
            this.symmetryTolerance,
            Tables.renderSymmetryBody(classified, this.symmetryRaw)
        );

        const slider = document.getElementById('symmetry-tolerance-slider');
        if (slider) {
            // Only refresh the results body on input — replacing the slider
            // element itself mid-drag would interrupt the drag gesture.
            slider.addEventListener('input', e => {
                this.symmetryTolerance = parseFloat(e.target.value);
                document.getElementById('symmetry-tolerance-value').textContent =
                    this.symmetryTolerance.toFixed(3) + ' \u00c5';

                const updated = Symmetry.classify(this.symmetryRaw, this.symmetryTolerance);
                document.getElementById('symmetry-results-body').innerHTML =
                    Tables.renderSymmetryBody(updated, this.symmetryRaw);
            });
        }
    },

});
