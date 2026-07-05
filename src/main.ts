import './style.css'
import { Engine } from './Engine'

const app = document.querySelector<HTMLDivElement>('#app')!

app.innerHTML = `
  <div class="game-container">
    <canvas id="gameCanvas"></canvas>
  </div>
`

const canvas = document.getElementById('gameCanvas') as HTMLCanvasElement;
const engine = new Engine(canvas);
engine.start();
