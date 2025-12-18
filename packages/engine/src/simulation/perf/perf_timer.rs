#[cfg(target_arch = "wasm32")]
use wasm_bindgen::prelude::*;

#[cfg(target_arch = "wasm32")]
#[wasm_bindgen]
extern "C" {
    #[wasm_bindgen(js_namespace = performance, js_name = now)]
    fn performance_now() -> f64;
}

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
            PerfTimer { start_ms: performance_now() }
        }
        #[cfg(not(target_arch = "wasm32"))]
        {
            PerfTimer { start: std::time::Instant::now() }
        }
    }

    pub(crate) fn elapsed_ms(&self) -> f64 {
        #[cfg(target_arch = "wasm32")]
        {
            performance_now() - self.start_ms
        }
        #[cfg(not(target_arch = "wasm32"))]
        {
            self.start.elapsed().as_secs_f64() * 1000.0
        }
    }
}
