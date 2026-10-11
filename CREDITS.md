# Credits

Third-party code, data and constants used by this project, with their licenses. Nothing is vendored from another repository. Everything listed below was read, and its formulas or numbers were re-implemented in TypeScript and WGSL.

## Color science

- Color matching functions: the multi-lobe piecewise Gaussian fit from Chris Wyman, Peter-Pike Sloan and Peter Shirley, "Simple Analytic Approximations to the CIE XYZ Color Matching Functions", Journal of Computer Graphics Techniques 2(2), 2013, Table 1 and Listing 1 (jcgt.org/published/0002/02/01). The paper is published under CC BY-ND 3.0. Only the numeric coefficients of the fit are used, in `src/core/color/cmf.ts`. No text or figure from the paper is copied.
- CIE 1931 2 degree standard observer table (CIE 018:2019, DOI 10.25039/CIE.DS.xvudnb9b), license CC BY-SA 4.0. It is not shipped. It was used once, offline, to check the fit, and the tests keep only a handful of derived Planckian chromaticity numbers (see `docs/adr/0003-color-matching-functions-analytic-fit.md`).
- Second radiation constant c2 = hc/k, from the CODATA 2022 values of the Planck constant, the speed of light and the Boltzmann constant as published by NIST (physics.nist.gov/cuu/Constants). The values are exact since the 2019 SI redefinition.
- XYZ to linear sRGB matrix and the sRGB transfer functions: CSS Color Module Level 4 (W3C), which gives the matrix as exact rational entries, and IEC 61966-2-1.

## Tone mapping

- ACES filmic fit: Stephen Hill, `ACES.hlsl` in github.com/TheRealMJP/BakingLab, MIT license, read at commit `0f66f50398a372ea27ba0e4d95379d32c83d2e8a`. The two matrices and the rational fit are reproduced in `src/core/color/tonemap.ts` and `src/gpu/shaders/tonemap.wgsl`. The upstream file carries an MIT license header that names its authors.

## Rendering techniques

These are published techniques. The code was written for this project from the descriptions.

- PCG hash: Mark Jarzynski and Marc Olano, "Hash Functions for GPU Rendering", Journal of Computer Graphics Techniques 9(3), 2020, and Melissa O'Neill, "PCG: A Family of Simple Fast Space-Efficient Statistically Good Algorithms for Random Number Generation", 2014. The constants are those of the 32-bit PCG output hash.
- R2 low-discrepancy sequence for the sub-pixel jitter: Martin Roberts, "The Unreasonable Effectiveness of Quasirandom Sequences", 2018.
- Bloom: the 13-tap downsample, the luminance-weighted average on the first level that suppresses fireflies, and the tent upsample, as described in Jorge Jimenez, "Next Generation Post Processing in Call of Duty: Advanced Warfare", SIGGRAPH 2014.

## Numerical methods

These are published algorithms, written from their descriptions for this project.

- Dormand-Prince 5(4) embedded Runge-Kutta pair, used as the error reference for RK4: J. R. Dormand and P. J. Prince, "A family of embedded Runge-Kutta formulae", Journal of Computational and Applied Mathematics 6, 1980. The tableau coefficients are the published numbers.
- Carlson's duplication algorithm for the symmetric elliptic integral R_F, used by the exact deflection check in `src/core/physics/elliptic.ts`: B. C. Carlson, "Numerical computation of real or complex elliptic integrals", Numerical Algorithms 10, 1995. The series coefficients 1/24, 3/44 and 1/14 are from that paper.
- Gauss-Legendre quadrature nodes, computed at startup by Newton iteration on the Legendre polynomials.
- Closed-form deflection in elliptic integrals and the weak-field series: C. Darwin, "The gravity field of a particle", Proceedings of the Royal Society A 249, 1959, and C. R. Keeton and A. O. Petters, Physical Review D 72, 104006, 2005.
- Accretion disk temperature profile: N. I. Shakura and R. A. Sunyaev, Astronomy and Astrophysics 24, 1973. Static observer frame conventions: J. M. Bardeen, 1973, and O. James, E. von Tunzelmann, P. Franklin and K. S. Thorne, Classical and Quantum Gravity 32, 065001, 2015.

## Physics references

The sources for every equation are listed at the end of `docs/physics.md`.

## Tooling

Runtime and development dependencies are listed in `package.json`, and the exact versions are in `pnpm-lock.yaml`. Their licenses, read from the installed packages on 2026-10-10:

- MIT: Angular (common, compiler, core, platform-browser, build, CLI, compiler-cli), NgRx Signals, KaTeX, ESLint, `@eslint/js`, angular-eslint, typescript-eslint, Vitest and its coverage package, jsdom, Prettier, tsx, esbuild, `@types/node`.
- Apache 2.0: RxJS, Playwright, Lighthouse, TypeScript.
- BSD 3-Clause: `@webgpu/types`.
- 0BSD: tslib.
- Transitive development tools under other terms: axe-core (through Lighthouse) and lightningcss (through the Angular build) are MPL-2.0, and the caniuse-lite data package is CC-BY-4.0. They are used unmodified, are not shipped in the build and nothing from them is copied into this repository.

KaTeX ships with the physics side panel. Its package license is MIT. The font files in the build come from the KaTeX package, and the font sources in the KaTeX repository carry SIL Open Font License 1.1 headers, so the fonts are redistributed under those terms. The production build writes `3rdpartylicenses.txt` next to the application for the code it bundles.

Lighthouse is only used by `pnpm lighthouse`, esbuild only by `bench/windows/bundle-parity.mjs` and the Angular build, and Playwright by the tests, the benchmarks and the recording scripts. ffmpeg (run from the command line, not distributed) encodes the preview video and the demo GIF.

## Original work

Everything else in the repository was written for this project: the physics, the WGSL shaders, the star field and nebula, the CPU renderer and the Angular interface. The star field and the nebula are procedural. No photograph, texture or other third-party image is used, and the demo GIF and the preview video are recordings of this application.
