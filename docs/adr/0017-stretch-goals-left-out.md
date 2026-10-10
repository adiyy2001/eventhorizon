# 17. Stretch goals left out

Status: accepted

## Context

Three extras were optional: the exact deflection angle from elliptic integrals as an extra check, a free-falling observer with aberration, and a Kerr black hole as a separate mode. The rule for the project was to attempt them only after every must-have works in the production build.

## Decision

The elliptic integral check is built (ADR 15, `docs/physics.md` section 8). The free-falling observer and Kerr are not.

Both would need new physics and new evidence, and neither is a small addition:

- A free-falling observer changes the initial conditions of every ray. The static observer frame (`docs/physics.md` section 6) would be replaced by a moving frame with aberration, a new camera mode and a second set of hand-computed tests. The disk redshift would need the observer's velocity as well.
- Kerr has no spherical symmetry, so rays no longer stay in a plane and the vector form with a conserved $h$ does not apply. It needs the Carter constant, new geodesic equations, a different disk (the ISCO moves with the spin), frame dragging in the observer frame, a CPU reference, GPU parity and its own ADR.

The reference integrator, the parity runs and the validation suite are what the project is built around, and they are only worth having if they cover everything that ships. Adding a mode that lacks them would weaken the claim that every pixel agrees with general relativity. The README lists both under limitations.

## Alternatives

- A free-falling camera with a visual-only aberration. Cheap, but it would show an effect that has no test behind it.
- Kerr as a shader-only experiment. It could look right and still be wrong in ways nothing here would catch.

## Consequences

The Schwarzschild renderer is complete against its own validation. A Kerr mode is the natural next project, and the CPU reference should come first, with the same bisection and deflection checks that exist here.
