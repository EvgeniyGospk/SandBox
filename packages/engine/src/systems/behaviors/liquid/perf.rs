use std::cell::RefCell;

thread_local! {
    pub(super) static PERF_LIQUID_SCANS: RefCell<u64> = RefCell::new(0);
}

pub fn reset_liquid_scan_counter() {
    PERF_LIQUID_SCANS.with(|c| *c.borrow_mut() = 0);
}

pub fn take_liquid_scan_counter() -> u64 {
    PERF_LIQUID_SCANS.with(|c| {
        let val = *c.borrow();
        *c.borrow_mut() = 0;
        val
    })
}

#[inline]
pub(super) fn inc_liquid_scans() {
    PERF_LIQUID_SCANS.with(|c| {
        let mut v = c.borrow_mut();
        *v = v.saturating_add(1);
    });
}
