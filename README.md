# Don't Look Back

A first-person psychological horror experience built with Three.js.

## Overview

Explore an endless, procedurally generated corridor in this atmospheric horror game. The facility watches you. The lights flicker. Something doesn't feel right.

## Features

- **Procedurally Generated Environment** - Infinite corridor generation with dynamic chunk loading and cleanup
- **Atmospheric Lighting System** - Dynamic lighting with realistic flicker effects that respond to game state
- **Immersive Audio** - Spatial audio system with ambient sounds and atmospheric music
- **Paranoia Mechanics** - Psychological tension system that monitors player behavior
- **CRT Visual Effects** - Retro scanline overlay for enhanced atmosphere
- **First-Person Controls** - Smooth player movement with camera controls

## Tech Stack

- **Three.js** - 3D rendering and scene management
- **Vanilla JavaScript** - ES6 modules architecture
- **HTML5/CSS3** - UI and visual effects

## Project Structure

```
├── index.html          # Main entry point
├── main.js             # Game client and core loop
├── player.js           # Player controls and physics
├── environment.js      # Corridor generation and visuals
├── facility_system.js  # Game state and event management
├── audio_system.js     # Sound and music handling
├── style.css           # UI styling
├── audio/              # Sound effects and music
└── textures/           # Visual assets
```

## Running Locally

Simply open `index.html` in a modern browser, or use a local server:

```bash
# Using Python
python -m http.server 8000

# Using Node.js
npx serve .
```

Then navigate to `http://localhost:8000` (or the appropriate port).

## Controls

- **WASD** - Movement
- **Mouse** - Look around
- **Click** - Pointer lock (enable mouse look)

---

*Keep moving forward. Don't look back.*
