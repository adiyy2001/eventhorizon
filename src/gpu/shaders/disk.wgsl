struct PlaneCrossing {
  radius: f32,
  lambda: f32,
  x: f32,
  z: f32,
}

fn hermite(start: f32, startSlope: f32, end: f32, endSlope: f32, span: f32, fraction: f32) -> f32 {
  let squared = fraction * fraction;
  let cubed = squared * fraction;
  return (2.0 * cubed - 3.0 * squared + 1.0) * start
    + (cubed - 2.0 * squared + fraction) * span * startSlope
    + (-2.0 * cubed + 3.0 * squared) * end
    + (cubed - squared) * span * endSlope;
}

fn hermiteSlope(start: f32, startSlope: f32, end: f32, endSlope: f32, span: f32, fraction: f32) -> f32 {
  let squared = fraction * fraction;
  return (6.0 * squared - 6.0 * fraction) * start
    + (3.0 * squared - 4.0 * fraction + 1.0) * span * startSlope
    + (-6.0 * squared + 6.0 * fraction) * end
    + (3.0 * squared - 2.0 * fraction) * span * endSlope;
}

fn locatePlaneCrossing(previous: Ray, current: Ray, span: f32) -> f32 {
  var low = 0.0;
  var high = 1.0;
  let startSign = sign(previous.position.y);
  var fraction = previous.position.y / (previous.position.y - current.position.y);
  for (var iteration = 0u; iteration < 24u; iteration = iteration + 1u) {
    let value = hermite(previous.position.y, previous.velocity.y, current.position.y, current.velocity.y, span, fraction);
    if (value == 0.0) {
      return fraction;
    }
    if (sign(value) == startSign) {
      low = fraction;
    } else {
      high = fraction;
    }
    let slope = hermiteSlope(previous.position.y, previous.velocity.y, current.position.y, current.velocity.y, span, fraction);
    var next = fraction - value / slope;
    if (!(next > low && next < high)) {
      next = 0.5 * (low + high);
    }
    if (abs(next - fraction) < 1e-6) {
      return next;
    }
    fraction = next;
  }
  return fraction;
}

fn planeCrossing(previous: Ray, current: Ray, span: f32) -> PlaneCrossing {
  let fraction = locatePlaneCrossing(previous, current, span);
  let x = hermite(previous.position.x, previous.velocity.x, current.position.x, current.velocity.x, span, fraction);
  let z = hermite(previous.position.z, previous.velocity.z, current.position.z, current.velocity.z, span, fraction);
  var crossing: PlaneCrossing;
  crossing.radius = sqrt(x * x + z * z);
  crossing.lambda = previous.position.x * previous.velocity.z - previous.position.z * previous.velocity.x;
  crossing.x = x;
  crossing.z = z;
  return crossing;
}

fn crossesPlane(previousY: f32, currentY: f32) -> bool {
  return (previousY < 0.0 && currentY >= 0.0) || (previousY > 0.0 && currentY <= 0.0);
}

fn isInsideAnnulus(radius: f32, params: TraceParams) -> bool {
  return radius >= params.diskInner && radius <= params.diskOuter;
}

fn temperatureShape(radius: f32, innerRadius: f32) -> f32 {
  if (radius <= innerRadius) {
    return 0.0;
  }
  return pow(radius, -0.75) * pow(1.0 - sqrt(innerRadius / radius), 0.25);
}

fn diskTemperatureRatio(radius: f32, innerRadius: f32) -> f32 {
  let peak = temperatureShape(49.0 / 36.0 * innerRadius, innerRadius);
  return temperatureShape(radius, innerRadius) / peak;
}

fn redshiftFactor(radius: f32, photonAngularMomentum: f32, params: TraceParams) -> f32 {
  var factor = 1.0;
  if (hasFlag(params, FLAG_GRAVITATIONAL)) {
    let local = sqrt(1.0 - SCHWARZSCHILD_RADIUS / radius);
    let observer = 1.0 / sqrt(1.0 - SCHWARZSCHILD_RADIUS / params.observerDistance);
    factor = factor * local * observer;
  }
  if (hasFlag(params, FLAG_DOPPLER)) {
    let orbitalSpeedSquared = 1.0 / (radius - SCHWARZSCHILD_RADIUS);
    let lorentz = 1.0 / sqrt(1.0 - orbitalSpeedSquared);
    let angularVelocity = pow(radius, -1.5);
    factor = factor / (lorentz * (1.0 - angularVelocity * photonAngularMomentum));
  }
  return factor;
}
