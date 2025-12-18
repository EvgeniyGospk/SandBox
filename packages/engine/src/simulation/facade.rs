use wasm_bindgen::prelude::*;

use super::perf_stats::PerfStats;
use super::WorldCore;

#[wasm_bindgen]
pub struct AbiLayout {
    types_ptr: u32,
    types_len_elements: u32,
    types_len_bytes: u32,
    colors_ptr: u32,
    colors_len_elements: u32,
    colors_len_bytes: u32,
    temperature_ptr: u32,
    temperature_len_elements: u32,
    temperature_len_bytes: u32,
    chunk_transfer_ptr: u32,
    chunk_transfer_len_elements: u32,
    chunk_transfer_len_bytes: u32,
    dirty_list_ptr: u32,
    dirty_list_len_elements: u32,
    dirty_list_len_bytes: u32,
    rect_transfer_ptr: u32,
    rect_transfer_len_elements: u32,
    rect_transfer_len_bytes: u32,
}

#[wasm_bindgen]
impl AbiLayout {
    #[wasm_bindgen(getter)]
    pub fn types_ptr(&self) -> u32 { self.types_ptr }
    #[wasm_bindgen(getter)]
    pub fn types_len_elements(&self) -> u32 { self.types_len_elements }
    #[wasm_bindgen(getter)]
    pub fn types_len_bytes(&self) -> u32 { self.types_len_bytes }

    #[wasm_bindgen(getter)]
    pub fn colors_ptr(&self) -> u32 { self.colors_ptr }
    #[wasm_bindgen(getter)]
    pub fn colors_len_elements(&self) -> u32 { self.colors_len_elements }
    #[wasm_bindgen(getter)]
    pub fn colors_len_bytes(&self) -> u32 { self.colors_len_bytes }

    #[wasm_bindgen(getter)]
    pub fn temperature_ptr(&self) -> u32 { self.temperature_ptr }
    #[wasm_bindgen(getter)]
    pub fn temperature_len_elements(&self) -> u32 { self.temperature_len_elements }
    #[wasm_bindgen(getter)]
    pub fn temperature_len_bytes(&self) -> u32 { self.temperature_len_bytes }

    #[wasm_bindgen(getter)]
    pub fn chunk_transfer_ptr(&self) -> u32 { self.chunk_transfer_ptr }
    #[wasm_bindgen(getter)]
    pub fn chunk_transfer_len_elements(&self) -> u32 { self.chunk_transfer_len_elements }
    #[wasm_bindgen(getter)]
    pub fn chunk_transfer_len_bytes(&self) -> u32 { self.chunk_transfer_len_bytes }

    #[wasm_bindgen(getter)]
    pub fn dirty_list_ptr(&self) -> u32 { self.dirty_list_ptr }
    #[wasm_bindgen(getter)]
    pub fn dirty_list_len_elements(&self) -> u32 { self.dirty_list_len_elements }
    #[wasm_bindgen(getter)]
    pub fn dirty_list_len_bytes(&self) -> u32 { self.dirty_list_len_bytes }

    #[wasm_bindgen(getter)]
    pub fn rect_transfer_ptr(&self) -> u32 { self.rect_transfer_ptr }
    #[wasm_bindgen(getter)]
    pub fn rect_transfer_len_elements(&self) -> u32 { self.rect_transfer_len_elements }
    #[wasm_bindgen(getter)]
    pub fn rect_transfer_len_bytes(&self) -> u32 { self.rect_transfer_len_bytes }
}

#[wasm_bindgen]
pub struct World {
    core: WorldCore,
}

#[wasm_bindgen]
impl World {
    /// Create a new world with given dimensions
    #[wasm_bindgen(constructor)]
    pub fn new(width: u32, height: u32) -> Self {
        Self {
            core: WorldCore::new(width, height),
        }
    }

    #[wasm_bindgen(js_name = newWithMoveBufferCapacity)]
    pub fn new_with_move_buffer_capacity(width: u32, height: u32, move_buffer_capacity: usize) -> Self {
        Self {
            core: WorldCore::new_with_move_buffer_capacity(width, height, move_buffer_capacity),
        }
    }

    #[wasm_bindgen(getter)]
    pub fn width(&self) -> u32 { self.core.width() }

    #[wasm_bindgen(getter)]
    pub fn height(&self) -> u32 { self.core.height() }

    #[wasm_bindgen(getter)]
    pub fn particle_count(&self) -> u32 { self.core.particle_count() }

    #[wasm_bindgen(getter)]
    pub fn frame(&self) -> u64 { self.core.frame() }

    /// Enable or disable per-step perf metrics (adds timing overhead when enabled)
    pub fn enable_perf_metrics(&mut self, enabled: bool) {
        self.core.enable_perf_metrics(enabled);
    }

    /// Get last step perf snapshot (zeros when perf disabled)
    pub fn get_perf_stats(&self) -> PerfStats {
        self.core.get_perf_stats()
    }

    pub fn set_gravity(&mut self, x: f32, y: f32) {
        self.core.set_gravity(x, y);
    }

    pub fn set_ambient_temperature(&mut self, temp: f32) {
        self.core.set_ambient_temperature(temp);
    }

    /// DEBUG: Get current ambient temperature
    pub fn get_ambient_temperature(&self) -> f32 {
        self.core.get_ambient_temperature()
    }

    /// Enable/disable empty-chunk sleeping (perf/debug toggle).
    pub fn set_chunk_sleeping_enabled(&mut self, enabled: bool) {
        self.core.set_chunk_sleeping_enabled(enabled);
    }

    /// Add a particle at position
    pub fn add_particle(&mut self, x: u32, y: u32, element: u8) -> bool {
        self.core.add_particle(x, y, element)
    }

    /// Add particles in radius (brush)
    pub fn add_particles_in_radius(&mut self, cx: i32, cy: i32, radius: i32, element: u8) {
        self.core.add_particles_in_radius(cx, cy, radius, element)
    }

    /// Remove particle at position
    pub fn remove_particle(&mut self, x: u32, y: u32) -> bool {
        self.core.remove_particle(x, y)
    }

    /// Remove particles in radius
    pub fn remove_particles_in_radius(&mut self, cx: i32, cy: i32, radius: i32) {
        self.core.remove_particles_in_radius(cx, cy, radius)
    }

    /// Clear all particles
    pub fn clear(&mut self) {
        self.core.clear();
    }

    pub fn load_content_bundle(&mut self, json: String) -> Result<(), JsValue> {
        self.core
            .load_content_bundle_json(&json)
            .map_err(|e| JsValue::from_str(&e))?;
        Ok(())
    }

    pub fn get_content_manifest_json(&self) -> String {
        self.core.get_content_manifest_json()
    }

    // === RIGID BODY API ===

    /// Spawn a rectangular rigid body at position (x, y) with size (w, h)
    /// Returns the body ID
    pub fn spawn_rigid_body(&mut self, x: f32, y: f32, w: i32, h: i32, element_id: u8) -> u32 {
        self.core.spawn_rigid_body(x, y, w, h, element_id)
    }

    /// Spawn a circular rigid body at position (x, y) with given radius
    /// Returns the body ID
    pub fn spawn_rigid_circle(&mut self, x: f32, y: f32, radius: i32, element_id: u8) -> u32 {
        self.core.spawn_rigid_circle(x, y, radius, element_id)
    }

    /// Remove a rigid body by ID
    pub fn remove_rigid_body(&mut self, id: u32) {
        self.core.remove_rigid_body(id);
    }

    /// Get number of active rigid bodies
    pub fn rigid_body_count(&self) -> usize {
        self.core.rigid_body_count()
    }

    /// Step the simulation forward
    /// Phase 4: Only process active chunks!
    /// Phase 2: Newtonian physics with velocity
    pub fn step(&mut self) {
        self.core.step();
    }

    /// Get active chunk count (for debugging/stats)
    pub fn active_chunks(&self) -> usize {
        self.core.active_chunks()
    }

    /// Get total chunk count
    pub fn total_chunks(&self) -> usize {
        self.core.total_chunks()
    }

    /// Get pointer to types array (for JS rendering)
    pub fn types_ptr(&self) -> *const u8 {
        self.core.types_ptr()
    }

    /// Get pointer to colors array (for JS rendering)
    pub fn colors_ptr(&self) -> *const u32 {
        self.core.colors_ptr()
    }

    /// Get grid size for types
    pub fn types_len(&self) -> usize {
        self.core.types_len()
    }

    pub fn types_len_elements(&self) -> usize {
        self.core.types_len()
    }

    pub fn types_len_bytes(&self) -> usize {
        self.core.types_byte_len()
    }

    /// Get grid size for colors
    pub fn colors_len(&self) -> usize {
        self.core.colors_len()
    }

    pub fn colors_len_elements(&self) -> usize {
        self.core.colors_len_elements()
    }

    pub fn colors_len_bytes(&self) -> usize {
        self.core.colors_len_bytes()
    }

    pub fn colors_elements_len(&self) -> usize {
        self.core.colors_elements_len()
    }

    pub fn types_byte_len(&self) -> usize {
        self.core.types_byte_len()
    }

    pub fn colors_byte_len(&self) -> usize {
        self.core.colors_byte_len()
    }

    pub fn temperature_byte_len(&self) -> usize {
        self.core.temperature_byte_len()
    }

    /// Get pointer to temperature array (for JS thermal rendering)
    pub fn temperature_ptr(&self) -> *const f32 {
        self.core.temperature_ptr()
    }

    /// Get temperature array length
    pub fn temperature_len(&self) -> usize {
        self.core.temperature_len()
    }

    pub fn temperature_len_elements(&self) -> usize {
        self.core.temperature_len()
    }

    pub fn temperature_len_bytes(&self) -> usize {
        self.core.temperature_byte_len()
    }

    pub fn move_buffer_capacity(&self) -> usize {
        self.core.move_buffer_capacity()
    }

    pub fn move_buffer_count(&self) -> usize {
        self.core.move_buffer_count()
    }

    pub fn move_buffer_overflow_count(&self) -> usize {
        self.core.move_buffer_overflow_count()
    }

    // === PHASE 3: SMART RENDERING API ===

    /// Collect list of dirty chunks that need rendering
    /// Uses visual_dirty (separate from physics dirty) to avoid state desync
    pub fn collect_dirty_chunks(&mut self) -> usize {
        self.core.collect_dirty_chunks()
    }

    /// Get pointer to dirty chunk list
    pub fn get_dirty_list_ptr(&self) -> *const u32 {
        self.core.get_dirty_list_ptr()
    }

    /// Extract pixels from a chunk into transfer buffer (strided -> linear)
    /// Returns pointer to the transfer buffer
    pub fn extract_chunk_pixels(&mut self, chunk_idx: u32) -> *const u32 {
        self.core.extract_chunk_pixels(chunk_idx)
    }

    /// Get chunk transfer buffer size (32*32 = 1024 pixels * 4 bytes = 4096 bytes)
    pub fn chunk_buffer_byte_size(&self) -> usize {
        self.core.chunk_buffer_byte_size()
    }

    /// Get chunks X count (for JS coordinate calculation)
    pub fn chunks_x(&self) -> u32 {
        self.core.chunks_x()
    }

    /// Get chunks Y count
    pub fn chunks_y(&self) -> u32 {
        self.core.chunks_y()
    }

    // === PHASE 2: MERGED DIRTY RECTANGLES API ===

    /// Collect dirty chunks and merge into rectangles for GPU batching
    /// Returns number of merged rectangles
    /// 
    /// Call get_merged_rect_* functions to get each rectangle's properties
    pub fn collect_merged_rects(&mut self) -> usize {
        self.core.collect_merged_rects()
    }

    /// DEBUG: Count dirty chunks WITHOUT clearing (for logging)
    pub fn count_dirty_chunks(&self) -> usize {
        self.core.count_dirty_chunks()
    }

    /// Get merged rect X (in pixels)
    pub fn get_merged_rect_x(&self, idx: usize) -> u32 {
        self.core.get_merged_rect_x(idx)
    }

    /// Get merged rect Y (in pixels)
    pub fn get_merged_rect_y(&self, idx: usize) -> u32 {
        self.core.get_merged_rect_y(idx)
    }

    /// Get merged rect Width (in pixels)
    pub fn get_merged_rect_w(&self, idx: usize) -> u32 {
        self.core.get_merged_rect_w(idx)
    }

    /// Get merged rect Height (in pixels)
    pub fn get_merged_rect_h(&self, idx: usize) -> u32 {
        self.core.get_merged_rect_h(idx)
    }

    /// Extract pixels for a merged rectangle into transfer buffer
    /// Returns pointer to the buffer
    /// 
    /// The buffer is laid out as row-major: width * height pixels
    pub fn extract_rect_pixels(&mut self, idx: usize) -> *const u32 {
        self.core.extract_rect_pixels(idx)
    }

    /// Get the size of the rect transfer buffer in bytes
    pub fn rect_buffer_size(&self) -> usize {
        self.core.rect_buffer_size()
    }

    pub fn abi_layout(&self) -> AbiLayout {
        let data = self.core.abi_layout_data();
        AbiLayout {
            types_ptr: data.types_ptr as u32,
            types_len_elements: data.types_len_elements as u32,
            types_len_bytes: data.types_len_bytes as u32,
            colors_ptr: data.colors_ptr as u32,
            colors_len_elements: data.colors_len_elements as u32,
            colors_len_bytes: data.colors_len_bytes as u32,
            temperature_ptr: data.temperature_ptr as u32,
            temperature_len_elements: data.temperature_len_elements as u32,
            temperature_len_bytes: data.temperature_len_bytes as u32,
            chunk_transfer_ptr: data.chunk_transfer_ptr as u32,
            chunk_transfer_len_elements: data.chunk_transfer_len_elements as u32,
            chunk_transfer_len_bytes: data.chunk_transfer_len_bytes as u32,
            dirty_list_ptr: data.dirty_list_ptr as u32,
            dirty_list_len_elements: data.dirty_list_len_elements as u32,
            dirty_list_len_bytes: data.dirty_list_len_bytes as u32,
            rect_transfer_ptr: data.rect_transfer_ptr as u32,
            rect_transfer_len_elements: data.rect_transfer_len_elements as u32,
            rect_transfer_len_bytes: data.rect_transfer_len_bytes as u32,
        }
    }
}
