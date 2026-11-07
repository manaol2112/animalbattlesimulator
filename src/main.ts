import '@fontsource/teko/latin-400.css';
import '@fontsource/teko/latin-500.css';
import '@fontsource/barlow/latin-400.css';
import '@fontsource/barlow/latin-500.css';
import '@fontsource/barlow-condensed/latin-500.css';
import '@fontsource/barlow-condensed/latin-600.css';
import '@fontsource/barlow-condensed/latin-700.css';
import './ui/style.css';
import { audio } from './audio';
import { Game } from './game';

try {
  const game = new Game();
  if (import.meta.env.DEV) {
    // Handy for automated checks and poking at the running game from the console.
    (window as unknown as { __game: Game; __audio: typeof audio }).__game = game;
    (window as unknown as { __audio: typeof audio }).__audio = audio;
  }
} catch (e) {
  console.error(e);
  const noWebGL = !document.createElement('canvas').getContext('webgl2');
  const box = document.getElementById('ui')!;
  box.innerHTML = '<div class="modal-wrap"><div class="modal"><h2></h2><p></p></div></div>';
  box.querySelector('h2')!.textContent = noWebGL ? '3D graphics unavailable' : 'The game could not start';
  box.querySelector('p')!.textContent = noWebGL
    ? 'Beastfall needs WebGL 2. Try updating your browser or turning off any setting that blocks hardware acceleration.'
    : `Please reload the page. Details: ${e instanceof Error ? e.message : String(e)}`;
}
