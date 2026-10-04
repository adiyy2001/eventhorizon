fn accelerationFactor(position: vec3f, velocity: vec3f) -> f32 {
  let momentum = cross(position, velocity);
  let radiusSquared = dot(position, position);
  let radius = sqrt(radiusSquared);
  return -3.0 * dot(momentum, momentum) / (radiusSquared * radiusSquared * radius);
}

fn acceleration(position: vec3f, velocity: vec3f, lensing: bool) -> vec3f {
  if (lensing) {
    return accelerationFactor(position, velocity) * position;
  }
  return vec3f(0.0);
}

fn stepSize(ray: Ray, params: TraceParams, lensing: bool) -> f32 {
  let radiusSquared = dot(ray.position, ray.position);
  var size = params.stepKappa * sqrt(radiusSquared);
  if (lensing) {
    let momentum = cross(ray.position, ray.velocity);
    size = size / (1.0 + params.stepAngularWeight * dot(momentum, momentum) / radiusSquared);
  }
  return min(params.stepMax, max(params.stepMin, size));
}

fn rk4Step(ray: Ray, dt: f32, lensing: bool) -> Ray {
  let halfStep = 0.5 * dt;
  let a1 = acceleration(ray.position, ray.velocity, lensing);

  let p2 = ray.position + halfStep * ray.velocity;
  let v2 = ray.velocity + halfStep * a1;
  let a2 = acceleration(p2, v2, lensing);

  let p3 = ray.position + halfStep * v2;
  let v3 = ray.velocity + halfStep * a2;
  let a3 = acceleration(p3, v3, lensing);

  let p4 = ray.position + dt * v3;
  let v4 = ray.velocity + dt * a3;
  let a4 = acceleration(p4, v4, lensing);

  let sixth = dt / 6.0;
  var next: Ray;
  next.position = ray.position + sixth * (ray.velocity + 2.0 * v2 + 2.0 * v3 + v4);
  next.velocity = ray.velocity + sixth * (a1 + 2.0 * a2 + 2.0 * a3 + a4);
  return next;
}

fn segmentEntersSphere(previous: Ray, current: Ray, radius: f32) -> bool {
  let delta = current.position - previous.position;
  let lengthSquared = dot(delta, delta);
  let along = -dot(previous.position, delta) / lengthSquared;
  let fraction = clamp(along, 0.0, 1.0);
  let closest = previous.position + fraction * delta;
  return dot(closest, closest) < radius * radius;
}
