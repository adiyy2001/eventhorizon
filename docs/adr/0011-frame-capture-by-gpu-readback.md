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
