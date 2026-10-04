# 12. Background, radiance scale and HDR chain decisions

Status: accepted

## Context

The color milestone had to settle four things the plan left open: how stars are drawn when the sky is lensed, what resolution the nebula cubemap needs, what physical scale the displayed radiance has, and which defaults make the first image readable.

## Decision

Stars are evaluated per ray, not baked. The sky is split into six cube faces, each a grid of 96 by 96 cells, and every cell holds at most one star with a hashed position, brightness and temperature. A ray looks at the 3 by 3 cells around its final direction on the face it lands on (faces extend 2 percent past the edge so a star near a seam is found from both sides). A star is a Gaussian of sigma 7e-4 rad in the direction of the escaped ray, written as the squared chord length `|d - s|²` to avoid cancellation in float32. Because the profile is evaluated in the final direction, a star seen through the strong lensing near the ring is stretched into an arc, and accumulation with sub-pixel jitter fills in the arc. Existence probability is weighted by the solid angle of the cell, so density is uniform on the sphere. Brightness follows a Pareto law (exponent -0.8, clamped between 0.06 and 6 in units of the radiance of a 6500 K reference at luminance 1). Temperature is log-uniform between 2600 K and about 18000 K.

The nebula is baked once into a 512 by 512 `rgba16float` cube with no mip chain. It is smooth low-frequency noise (an fbm band plus warped clouds and a warm to cool hue mix) so 512 texels per face is more than the eye can resolve, and mips would only add a bake step. Sampling uses a linear sampler at the final direction.

Displayed radiance is bolometric. The LUT stores linear sRGB chromaticity at unit luminance for a blackbody. The disk radiance is that color times `(T/6500)^4`, with `T` the observed temperature `g·T_emitted`. This applies the Planck invariance of `docs/physics.md` section 11 directly: bolometric intensity scales as the fourth power of the temperature. The visible-band luminance of a real blackbody grows more slowly than that for hot gas. The CPU table also stores the relative visible luminance, which the picture does not use, because the brief asks for the g⁴ scaling.

Defaults changed from the tracer milestone: observer distance 50 (was 30), disk outer radius 16 (was 20), peak temperature 5500 K (was 9000 K). At 9000 K with exposure 0 the whole disk saturates to white after the ACES fit, which hides both the temperature gradient and the beaming. At 5500 K the disk reads warm, with the approaching side visibly brighter, and 9000 K stays available as a baseline for hot disks.

The post chain is: trace into `rgba32float`, accumulate with weight `1/(n+1)` into a ping-pong pair, resolve into `rgba16float` (clamped to 60000), bloom through five levels (13-tap downsample with a luminance-weighted first level, 3 by 3 tent upsample added back), then present, which adds the bloom scaled by its strength and applies exposure in stops, the ACES fit, the sRGB transfer function and a one-LSB triangular dither. The jitter sequence is R2.

## Alternatives

- Stars baked into the cubemap. Lensing then magnifies texels instead of stars, and a 1024² face would need to be sampled far below the star size near the ring, giving blur instead of arcs.
- A 1024² mipmapped cubemap (the plan's first figure). Four times the memory for no visible gain on a smooth nebula.
- Luminance-correct visible-band scaling instead of `(T/6500)^4`. Closer to what a camera records for very hot gas, but the brief defines the scale as g⁴.

## Consequences

- Star lookup costs nine cell hashes per escaped ray. It runs only for rays that reach the sky.
- Everything on the GPU that has a CPU twin (hash, noise, nebula, stars, LUT, tone map) is compared in `e2e/color-pipeline.spec.ts`, and `src/gpu/shader-constants.spec.ts` fails if a WGSL constant drifts from its TypeScript value.
- Results from the software adapter: LUT within 4.3e-4 relative of the CPU, tone mapper within 2.9e-7 absolute, stars within 6.7e-4 absolute, nebula within 8.8e-4 relative, hashes bit-exact, baked cubemap texels within 1.6e-2 relative on the smallest values (float16 storage).
