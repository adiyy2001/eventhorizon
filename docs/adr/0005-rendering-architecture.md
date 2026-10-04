# 5. Rendering architecture

Status: accepted

## Context

Every pixel needs its own numerically integrated geodesic. The image has to refine while the camera is still, hold a frame rate while it moves, and run the same physics switches per pixel for the split-screen comparison.

## Decision

A compute shader does the tracing, and the later steps are fullscreen passes:

1. Trace (compute, 8x8 workgroups): one thread per pixel of the internal render target. It reads the jittered sub-pixel offset, integrates the ray, shades the disk hit through the temperature LUT and samples the background cubemap. It writes linear HDR radiance to an `rgba32float` storage texture.
2. Accumulate: a ping-pong pair of `rgba32float` textures. The new frame is blended into the history with weight 1/n while the camera and settings hash are unchanged. Any change resets n. Using two textures avoids the read-write storage texture feature and keeps precision where a half-float history would drift after hundreds of frames.
3. Bloom: a downsample chain and a tent-filtered upsample chain on `rgba16float` targets.
4. Present: exposure, ACES tone mapping, sRGB transfer, a small dither, bilinear upscale from the internal resolution to the canvas, and the analytic overlays (shadow edge circle, split divider).

Dynamic resolution scales the internal target between 0.35 and 1.0 of the canvas using a frame time controller (a pure function, unit tested). Timing comes from `timestamp-query` where the adapter exposes it and from `requestAnimationFrame` deltas otherwise. When the camera stops, the scale goes back to 1.0 and accumulation starts.

The background cubemap (stars with blackbody colors plus procedural nebula noise) is baked once by a compute shader into six `rgba16float` layers and mipmapped. The temperature LUT is a one-row `rgba16float` texture built on the CPU.

Split-screen comparison costs nothing extra: each pixel picks its switch set from its x coordinate against the split position.

The WGSL sources are plain `.wgsl` files imported as text through the Angular esbuild `loader` option and composed into modules by a small registry in TypeScript.

## Alternatives

- A fragment shader instead of compute. Simpler to start, but no control over workgroup shape and the per-pixel state for accumulation is more awkward.
- A single pass with no accumulation. Fast to write, but anti-aliasing and the photon ring detail near the shadow edge need many samples per pixel.
- Half-float accumulation. Half the memory, visible banding after long accumulation.

## Consequences

- Memory at 1080p: the trace target and two history textures at 16 bytes per pixel, about 100 MB, plus the cubemap (6 x 1024² x 8 bytes, about 67 MB with mips). Both are acceptable on integrated GPUs and checked in the benchmark milestone.
- The tracer has no dependency on a read-write storage texture, `shader-f16` or subgroups, so any WebGPU adapter that passes the default limits can run it.
- Frames for tests and exports are read back from GPU buffers (see ADR 11), which keeps them independent of the browser compositor.

## Amendment from the GPU tracer milestone

- The trace kernel also writes one `u32` outcome per pixel into a storage buffer. The overlay and test code can read which pixels were captured, escaped or hit the disk without decoding colors, and the image comparison against the CPU uses it.
- A second kernel, `traceParity`, runs the same `traceRay` function over a buffer of rays and writes a 48 byte `TraceResult` per ray. It shares every WGSL module with the image kernel except the entry file, which is what makes the parity result a statement about the shipped tracer.
- The present pass loads the `rgba32float` radiance texture with `textureLoad` and an explicit `unfilterable-float` bind group layout, so it does not need the `float32-filterable` feature.
- WGSL modules are plain files composed in a fixed order by `shader-modules.ts`. A unit test fails when two modules declare the same name, and the struct layouts in WGSL are parsed and compared with the TypeScript layout used for packing.
