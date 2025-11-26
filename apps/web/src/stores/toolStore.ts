import { create } from 'zustand'
import type { ElementType } from '@/lib/engine'

type ToolType = 'brush' | 'eraser' | 'pipette' | 'fill' | 'move'
type BrushShape = 'circle' | 'square' | 'line'

interface ToolState {
  // Current tool
  selectedTool: ToolType
  brushShape: BrushShape
  brushSize: number
  
  // Selected element
  selectedElement: ElementType
  
  // Actions
  setTool: (tool: ToolType) => void
  setBrushShape: (shape: BrushShape) => void
  setBrushSize: (size: number) => void
  setElement: (element: ElementType) => void
}

export const useToolStore = create<ToolState>((set) => ({
  // Initial state
  selectedTool: 'brush',
  brushShape: 'circle',
  brushSize: 10,
  selectedElement: 'sand',
  
  // Actions
  setTool: (selectedTool) => set({ selectedTool }),
  setBrushShape: (brushShape) => set({ brushShape }),
  setBrushSize: (brushSize) => set({ brushSize: Math.min(50, Math.max(1, brushSize)) }),
  setElement: (selectedElement) => set({ selectedElement, selectedTool: 'brush' }),
}))
