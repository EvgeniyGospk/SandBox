export function RigidBodySizeSlider(args: {
  rigidBodySize: number
  onChange: (size: number) => void
}) {
  const { rigidBodySize, onChange } = args

  return (
    <div className="mb-4">
      <label className="text-xs text-[#808080] uppercase tracking-wider mb-2 block">Size: {rigidBodySize}px</label>
      <input
        type="range"
        min="5"
        max="50"
        value={rigidBodySize}
        onChange={(e) => onChange(parseInt(e.target.value))}
        className="w-full h-2 bg-[#252525] rounded-lg appearance-none cursor-pointer accent-[#8B5CF6]"
      />
    </div>
  )
}
