# 8. Tone mapping with the ACES fit by Stephen Hill

Status: accepted

## Context

ACES and AgX are the two usual filmic choices. The HDR image spans many orders of magnitude between the dim outer disk and the beamed side, and hot blackbody colors are strongly saturated.

I looked at the reference implementations. The AgX reference repository (sobotka/AgX) carries no license file, so its matrices and curves cannot be copied under the permissive-only rule. The ACES fit by Stephen Hill, published in MJP's BakingLab repository as `ACES.hlsl`, is MIT licensed.

## Decision

Use the ACES fit by Stephen Hill (input matrix, rational RRT and ODT fit, output matrix), written in WGSL and in TypeScript for the CPU path and the tests. The implementation reads the upstream file again, checks the matrices against it, and records the commit in `CREDITS.md`. The exposure control multiplies linear radiance before the fit, and the result goes through the sRGB transfer function.

## Alternatives

- AgX. Handles saturated highlights more gracefully, but the license of the reference is unclear.
- The Narkowicz single-curve ACES approximation. Cheaper, per-channel only, and hue shifts toward blue are stronger.
- Reinhard. Easy and bounded, not filmic.

## Consequences

- Very hot (blue) regions can shift hue in the fit. The visual review checks the beamed side of the disk specifically, and the result is described honestly in the README limitations.
- The CPU and GPU tone mappers must agree. A test compares them on a fixed table of inputs.

## Amendment: color

The upstream file was read again at BakingLab commit `0f66f50398a372ea27ba0e4d95379d32c83d2e8a`. Both matrices and the fit coefficients match what the code uses, and the commit is recorded in `CREDITS.md`. The CPU and GPU tone mappers agree within 2.9e-7 absolute on 200 random inputs (`e2e/color-pipeline.spec.ts`). The default exposure is 0 stops with a peak disk temperature of 5500 K, see ADR 12.
