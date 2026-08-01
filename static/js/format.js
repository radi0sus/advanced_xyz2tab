// format.js — shared formatting helpers

const Format = {

    _subscriptMap: {
        '0': '₀',
        '1': '₁',
        '2': '₂',
        '3': '₃',
        '4': '₄',
        '5': '₅',
        '6': '₆',
        '7': '₇',
        '8': '₈',
        '9': '₉',
    },

    subscriptNumber(value) {
        return String(value)
            .split('')
            .map(ch => this._subscriptMap[ch] || ch)
            .join('');
    },

    // Point group names as HTML with the order/type suffix as a proper
    // <sub> block (e.g. "C2h" -> "C<sub>2h</sub>") — deliberately not Unicode
    // subscripts, which render unevenly for mixed digit+letter suffixes
    // (e.g. "C₂ₕ" has the digit sitting noticeably lower than the letter).
    pointGroupHtml(name) {
        if (!name) return '';
        const main = name.charAt(0);
        const rest = name.slice(1);
        return rest ? `${main}<sub>${rest}</sub>` : main;
    },

    // Shared between the HTML symmetry table and the Markdown export —
    // both render inline HTML, so the same <sub>-based labels work in both.
    symmetryElementLabel(el) {
        if (!el) return '–';
        const countSuffix = el.count && el.count > 1 ? ` (×${el.count})` : '';
        switch (el.type) {
            case 'i': return 'i (inversion)';
            case 'sigma': return 'σ';
            case 'sigma_h': return 'σ<sub>h</sub>';
            case 'sigma_v': return 'σ<sub>v</sub>';
            case 'sigma_d': return 'σ<sub>d</sub>';
            case 'Cn': return `C<sub>${el.order}</sub>${countSuffix}`;
            case 'C2\u22a5': return 'C<sub>2</sub> (⊥ main axis)';
            case 'Sn': return `S<sub>${el.order}</sub>`;
            default: return el.type || '–';
        }
    },

    chemicalFormula(formula) {
        if (!formula) return '';

        const parts = [];
        const re = /([A-Z][a-z]?)(\d*)/g;

        let match;

        while ((match = re.exec(String(formula))) !== null) {
            const element = match[1];
            const rawCount = match[2];

            const count = rawCount === ''
                ? 1
                : parseInt(rawCount, 10);

            if (!Number.isFinite(count) || count < 0) {
                continue;
            }

            if (count === 0) {
                continue;
            }

            if (count === 1) {
                parts.push(element);
            } else {
                parts.push(element + this.subscriptNumber(count));
            }
        }

        return parts.join('');
    },
};
