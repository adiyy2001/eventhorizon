@group(0) @binding(0) var<storage, read_write> values: array<u32>;

fn smokeValue(index: u32) -> u32 {
  return index * index + 7u;
}

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) id: vec3u) {
  if (id.x < arrayLength(&values)) {
    values[id.x] = smokeValue(id.x);
  }
}
