use std::cell::RefCell;

thread_local! {
    pub static PERF_RAYCAST_STEPS: RefCell<u64> = RefCell::new(0);
    pub static PERF_RAYCAST_COLLISIONS: RefCell<u64> = RefCell::new(0);
}

pub fn reset_physics_perf_counters() {
    PERF_RAYCAST_STEPS.with(|c| *c.borrow_mut() = 0);
    PERF_RAYCAST_COLLISIONS.with(|c| *c.borrow_mut() = 0);
}

pub fn take_physics_perf_counters() -> (u64, u64) {
    let steps = PERF_RAYCAST_STEPS.with(|c| {
        let v = *c.borrow();
        *c.borrow_mut() = 0;
        v
    });
    let collisions = PERF_RAYCAST_COLLISIONS.with(|c| {
        let v = *c.borrow();
        *c.borrow_mut() = 0;
        v
    });
    (steps, collisions)
}
