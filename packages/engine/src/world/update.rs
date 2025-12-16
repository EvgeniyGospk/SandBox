use crate::behaviors::UpdateContext;
use crate::elements::{
    CAT_BIO, CAT_ENERGY, CAT_GAS, CAT_LIQUID, CAT_POWDER, CAT_SOLID, CAT_UTILITY, ELEMENT_COUNT,
    ELEMENT_DATA, EL_EMPTY,
};

use super::{PerfTimer, WorldCore};

pub(super) fn update_particle_chunked(world: &mut WorldCore, x: u32, y: u32) -> bool {
    unsafe {
        let element = world.grid.get_type_unchecked(x, y);
        if element == EL_EMPTY {
            return false;
        }

        if (element as usize) >= ELEMENT_COUNT {
            world.grid.clear_cell_unchecked(x, y);
            return false;
        }

        let idx = world.grid.index_unchecked(x, y);

        if world.grid.is_updated_unchecked(idx) {
            return false;
        }

        world.grid.set_updated_unchecked(idx, true);

        let life = world.grid.get_life_unchecked(idx);
        if life > 0 {
            world.grid.set_life_unchecked(idx, life - 1);
            if life - 1 == 0 {
                world.grid.clear_cell_unchecked(x, y);
                world.chunks.remove_particle(x, y);
                if world.particle_count > 0 {
                    world.particle_count -= 1;
                }
                return true;
            }
        }

        let category = ELEMENT_DATA[element as usize].category;

        if category == CAT_SOLID {
            return false;
        }

        let old_type = element;

        let mut ctx = UpdateContext {
            grid: &mut world.grid,
            chunks: &mut world.chunks,
            world_particle_count: &mut world.particle_count,
            x,
            y,
            frame: world.frame,
            gravity_x: world.gravity_x,
            gravity_y: world.gravity_y,
            ambient_temp: world.ambient_temperature,
            rng: &mut world.rng_state,
        };

        if world.perf_enabled {
            let t_beh = PerfTimer::start();
            world.behaviors.update(category, &mut ctx);
            let dur = t_beh.elapsed_ms();
            world.perf_stats.behavior_calls = world.perf_stats.behavior_calls.saturating_add(1);
            match category {
                CAT_POWDER => {
                    world.perf_stats.behavior_powder = world.perf_stats.behavior_powder.saturating_add(1);
                    world.perf_stats.powder_ms += dur;
                }
                CAT_LIQUID => {
                    world.perf_stats.behavior_liquid = world.perf_stats.behavior_liquid.saturating_add(1);
                    world.perf_stats.liquid_ms += dur;
                }
                CAT_GAS => {
                    world.perf_stats.behavior_gas = world.perf_stats.behavior_gas.saturating_add(1);
                    world.perf_stats.gas_ms += dur;
                }
                CAT_ENERGY => {
                    world.perf_stats.behavior_energy = world.perf_stats.behavior_energy.saturating_add(1);
                    world.perf_stats.energy_ms += dur;
                }
                CAT_UTILITY => {
                    world.perf_stats.behavior_utility = world.perf_stats.behavior_utility.saturating_add(1);
                    world.perf_stats.utility_ms += dur;
                }
                CAT_BIO => {
                    world.perf_stats.behavior_bio = world.perf_stats.behavior_bio.saturating_add(1);
                    world.perf_stats.bio_ms += dur;
                }
                _ => {}
            }
        } else {
            world.behaviors.update(category, &mut ctx);
        }

        drop(ctx);

        let new_type = world.grid.get_type_unchecked(x, y);
        let moved = new_type != old_type || new_type == EL_EMPTY;

        if moved {
            world.chunks.wake_neighbors(x, y);
        }

        let current_type = world.grid.get_type_unchecked(x, y);
        if current_type != EL_EMPTY {
            world.process_reactions(x, y, current_type);
        }

        moved
    }
}
