#[cfg(target_arch = "wasm32")]
use js_sys;

#[derive(Clone, Copy)]
pub(crate) struct PerfTimer {
    #[cfg(target_arch = "wasm32")]
    start_ms: f64,
    #[cfg(not(target_arch = "wasm32"))]
    start: std::time::Instant,
}

impl PerfTimer {
    pub(crate) fn start() -> Self {
        #[cfg(target_arch = "wasm32")]
        {
            PerfTimer { start_ms: js_sys::Date::now() }
        }
        #[cfg(not(target_arch = "wasm32"))]
        {
            PerfTimer { start: std::time::Instant::now() }
        }
    }

    pub(crate) fn elapsed_ms(&self) -> f64 {
        #[cfg(target_arch = "wasm32")]
        {
            js_sys::Date::now() - self.start_ms
        }
        #[cfg(not(target_arch = "wasm32"))]
        {
            self.start.elapsed().as_secs_f64() * 1000.0
        }
    }
}
