import { create } from 'zustand'
import { EL_SAND, EL_STONE, type ElementId } from '@/features/simulation/engine/api/types'
import type { BrushShape, RigidBodyShape, ToolType } from './toolTypes'

interface ToolState {
  // Current tool
  selectedTool: ToolType
  brushShape: BrushShape
  brushSize: number
  
  // Selected element
  selectedElementId: ElementId
  
  // Rigid body settings
  rigidBodyShape: RigidBodyShape
  rigidBodySize: number
  rigidBodyElementId: ElementId
  
  // Actions
  setTool: (tool: ToolType) => void
  setBrushShape: (shape: BrushShape) => void
  setBrushSize: (size: number) => void
  setElementId: (elementId: ElementId) => void
  setRigidBodyShape: (shape: RigidBodyShape) => void
  setRigidBodySize: (size: number) => void
  setRigidBodyElementId: (elementId: ElementId) => void
}

export const useToolStore = create<ToolState>((set) => ({
  // Initial state
  selectedTool: 'brush',
  brushShape: 'circle',
  brushSize: 10,
  selectedElementId: EL_SAND,
  
  // Rigid body defaults
  rigidBodyShape: 'box',
  rigidBodySize: 20,
  rigidBodyElementId: EL_STONE,
  
  // Actions
  setTool: (selectedTool) => set({ selectedTool }),
  setBrushShape: (brushShape) => set({ brushShape }),
  setBrushSize: (brushSize) => set({ brushSize: Math.min(50, Math.max(1, brushSize)) }),
  setElementId: (selectedElementId) => set({ selectedElementId, selectedTool: 'brush' }),
  setRigidBodyShape: (rigidBodyShape) => set({ rigidBodyShape, selectedTool: 'rigid_body' }),
  setRigidBodySize: (rigidBodySize) => set({ rigidBodySize: Math.min(50, Math.max(5, rigidBodySize)) }),
  setRigidBodyElementId: (rigidBodyElementId) => set({ rigidBodyElementId }),
}))
