import type { ReactNode } from 'react'

export function ElementsGrid<T>(args: {
  items: ReadonlyArray<T>
  renderItem: (item: T) => ReactNode
}) {
  const { items, renderItem } = args

  return (
    <div
      className="flex-1 overflow-y-auto p-3"
      onWheel={(e) => {
        e.currentTarget.scrollTop += e.deltaY
      }}
    >
      <div className="grid grid-cols-3 gap-2">{items.map(renderItem)}</div>
    </div>
  )
}
