#!/bin/bash
# Build WASM with parallel support (requires nightly)

set -e

cd "$(dirname "$0")"

echo "🦀 Building with Rust Nightly + Rayon parallel support..."

# Build with nightly, atomics, and build-std
RUSTFLAGS="-C target-feature=+simd128,+atomics,+bulk-memory" \
PATH="$HOME/.cargo/bin:$PATH" cargo +nightly build \
  --lib \
  --release \
  --target wasm32-unknown-unknown \
  -Z build-std=panic_abort,std

# Generate JS bindings
echo "📦 Generating JS bindings..."
PATH="$HOME/.cargo/bin:$PATH" wasm-bindgen \
  target/wasm32-unknown-unknown/release/particula_engine.wasm \
  --out-dir ../engine-wasm \
  --target web \
  --out-name particula_engine

# Optional: optimize with wasm-opt if available
if command -v wasm-opt &> /dev/null; then
  echo "🔧 Optimizing WASM..."
  wasm-opt -O3 --enable-simd --enable-threads --enable-bulk-memory \
    ../engine-wasm/particula_engine_bg.wasm \
    -o ../engine-wasm/particula_engine_bg.wasm
fi

echo "✅ Build complete! WASM with parallel support ready."
