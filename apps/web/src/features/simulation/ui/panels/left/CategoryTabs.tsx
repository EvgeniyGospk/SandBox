type Props = {
  categories: Array<[string, string]>
  activeCategory: string
  onSelectCategory: (key: string) => void
}

export function CategoryTabs(props: Props) {
  const { categories, activeCategory, onSelectCategory } = props

  return (
    <div className="px-4 py-3 border-b border-[#333]">
      <div
        className="flex gap-2 overflow-x-auto scrollbar-hide"
        onWheel={(e) => {
          e.currentTarget.scrollLeft += e.deltaY
        }}
      >
        {categories.map(([key, label]) => (
          <button
            key={key}
            onClick={() => onSelectCategory(key)}
            className={`px-4 py-2 text-sm font-medium rounded-lg whitespace-nowrap transition-all ${
              activeCategory === key
                ? 'bg-[#3B82F6] text-white shadow-lg shadow-blue-500/20'
                : 'bg-[#252525] text-[#808080] hover:text-white hover:bg-[#2a2a2a]'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  )
}
