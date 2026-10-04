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

## Amendment from the CPU reference milestone

Constants after measurement (`pnpm validate:steps`, `pnpm validate:physics`, `docs/physics.md` section 12):

- Step rule: `dt = clamp(κ·r / (1 + w·h²/r²), dt_min, dt_max)` with κ = 0.03, w = 0.5, dt_min = 1e-4, dt_max = 4. For straight rays only `κ·r` applies. The second term limits the angle a ray sweeps per step, which is what matters near the photon sphere.
- Capture margin ε = 1e-3, plus an exact early exit for `r < 3` while moving inwards. Escape radius `max(100, 2·D)`, with the remaining bending `(3/8)·r_s·h³/R⁴` documented and tested. Step limit 20000, flagged and counted as captured.
- Measured with these values: the capture boundary comes out within 5.2e-8 of 3√3 at D = 30 (target in the brief 1e-4), the RK4 deflection differs from the Binet form by at most 5.2e-7 radians for b from 5.3 to 500, and the mean is about 108 steps per ray for a 80 degree view at D = 30.
- `h` is not conserved exactly. RK4 does not preserve quadratic invariants, so the tests state a drift bound instead of the 1e-12 the plan assumed: 1e-8 relative for `h` and 1e-6 for the null condition with the production step (measured 4.4e-10 and 6.1e-8), and 1e-12 and 1e-10 with a step ten times smaller.
- Three computations of the deflection agree to 5e-12: the Binet form, a quadrature of the exact integral, and the vector form with Dormand-Prince.
- The vector-form state is `x, v` as six scalars, and `rk4Step` works on it in place with scalar locals. The reference integrator uses tuples and allocates, since it is not on the hot path.

## Amendment from the GPU tracer milestone

- The WGSL tracer keeps the step rule row unchanged (κ = 0.03, w = 0.5, dt_min = 1e-4, dt_max = 4). Float32 agrees with float64 on all 4096 parity rays, so there is no reason to trade accuracy for a cheaper row yet. Frame time decides that later, on measured hardware.
- Step budget on the GPU is 4096 per ray, set in `viewMaxSteps` and shared by the CPU view code. The float64 reference needs at most 496 steps on the parity set. A ray that reaches the budget is reported captured with a flag, and the parity test requires zero flagged rays.
- Escape radius for the parity set is 120, which is `max(100, 2·D)` for the farthest observer (D = 60). The view code uses `max(100, 2·D)` for its own D.
- The observer setup uses the identity radial speed = cos α, which follows from the null condition and avoids a cancellation in float32.
- Measured error of the GPU tracer against float64 on 4096 rays (SwiftShader): final direction at most 1.6e-4 rad, first hit radius at most 1.4e-4 relative, hit λ at most 1.8e-5 absolute. A `Math.fround` twin of the tracer on the CPU shows the same error, so it is precision and not a porting mistake. Details and the table are in `docs/physics.md`.
- Rays with |b - b_c| < 0.02 and rays that cross the plane within 0.002 of a disk edge are left out of the parity set. Both are cases where the answer depends on the last digits.

