// app.export.js — Markdown and PNG export

Object.assign(App, {

    exportMd() {
        const md = Tables.toMarkdown(
            this.parsed,
            this.filteredBonds,
            this.filteredAngles,
            this.plane1Atoms,
            this.plane1Result,
            this.plane2Atoms,
            this.plane2Result,
            this.planeAngle,
            this.dihedralAtoms,
            this.dihedralAngle,
        );

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
