// ============================================================================
// PHASE 3: SIMD-OPTIMIZED TEMPERATURE PROCESSING
// ============================================================================
// 
// WASM SIMD128 provides 128-bit vectors:
// - f32x4: 4 float32 values processed in ONE instruction
// - Speedup: 2-4x for bulk temperature operations
// 
// Usage: Call update_air_temperature_simd for rows of empty cells

#[cfg(target_arch = "wasm32")]
use std::arch::wasm32::*;

/// SIMD: Update air temperature for 4 cells at once
/// All 4 cells lerp towards ambient temperature
/// 
/// # Safety
/// - `temps_ptr` must be aligned to 16 bytes and valid for `count` f32s
/// - `count` must be divisible by 4
#[cfg(target_arch = "wasm32")]
#[inline]
pub unsafe fn update_air_temperature_simd(
    temps_ptr: *mut f32,
    count: usize,
    ambient_temp: f32,
    lerp_speed: f32,
) {
    // Broadcast constants to all 4 lanes
    let v_ambient = f32x4_splat(ambient_temp);
    let v_lerp = f32x4_splat(lerp_speed);
    let v_one_minus_lerp = f32x4_splat(1.0 - lerp_speed);

    let mut i = 0;
    while i + 4 <= count {
        let ptr = temps_ptr.add(i);

        // Load 4 temperatures
        let v_current = v128_load(ptr as *const v128);

        // new_temp = current * (1 - lerp) + ambient * lerp
        // This is equivalent to: current + (ambient - current) * lerp
        let v_scaled_current = f32x4_mul(v_current, v_one_minus_lerp);
        let v_scaled_ambient = f32x4_mul(v_ambient, v_lerp);
        let v_new = f32x4_add(v_scaled_current, v_scaled_ambient);

        // Store back
        v128_store(ptr as *mut v128, v_new);

        i += 4;
    }

    // Handle remainder (0-3 cells) with scalar code
    while i < count {
        let ptr = temps_ptr.add(i);
        let current = *ptr;
        *ptr = current + (ambient_temp - current) * lerp_speed;
        i += 1;
    }
}

/// SIMD: Batch process diffusion between cell and its right neighbor
/// Processes 4 pairs at once: (i, i+1), (i+2, i+3), (i+4, i+5), (i+6, i+7)
/// 
/// # Safety
/// - `temps_ptr` must be valid for at least `count + 1` f32s
/// - `count` must be divisible by 4
#[cfg(target_arch = "wasm32")]
#[inline]
pub unsafe fn diffuse_horizontal_simd(
    temps_ptr: *mut f32,
    count: usize,
    transfer_rate: f32,
) {
    let v_rate = f32x4_splat(transfer_rate);
    let v_threshold = f32x4_splat(0.5);

    // Process in steps of 4, comparing each cell with its right neighbor
    let mut i = 0;
    while i + 4 < count {
        let ptr = temps_ptr.add(i);

        // Load current 4 temps and next 4 temps (shifted by 1)
        let v_current = v128_load(ptr as *const v128);
        let v_next = v128_load(ptr.add(1) as *const v128);

        // diff = next - current
        let v_diff = f32x4_sub(v_next, v_current);
        let v_abs_diff = f32x4_abs(v_diff);

        // Only transfer if |diff| > threshold (create mask)
        let v_mask = f32x4_gt(v_abs_diff, v_threshold);

        // change = diff * rate (only where mask is true)
        let v_change = f32x4_mul(v_diff, v_rate);
        let v_masked_change = v128_and(v_change, v_mask);

        // Apply: current += change, next -= change
        let v_new_current = f32x4_add(v_current, v_masked_change);
        let v_new_next = f32x4_sub(v_next, v_masked_change);

        v128_store(ptr as *mut v128, v_new_current);
        v128_store(ptr.add(1) as *mut v128, v_new_next);

        i += 4;
    }
}

/// Process a full row of temperatures with SIMD (air cells only)
/// Fallback for non-WASM targets
#[cfg(not(target_arch = "wasm32"))]
pub unsafe fn update_air_temperature_simd(
    temps_ptr: *mut f32,
    count: usize,
    ambient_temp: f32,
    lerp_speed: f32,
) {
    for i in 0..count {
        let ptr = temps_ptr.add(i);
        let current = *ptr;
        *ptr = current + (ambient_temp - current) * lerp_speed;
    }
}

#[cfg(not(target_arch = "wasm32"))]
pub unsafe fn diffuse_horizontal_simd(
    _temps_ptr: *mut f32,
    _count: usize,
    _transfer_rate: f32,
) {
    // No-op on non-WASM, use scalar path
}
