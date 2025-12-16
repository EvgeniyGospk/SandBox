import { create } from 'zustand'
import type { ElementType } from '@/core/engine'
import type { BrushShape, RigidBodyShape, ToolType } from './toolTypes'

interface ToolState {
  // Current tool
  selectedTool: ToolType
  brushShape: BrushShape
  brushSize: number
  
  // Selected element
  selectedElement: ElementType
  
  // Rigid body settings
  rigidBodyShape: RigidBodyShape
  rigidBodySize: number
  rigidBodyElement: ElementType
  
  // Actions
  setTool: (tool: ToolType) => void
  setBrushShape: (shape: BrushShape) => void
  setBrushSize: (size: number) => void
  setElement: (element: ElementType) => void
  setRigidBodyShape: (shape: RigidBodyShape) => void
  setRigidBodySize: (size: number) => void
  setRigidBodyElement: (element: ElementType) => void
}

export const useToolStore = create<ToolState>((set) => ({
  // Initial state
  selectedTool: 'brush',
  brushShape: 'circle',
  brushSize: 10,
  selectedElement: 'sand',
  
  // Rigid body defaults
  rigidBodyShape: 'box',
  rigidBodySize: 20,
  rigidBodyElement: 'stone',
  
  // Actions
  setTool: (selectedTool) => set({ selectedTool }),
  setBrushShape: (brushShape) => set({ brushShape }),
  setBrushSize: (brushSize) => set({ brushSize: Math.min(50, Math.max(1, brushSize)) }),
  setElement: (selectedElement) => set({ selectedElement, selectedTool: 'brush' }),
  setRigidBodyShape: (rigidBodyShape) => set({ rigidBodyShape, selectedTool: 'rigid_body' }),
  setRigidBodySize: (rigidBodySize) => set({ rigidBodySize: Math.min(50, Math.max(5, rigidBodySize)) }),
  setRigidBodyElement: (rigidBodyElement) => set({ rigidBodyElement }),
}))
