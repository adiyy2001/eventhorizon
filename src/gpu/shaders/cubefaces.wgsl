const FACE_COUNT: u32 = 6u;
const NEBULA_BORDER: u32 = 1u;

fn faceForward(face: u32) -> vec3f {
  switch face {
    case 0u: { return vec3f(1.0, 0.0, 0.0); }
    case 1u: { return vec3f(-1.0, 0.0, 0.0); }
    case 2u: { return vec3f(0.0, 1.0, 0.0); }
    case 3u: { return vec3f(0.0, -1.0, 0.0); }
    case 4u: { return vec3f(0.0, 0.0, 1.0); }
    default: { return vec3f(0.0, 0.0, -1.0); }
  }
}

fn faceU(face: u32) -> vec3f {
  switch face {
    case 0u: { return vec3f(0.0, 0.0, -1.0); }
    case 1u: { return vec3f(0.0, 0.0, 1.0); }
    case 5u: { return vec3f(-1.0, 0.0, 0.0); }
    default: { return vec3f(1.0, 0.0, 0.0); }
  }
}

fn faceV(face: u32) -> vec3f {
  switch face {
    case 2u: { return vec3f(0.0, 0.0, 1.0); }
    case 3u: { return vec3f(0.0, 0.0, -1.0); }
    default: { return vec3f(0.0, -1.0, 0.0); }
  }
}

fn faceDirection(face: u32, u: f32, v: f32) -> vec3f {
  return normalize(faceForward(face) + faceU(face) * u + faceV(face) * v);
}

fn dominantFace(direction: vec3f) -> u32 {
  let magnitude = abs(direction);
  if (magnitude.x >= magnitude.y && magnitude.x >= magnitude.z) {
    return select(1u, 0u, direction.x >= 0.0);
  }
  if (magnitude.y >= magnitude.z) {
    return select(3u, 2u, direction.y >= 0.0);
  }
  return select(5u, 4u, direction.z >= 0.0);
}
