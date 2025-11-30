//! RigidBodySystem - Manager for all rigid bodies
//!
//! Phase: Advanced Physics with Torque, Momentum Transfer, and Bounce
//!
//! The Loop:
//! 1. ERASE: Clear bodies from old positions in grid
//! 2. UPDATE: Apply gravity/velocity, update positions
//! 3. COLLISION: Check for collisions with world (with momentum transfer!)
//! 4. TORQUE: Apply rotational forces from asymmetric contacts
//! 5. BOUNCE: Reflect velocity based on collision normal
//! 6. RASTERIZE: Draw bodies at new positions

use crate::grid::Grid;
use crate::rigid_body::{RigidBody, Vec2};
use crate::chunks::ChunkGrid;
use crate::elements::{
    EL_EMPTY, ELEMENT_DATA, CAT_SOLID, CAT_POWDER, CAT_LIQUID, CAT_GAS,
    get_color_with_variation, get_props,
};

// === Physics Constants ===
/// Minimum momentum to penetrate soft materials (powder/liquid)
const PENETRATION_THRESHOLD: f32 = 30.0;
/// How much velocity is transferred to kicked particles (0.0-1.0)
const KICK_TRANSFER: f32 = 0.6;
/// Random spread for particle splashes
const SPLASH_SPREAD: f32 = 2.0;
/// Velocity below which body comes to rest
const REST_THRESHOLD: f32 = 0.1;
/// Angular velocity below which rotation stops  
const ANGULAR_REST_THRESHOLD: f32 = 0.05;
/// Damping factor for angular velocity (lower = more friction)
const ANGULAR_DAMPING: f32 = 0.85;
/// Maximum angular velocity (prevent crazy spinning)
const MAX_ANGULAR_VEL: f32 = 0.3;

/// Extended collision result with contact information
struct CollisionResult {
    /// Did any collision occur?
    hit: bool,
    /// Hit on X axis specifically?
    hit_x: bool,
    /// Hit on Y axis specifically?
    hit_y: bool,
    /// Number of contact points
    contact_count: u32,
    /// Sum of contact X positions (divide by count for average)
    contact_sum_x: f32,
    /// Sum of contact Y positions
    contact_sum_y: f32,
    /// Accumulated collision normal (sum of individual normals)
    normal_sum: Vec2,
    /// Number of soft contacts that were penetrated
    penetrated_count: u32,
}

/// Clear body pixels from grid (using cached world coordinates)
fn clear_body_from_grid(body: &RigidBody, grid: &mut Grid, chunks: &mut ChunkGrid) {
    // Use cached world coordinates for accurate clearing (prevents black spots)
    for (i, &(x, y)) in body.prev_world_coords.iter().enumerate() {
        if grid.in_bounds(x, y) {
            let ux = x as u32;
            let uy = y as u32;
            
            // Only clear if this cell belongs to our rigid body
            let current_type = grid.get_type(x, y);
            // Check against the element type of this pixel
            if i < body.pixels.len() && current_type == body.pixels[i].element {
                grid.clear_cell(ux, uy);
                chunks.mark_dirty(ux, uy);
            }
        }
    }
}

/// Draw body pixels to grid (using CURRENT position)
fn displace_soft_cell(
    grid: &mut Grid,
    chunks: &mut ChunkGrid,
    x: u32,
    y: u32,
    candidates: &[(i32, i32)],
) -> bool {
    for (dx, dy) in candidates {
        let tx = x as i32 + dx;
        let ty = y as i32 + dy;
        if !grid.in_bounds(tx, ty) { continue; }
        let target = grid.get_type(tx, ty);
        if target == EL_EMPTY {
            grid.swap(x, y, tx as u32, ty as u32);
            chunks.mark_dirty(x, y);
            chunks.mark_dirty(tx as u32, ty as u32);
            return true;
        }
    }
    false
}

fn rasterize_body(body: &mut RigidBody, grid: &mut Grid, chunks: &mut ChunkGrid) {
    // Clear and prepare to collect new world coordinates
    body.prev_world_coords.clear();
    
    for pixel in &body.pixels {
        let (x, y) = body.local_to_world(pixel.dx as f32, pixel.dy as f32);
        
        // Always record the world coordinate for this pixel (for accurate clearing later)
        body.prev_world_coords.push((x, y));
        
        if grid.in_bounds(x, y) {
            let ux = x as u32;
            let uy = y as u32;
            
            // If cell contains powder or liquid, try to push it aside instead of deleting
            let existing = grid.get_type(x, y);
            if existing != EL_EMPTY && existing != pixel.element {
                if (existing as usize) < ELEMENT_DATA.len() {
                    let cat = ELEMENT_DATA[existing as usize].category;
                    if cat == CAT_POWDER || cat == CAT_LIQUID {
                        // When falling, do NOT tunnel through soft material—stop drawing here.
                        if body.velocity.y > 0.05 {
                            continue;
                        }
                        // Build displacement candidates based on velocity and pixel offset
                        let mut candidates: [(i32, i32); 8] = [(0, 0); 8];
                        let mut count = 0;
                        
                        let sign_vx = if body.velocity.x > 0.1 { 1 } else if body.velocity.x < -0.1 { -1 } else { 0 };
                        let sign_vy = if body.velocity.y > 0.1 { 1 } else if body.velocity.y < -0.1 { -1 } else { 0 };
                        
                        if sign_vx != 0 || sign_vy != 0 {
                            candidates[count] = (sign_vx, sign_vy); count += 1;
                            if sign_vx != 0 { candidates[count] = (sign_vx, 0); count += 1; }
                            if sign_vy != 0 { candidates[count] = (0, sign_vy); count += 1; }
                            if sign_vx != 0 || sign_vy != 0 {
                                candidates[count] = (sign_vy, -sign_vx); count += 1; // perpendicular
                                candidates[count] = (-sign_vy, sign_vx); count += 1;
                            }
                        }
                        
                        // Outward from body center as fallback
                        let outward_x = (pixel.dx as i32).signum();
                        let outward_y = (pixel.dy as i32).signum();
                        if outward_x != 0 || outward_y != 0 {
                            candidates[count] = (outward_x, outward_y); count += 1;
                            if outward_x != 0 { candidates[count] = (outward_x, 0); count += 1; }
                            if outward_y != 0 { candidates[count] = (0, outward_y); count += 1; }
                        }
                        
                        if !displace_soft_cell(grid, chunks, ux, uy, &candidates[..count]) {
                            // Could not push out soft material; leave it intact and skip placing this pixel
                            continue;
                        }
                    }
                }
            }
            
            // Get element properties
            let props = get_props(pixel.element);
            
            // Generate color with variation
            let color = get_color_with_variation(pixel.element, pixel.color_seed);
            
            // Set particle with rigid flag
            grid.set_particle(
                ux, uy,
                pixel.element,
                color,
                props.lifetime,
                props.default_temp,
            );
            
            // Mark as updated so behaviors don't touch it
            grid.set_updated(ux, uy, true);
            
            chunks.mark_dirty(ux, uy);
        }
    }
}

/// Simple PRNG for splash randomness (no std lib dependency)
fn simple_random(seed: u32) -> f32 {
    let x = seed.wrapping_mul(1103515245).wrapping_add(12345);
    ((x >> 16) & 0x7FFF) as f32 / 32768.0 - 0.5 // Range: -0.5 to 0.5
}

/// Kick a particle - transfer momentum from rigid body to grid particle
/// Creates the "splash" effect when heavy objects hit soft materials
fn kick_particle(
    grid: &mut Grid,
    chunks: &mut ChunkGrid,
    x: i32,
    y: i32,
    body_velocity: Vec2,
    body_pos: Vec2,
    seed: u32,
) {
    if !grid.in_bounds(x, y) { return; }
    
    let ux = x as u32;
    let uy = y as u32;
    
    // Calculate kick direction: away from body center + along body velocity
    let dx = x as f32 - body_pos.x;
    let dy = y as f32 - body_pos.y;
    let dist = (dx * dx + dy * dy).sqrt().max(1.0);
    
    // Normalize direction from body center
    let dir_x = dx / dist;
    let dir_y = dy / dist;
    
    // Random spread for splash effect
    let rand1 = simple_random(seed);
    let rand2 = simple_random(seed.wrapping_mul(7));
    
    // Combine: body velocity transfer + radial push + random spread
    let kick_x = body_velocity.x * KICK_TRANSFER 
               + dir_x * body_velocity.length() * 0.3
               + rand1 * SPLASH_SPREAD;
    let kick_y = body_velocity.y * KICK_TRANSFER 
               + dir_y * body_velocity.length() * 0.3 
               - 1.5  // Slight upward bias for splash
               + rand2 * SPLASH_SPREAD;
    
    // Apply velocity to particle
    grid.add_velocity(ux, uy, kick_x, kick_y);
    chunks.mark_dirty(ux, uy);
}

/// Check if body would collide at new position
/// Now with momentum-based penetration of soft materials!
fn check_collision_advanced(
    new_x: f32,
    new_y: f32,
    body: &RigidBody,
    grid: &mut Grid,
    chunks: &mut ChunkGrid,
    skip_self_overlap: bool,
) -> CollisionResult {
    let mut hit_x = false;
    let mut hit_y = false;
    let mut contact_count = 0u32;
    let mut contact_sum_x = 0.0f32;
    let mut contact_sum_y = 0.0f32;
    let mut normal_sum = Vec2::zero();
    let mut penetrated_count = 0u32;
    
    // Calculate body momentum for penetration check
    let momentum = body.velocity.length() * body.mass;
    let can_penetrate = momentum > PENETRATION_THRESHOLD;
    
    // Seed for random kicks
    let mut kick_seed = (new_x as u32).wrapping_mul(31337).wrapping_add(new_y as u32);
    
    // Temporarily modify position for checking
    let temp_pos = Vec2::new(new_x, new_y);
    
    for pixel in &body.pixels {
        let (sin, cos) = body.angle.sin_cos();
        let dx = pixel.dx as f32;
        let dy = pixel.dy as f32;
        let rx = dx * cos - dy * sin;
        let ry = dx * sin + dy * cos;
        
        let world_x = (temp_pos.x + rx).round() as i32;
        let world_y = (temp_pos.y + ry).round() as i32;
        
        // Old position for axis detection
        let old_wx = (body.pos.x + rx).round() as i32;
        let old_wy = (body.pos.y + ry).round() as i32;
        
        // Check world bounds
        if !grid.in_bounds(world_x, world_y) {
            if world_x != old_wx { hit_x = true; }
            if world_y != old_wy { hit_y = true; }
            
            // Record contact at boundary
            contact_count += 1;
            contact_sum_x += world_x as f32;
            contact_sum_y += world_y as f32;
            normal_sum.x += body.pos.x - world_x as f32;
            normal_sum.y += body.pos.y - world_y as f32;
            continue;
        }
        
        // Check cell content
        let cell_type = grid.get_type(world_x, world_y);
        
        if cell_type != EL_EMPTY {
            let cell_props = &ELEMENT_DATA[cell_type as usize];
            let category = cell_props.category;
            
            // === SOFT MATERIALS: Powder, Liquid, Gas ===
            if category == CAT_POWDER || category == CAT_LIQUID || category == CAT_GAS {
                if can_penetrate {
                    // === BULLDOZER MODE: Penetrate and kick! ===
                    kick_seed = kick_seed.wrapping_mul(1103515245).wrapping_add(12345);
                    kick_particle(grid, chunks, world_x, world_y, body.velocity, body.pos, kick_seed);
                    penetrated_count += 1;
                    
                    // Don't count as hard collision - body continues through
                    continue;
                } else {
                    // Low momentum - treat powder as solid, but liquids/gases pass through
                    if category == CAT_POWDER {
                        // Record contact for torque calculation
                        contact_count += 1;
                        contact_sum_x += world_x as f32;
                        contact_sum_y += world_y as f32;
                        normal_sum.x += body.pos.x - world_x as f32;
                        normal_sum.y += body.pos.y - world_y as f32;
                        
                        if skip_self_overlap && old_wx == world_x && old_wy == world_y {
                            continue;
                        }
                        
                        if world_x != old_wx { hit_x = true; }
                        if world_y != old_wy { hit_y = true; }
                    }
                    // Liquids and gases at low speed - pass through
                    continue;
                }
            }
            
            // === SOLID MATERIALS: Always collide ===
            if category == CAT_SOLID {
                // Skip self-overlap during movement
                if skip_self_overlap && old_wx == world_x && old_wy == world_y {
                    continue;
                }
                
                // Record contact point for torque
                contact_count += 1;
                contact_sum_x += world_x as f32;
                contact_sum_y += world_y as f32;
                
                // Accumulate normal (direction from obstacle to body center)
                normal_sum.x += (body.pos.x - world_x as f32);
                normal_sum.y += (body.pos.y - world_y as f32);
                
                // Determine collision axis
                if world_x != old_wx { hit_x = true; }
                if world_y != old_wy { hit_y = true; }
            }
        }
    }
    
    CollisionResult {
        hit: hit_x || hit_y,
        hit_x,
        hit_y,
        contact_count,
        contact_sum_x,
        contact_sum_y,
        normal_sum,
        penetrated_count,
    }
}

/// Simple collision check (for spawn validation - no momentum transfer)
fn check_collision_simple(new_x: f32, new_y: f32, body: &RigidBody, grid: &Grid) -> bool {
    for pixel in &body.pixels {
        let (sin, cos) = body.angle.sin_cos();
        let dx = pixel.dx as f32;
        let dy = pixel.dy as f32;
        let rx = dx * cos - dy * sin;
        let ry = dx * sin + dy * cos;
        
        let world_x = (new_x + rx).round() as i32;
        let world_y = (new_y + ry).round() as i32;
        
        if !grid.in_bounds(world_x, world_y) {
            return true;
        }
        
        let cell_type = grid.get_type(world_x, world_y);
        if cell_type != EL_EMPTY {
            let props = &ELEMENT_DATA[cell_type as usize];
            if props.category == CAT_SOLID || props.category == CAT_POWDER {
                return true;
            }
        }
    }
    false
}

/// Manages all rigid bodies in the simulation
pub struct RigidBodySystem {
    /// All rigid bodies
    bodies: Vec<RigidBody>,
    /// Gravity (pixels per frame squared)
    gravity: f32,
    /// Next body ID
    next_id: u32,
    /// Friction for sliding (0-1)
    friction: f32,
}

impl RigidBodySystem {
    pub fn new() -> Self {
        Self {
            bodies: Vec::new(),
            gravity: 0.5, // Match physics.rs GRAVITY constant
            next_id: 1,
            friction: 0.8,
        }
    }
    
    /// Set gravity (can be negative for inverted gravity)
    pub fn set_gravity(&mut self, g: f32) {
        self.gravity = g;
    }
    
    /// Add a new rigid body. Returns 0 if placement collides with existing solids.
    pub fn add_body(&mut self, mut body: RigidBody, grid: &mut Grid, chunks: &mut ChunkGrid) -> u32 {
        // Reject spawn if it intersects existing solids/powders/rigid bodies
        if check_collision_simple(body.pos.x, body.pos.y, &body, grid) {
            return 0;
        }
        
        let id = self.next_id;
        body.id = id;
        self.next_id += 1;
        
        // Draw immediately so new body is visible and blocks future spawns this frame
        rasterize_body(&mut body, grid, chunks);
        body.prev_pos = body.pos;
        body.prev_angle = body.angle;
        
        self.bodies.push(body);
        id
    }
    
    /// Remove a rigid body by ID
    pub fn remove_body(&mut self, id: u32) {
        self.bodies.retain(|b| b.id != id);
    }
    
    /// Get body count
    pub fn body_count(&self) -> usize {
        self.bodies.len()
    }
    
    /// Main update loop - call BEFORE particle simulation
    /// Now with Torque, Bounce, and Momentum Transfer!
    pub fn update(&mut self, grid: &mut Grid, chunks: &mut ChunkGrid, gravity_y: f32) {
        // Update gravity from world
        self.gravity = gravity_y.abs() * 0.5;
        let gravity_sign = if gravity_y >= 0.0 { 1.0 } else { -1.0 };
        
        // Process each body sequentially
        for body in &mut self.bodies {
            if !body.active { continue; }
            
            // === PHASE 1: ERASE from previous position ===
            clear_body_from_grid(body, grid, chunks);
            body.save_prev_state();
            
            // === PHASE 2: APPLY FORCES ===
            // Gravity
            body.velocity.y += self.gravity * gravity_sign;
            
            // Clamp velocity
            body.velocity.x = body.velocity.x.clamp(-10.0, 10.0);
            body.velocity.y = body.velocity.y.clamp(-10.0, 10.0);
            
            // Predict next position
            let next_x = body.pos.x + body.velocity.x;
            let next_y = body.pos.y + body.velocity.y;
            
            // === PHASE 3: COLLISION DETECTION with Momentum Transfer ===
            let collision = check_collision_advanced(next_x, next_y, body, grid, chunks, true);
            
            // Slow down body if it penetrated soft materials (drag effect)
            if collision.penetrated_count > 0 {
                let drag = 0.95_f32.powi(collision.penetrated_count as i32);
                body.velocity = body.velocity * drag;
            }
            
            if collision.hit {
                // === PHASE 4: TORQUE from asymmetric contact ===
                if collision.contact_count > 0 {
                    // Calculate contact center
                    let contact_x = collision.contact_sum_x / collision.contact_count as f32;
                    let contact_y = collision.contact_sum_y / collision.contact_count as f32;
                    
                    // Vector from body center to contact center ("arm")
                    let arm_x = contact_x - body.pos.x;
                    let _arm_y = contact_y - body.pos.y;
                    
                    // Reaction force (opposite to gravity when resting on ground)
                    // Simplified: use velocity magnitude as proxy for impact force
                    let impact_force = body.velocity.length() * body.mass * 0.1;
                    
                    // 2D cross product: torque = arm × force
                    // If contact is to the LEFT of center (arm_x < 0) and force pushes UP,
                    // torque is positive (counter-clockwise)
                    let torque = arm_x * impact_force * gravity_sign;
                    
                    // Apply torque
                    body.angular_vel += torque / body.moment_of_inertia;
                }
                
                // === PHASE 5: BOUNCE - Reflect velocity off collision normal ===
                if collision.normal_sum.length_squared() > 0.01 {
                    let normal = collision.normal_sum.normalize();
                    
                    // Only bounce if we have significant velocity
                    if body.velocity.length_squared() > 2.0 {
                        // Vector reflection: V' = V - 2(V·N)N
                        let dot = body.velocity.dot(normal);
                        
                        // Only reflect if moving INTO the surface (dot < 0 means moving away)
                        if dot < 0.0 {
                            let bounce_vel = Vec2::new(
                                body.velocity.x - 2.0 * dot * normal.x,
                                body.velocity.y - 2.0 * dot * normal.y,
                            );
                            
                            // Apply restitution (bounciness)
                            body.velocity = bounce_vel * body.restitution;
                            
                            // Add spin from glancing collision
                            body.angular_vel += dot * 0.02;
                        }
                    } else {
                        // Low velocity - come to rest
                        body.velocity = Vec2::zero();
                    }
                }
                
                // === Resolve position: try axis-separated movement ===
                if collision.hit_y && !collision.hit_x {
                    // Can still move horizontally
                    body.velocity.x *= self.friction;
                    let next_x_only = body.pos.x + body.velocity.x;
                    if !check_collision_simple(next_x_only, body.pos.y, body, grid) {
                        body.pos.x = next_x_only;
                    }
                } else if collision.hit_x && !collision.hit_y {
                    // Can still move vertically
                    let next_y_only = body.pos.y + body.velocity.y;
                    if !check_collision_simple(body.pos.x, next_y_only, body, grid) {
                        body.pos.y = next_y_only;
                    }
                }
                // If both axes blocked - body stays in place
                
                // Rest threshold
                if body.velocity.length_squared() < REST_THRESHOLD * REST_THRESHOLD {
                    body.velocity = Vec2::zero();
                }
            } else {
                // === No collision - move freely ===
                body.pos.x = next_x;
                body.pos.y = next_y;
            }
            
            // === PHASE 6: ROTATION ===
            // Clamp angular velocity to prevent crazy spinning
            body.angular_vel = body.angular_vel.clamp(-MAX_ANGULAR_VEL, MAX_ANGULAR_VEL);
            
            body.angle += body.angular_vel;
            body.angular_vel *= ANGULAR_DAMPING;
            
            // Angular rest threshold - stop small oscillations
            if body.angular_vel.abs() < ANGULAR_REST_THRESHOLD {
                body.angular_vel = 0.0;
            }
            
            // Keep angle in reasonable range to avoid float precision issues
            if body.angle.abs() > std::f32::consts::TAU {
                body.angle = body.angle % std::f32::consts::TAU;
            }
            
            // === PHASE 7: RASTERIZE at new position ===
            rasterize_body(body, grid, chunks);
            
            // Update prev state for next frame
            body.prev_pos = body.pos;
            body.prev_angle = body.angle;
        }
    }
}

impl Default for RigidBodySystem {
    fn default() -> Self {
        Self::new()
    }
}
