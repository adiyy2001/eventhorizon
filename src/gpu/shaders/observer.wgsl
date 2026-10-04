fn pixelDirection(params: TraceParams, pixel: vec2f) -> vec3f {
  let ndcX = 2.0 * pixel.x / f32(params.width) - 1.0;
  let ndcY = 1.0 - 2.0 * pixel.y / f32(params.height);
  let direction = params.cameraForward
    + params.cameraRight * (ndcX * params.halfWidth)
    + params.cameraUp * (ndcY * params.halfHeight);
  return normalize(direction);
}

fn staticObserverRay(position: vec3f, localDirection: vec3f) -> Ray {
  let distance = length(position);
  let direction = normalize(localDirection);
  let inward = -position / distance;
  let cosAngle = dot(direction, inward);
  let tangential = direction - inward * cosAngle;
  let sinAngle = length(tangential);
  let horizonFactor = sqrt(1.0 - SCHWARZSCHILD_RADIUS / distance);
  let tangentialSpeed = sinAngle / horizonFactor;
  var tangentialScale = 0.0;
  if (sinAngle > 0.0) {
    tangentialScale = tangentialSpeed / sinAngle;
  }
  var ray: Ray;
  ray.position = position;
  ray.velocity = tangential * tangentialScale + inward * cosAngle;
  return ray;
}
