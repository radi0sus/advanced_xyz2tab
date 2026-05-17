// app.layout.js — theme sync and resizable panels

Object.assign(App, {

    _initThemeSync() {
        // Apply current OS theme to 3Dmol background
        Viewer.applyThemeBackground();

        // React to OS theme changes
        const mq = window.matchMedia('(prefers-color-scheme: dark)');

        const onThemeChange = () => {
            Viewer.applyThemeBackground();
        };

        if (mq.addEventListener) {
            mq.addEventListener('change', onThemeChange);
        } else if (mq.addListener) {
            // Older Safari
            mq.addListener(onThemeChange);
        }

        // Keep 3Dmol canvas in sync with browser resizing
        window.addEventListener('resize', () => {
            Viewer.resize();
        });
    },

    _initPanelResizers() {
        const root = document.documentElement;

        const mainLayout = document.getElementById('main-layout');
        const viewerPanel = document.getElementById('viewer-panel');
        const tablePanel = document.getElementById('table-panel');

        const layoutResizer = document.getElementById('layout-resizer');
        const viewerAtomResizer = document.getElementById('viewer-atom-resizer');
        const atomListPanel = document.getElementById('atom-list-panel');

        if (!mainLayout || !viewerPanel || !tablePanel) return;

        // Restore saved sizes
        const savedViewerWidth = localStorage.getItem('xyz2tab.viewerPanelWidth');
        const savedAtomListHeight = localStorage.getItem('xyz2tab.atomListHeight');

        if (savedViewerWidth) {
            root.style.setProperty('--viewer-panel-width', savedViewerWidth);
        }

        if (savedAtomListHeight) {
            root.style.setProperty('--atom-list-height', savedAtomListHeight);
        }

        let resizeFrame = null;

        const scheduleViewerResize = () => {
            if (resizeFrame) cancelAnimationFrame(resizeFrame);

            resizeFrame = requestAnimationFrame(() => {
                Viewer.resize();
                resizeFrame = null;
            });
        };

        // Horizontal resizing: left panel / right panel
        if (layoutResizer) {
            layoutResizer.addEventListener('mousedown', e => {
                e.preventDefault();

                layoutResizer.classList.add('resizing');
                document.body.classList.add('resizing', 'resizing-horizontal');

                const onMouseMove = ev => {
                    const rect = mainLayout.getBoundingClientRect();

                    let pct = ((ev.clientX - rect.left) / rect.width) * 100;

                    // Reasonable limits
                    pct = Math.max(25, Math.min(75, pct));

                    const value = pct.toFixed(2) + '%';

                    root.style.setProperty('--viewer-panel-width', value);
                    scheduleViewerResize();
                };

                const onMouseUp = () => {
                    layoutResizer.classList.remove('resizing');
                    document.body.classList.remove('resizing', 'resizing-horizontal');

                    const value = getComputedStyle(root)
                        .getPropertyValue('--viewer-panel-width')
                        .trim();

                    localStorage.setItem('xyz2tab.viewerPanelWidth', value);

                    document.removeEventListener('mousemove', onMouseMove);
                    document.removeEventListener('mouseup', onMouseUp);

                    Viewer.resize();
                };

                document.addEventListener('mousemove', onMouseMove);
                document.addEventListener('mouseup', onMouseUp);
            });
        }

        // Vertical resizing: 3D viewer / atom list
        if (viewerAtomResizer && atomListPanel) {
            viewerAtomResizer.addEventListener('mousedown', e => {
                e.preventDefault();

                viewerAtomResizer.classList.add('resizing');
                document.body.classList.add('resizing', 'resizing-vertical');

                const onMouseMove = ev => {
                    const panelRect = viewerPanel.getBoundingClientRect();

                    // Atom list is below the resizer.
                    // Dragging resizer down makes atom list smaller.
                    let height = panelRect.bottom - ev.clientY;

                    const minHeight = 80;
                    const maxHeight = Math.max(120, panelRect.height * 0.55);

                    height = Math.max(minHeight, Math.min(maxHeight, height));

                    const value = Math.round(height) + 'px';

                    root.style.setProperty('--atom-list-height', value);
                    scheduleViewerResize();
                };

                const onMouseUp = () => {
                    viewerAtomResizer.classList.remove('resizing');
                    document.body.classList.remove('resizing', 'resizing-vertical');

                    const value = getComputedStyle(root)
                        .getPropertyValue('--atom-list-height')
                        .trim();

                    localStorage.setItem('xyz2tab.atomListHeight', value);

                    document.removeEventListener('mousemove', onMouseMove);
                    document.removeEventListener('mouseup', onMouseUp);

                    Viewer.resize();
                };

                document.addEventListener('mousemove', onMouseMove);
                document.addEventListener('mouseup', onMouseUp);
            });
        }
    },
});
