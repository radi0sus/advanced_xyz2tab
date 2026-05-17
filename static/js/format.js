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
