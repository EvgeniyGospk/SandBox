/// Random direction helper (mirrors TypeScript getRandomDirection EXACTLY)
/// TS: const goLeft = (frame + x) & 1; dx1 = goLeft ? -1 : 1
#[inline]
pub fn get_random_dir(frame: u64, x: u32) -> (i32, i32) {
    // TypeScript: goLeft = (frame + x) & 1 -> if truthy (1) then left first
    let go_left = ((frame as u32 + x) & 1) == 1;
    if go_left { (-1, 1) } else { (1, -1) }
}

/// Discrete gravity direction as a grid step (−1/0/1 per axis).
/// If gravity is (0,0), defaults to down (0,1).
#[inline]
pub fn gravity_dir(gravity_x: f32, gravity_y: f32) -> (i32, i32) {
    let gx = if gravity_x > 0.0 { 1 } else if gravity_x < 0.0 { -1 } else { 0 };
    let gy = if gravity_y > 0.0 { 1 } else if gravity_y < 0.0 { -1 } else { 0 };
    if gx == 0 && gy == 0 {
        (0, 1)
    } else {
        (gx, gy)
    }
}

/// Two perpendicular unit directions for a given direction.
/// Returned as (left, right) relative to `dir`.
#[inline]
pub fn perp_dirs(dx: i32, dy: i32) -> ((i32, i32), (i32, i32)) {
    // 90° rotations: (-dy, dx) and (dy, -dx)
    ((-dy, dx), (dy, -dx))
}

/// Xorshift32 random number generator
#[inline]
pub fn xorshift32(state: &mut u32) -> u32 {
    let mut x = *state;
    x ^= x << 13;
    x ^= x >> 17;
    x ^= x << 5;
    *state = x;
    x
}
