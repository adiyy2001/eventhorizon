# 10. Fallback renderer in Web Workers

Status: accepted

## Context

WebGPU is on by default in Chrome and Edge. Firefox ships it by default only on Windows and on macOS 26 for Apple Silicon, and Safari has it partly (caniuse reports 85.7 percent of users with full support, checked on 2026-10-04). A visitor without it should still see a correct picture and understand why it is slow.

The static site is meant for GitHub Pages, which cannot send the `Cross-Origin-Opener-Policy` and `Cross-Origin-Embedder-Policy` headers that `SharedArrayBuffer` needs.

## Decision

When `navigator.gpu` is missing, `requestAdapter()` returns null or device creation fails, the app starts a CPU renderer:

- The same float64 reference integrator, color pipeline and background generator that the tests use, running in a pool of Web Workers (`hardwareConcurrency - 1`, at most 8).
- Tile based and progressive: passes at 1/8, 1/4, 1/2 and full resolution, each pass cancellable. A generation number on every message makes results from stale settings harmless.
- Pixel data moves by transferable `ArrayBuffer`s. No `SharedArrayBuffer`.
- The control panel, URL state and keyboard controls are the same as on the GPU path. The physics switches work; the overlays and split comparison are supported where they are cheap to compute on the CPU.
- A short pre-recorded video of the WebGPU render, produced by a script in the repo, is shown next to a plain explanation of why the live render is slow.

Capability detection checks the API and the adapter. It does not sniff the user agent.

## Alternatives

- WebGL2 fragment shader fallback. Faster than workers for most users, but it means a second shader implementation in float32 GLSL with its own parity story, which is outside the brief.
- A static image only. Honest, but it throws away the reference integrator that already exists.

## Consequences

- The worker path doubles as a live demonstration of the validation: the fallback image and the GPU image of the same settings are compared in a test.
- The fallback is slow by design. The benchmark script records its time to first image and time to full resolution, with the CPU model printed.
