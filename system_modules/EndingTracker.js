export class EndingTracker {
    constructor() {
        console.log("TRACKER: Initializing...");
        this.storageKey = 'facility_ending_history';
        this.history = this.loadHistory();
        console.log("TRACKER: History Loaded:", this.history);

        this.quotes = {
            // [COMBINATIONS]

            // 3x SAME
            'DON\'T_DON\'T_DON\'T': {
                text: "\"He who fears suffering is already suffering from what he fears.\"",
                author: "Michel de Montaigne"
            },
            'LOOK_LOOK_LOOK': {
                text: "\"Man is the only creature who refuses to be what he is.\"",
                author: "Friedrich Nietzsche"
            },
            'BACK_BACK_BACK': {
                text: "\"Remorse is the poison of life.\"",
                author: "Charlotte Brontë"
            },

            // 2x DON'T Combinations
            'DON\'T_DON\'T_LOOK': {
                text: "\"No man is free who is not master of himself.\"",
                author: "Epictetus"
            },
            'DON\'T_DON\'T_BACK': {
                text: "\"Do not look back in anger, or forward in fear, but around in awareness.\"",
                author: "James Thurber"
            },

            // 2x LOOK Combinations
            'LOOK_LOOK_DON\'T': {
                text: "\"To live is to suffer, to survive is to find some meaning in the suffering.\"",
                author: "Friedrich Nietzsche"
            },
            'LOOK_LOOK_BACK': {
                text: "\"We are all in the gutter, but some of us are looking at the stars.\"",
                author: "Oscar Wilde"
            },

            // 2x BACK Combinations
            'BACK_BACK_DON\'T': {
                text: "\"If a man knows not to which port he sails, no wind is favorable.\"",
                author: "Seneca"
            },
            'BACK_BACK_LOOK': {
                text: "\"Nothing endures but change.\"",
                author: "Heraclitus"
            },

            // 1 of EACH (Order Independent)
            'ALL_UNIQUE': {
                text: "\"Life is lived forwards, but understood backwards.\"",
                author: "Bil Keane"
            },

            // DEFAULT
            'DEFAULT': {
                text: "\"The only true wisdom is in knowing you know nothing.\"",
                author: "Socrates"
            }
        };
    }

    loadHistory() {
        try {
            // [SESSION CHECK]
            // Only preserve history if the game explicitly requested a reload (Ending Chain).
            // Manual Refresh should clear it.
            const shouldPersist = sessionStorage.getItem('allow_ending_persistence');
            console.log(`TRACKER: loadHistory called. Flag: ${shouldPersist}`);

            if (shouldPersist === 'true') {
                console.log("TRACKER: Flag consumed. LOADING history.");
                sessionStorage.removeItem('allow_ending_persistence'); // Consume flag

                const data = localStorage.getItem(this.storageKey);
                return data ? JSON.parse(data) : [];
            } else {
                // Manual Refresh or First Load -> Start Fresh
                console.log("TRACKER: No Persistence Flag. MANUAL RELOAD/RESET detected. WIPING History.");
                localStorage.removeItem(this.storageKey);
                return [];
            }

        } catch (e) {
            console.error("EndingTracker: Failed to load history", e);
            return [];
        }
    }

    saveHistory() {
        try {
            // Keep checks sane - max 3
            if (this.history.length > 3) {
                this.history = this.history.slice(this.history.length - 3);
            }
            localStorage.setItem(this.storageKey, JSON.stringify(this.history));
        } catch (e) {
            console.error("EndingTracker: Failed to save history", e);
        }
    }

    addEnding(type) {
        // Types: "DON'T", "LOOK", "BACK"
        console.log(`TRACKER: Adding Ending -> ${type}`);
        this.history.push(type);
        this.saveHistory();
    }

    hasTrueEndingReached() {
        return this.history.length >= 3;
    }

    getTrueEndingQuote() {
        if (this.history.length < 3) return null;

        // Take last 3
        const recent = this.history.slice(this.history.length - 3);
        const counts = {
            "DON'T": 0,
            "LOOK": 0,
            "BACK": 0
        };

        recent.forEach(t => {
            if (counts[t] !== undefined) counts[t]++;
        });

        // 1. Check Identical (3 of same)
        if (counts["DON'T"] === 3) return this.quotes["DON'T_DON\'T_DON\'T"];
        if (counts["LOOK"] === 3) return this.quotes["LOOK_LOOK_LOOK"];
        if (counts["BACK"] === 3) return this.quotes["BACK_BACK_BACK"];

        // 2. Check All Unique (1 of each)
        if (counts["DON'T"] === 1 && counts["LOOK"] === 1 && counts["BACK"] === 1) {
            return this.quotes["ALL_UNIQUE"];
        }

        // 3. Check 2 Same (Specific Mixes)
        if (counts["DON'T"] === 2) {
            if (counts["LOOK"] === 1) return this.quotes["DON'T_DON'T_LOOK"];
            if (counts["BACK"] === 1) return this.quotes["DON'T_DON'T_BACK"];
        }
        if (counts["LOOK"] === 2) {
            if (counts["DON'T"] === 1) return this.quotes["LOOK_LOOK_DON'T"];
            if (counts["BACK"] === 1) return this.quotes["LOOK_LOOK_BACK"];
        }
        if (counts["BACK"] === 2) {
            if (counts["DON'T"] === 1) return this.quotes["BACK_BACK_DON'T"];
            if (counts["LOOK"] === 1) return this.quotes["BACK_BACK_LOOK"];
        }

        // 4. Default / Fallback
        return this.quotes["DEFAULT"];
    }

    // Debugging
    clear() {
        this.history = [];
        this.saveHistory();
        console.log("TRACKER: History Cleared");
    }
}
