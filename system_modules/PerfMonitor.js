// Frame-time / corridor-spawn instrumentation. Toggle the overlay with F3.
//
// The number to watch is PROGRAMS (compiled shader programs). three.js bakes the
// scene's point-light count into the shader as a #define and puts it in the program
// cache key, so if that count moves, every lit material is recompiled and linked
// synchronously - which shows up as a multi-hundred-millisecond frame. If PROGRAMS
// climbs when a corridor chunk spawns, lights are being added or removed somewhere.
// It should stay flat forever once the lamp pool is warm.

export class PerfMonitor {
    constructor() {
        this.enabled = false;

        this.lastFrameTime = performance.now();
        this.frameMs = 0;
        this.frames = 0;
        this.fps = 0;
        this.fpsAccum = 0;

        // Rolling worst frame over the last WINDOW seconds
        this.window = 3.0;
        this.windowTimer = 0;
        this.worstMs = 0;
        this.worstMsShown = 0;

        this.lastGenMs = 0;
        this.worstGenMs = 0;
        this.genCount = 0;

        this.programs = 0;
        this.lastPrograms = -1;
        this.programChanges = 0;

        this.el = null;
        this._buildOverlay();

        window.addEventListener('keydown', (e) => {
            if (e.code === 'F3') {
                e.preventDefault();
                this.toggle();
            }
        });

        // Reachable from the console for one-off checks.
        window.__perf = this;
    }

    _buildOverlay() {
        const el = document.createElement('div');
        el.id = 'perf-hud';
        el.style.cssText = [
            'position:absolute', 'top:8px', 'left:8px', 'z-index:20000',
            'font:12px/1.45 "Courier New",monospace', 'color:#8f8', 'background:rgba(0,0,0,0.72)',
            'padding:8px 10px', 'border:1px solid #2a4', 'white-space:pre', 'pointer-events:none',
            'display:none', 'letter-spacing:0.3px'
        ].join(';');
        document.body.appendChild(el);
        this.el = el;
    }

    toggle() {
        this.enabled = !this.enabled;
        this.el.style.display = this.enabled ? 'block' : 'none';
        if (this.enabled) {
            // Reset peaks so the reading reflects what happens from now on.
            this.worstMs = 0;
            this.worstMsShown = 0;
            this.worstGenMs = 0;
            this.programChanges = 0;
        }
    }

    noteGeneration(ms, chunksBefore) {
        // generator.update() runs every frame but only builds on some of them.
        // Ignore the cheap no-op frames so the numbers describe actual spawns.
        if (ms < 0.05) return;
        this.lastGenMs = ms;
        this.genCount++;
        if (ms > this.worstGenMs) this.worstGenMs = ms;
        this._lastChunksBefore = chunksBefore;
    }

    endFrame(renderer, generator) {
        const now = performance.now();
        this.frameMs = now - this.lastFrameTime;
        this.lastFrameTime = now;

        // Ignore the very first frame and tab-switch gaps
        if (this.frameMs > 0 && this.frameMs < 2000) {
            this.frames++;
            this.fpsAccum += this.frameMs;
            this.windowTimer += this.frameMs / 1000;
            if (this.frameMs > this.worstMs) this.worstMs = this.frameMs;

            if (this.windowTimer >= this.window) {
                this.fps = this.frames / (this.fpsAccum / 1000);
                this.worstMsShown = this.worstMs;
                this.frames = 0;
                this.fpsAccum = 0;
                this.worstMs = 0;
                this.windowTimer = 0;
            }
        }

        this.programs = renderer.info.programs ? renderer.info.programs.length : 0;
        if (this.lastPrograms !== -1 && this.programs !== this.lastPrograms) {
            this.programChanges++;
            console.warn(
                `PERF: shader program count ${this.lastPrograms} -> ${this.programs} ` +
                `(frame took ${this.frameMs.toFixed(1)}ms). A changed point-light count forces ` +
                `a full recompile of every lit material.`
            );
        }
        this.lastPrograms = this.programs;

        if (this.enabled) this._render(renderer, generator);
    }

    _render(renderer, generator) {
        const lighting = generator.lighting;
        const corridor = generator.corridor;

        const activeLamps = lighting ? lighting.lights.length : 0;
        const poolSize = lighting && lighting.lamps ? lighting.lamps.length : 0;
        const mem = renderer.info.memory;

        this.el.textContent = [
            `FPS          ${this.fps.toFixed(0).padStart(6)}   (${this.frameMs.toFixed(1)}ms)`,
            `worst /${this.window}s ${this.worstMsShown.toFixed(1).padStart(6)}ms`,
            ``,
            `PROGRAMS     ${String(this.programs).padStart(6)}   changes:${this.programChanges}`,
            `geometries   ${String(mem.geometries).padStart(6)}`,
            `textures     ${String(mem.textures).padStart(6)}`,
            ``,
            `chunks       ${String(corridor ? corridor.chunks.length : 0).padStart(6)}`,
            `lamps active ${String(activeLamps).padStart(6)} / ${poolSize}`,
            `spawns       ${String(this.genCount).padStart(6)}`,
            `last spawn   ${this.lastGenMs.toFixed(2).padStart(6)}ms`,
            `worst spawn  ${this.worstGenMs.toFixed(2).padStart(6)}ms`,
            ``,
            `F3 to hide`
        ].join('\n');
    }
}
