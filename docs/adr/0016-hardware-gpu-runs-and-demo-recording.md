# 16. Hardware GPU runs and the demo recording

Status: accepted

## Context

The development machine runs the tests inside WSL2, where Chromium only sees the SwiftShader software adapter. Everything that depends on timing or on the real driver stack (frame times, GPU parity, the look of the demo) needs a hardware adapter. The laptop has one: its Windows side runs Chrome 154 with an NVIDIA GeForce RTX 3070 Ti Laptop GPU (`ampere`) and an Intel Iris Xe (`gen-12lp`), and it can reach a server in WSL as `http://localhost:<port>`.

The README also needs a demo GIF under 8 MB that shows an orbit and then the switches with the split slider.

## Decision

Parity and frame times run in Windows Node against a server in WSL. The production build is served from WSL by `scripts/serve-dist.ts`. A small Node process on the Windows side drives the installed Chrome through `playwright-core` (`bench/windows/frame-times.mjs` for frame times). The parity script `bench/gpu-parity.ts` is the same file that runs on SwiftShader. `bench/windows/bundle-parity.mjs` bundles it with esbuild into one module, with `@playwright/test` aliased to `playwright-core`, and three environment variables change what it does: `EVENTHORIZON_HARDWARE_GPU=1` swaps the SwiftShader flags for `--enable-unsafe-webgpu --ignore-gpu-blocklist`, `EVENTHORIZON_CHROME` names the browser executable and `EVENTHORIZON_ORIGIN` points at the served build. `EVENTHORIZON_EXTRA_FLAGS=--force_high_performance_gpu` selects the discrete adapter, and without it Chrome picks the Iris Xe. The launch flags moved to `bench/launch-arguments.ts`, so the bundle does not pull in the Playwright test configuration. Every result file records the adapter, the browser version and the flags.

The demo is a sequence of screenshots of the real interface. `scripts/record-demo.ts` opens the page at 80 degrees inclination and plays a fixed list of actions from `bench/demo-plan.ts`: a slow orbit by dragging the canvas, then, with the compare view on, Doppler beaming off with the divider swept across, back on, and the same for lensing. After each action it waits two animation frames and 120 ms and takes one PNG, so every frame is one step of the script and playback speed does not depend on how fast the machine renders. `scripts/encode-demo.ts` turns the frames into a GIF with ffmpeg: a crop of the top 1010 pixels of a 1280 by 1260 viewport, a scale to 760 pixels, 10 frames per second, a 96 color palette from `palettegen` with `stats_mode=diff` and Bayer dithering. The result has 230 frames, lasts 23 s and takes 6.85 MB. The plan has unit tests (the order of actions, balanced pointer presses, the ffmpeg arguments), and the script fails when the GIF is larger than 8 MB.

The switches are toggled through a click dispatched in the page, because Playwright's own `check()` scrolls the sidebar to the element and moves the layout between frames.

## Alternatives

- Playwright's `recordVideo`. It needs a separate ffmpeg download for the browser, the video follows real time, and a slow frame makes the demo stutter.
- The capture hook from ADR 11 that the preview video uses. It gives exact frames of the canvas, but the demo should show the interface around it, including the switches that change.
- Recording on SwiftShader. A full frame takes seconds there, which makes a 23 second recording impractical.
- Running the whole parity script with `tsx` on Windows. The `node_modules` folder in WSL holds Linux binaries, so the script is bundled instead.

## Consequences

- Real-GPU numbers can be reproduced with a short recipe, and the SwiftShader path stays the default for CI.
- The recording needs a hardware adapter. On SwiftShader it would still run, but slowly.
- Chrome processes started for these runs are closed by Playwright. A run that is killed halfway can leave one behind, so check the process list on Windows afterwards.
- The visual baselines are still rendered on SwiftShader. Comparing them on hardware would need the Playwright test runner on the Windows side, which this decision does not cover.
