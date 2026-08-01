// app.symmetry.js — point-group symmetry detection: state, wiring, rendering.
// Lives in the Info tab (no dedicated tab / no viewer overlay).

Object.assign(App, {

    // State
    symmetryRaw: null,          // expensive detect() result, cached per loaded file
    symmetryTolerance: 0.10,    // Angstrom; only affects pass/fail coloring + group choice
    symmetrySkippedAuto: false, // true if atom count exceeded the auto-run threshold

    // Called once per loaded file, from setup().
    _runSymmetryAnalysis() {
        this.symmetryRaw = null;
        this.symmetrySkippedAuto = false;

        const atoms = this.parsed.atoms;

        if (atoms.length > Symmetry.MAX_ATOMS_AUTO) {
            this.symmetrySkippedAuto = true;
            this._renderSymmetry();
            return;
        }

        this.symmetryRaw = Symmetry.detect(atoms);
        this._renderSymmetry();
    },

    // Manual trigger for large structures (button in the Info tab).
    _runSymmetryAnalysisManual() {
        if (!this.parsed) return;
        this.symmetryRaw = Symmetry.detect(this.parsed.atoms);
        this.symmetrySkippedAuto = false;
        this._renderSymmetry();
    },

    _renderSymmetry() {
        const container = document.getElementById('symmetry-wrap');
        if (!container) return;

        if (this.symmetrySkippedAuto) {
            container.innerHTML = `
                <div class="table-label">Point group symmetry</div>
                <div class="result-box">
                    Skipped automatically for ${this.parsed.atoms.length} atoms
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
