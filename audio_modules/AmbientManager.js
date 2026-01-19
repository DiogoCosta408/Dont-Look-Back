export class AmbientManager {
    constructor(ctx, destination) {
        this.ctx = ctx;
        this.destination = destination;

        // Filters for "Silence Pressure"
        this.pressureFilter = this.ctx.createBiquadFilter();
        this.pressureFilter.type = 'lowpass';
        this.pressureFilter.frequency.value = 20000; // Open
        this.pressureFilter.connect(this.destination);

        // Ambience (Stillness sound)
        this.humOsc = null;
        this.humOsc2 = null;
        this.humGain = null;
        this.isHumming = false;
    }

    // Returns the input node for music to connect to
    getMusicInputNode() {
        return this.pressureFilter;
    }

    update(delta, metrics, pFactor) {
        // ENDGAME OVERRIDE handled by Facade or internal logic here?
        // Original: if (pFactor >= 0.99) ...
        const isEndgame = (pFactor >= 0.99);

        if (isEndgame) {
            this.pressureFilter.gain.value = 0;
            this.manageStillnessHum(delta, metrics, 1.0);
            return;
        }

        this.manageSilencePressure(delta, metrics);
        this.manageStillnessHum(delta, metrics, pFactor);
    }

    manageSilencePressure(delta, metrics) {
        let targetFreq = 20000;
        if (metrics.isStationary && metrics.stationaryTime > 3.0) {
            const progress = Math.min((metrics.stationaryTime - 3.0) / 10.0, 1.0);
            targetFreq = 20000 - (19600 * progress);
        }
        const current = this.pressureFilter.frequency.value;
        this.pressureFilter.frequency.value += (targetFreq - current) * delta * 0.5;
    }

    manageStillnessHum(delta, metrics, pFactor) {
        let targetGain = 0;
        if (pFactor > 0) {
            targetGain = pFactor * 0.25;
        }
        if (pFactor <= 0) targetGain = 0;

        // Endgame override roar
        if (pFactor >= 0.99) targetGain = 0.4;

        if (targetGain > 0) {
            if (!this.isHumming) this.startHum();
            if (this.humGain) {
                const current = this.humGain.gain.value;
                this.humGain.gain.value += (targetGain - current) * delta * 1.0;
            }
        } else {
            if (this.isHumming) this.stopHum();
        }
    }

    startHum() {
        this.isHumming = true;
        this.humOsc = this.ctx.createOscillator();
        this.humOsc.type = 'sine';
        this.humOsc.frequency.value = 55;

        this.humOsc2 = this.ctx.createOscillator();
        this.humOsc2.type = 'triangle';
        this.humOsc2.frequency.value = 58;

        this.humGain = this.ctx.createGain();
        this.humGain.gain.value = 0;

        this.humOsc.connect(this.humGain);
        this.humOsc2.connect(this.humGain);
        this.humGain.connect(this.destination);

        this.humOsc.start();
        this.humOsc2.start();
    }

    stopHum() {
        this.isHumming = false;
        if (this.humGain) {
            this.humGain.gain.cancelScheduledValues(this.ctx.currentTime);
            this.humGain.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 2.0);

            const oldOsc = this.humOsc;
            const oldOsc2 = this.humOsc2;
            const oldGain = this.humGain;

            setTimeout(() => {
                if (oldOsc) oldOsc.stop();
                if (oldOsc2) oldOsc2.stop();
                if (oldGain) oldGain.disconnect();
            }, 2100);

            this.humOsc = null;
            this.humOsc2 = null;
            this.humGain = null;
        }
    }

    // SILENCE EVERYTHING (For Intro Loop)
    silence() {
        // Cut Music
        if (this.pressureFilter) {
            this.pressureFilter.gain.setValueAtTime(0, this.ctx.currentTime);
        }
        // Cut Hum
        this.stopHum();
    }

    reset() {
        // Restore Music
        if (this.pressureFilter) {
            this.pressureFilter.gain.setValueAtTime(1.0, this.ctx.currentTime);
            this.pressureFilter.frequency.value = 20000;
        }
    }
}
