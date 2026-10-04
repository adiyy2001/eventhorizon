# 7. Disk model, redshift factor and what the switches mean

Status: accepted

## Context

The brief fixes the disk (thin, equatorial, inner edge at the ISCO, Keplerian circular orbits) and gives one redshift factor, `g = sqrt(1 - 3M/r) / (1 - Ω·λ)`, with observed temperature `g·T` and bolometric intensity scaled by `g⁴`. The physics switches have to turn individual effects on and off. Three details need pinning down before any code is written.

## Decision

Redshift decomposition. For an emitter on a circular orbit with Ω = sqrt(M/r³), the factor splits exactly into a gravitational part and a kinematic part:

- `g_grav = sqrt(1 - r_s/r)`
- `g_dopp = 1 / (γ·(1 - Ω·λ))` with `γ = sqrt((1 - r_s/r)/(1 - 3M/r))`

and `g_grav · g_dopp = sqrt(1 - 3M/r)/(1 - Ω·λ)`. The "gravitational redshift" switch sets `g_grav = 1`; the "Doppler beaming" switch sets `g_dopp = 1`. The second one removes the transverse time dilation and the beaming together, which is stated in the UI help text. A test checks that the product of the parts equals the combined factor to 1e-12.

Camera at finite distance. The formula above is the ratio of the photon energy at infinity to the energy in the emitter frame. The camera is a static observer at distance D, which measures `E/sqrt(1 - r_s/D)`. The total factor is therefore multiplied by `1/sqrt(1 - r_s/D)`, and this factor belongs to the gravitational redshift switch. The brief's factor is the limit D to infinity.

Sign of λ. The integrator runs from the camera into the scene, which is the time reverse of the photon's path. The photon's angular momentum about the disk axis is `λ = -(x × x')_y` with the disk axis along +y and the emitters orbiting counter-clockwise seen from +y. A positive λ raises g above its λ = 0 value `sqrt(1 - 3M/r)`. The test for it is physical: at high inclination the side of the disk moving towards the camera must come out blue-shifted and brighter, and a hand-built case with λ > 0 must give `g > sqrt(1 - 3M/r)`.

Intensity and color. The observed spectrum of a blackbody emitter is again a blackbody, with temperature `g·T`, because `I_ν/ν³` is invariant along the ray. The displayed radiance is `(g·T)⁴` scaled by a constant, with the chromaticity taken from the LUT at `g·T`. This follows the brief's bolometric scaling. Visible-band luminance would grow more slowly for hot gas.

Other disk simplifications, all listed in `docs/physics.md`: `T(r) ∝ r^(-3/4)·(1 - sqrt(r_in/r))^(1/4)` without the relativistic correction factor of Page and Thorne, zero emission inside r_in, an opaque surface that emits isotropically (no limb darkening), no radiation that returns to the disk, no scattering. The temperature control sets the peak temperature (the profile peaks at r = 49/36·r_in); real stellar-mass disks are X-ray sources, so the slider range is a visualization choice and says so.

What the other switches mean:

- Lensing off: the acceleration is multiplied by 0, so rays are straight lines in the same code path, and the hole is drawn as an opaque sphere of radius r_s so the comparison still has a body.
- Higher-order images off: only the first crossing of the disk plane counts. On: rays continue past crossings that miss the annulus and the first crossing inside the annulus ends the ray. The disk is opaque, so a second or third image is a ray that crossed the plane outside the annulus first.

## Alternatives

- Keep `g` as one number and offer a single "relativistic shift" switch. Simpler, but the brief asks for switches that show what each effect contributes.
- Compute `λ` from the forward photon direction and skip the sign flip. Correct only if the tracer ran forwards, which it does not.

## Consequences

- Both switches map to one multiplication each, with the tracer kernel unchanged.
- Without the finite-distance factor the image would be too dim by `sqrt(1 - r_s/D)` at D = 20 (about 5 percent in frequency and 19 percent in intensity).

## Amendment from the CPU reference milestone

- `redshiftParts(r, λ, D)` returns `gravitational`, `observer`, `kinematic` and `total`. `combineRedshift` drops `gravitational` and `observer` together when the gravitational switch is off, and drops `kinematic` when the Doppler switch is off.
- The photon angular momentum about the disk axis is constant along the whole ray, because the force is central and `x × x'` is conserved (`docs/physics.md` section 3). The tracer reports `λ` from the start of the crossing step, and a test checks it against the value at the camera.
- The local orbital speed relative to a static observer is `1/sqrt(r - 2)`, which gives `γ = sqrt((r - 2)/(r - 3))` and exactly one half at the ISCO.
- Physical sign test: on an 80 degree view the pixels whose first crossing lies between r = 9 and r = 13 and whose emitter moves towards the camera have mean `Ω·λ` above 0.01, and the receding side below -0.01.
