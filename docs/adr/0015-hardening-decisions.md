# 15. Hardening decisions

Status: accepted

## Context

The last milestone closes gaps: the default picture looked flat, the visual baselines covered cameras and temperatures but not the switches, the frame time benchmark and the Pages deployment did not exist, and the elliptic integral check from the stretch list was still open.

## Decision

**Default look.** The peak temperature is 6500 K and the exposure is -1.5 EV (it was 5500 K and 0 EV). At the old values the disk sat on the plateau of the ACES fit across its whole width, so the radial falloff and the beamed side were hard to read. Six renders at 256 to 512 pixels were compared by eye before the change. The new pair keeps a warm outer disk and a blue-white approaching side, and it leaves the stars visible. Tests that relied on 0 EV now state the exposure they need.

**Visual baselines.** Ten renders at 256 pixels and four accumulated frames: the full model, two inclinations, the four physics switches one by one, two temperatures, and the three overlays with the split compare. Each is compared with the stored PNG by mean absolute difference (below 0.5 of 255) and by the largest single channel difference (below 64), so a small local change such as a moved overlay line cannot hide in the mean. `pnpm test:visual` runs the comparison and `pnpm capture:baselines` writes new images after a deliberate change. The capture script deletes the old files first, and a script test fails when the folder and the list of specs disagree.

**Frame times.** `pnpm bench:fps` runs the scripted camera motion at 1920 by 1080 with dynamic resolution on and off and writes median, 95th percentile and the resolution scale to `bench/results/frame-times-<adapter>.json` with the adapter and a `software` marker. The automation hook got a `dynamicResolution` switch for this, which pins the minimum scale to 1.

**Renderer lifetime.** A hook creates and destroys the renderer a given number of times on one device and reports whether the device was lost. The end-to-end test runs it 20 times.

**Pages.** The build uses base href `/` and ships a `CNAME` file for `eventhorizon.adrianturbinski.pl` from `public/`. `pnpm build:pages` builds and then checks the artifact: the base href, every local reference, the video and its poster, and the host in `CNAME`. The workflow `pages.yml` uploads `dist/eventhorizon/browser` and deploys it. `ci.yml` runs the whole verification, the physics validation, the parity run and Lighthouse, and keeps the bench results as an artifact.

**Elliptic integrals.** `deflectionByElliptic` computes the exact deflection from the closed form with Carlson's $R_F$. It agrees with the quadrature to about 6e-15 radians, and `pnpm validate:physics` checks it with a limit of 1e-10. It is a validation extra and is not used for rendering.

## Alternatives

- Keep 5500 K and 0 EV and change only the tone curve. That would move the fit away from the published one (ADR 8).
- Compare baselines with a mean only. Cheaper, and it misses thin features.
- Deploy with base href `/eventhorizon/` on the project URL. The portfolio uses a custom domain, so the root path is the right one.
- Kerr mode and the free-falling observer stay out. Both need their own equations, parity runs and ADRs, and the must-haves and their evidence come first.

## Consequences

Baselines were rendered on SwiftShader. A hardware GPU can differ in the last bits, which the tolerance is set to absorb, and the largest-difference limit is the number to loosen first if it does not. The preview video was recorded again with the new look.
