//! Zero-Cost Safety Macros
//! 
//! Phase 4: "Roll Cage" - Debug checks in dev, raw speed in prod
//! 
//! In Debug mode: Normal bounds-checked access (panics with useful errors)
//! In Release mode: Unsafe unchecked access (zero overhead)
//! 
//! Usage:
//! ```rust
//! use particula_engine::fast;
//! 
//! let idx = 2;
//! 
//! let arr = vec![1, 2, 3, 4, 5];
//! // Read: fast!(slice, [index])
//! let val = *fast!(arr, [idx]);
//! assert_eq!(val, 3);
//! 
//! let mut life = vec![0u8; 5];
//! // Write: fast!(slice, [index] = value)
//! fast!(life, [idx] = 100);
//! assert_eq!(life[idx], 100);
//! ```

/// Zero-cost bounds checking macro
/// 
/// - Debug: Uses normal indexing with bounds checks
/// - Release: Uses get_unchecked/get_unchecked_mut
/// 
/// This gives you the best of both worlds:
/// - Safe development with clear panic messages
/// - Maximum performance in production
#[macro_export]
macro_rules! fast {
    // Read pattern: fast!(slice, [index])
    ($slice:expr, [$index:expr]) => {{
        #[cfg(debug_assertions)]
        {
            // Debug: Normal access with bounds check
            &$slice[$index]
        }
        #[cfg(not(debug_assertions))]
        {
            // Release: Unsafe unchecked access
            unsafe { $slice.get_unchecked($index) }
        }
    }};
    
    // Write pattern: fast!(slice, [index] = value)
    ($slice:expr, [$index:expr] = $val:expr) => {{
        #[cfg(debug_assertions)]
        {
            // Debug: Normal access with bounds check
            $slice[$index] = $val;
        }
        #[cfg(not(debug_assertions))]
        {
            // Release: Unsafe unchecked access
            unsafe { *$slice.get_unchecked_mut($index) = $val; }
        }
    }};
}

/// Unsafe block wrapper for explicit "I know what I'm doing" sections
/// In debug mode, adds extra logging before the unsafe operation
#[macro_export]
macro_rules! unsafe_fast {
    ($($code:tt)*) => {{
        #[cfg(debug_assertions)]
        {
            // In debug, still run the unsafe code but could add logging here
            unsafe { $($code)* }
        }
        #[cfg(not(debug_assertions))]
        {
            unsafe { $($code)* }
        }
    }};
}

#[cfg(test)]
mod tests {
    #[test]
    fn test_fast_read() {
        let arr = vec![1, 2, 3, 4, 5];
        let val = *fast!(arr, [2]);
        assert_eq!(val, 3);
    }
    
    #[test]
    fn test_fast_write() {
        let mut arr = vec![1, 2, 3, 4, 5];
        fast!(arr, [2] = 100);
        assert_eq!(arr[2], 100);
    }
    
    #[test]
    #[should_panic]
    #[cfg(debug_assertions)]
    fn test_fast_bounds_check_debug() {
        let arr = vec![1, 2, 3];
        let _ = *fast!(arr, [10]); // Should panic in debug
    }
}
