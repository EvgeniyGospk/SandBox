import { useEffect, useState } from 'react'
import { Canvas } from '@/components/Canvas'
import { LeftPanel } from '@/components/panels/LeftPanel'
import { TopToolbar } from '@/components/panels/TopToolbar'
import { BottomBar } from '@/components/panels/BottomBar'
import { RightPanel } from '@/components/panels/RightPanel'

function App() {
  const [isEngineReady, setIsEngineReady] = useState(false)

  useEffect(() => {
    // TODO: Initialize WASM engine here
    // For now, just mark as ready
    setIsEngineReady(true)
  }, [])

  if (!isEngineReady) {
    return (
      <div className="flex items-center justify-center h-screen bg-[#0D0D0D]">
        <div className="text-white text-xl">Loading Particula...</div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-screen bg-[#0D0D0D] text-white overflow-hidden">
      {/* Top Toolbar */}
      <TopToolbar />

      {/* Main Content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Panel - Elements */}
        <LeftPanel />

        {/* Canvas - Center */}
        <main className="flex-1 relative">
          <Canvas />
        </main>

        {/* Right Panel - Settings */}
        <RightPanel />
      </div>

      {/* Bottom Bar */}
      <BottomBar />
    </div>
  )
}

export default App
