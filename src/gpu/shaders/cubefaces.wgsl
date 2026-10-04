const FACE_COUNT: u32 = 6u;

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
