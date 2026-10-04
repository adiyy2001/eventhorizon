# 2. Geodesic equation form and integrator

Status: accepted

## Context

Light rays around a Schwarzschild black hole (units G = c = M = 1, r_s = 2) stay in the plane spanned by their position and direction. Two equivalent forms are available:

- Binet form in the ray plane: with u = 1/r, `d²u/dφ² + u = 3M·u²`.
- Vector form: `x'' = -(3/2)·r_s·h²·x/|x|⁵` with `h = |x × x'|` constant along the ray.

The same integration has to run on the GPU in float32 for every pixel and on the CPU in float64 as the reference, so the choice affects both.

## Decision

The vector form is the working equation on both sides. The parameter is the affine parameter normalized so that the photon energy at infinity is E = 1. Then:

- `h` equals the photon's angular momentum L and is the impact parameter b at infinity.
- `|x'|² = 1 + r_s·h²/r³` holds exactly. The quantity `|x'|² - r_s·h²/r³ - 1` is the null condition drift and is measured, not assumed to vanish.
- An impact parameter at finite distance is recovered from the invariant `b = h / sqrt(|x'|² - r_s·h²/r³)`. A bisection that starts rays at finite distance with `|x'| = 1` is biased by about 2e-5 at D = 200; using the invariant removes the bias.

Rays are started from a static observer at distance D. A direction at angle α from the line towards the hole, measured in the observer's local orthonormal frame, gives `h = D·sin α / sqrt(1 - r_s/D)`, a tangential speed `h/D` and a radial speed from `|x'|² = 1 + r_s·h²/D³`.

Integrator: classic RK4 with a step that scales with the radius, `dt = clamp(κ·r, dt_min, dt_max)`, tightened further where the acceleration is large (near the photon sphere). A Dormand-Prince 5(4) integrator with a tight tolerance lives in the CPU code as the reference for the error analysis of RK4, not as the production path. The initial κ is 0.03 and is retuned by measurement in the CPU and GPU milestones, the final value recorded in `docs/physics.md`.

Termination: `r < r_s·(1 + ε)` is a capture, `r > R_esc` while moving outwards is an escape (the background is sampled along the velocity direction, not the position direction), and a sign change of the coordinate along the disk axis between `r_in` and `r_out` is a disk crossing, located inside the step with cubic Hermite interpolation. The affine form has no singularity at the horizon, so ε only sets the margin for classifying a capture. A ray keeps going after a plane crossing that misses the annulus, so that higher-order images of the disk can appear.

The Binet form is implemented on the CPU as an independent check, together with a direct quadrature of the exact deflection integral. A test integrates both forms for the same rays and requires the deflection angles to agree.

## Alternatives

- Binet form as the main integrator. One scalar ODE per ray, but every ray needs its own plane basis, and the parameterization by φ degenerates at turning points of u.
- Hamiltonian form in Schwarzschild coordinates. Singular at the horizon and at the poles, needs coordinate-specific care in the shader and does not map to vector operations.
- A symplectic or leapfrog integrator. The force is conservative for a fixed h, so it would behave well, but RK4 at a radius-scaled step reaches the accuracy needed with simpler code and is what the brief names.

## Consequences

- The shader works with `vec3f` positions and velocities and needs no trigonometry per step.
- `h` is conserved by construction up to rounding, which makes it the cheap health check in the tests. The null condition is the real error monitor.
- Near the critical impact parameter a ray winds around the photon sphere and the final direction depends sharply on b. The CPU and GPU parity tests exclude a stated margin around b_c, since float32 cannot be expected to agree with float64 there.
