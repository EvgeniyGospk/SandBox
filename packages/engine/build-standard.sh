#!/bin/bash
# Build WASM without parallel (works in Node.js for benchmarks)

set -e

cd "$(dirname "$0")"

echo "🦀 Building standard WASM (no parallel, works in Node.js)..."

# Build with stable toolchain, no parallel feature
PATH="$HOME/.cargo/bin:$PATH" cargo build \
  --lib \
  --release \
  --target wasm32-unknown-unknown \
  --no-default-features \
  --features console_error_panic_hook

# Generate JS bindings
echo "📦 Generating JS bindings..."
PATH="$HOME/.cargo/bin:$PATH" wasm-bindgen \
  target/wasm32-unknown-unknown/release/particula_engine.wasm \
  --out-dir ../engine-wasm \
  --target web \
  --out-name particula_engine

echo "✅ Standard build complete!"
