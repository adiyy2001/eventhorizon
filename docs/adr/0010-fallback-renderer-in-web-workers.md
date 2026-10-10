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

## Amendment from the fallback renderer milestone

This section records what was built and where it differs from the plan above. The numbers come from `bench/results/fallback.json` and `bench/results/cpu-gpu-parity.json`.

The plan assumed that workers send back finished pixels. They send back linear radiance instead. A worker traces the samples of one tile with the core integrator and returns a `Float32Array` with three values per sample in a transferable buffer. The main thread keeps a `FrameAssembler` that holds the radiance of the whole frame, writes each sample into a block of its pass step until finer data arrives, and runs the CPU twins of the post chain when a picture is drawn. A preview applies exposure, the ACES fit and the sRGB transfer. The final picture adds the bloom, cached per version of the frame, and the dither. A change of exposure, bloom strength or overlay therefore shows up without tracing again, and `cpuRenderKey` lists the settings that do need a new trace.

The picture is 512 by 512 with one ray through the pixel centre. The first frame of the graphics path uses a zero jitter offset, so both paths sample the same positions, and the software path has no accumulation of its own. The save button writes 512 pixel images in this mode.

The four passes take every 8th, 4th, 2nd and then every sample on both axes. Each pass traces only the samples the coarser passes left out, so no ray is traced twice and the passes together cost one full render. A tile is 16 samples on a side in the grid of its pass, and the tiles of a pass run from the centre outwards. A worker holds at most two tiles at a time. Every request carries a generation number: a new camera, switch or physics setting starts a new generation, the scheduler stops handing out tiles of the old one, and tiles that come back late are dropped. The previous picture stays on screen until the first pass of the new generation is complete. Previews are drawn at most every 48 ms, or at twice the cost of the previous draw when that is longer. A worker error stops the renderer and is reported under the image.

The shadow edge and the split comparison are drawn on the CPU. The photon sphere and the innermost stable orbit overlays need the graphics path, so their switches are disabled with a note, the settings keep their value and the workers ignore it.

Capability detection routes on the result of the device acquisition. A missing `navigator.gpu`, a null adapter, a rejected device request, a failure while building the renderer and a lost device all move the viewport to the software path and show the reason in the banner. The WebGPU canvas is replaced by a new one, because a canvas that has returned a WebGPU context cannot return a 2D one. The user agent is not read.

`scripts/record-preview.ts` records the preview from the graphics path through the capture hook: 200 frames at 20 frames per second, 512 pixels, four accumulated frames each, the azimuth turning once while the inclination moves between 20 and 85 degrees. ffmpeg encodes VP9 at the lowest constant quality factor of a ladder that fits under 4 MB, and the stream carries the bt709 matrix and sRGB transfer tags so that a browser decodes the colors the way the frames were drawn. The result lasts 10.0 s and takes 1.48 MB, with a poster from the first frame and a WebVTT description. It was recorded on the software adapter at about 8 s per frame, and `pnpm record:preview` repeats it on any machine with WebGPU.

Timings on an i7-12700H with 20 logical cores and plain Chromium 153 without WebGPU flags, median of five loads from `pnpm bench:fallback`:

| Workers | First image after navigation | Full image after navigation | First image after a camera change | Full image after a camera change |
| ------- | ---------------------------- | --------------------------- | --------------------------------- | -------------------------------- |
| 1       | 520 ms                       | 11.7 s                      | 154 ms                            | 9.3 s                            |
| 2       | 488 ms                       | 5.7 s                       | 110 ms                            | 5.0 s                            |
| 4       | 440 ms                       | 3.6 s                       | 79 ms                             | 3.2 s                            |
| 8       | 607 ms                       | 3.0 s                       | 67 ms                             | 2.2 s                            |

The result file records the one minute load average after each row, since other work on the machine changes the timings.

Against the graphics image at 128 pixels, the mean absolute difference per color channel over nine scenarios stays at or below 0.020 on a 0 to 255 scale, with at most 3 levels on any single pixel. The scenarios are the default view, two inclinations, lensing off, beaming and redshift off, a hot disk with a wide field of view, strong bloom and exposure, the shadow edge and the split comparison. The tolerance is 0.25, and a deliberately different camera lands above ten times that.
