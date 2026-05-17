// app.export.js — Markdown and PNG export

Object.assign(App, {

    exportMd() {
        const md = Markdown.toMarkdown({
            parsed: this.parsed,

            bonds: this.filteredBonds,
            angles: this.filteredAngles,

            manualDistances: this.manualDistances,
            manualAngles: this.manualAngles,
            manualDihedrals: this.manualDihedrals,

            savedPlanes: this.savedPlanes,
            activePlaneId: this.activePlaneId,
            savedPlaneDistances: this.savedPlaneDistances,
            savedPlaneAngles: this.savedPlaneAngles,

            dihedralAtoms: this.dihedralAtoms,
            dihedralAngle: this.dihedralAngle,

            excludedAtoms: this.excludedAtoms,
            activeElements: this.activeElements,
            tolerancePct: this.tolerancePct,
            atomIndexStart: this.atomIndexStart,
        });

        const blob = new Blob([md], { type: 'text/markdown' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = (this.parsed.formula || 'xyz2tab') + '.md';
        a.click();

        URL.revokeObjectURL(url);
    },

    exportPng() {
        const uri = Viewer.getPNG();
        if (!uri) return;

        const a = document.createElement('a');
        a.href = uri;
        a.download = (this.parsed.formula || 'xyz2tab') + '.png';
        a.click();
    },
});