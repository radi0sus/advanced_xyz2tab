// app.volumes.js — Mesh view overlay (VdW surface, SASA, r_eq sphere,
// Perrin ellipsoid, r_eq,Perrin sphere, r_g sphere) in the 3D viewer.
//
// The actual 3D geometry lives in Viewer (setShowVolumes/setVolumeMode,
// backed by volumes.js). This file only wires the toggle button + mode
// dropdown — no numeric readout here by design, to keep the controls row
// compact; the underlying numbers are already shown in the Info tab /
// wherever else the tool reports them.

Object.assign(App, {

    _initVolumesControl() {
        const btn = document.getElementById('btn-toggle-volumes');
        const select = document.getElementById('volume-mode-select');

        if (!btn || !select) return;

        btn.addEventListener('click', () => {
            const on = !btn.classList.contains('active');
            btn.classList.toggle('active', on);
            Viewer.setShowVolumes(on);
        });

        select.addEventListener('change', () => {
            Viewer.setVolumeMode(select.value);
        });
    },
});
