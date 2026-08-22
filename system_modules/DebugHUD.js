// Debug overlay - toggle with F3.
//
// Shows live paranoia, every visual effect and every sound channel, plus frame
// timing. Everything is read-only: the HUD never drives state, so leaving it open
// cannot change how the game behaves.
//
// The one perf number worth understanding is PROGRAMS (compiled shader programs).
// three.js bakes the scene's point-light count into the shader as a #define and
// puts it in the program cache key, so if that count moves, every lit material is
// recompiled and linked synchronously - a multi-hundred-millisecond frame. If
// PROGRAMS climbs while playing, lights are being added or removed somewhere. With
// the lamp pool it should stay flat for the whole session.

const BAR_WIDTH = 22;

export class DebugHUD {
    constructor() {
        this.enabled = false;

        // Frame timing
        this.lastFrameTime = performance.now();
        this.frameMs = 0;
        this.frames = 0;
        this.fps = 0;
        this.fpsAccum = 0;

        this.window = 3.0;
        this.windowTimer = 0;
        this.worstMs = 0;
        this.worstMsShown = 0;

        // Corridor spawns
        this.lastGenMs = 0;
        this.worstGenMs = 0;

        // Shader programs
        this.programs = 0;
        this.lastPrograms = -1;
        this.programChanges = 0;

        // Effect trigger counters, so brief events leave a trace you can read
        // even if you blink. Reset each time the HUD is opened.
        this.counts = { flicker: 0, blackout: 0, inversion: 0, fovSurge: 0, blurBurst: 0, spawns: 0 };
        this._prev = { flicker: false, blackout: false, inversion: false, fovSurge: false, blurBurst: false };

        this.el = null;
        this._buildOverlay();

        window.addEventListener('keydown', (e) => {
            if (e.code === 'F3') {
                e.preventDefault();
                this.toggle();
            }
        });

        window.__debug = this;
    }

    _buildOverlay() {
        const el = document.createElement('div');
        el.id = 'debug-hud';
        el.style.cssText = [
            'position:absolute', 'top:8px', 'left:8px', 'z-index:20000',
            'font:11px/1.4 "Courier New",monospace', 'color:#9c9', 'background:rgba(0,0,0,0.78)',
            'padding:8px 12px', 'border:1px solid #2a4', 'white-space:pre', 'pointer-events:none',
            'display:none', 'letter-spacing:0.2px', 'max-height:96vh', 'overflow:hidden',
            'text-shadow:0 0 2px rgba(0,0,0,0.9)'
        ].join(';');
        document.body.appendChild(el);
        this.el = el;
    }

    toggle() {
        this.enabled = !this.enabled;
        this.el.style.display = this.enabled ? 'block' : 'none';

        if (this.enabled) {
            // Reset peaks and counters so the readout describes what happens from now.
            this.worstMs = 0;
            this.worstMsShown = 0;
            this.worstGenMs = 0;
            this.programChanges = 0;
            for (const k in this.counts) this.counts[k] = 0;
        }
    }

    noteGeneration(ms) {
        // generator.update() runs every frame but only builds on some of them.
        // Ignore the no-op frames so these numbers describe actual spawns.
        if (ms < 0.05) return;
        this.lastGenMs = ms;
        this.counts.spawns++;
        if (ms > this.worstGenMs) this.worstGenMs = ms;
    }

    endFrame(game) {
        const now = performance.now();
        this.frameMs = now - this.lastFrameTime;
        this.lastFrameTime = now;

        // Skip the first frame and any tab-switch gap
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

        const renderer = game.renderer;
        this.programs = renderer.info.programs ? renderer.info.programs.length : 0;
        if (this.lastPrograms !== -1 && this.programs !== this.lastPrograms) {
            this.programChanges++;
            console.warn(
                'PERF: shader program count ' + this.lastPrograms + ' -> ' + this.programs +
                ' (frame took ' + this.frameMs.toFixed(1) + 'ms). A changed point-light count ' +
                'forces a full recompile of every lit material.'
            );
        }
        this.lastPrograms = this.programs;

        this._countEdges(game);
        if (this.enabled) this._render(game);
    }

    // Count rising edges so one-shot events still register a tally.
    _countEdges(game) {
        const sys = game.system;
        const cam = game.player && game.player.cameraController;
        const lighting = game.generator && game.generator.lighting;

        const now = {
            flicker: !!(lighting && lighting.flicker && lighting.flicker.active),
            blackout: !!(sys && sys.blackout && sys.blackout.active),
            inversion: !!(sys && sys.cameraInversion && sys.cameraInversion.active),
            fovSurge: !!(cam && cam.fovSurge && cam.fovSurge.active),
            blurBurst: !!game.blurBurstActive
        };

        for (const k in now) {
            if (now[k] && !this._prev[k]) this.counts[k]++;
            this._prev[k] = now[k];
        }
    }

    _bar(fraction, width = BAR_WIDTH) {
        const f = Math.max(0, Math.min(1, fraction || 0));
        const filled = Math.round(f * width);
        return '[' + '#'.repeat(filled) + '.'.repeat(width - filled) + ']';
    }

    _flag(on, label) {
        return (on ? '* ' : '  ') + label;
    }

    _render(game) {
        const L = [];

        const sys = game.system;
        const player = game.player;
        const metrics = player ? player.metrics : {};
        const cam = player ? player.cameraController : null;
        const gen = game.generator;
        const lighting = gen ? gen.lighting : null;
        const corridor = gen ? gen.corridor : null;
        const audio = game.audioSystem;

        const pLevel = sys ? sys.paranoiaLevel : 0;
        const pMax = sys ? sys.maxParanoia : 100;
        const pFactor = sys ? sys.getParanoiaFactor() : 0;

        // ---- STATE ----
        L.push('== STATE ==============================');
        L.push('zone        ' + (game.currentZone || '?') + (game.insideMirage ? '  [MIRAGE/SANCTUARY]' : ''));
        L.push('survival    ' + (sys ? sys.survivalTime.toFixed(0) : '0') + 's');

        // ---- PARANOIA ----
        L.push('');
        L.push('== PARANOIA ===========================');
        L.push('level       ' + this._bar(pLevel / pMax) + ' ' + pLevel.toFixed(1) + '/' + pMax);
        L.push('pFactor     ' + (pFactor * 100).toFixed(1) + '%');

        // Thresholds, so it is obvious what is armed at the current level
        L.push('armed       '
            + this._flag(pFactor >= 0.20, 'flicker(20%)')
            + this._flag(pFactor > 0.95, ' blackout/twist(95%)'));

        if (sys) {
            L.push('lookBackT   ' + (sys.lookBackTimer || 0).toFixed(1) + 's'
                + '   apathy ' + (sys.apathyLevel || 0));
            L.push('voidDist    ' + (sys.highParanoiaDistance || 0).toFixed(0)
                + (sys.endgameTriggered ? '   [ENDGAME]' : ''));
        }

        // ---- PLAYER ----
        L.push('');
        L.push('== PLAYER =============================');
        L.push('facing      ' + (metrics.isLookingBack ? 'BACK' : 'forward')
            + '     ' + (metrics.isStationary ? 'STILL' : 'moving'));
        L.push('fwd streak  ' + (metrics.continuousForwardTime || 0).toFixed(1) + 's'
            + '   turn ' + (metrics.rotationSpeed || 0).toFixed(1) + ' rad/s');
        L.push('distance    ' + (metrics.totalDistance || 0).toFixed(0));

        // ---- VISUAL ----
        L.push('');
        L.push('== VISUAL =============================');
        if (cam) {
            const rollDeg = (player.camera.rotation.z * 180 / Math.PI);
            L.push('fov         ' + player.camera.fov.toFixed(1)
                + (cam.fovSurge.active ? '  SURGE ' + cam.fovSurge.timer.toFixed(1) + 's' : ''));
            L.push('roll        ' + rollDeg.toFixed(1) + ' deg'
                + '   (extRoll ' + (cam.externalRoll * 180 / Math.PI).toFixed(1) + ')');
            L.push('shake       ' + cam.externalShake.toFixed(3));
        }

        if (sys && sys.cameraInversion) {
            const inv = sys.cameraInversion;
            L.push('twist       ' + (inv.active
                ? 'ACTIVE ' + inv.timer.toFixed(2) + '/' + inv.duration.toFixed(2) + 's dir' + inv.direction
                : 'idle') + '   x' + this.counts.inversion);
        }

        if (game.afterimagePass) {
            L.push('motionblur  ' + game.afterimagePass.uniforms['damp'].value.toFixed(2)
                + (game.blurBurstActive ? '  BURST' : '') + '   x' + this.counts.blurBurst);
        }

        const mirageMesh = gen && gen.effects ? gen.effects.mirageMesh : null;
        if (mirageMesh) {
            L.push('mirage      ' + (mirageMesh.visible
                ? 'VISIBLE op' + mirageMesh.material.opacity.toFixed(2)
                : 'hidden'));
        }

        const drown = gen ? gen.drownManager : null;
        if (drown && drown.active) {
            L.push('drown       ACTIVE ' + drown.timer.toFixed(1) + 's'
                + (drown.isUnderwater ? ' UNDERWATER' : ''));
        }

        // ---- LIGHTS ----
        L.push('');
        L.push('== LIGHTS =============================');
        if (lighting) {
            const fl = lighting.flicker;
            L.push('flicker     ' + (fl.active
                ? 'BURST ' + fl.timer.toFixed(2) + '/' + fl.duration.toFixed(2) + 's'
                  + ' lamps' + fl.lamps.length + ' chain' + (fl.chainChance * 100).toFixed(0) + '%'
                : 'idle') + '   x' + this.counts.flicker);
            L.push('lamps lit   ' + lighting.lights.length + ' / ' + lighting.lamps.length
                + (lighting.forceBlackout ? '   FORCED DARK' : ''));
        }

        if (sys && sys.blackout) {
            const bo = sys.blackout;
            L.push('blackout    ' + (bo.active
                ? 'ACTIVE ' + bo.timer.toFixed(1) + '/' + bo.duration.toFixed(1) + 's'
                : (sys.blackoutCooldown > 0
                    ? 'cooldown ' + sys.blackoutCooldown.toFixed(0) + 's'
                    : 'armed')) + '   x' + this.counts.blackout);
        }

        // ---- AUDIO ----
        L.push('');
        L.push('== AUDIO ==============================');
        if (audio) {
            L.push('context     ' + audio.ctx.state + (audio.initialized ? '' : '  (not wired)'));

            const amb = audio.ambient, psy = audio.psych, ev = audio.eventAudio, intro = audio.introAudio;

            const playing = [];
            if (amb && amb.isHumming) playing.push('hum');
            if (ev && ev.isViolinPlaying) playing.push('violin');
            if (ev && ev.tinnitusNode) playing.push('tinnitus');
            if (psy && psy.isFootstepsPlaying) playing.push('footsteps');
            if (intro && intro.isClockPlaying) playing.push('clock');
            if (sys && sys.breathingAudio && !sys.breathingAudio.paused) playing.push('breathing');
            if (sys && sys._currentWhisper) playing.push('whisper');
            if (game.bgMusic && !game.bgMusic.paused) playing.push('music');

            L.push('playing     ' + (playing.length ? playing.join(' ') : '(silence)'));

            if (psy) {
                L.push('whisperT    ' + (psy.whisperTimer || 0).toFixed(1) + 's'
                    + '   heartT ' + (psy.heartbeatTimer || 0).toFixed(2) + 's');
            }
            if (sys) {
                L.push('msgCooldn   ' + Math.max(0, sys.whisperCooldownTimer || 0).toFixed(1) + 's');
            }
            if (game.bgMusic) {
                L.push('music vol   ' + game.bgMusic.volume.toFixed(2));
            }
        }

        // ---- PERF ----
        L.push('');
        L.push('== PERF ===============================');
        L.push('fps         ' + this.fps.toFixed(0) + '   frame ' + this.frameMs.toFixed(1) + 'ms'
            + '   worst/' + this.window + 's ' + this.worstMsShown.toFixed(1) + 'ms');
        L.push('PROGRAMS    ' + this.programs + '   changes ' + this.programChanges
            + (this.programChanges > 0 ? '  <-- RECOMPILES!' : ''));
        L.push('geo/tex     ' + game.renderer.info.memory.geometries
            + ' / ' + game.renderer.info.memory.textures);
        L.push('chunks      ' + (corridor ? corridor.chunks.length : 0)
            + '   spawns ' + this.counts.spawns);
        L.push('spawn cost  last ' + this.lastGenMs.toFixed(2) + 'ms'
            + '   worst ' + this.worstGenMs.toFixed(2) + 'ms');

        L.push('');
        L.push('F3 to hide');

        this.el.textContent = L.join('\n');
    }
}
