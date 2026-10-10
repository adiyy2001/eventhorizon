# 15. Hardening decisions

Status: accepted

## Context

This record closes the remaining gaps: the default picture looked flat, the visual baselines covered cameras and temperatures but not the switches, the frame time benchmark and the Pages deployment did not exist, and the elliptic integral check from the stretch list was still open.

## Decision

Default look. The peak temperature is 6500 K and the exposure is -1.5 EV (it was 5500 K and 0 EV). At the old values the disk sat on the plateau of the ACES fit across its whole width, so the radial falloff and the beamed side were hard to read. Six renders at 256 to 512 pixels were compared by eye before the change. The new pair keeps a warm outer disk and a blue-white approaching side, and it leaves the stars visible. Tests that relied on 0 EV now state the exposure they need.

Visual baselines. Ten renders at 256 pixels and four accumulated frames: the full model, two inclinations, the four physics switches one by one, two temperatures, and the three overlays with the split compare. Each is compared with the stored PNG by mean absolute difference (below 0.5 of 255) and by the largest single channel difference (below 64), so a small local change such as a moved overlay line cannot hide in the mean. `pnpm test:visual` runs the comparison and `pnpm capture:baselines` writes new images after a deliberate change. The capture script deletes the old files first, and a script test fails when the folder and the list of specs disagree.

Frame times. `pnpm bench:fps` runs the scripted camera motion at 1920 by 1080 with dynamic resolution on and off and writes median, 95th percentile and the resolution scale to `bench/results/frame-times-<adapter>.json` with the adapter and a `software` marker. The automation hook got a `dynamicResolution` switch for this, which pins the minimum scale to 1.

Performance pass, measured. The frame time numbers come from the installed Chrome 154 on the Windows host of the development laptop, through `bench/windows/frame-times.mjs` (plain Node with `playwright-core`, pointed at the production build served from WSL). The laptop has two adapters. The default one is the Intel Iris Xe (`gen-12lp`), and `--force_high_performance_gpu` selects the NVIDIA GeForce RTX 3070 Ti Laptop GPU (`ampere`). Results are in `bench/results/frame-times-<architecture>.json`, 120 moving frames at 1920 by 1080:

| Adapter | Dynamic resolution | GPU ms per frame (median) | Scale |
| --- | --- | --- | --- |
| RTX 3070 Ti Laptop | off | 12.1 | 1 |
| RTX 3070 Ti Laptop | on | 12.1 | 1 |
| Intel Iris Xe | off | 136.6 | 1 |
| Intel Iris Xe | on | 17.7 | 0.35 |

The discrete GPU holds 60 frames per second at full 1080p and the controller never lowers the scale. The integrated GPU needs the floor of the controller (0.35, about 672 by 378 internal pixels) to reach 62 frames per second at the median, and a still picture is refined at full resolution afterwards. The frame interval measured in the page (median 15 ms on the discrete GPU) also contains the scheduling of `requestAnimationFrame`, so the GPU time from the timestamp queries is the number to compare.

The workgroup shape of the tracer was measured on the discrete GPU (`bench/results/workgroup-shape-ampere.json`): 4 by 4 took 23.9 ms, 8 by 8 took 12.2 ms and 16 by 16 took 12.4 ms. The shape stays 8 by 8. The step rule and the early exits stay as ADR 2 and its amendments set them, because the parity margins were tuned against them and a cheaper row would have to pass the same parity run again for a gain that the frame times above do not need.

Renderer lifetime. A hook creates and destroys the renderer a given number of times on one device and reports whether the device was lost. The end-to-end test runs it 20 times.

Pages. The build uses base href `/` and ships a `CNAME` file for `eventhorizon.adrianturbinski.pl` from `public/`. `pnpm build:pages` builds and then checks the artifact: the base href, every local reference, the video and its poster, and the host in `CNAME`. The workflow `pages.yml` uploads `dist/eventhorizon/browser` and deploys it. `ci.yml` runs the whole verification, the physics validation, the parity run and Lighthouse, and keeps the bench results as an artifact.

Elliptic integrals. `deflectionByElliptic` computes the exact deflection from the closed form with Carlson's $R_F$. It agrees with the quadrature to about 6e-15 radians, and `pnpm validate:physics` checks it with a limit of 1e-10. It is a validation extra and is not used for rendering.

## Alternatives

- Keep 5500 K and 0 EV and change only the tone curve. That would move the fit away from the published one (ADR 8).
- Compare baselines with a mean only. Cheaper, and it misses thin features.
- Deploy with base href `/eventhorizon/` on the project URL. The portfolio uses a custom domain, so the root path is the right one.
- Kerr mode and the free-falling observer stay out. Both need their own equations, parity runs and ADRs, and the must-haves and their evidence come first.

## Consequences

Baselines were rendered on SwiftShader. A hardware GPU can differ in the last bits, which the tolerance is set to absorb, and the largest-difference limit is the number to loosen first if it does not. The preview video was recorded again with the new look.
