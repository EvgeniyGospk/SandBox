import { useEffect, useCallback } from 'react'
import { Canvas } from '@/features/simulation/ui/Canvas'
import { MainMenu } from '@/features/menu/ui/MainMenu'
import { ModStudioPage } from '@/features/modStudio/ui/ModStudioPage'
import { LeftPanel } from '@/features/simulation/ui/panels/LeftPanel'
import { TopToolbar } from '@/features/simulation/ui/panels/TopToolbar'
import { BottomBar } from '@/features/simulation/ui/panels/BottomBar'
import { RightPanel } from '@/features/simulation/ui/panels/RightPanel'
import { useSimulationStore } from '@/features/simulation/model/simulationStore'

function App() {
  const { gameState, startGame, openModStudio, returnToMenu } = useSimulationStore()

  // Handle ESC to return to menu
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && gameState !== 'menu') {
        returnToMenu()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [gameState, returnToMenu])

  const handleStartGame = useCallback(() => {
    startGame()
  }, [startGame])

  // Show Main Menu
  if (gameState === 'menu') {
    return <MainMenu onStartGame={handleStartGame} onOpenModStudio={openModStudio} />
  }

  if (gameState === 'modStudio') {
    return <ModStudioPage onBack={returnToMenu} />
  }

  // Show Game
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
          <Canvas key={gameState} />
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
