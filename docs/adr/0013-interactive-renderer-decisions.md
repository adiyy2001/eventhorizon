# 13. Interactive renderer decisions

Status: accepted

## Context

The interactive milestone had to fix how the split comparison picks its switches, how overlays are drawn so they stay sharp under accumulation, how dynamic resolution changes the image size without recreating resources, how the controller measures cost, and how the render loop is paced.

## Decision

**Split compare.** Each pixel chooses its switch set by comparing its x coordinate with the split position. The left side uses the switches the person selected, the right side always uses the full model (lensing, Doppler, gravitational redshift and higher-order images all on). The divider and its handle are drawn in the present pass. Moving the split changes the scene hash, so accumulation restarts. The split position is quantized in the hash so a drag does not restart on sub-pixel noise.

**Overlays.** The photon sphere and ISCO marks are found in the tracer, at the crossings the integrator already computes, and written to a mask next to the radiance. The mask has its own `rgba16float` ping-pong pair that accumulates with the radiance weight, so the jitter antialiases the dotted and dashed lines. The mask is composited after tone mapping. The shadow edge is an analytic circle with radius `tan(asin((b_c/D)·sqrt(1 - 2/D)))` drawn in the present pass (`docs/physics.md` section 16). Line styles are dotted, dashed and solid, and the viewport legend names each overlay, so color is never the only signal.

**Dynamic resolution by sub-rectangle.** The tracer renders into the top-left `scaledSize(full, scale)` rectangle of full-size targets. Changing the scale recreates nothing. The present pass multiplies its texture coordinates by the valid fraction in each axis, and the first bloom level samples the same rectangle stretched to full bloom size. The accumulation key is `hash(sceneHash, internalWidth, internalHeight)`, so a size change restarts the average.

**Controller.** A pure function in `src/gpu/dynamic-resolution.ts`. Cost at full resolution is estimated as `measured / scale²`, smoothed with factor 0.3. The wanted scale is `sqrt(target / cost)` rounded down to steps of 0.05, between 0.35 and 1, with a 60 Hz target. A change needs the measurement to leave a 12 percent band around the target. The measurement is the `timestamp-query` GPU time tagged with the scale it was taken at, or, without that feature, the delta between rendered frames. Without direct timing the controller probes one step up after 24 calm frames and doubles the wait to at most 384 after a failed probe. At rest the scale is 1.

**Loop pacing.** At most two frames are in flight. A blocked tick keeps its previous timestamp, so a delta measured later spans the wait and the controller still sees slow frames. The loop goes idle after 256 accumulated frames and wakes on any setting change.

**Accumulation.** Weight `1/(n+1)`, R2 jitter, and a reset writes the new frame without reading the history. A change that only touches exposure or bloom adds one more accumulation frame and does not restart, because the radiance is unchanged.

**Automation additions.** `renderSequence`, `exportImage` and `runMotion` (ADR 11 amendment). `renderSequence` is how the end-to-end test shows that accumulation after a change equals a fresh render, bit for bit.

**Defaults.** The values chosen in the color milestone stay: distance 50, disk outer radius 16, peak temperature 5500 K, inclination 75 degrees, vertical field of view 35 degrees, exposure 0, bloom 0.06. The interactive renderer showed no reason to change them. ADR 15 later changed the peak temperature to 6500 K and the exposure to -1.5 EV.

## Alternatives

- Resize the targets when the scale changes. Simple, but allocation during a camera drag causes hitches and invalidates bind groups.
- Draw the overlays in the present pass only. Works for the analytic shadow circle, but the sphere and the ring would lose the lensing, which is the point of drawing them in the tracer.
- Render the right half of the split with its own switch selection. Two free selections make the comparison harder to read than one reduced model against the full one.

## Consequences

- The GPU readback shows the full-size target with unused texels around the sub-rectangle, so capture and export always render at scale 1.
- On the software adapter the controller reaches 0.35 and holds it, and returns to 1 at rest (the log is in the progress entry). A hardware GPU settles somewhere else, and its frame times stay a task for Adrian.
