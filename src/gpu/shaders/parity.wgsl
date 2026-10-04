@group(0) @binding(0) var<uniform> params: TraceParams;
@group(0) @binding(1) var<storage, read> rays: array<vec4f>;
@group(0) @binding(2) var<storage, read_write> results: array<TraceResult>;

@compute @workgroup_size(64)
fn traceParity(@builtin(global_invocation_id) id: vec3u) {
  if (id.x >= params.rayCount) {
    return;
  }
  let position = rays[2u * id.x].xyz;
  let direction = rays[2u * id.x + 1u].xyz;
  results[id.x] = traceRay(staticObserverRay(position, direction), params);
}
