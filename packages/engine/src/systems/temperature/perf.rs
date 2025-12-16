use std::cell::RefCell;

thread_local! {
    pub static PERF_PHASE_CHANGES: RefCell<u64> = RefCell::new(0);
}

pub fn reset_phase_change_counter() {
    PERF_PHASE_CHANGES.with(|c| *c.borrow_mut() = 0);
}

pub fn take_phase_change_counter() -> u64 {
    PERF_PHASE_CHANGES.with(|c| {
        let val = *c.borrow();
        *c.borrow_mut() = 0;
        val
    })
}
