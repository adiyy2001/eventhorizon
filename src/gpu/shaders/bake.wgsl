struct BakeParams {
  size: u32,
  padding0: u32,
  padding1: u32,
  padding2: u32,
}

@group(0) @binding(0) var<uniform> bake: BakeParams;
@group(0) @binding(1) var cubeFaces: texture_storage_2d_array<rgba16float, write>;

@compute @workgroup_size(8, 8, 1)
fn bakeNebula(@builtin(global_invocation_id) id: vec3u) {
  if (id.x >= bake.size || id.y >= bake.size || id.z >= FACE_COUNT) {
    return;
  }
  let inner = f32(bake.size - 2u * NEBULA_BORDER);
  let border = f32(NEBULA_BORDER);
  let u = 2.0 * (f32(id.x) - border + 0.5) / inner - 1.0;
  let v = 2.0 * (f32(id.y) - border + 0.5) / inner - 1.0;
  let color = nebulaRadiance(faceDirection(id.z, u, v));
  textureStore(cubeFaces, vec2u(id.x, id.y), id.z, vec4f(color, 1.0));
}
