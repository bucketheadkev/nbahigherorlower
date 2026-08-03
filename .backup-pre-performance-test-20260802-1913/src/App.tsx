import { useState } from 'react';
import { GameView } from './components/GameView';
import './App.css';

type Phase = 'menu' | 'playing' | 'matchEnd';

export default function App() {
  const [phase, setPhase] = useState<Phase>('menu');

  return (
    <div className="app">
      <GameView phase={phase} onPhaseChange={setPhase} />
    </div>
  );
}
