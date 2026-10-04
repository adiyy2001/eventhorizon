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

## Physics references

The sources for every equation are listed at the end of `docs/physics.md`.

## Tooling

Runtime and development dependencies are listed in `package.json`. All of them are MIT, Apache 2.0, BSD or ISC licensed. KaTeX (MIT) joins the list with the physics side panel.
