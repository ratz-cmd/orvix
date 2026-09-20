// Contrat de câblage de la Super Résolution 2K dans le lecteur.
//
// Ces tests lisent la source plutôt que de monter le composant (13 000 lignes,
// hls.js, WebGL…) : ils garantissent que le moteur local reste branché sur le
// lecteur, que le canvas est bien superposé à la vidéo, et que l'ancien
// « faux » upscaling (filtre SVG recopié tel quel) ne redevient pas le seul
// traitement disponible.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const playerPath = new URL('../HLSPlayer.tsx', import.meta.url);
const panelPath = new URL('../HLSPlayerSettingsPanel.tsx', import.meta.url);
const upscalerPath = new URL('../../utils/videoUpscaler.ts', import.meta.url);
const policyPath = new URL('../../utils/upscalingPolicy.ts', import.meta.url);

test('le lecteur branche le moteur de Super Résolution local', async () => {
  const source = await readFile(playerPath, 'utf8');

  assert.match(source, /import \{ OrvixVideoUpscaler \} from '\.\.\/utils\/videoUpscaler';/);
  assert.match(source, /from '\.\.\/utils\/upscalingPolicy';/);
  assert.match(source, /new OrvixVideoUpscaler\(canvas, \{/);
  assert.match(source, /upscaler\.renderFrame\(video\)/);
  assert.match(source, /computeUpscaleTarget\(sourceWidth, sourceHeight\)/);
  assert.match(source, /computeRenderSize\(\{/);
  assert.match(source, /upscaler\.dispose\(\)/);
});

test('le canvas 2K est superposé à la vidéo et réservé aux VIP hors mobile', async () => {
  const source = await readFile(playerPath, 'utf8');

  const canvasBlock = source.slice(
    source.indexOf('data-testid="orvix-upscale-canvas"') - 400,
    source.indexOf('data-testid="orvix-upscale-canvas"') + 400,
  );
  assert.match(canvasBlock, /ref=\{upscaleCanvasRef\}/);
  assert.match(canvasBlock, /absolute inset-0/);

  // La condition d'affichage doit exiger le mode actif, le statut VIP et un PC.
  assert.match(
    source,
    /\{upscaleMode !== 'off' && isUserVip\(\) && !isMobile && \(/,
  );

  // Le rendu image par image suit la cadence réelle du décodeur.
  assert.match(source, /requestVideoFrameCallback/);
});

test('le filtre SVG historique ne s’empile plus sur le shader', async () => {
  const source = await readFile(playerPath, 'utf8');

  assert.match(
    source,
    /if \(!isMobile && isUserVip\(\) && upscaleMode !== 'off' && !isUpscalingRunning\) \{/,
  );
  assert.match(source, /isUpscalingRunning, videoOledMode/);
});

test('le plancher de qualité est imposé à la sélection automatique', async () => {
  const source = await readFile(playerPath, 'utf8');

  assert.match(source, /minAutoBitrate: MINIMUM_AUTO_BITRATE/);
  assert.match(source, /computeMinAutoBitrate\(nextOptions, policy\.minHeight\)/);
  assert.match(source, /buildQualityPolicy\(isUserVip\(\), requested\)/);
  assert.match(source, /setQualityFloorNotice\(qualityDescription\.notice\)/);
  assert.match(source, /t\('watch\.qualityFloorTitle'\)/);
});

test('le moteur WebGL ne dépend ni de React ni du serveur', async () => {
  const [upscaler, policy] = await Promise.all([
    readFile(upscalerPath, 'utf8'),
    readFile(policyPath, 'utf8'),
  ]);

  assert.doesNotMatch(upscaler, /from 'react'/);
  assert.doesNotMatch(upscaler, /fetch\(/);
  assert.match(upscaler, /precision highp float;/);
  assert.match(upscaler, /uUseBicubic/);
  assert.match(policy, /UPSCALE_TARGET_WIDTH = 2560|UPSCALE_TARGET_WIDTH,/);
  assert.match(upscaler, /RENDER_BUDGET_MS/);
});

test('les libellés du panneau parlent bien de 2K local et plus de « 4K »', async () => {
  const panel = await readFile(panelPath, 'utf8');

  assert.doesNotMatch(panel, /Ultra 4K/);
  assert.doesNotMatch(panel, /feConvolveMatrix \[3x3/);
  assert.match(panel, /2560 × 1440/);
  assert.match(panel, /WebGL/);
});
