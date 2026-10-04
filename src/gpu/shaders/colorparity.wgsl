const MODE_LUT: u32 = 0u;
const MODE_TONEMAP: u32 = 1u;
const MODE_STARS: u32 = 2u;
const MODE_NEBULA: u32 = 3u;
const MODE_CUBEMAP: u32 = 4u;
const MODE_HASH: u32 = 5u;

struct ColorParityParams {
  mode: u32,
  count: u32,
  padding0: u32,
  padding1: u32,
}

@group(0) @binding(0) var<uniform> parity: ColorParityParams;
@group(0) @binding(1) var<storage, read> inputs: array<vec4f>;
@group(0) @binding(2) var<storage, read_write> outputs: array<vec4f>;

@compute @workgroup_size(64)
fn colorParity(@builtin(global_invocation_id) id: vec3u) {
  if (id.x >= parity.count) {
    return;
  }
  let input = inputs[id.x];
  var output = vec4f(0.0);
  switch parity.mode {
    case MODE_LUT: { output = vec4f(blackbodyRadiance(input.x), lutColor(input.x).x); }
    case MODE_TONEMAP: { output = vec4f(displayEncode(input.xyz, input.w), 0.0); }
    case MODE_STARS: { output = vec4f(starRadiance(normalize(input.xyz)), 0.0); }
    case MODE_NEBULA: { output = vec4f(nebulaRadiance(normalize(input.xyz)), 0.0); }
    case MODE_CUBEMAP: { output = vec4f(nebulaSample(normalize(input.xyz)), 0.0); }
    default: { output = vec4f(unitFloat(hash3(bitcast<u32>(input.x), bitcast<u32>(input.y), bitcast<u32>(input.z), bitcast<u32>(input.w)))); }
  }
  outputs[id.x] = output;
}
