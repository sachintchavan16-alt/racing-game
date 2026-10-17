import './styles.css';
import { Game } from './core/Game.js';

const boot = document.getElementById('boot');
const bar = document.getElementById('boot-bar');
const status = document.getElementById('boot-status');
const startBtn = document.getElementById('boot-start');

function setProgress(pct, text) {
  if (bar) bar.style.width = `${Math.round(pct * 100)}%`;
  if (text && status) status.textContent = text;
}

async function main() {
  let game;
  try {
    game = new Game(document.getElementById('scene'), setProgress);
    await game.init();
  } catch (err) {
    console.error(err);
    setProgress(1, `Failed to start: ${err.message}`);
    return;
  }

  setProgress(1, 'Ready.');
  startBtn.disabled = false;

  const begin = () => {
    startBtn.removeEventListener('click', begin);
    boot.classList.add('boot--hidden');
    game.start();
  };
  startBtn.addEventListener('click', begin);

  window.addEventListener('pagehide', () => game.dispose());
  window.__JUNGLE_RIDER__ = game;
}

main();
