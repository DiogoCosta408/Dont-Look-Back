# Impossible Door: Technical Design

## **1. Spawn Logic**
The Door should not appear randomly. It requires a specific state to be "earned" by the player, ensuring it feels like a discovery rather than a glitch.

*   **Condition**:
    *   **Distance**: Player must have traveled at least **500 units** (approx. 2-3 minutes of walking).
    *   **State**: Paranoia must be **LOW (< 20)**. The Door is a trap for the "calm" or "curious" player, not the frantic runner.
    *   **Placement**: It spawns in the exact center of a corridor chunk (`x: 0, z: [offset]`).
*   **Implementation**:
    *   Modify `CorridorGenerator.js` to check these conditions in `generateChunk`.
    *   If met, spawn `ImpossibleDoor` class instead of a standard chunk (or effectively "inside" a modified empty chunk).

## **2. Rendering (The Non-Euclidean Effect)**
To achieve the "bigger on the inside" effect where you look through a door frame into a different world without loading screens, we use **Stencil Buffers**.

*   **The Door Frame**: A standard mesh (wood texture). Inside the frame is a "Portal Plane" (invisible geometry).
*   **The Void Room**: The "Bedroom" is actually constructed *physically* in the scene, but **masked out**.
*   **Stencil Magic**:
    1.  The "Bedroom" meshes are set to only render where the Stencil Value is `1`.
    2.  The "Portal Plane" (the doorway) writes `1` to the Stencil Buffer but does not render color.
    3.  Result: You only see the Bedroom when looking *through* the Portal Plane. Walking around it reveals nothing (Stencil Value `0`).

## **3. The Transition (Teleport)**
When the player crosses the threshold:
1.  **Detect Intersection**: Raycast or Box Collision with the Portal Plane.
2.  **Seamless Teleport**:
    *   Disable the Stencil Mask on the Bedroom (making it fully real).
    *   Unload the Corridor (or hide it).
    *   Enable the "Trap" logic (Door disappears behind you).

## **4. The Bedroom (The Trap)**
*   **Geometry**: A simple 4-wall room. Bed, lamp, window.
*   **Lighting**: Distinctly warm point light (contrast to the facility's cold/dark tone).
*   **The Escape**:
    *   Interaction with the Light Switch.
    *   Clicking it turns the scene **Pitch Black**.
    *   In the dark, teleport the player back to the Corridor (at a much deeper Z-depth) and reset the Facility state.
