# 11. Frames for tests, exports and media come from GPU readback

Status: accepted

## Context

The screenshot export is a must-have, and the visual regression tests, the fallback video and the demo recording all need exact frames. I tested what headless Chromium does with a WebGPU canvas on a machine without a GPU (SwiftShader software adapter):

- With only `--enable-unsafe-webgpu --use-webgpu-adapter=swiftshader`, an adapter and compute work are available, but presenting to a canvas destroys the device ("A valid external Instance reference no longer exists") and `page.screenshot()` shows a white canvas.
- With `--use-angle=swiftshader --enable-features=Vulkan,DefaultANGLEVulkan,VulkanFromANGLE` added, presentation works and `page.screenshot()` shows the canvas (checked by reading the center pixel of a rendered gradient).

So a compositor screenshot works, but only with a particular set of flags, and its output depends on the browser's compositing and color handling.

## Decision

The renderer exposes one capture path: render the final image into an `rgba8unorm` texture with the same present pass, copy it into a mapped buffer, and encode a PNG from the bytes. The user-facing screenshot export, the visual regression comparisons, the fallback video frames and the demo GIF frames all use it. An automation hook enabled by the `?automation` query parameter renders at a fixed resolution with dynamic scaling off and a fixed number of accumulated frames, then resolves, so captures do not depend on timing.

`page.screenshot()` stays in use for the interface around the canvas (layout, focus rings, responsive checks), run with the working flag set.

## Alternatives

- Compositor screenshots everywhere. Depends on flags and on the browser's compositing.
- `canvas.toBlob()`. Works only in the same task as the render, which makes it fragile in a render loop.

## Consequences

- The capture path is the same code the user triggers with the export button, so it is tested by every visual test.
- The automation hook ships in the production build, since the end-to-end tests run against it. It is read-only, documented, and does nothing without the query parameter.

## Amendment from the GPU tracer milestone

The automation hook exists as `window.eventhorizonAutomation`, installed from `main.ts` only when the URL has `?automation`, through a lazy chunk (4 kB) that is not loaded otherwise. It offers `compileShaders`, `runParity` and `renderView`. Each call acquires its own device, listens for uncaptured GPU errors and fails if one arrived, so a validation error cannot hide behind a zero-filled readback. `renderView` returns the outcome map, the red channel of the radiance texture and a PNG made by the browser from the same bytes the capture path reads back. Fixed resolution, no dynamic scaling and no accumulation apply for now because none of them exist yet; M5 adds the accumulated-frame count to the hook.

## Amendment from the interactive milestone

The hook now also offers `renderSequence` (render several settings in turn on one renderer and report the accumulated frame count after each step), `exportImage` (the export path at a chosen size) and `runMotion` (a scripted camera move through the real render loop, returning the resolution controller log). `renderView` and the sequence report the number of accumulated frames, and `renderView` accepts the full settings object (switches, overlays, split) next to the older `view` and `post` fields. The export button and `exportImage` share one still renderer. It clamps each edge to 64 to 2048 pixels, renders 1 to 256 frames (32 by default) at scale 1 and ignores dynamic resolution. Under `?automation` the live loop idles after 4 accumulated frames instead of 256, so a test page does not keep the GPU busy.

