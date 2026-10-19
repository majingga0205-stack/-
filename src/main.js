import { Game } from './game.js';
import { Renderer } from './render.js';
import { AudioEngine } from './audio.js';
import { GameUI } from './ui.js';

const canvas = document.getElementById('game-canvas');
const audio = new AudioEngine();
const game = new Game({ audio });
const renderer = new Renderer(canvas);
const ui = new GameUI(game);
game.ui = ui;
game.bindInput(canvas);
audio.setVolumes(game.settings.music, game.settings.sfx);
window.__game = game;
let lastTime = performance.now();
function frame(now) {
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;
  game.tick(dt);
  audio.update(dt, game.mode);
  renderer.draw(game, dt);
  ui.update();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
