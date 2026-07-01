/**
 * main.js — ponto de entrada da aplicação (spec seções 3 e 9).
 *
 * Faz o "wiring" de todos os módulos: detecção de WebGL (fallback), criação da
 * cena/renderer/bloom (SceneManager), corpos (Sun + Planets a partir de
 * planets.js), câmera (CameraRig + CinematicPath), interação (Picker +
 * FocusController), UI (Hud + InfoCard) e o laço de render (Loop).
 */

import * as THREE from 'three';

import { AppState } from './core/AppState.js';
import { SceneManager } from './core/SceneManager.js';
import { Loop } from './core/Loop.js';
import { CameraRig } from './camera/CameraRig.js';
import { CinematicPath } from './camera/CinematicPath.js';
import { PLANETS, SUN } from './data/planets.js';
import { Sun } from './bodies/Sun.js';
import { Planet } from './bodies/Planet.js';
import { LOD } from './bodies/ParticleSphere.js';
import { Picker } from './interaction/Picker.js';
import { FocusController } from './interaction/FocusController.js';
import { InfoCard } from './ui/InfoCard.js';
import { Hud } from './ui/Hud.js';

/**
 * Detecta suporte a WebGL criando um contexto de teste (spec seção 10).
 * @returns {boolean}
 */
function isWebGLAvailable() {
  try {
    const canvas = document.createElement('canvas');
    return !!(
      window.WebGLRenderingContext &&
      (canvas.getContext('webgl2') || canvas.getContext('webgl'))
    );
  } catch (e) {
    return false;
  }
}

/**
 * Exibe o fallback HTML e esconde a UI/cena (spec seção 10).
 */
function showWebGLFallback() {
  const fallback = document.getElementById('webgl-fallback');
  if (fallback) fallback.hidden = false;
}

/**
 * Bootstrap da aplicação. Monta e liga todos os módulos.
 */
function main() {
  // 1) Guarda de WebGL: sem suporte, mostra fallback e aborta.
  if (!isWebGLAvailable()) {
    showWebGLFallback();
    return;
  }

  const container = document.getElementById('app');
  const uiRoot = document.getElementById('ui-root');

  // Detecção de modo debug (?debug) — usada pelos módulos para habilitar lil-gui.
  const debug = new URLSearchParams(window.location.search).has('debug');

  // 2) Estado global mínimo.
  const appState = new AppState();

  // 3) Cena + renderer + bloom.
  // Sem bloomParams explícitos: usa o DEFAULT_BLOOM do SceneManager (threshold
  // alto + strength/radius moderados), calibrado para o Sol brilhar sem lavar
  // a cena inteira. Fonte única da verdade nos parâmetros de bloom.
  const sceneManager = new SceneManager({
    container,
    bloom: true,
  });
  sceneManager.init();

  // 4) Corpos: Sol no centro + 8 planetas.
  const sun = new Sun({ data: SUN });
  sun.build();
  sceneManager.add(sun.object3d);

  /** @type {Map<string, Planet>} */
  const bodies = new Map();
  for (const data of PLANETS) {
    const planet = new Planet({ data });
    planet.build();
    sceneManager.add(planet.object3d);
    // Adiciona a trilha da órbita, se o planeta a expuser.
    if (planet.orbit && planet.orbit.trail) {
      sceneManager.add(planet.orbit.trail);
    }
    bodies.set(data.id, planet);
  }

  // 5) Câmera: rig (OrbitControls + modos) + passeio cinematográfico.
  const cameraRig = new CameraRig({
    camera: sceneManager.camera,
    domElement: sceneManager.renderer.domElement,
    appState,
  });
  cameraRig.init();

  const cinematicPath = new CinematicPath({
    camera: sceneManager.camera,
    lookAt: new THREE.Vector3(0, 0, 0),
  });
  cinematicPath.start();

  // 6) UI: HUD + InfoCard.
  const hud = new Hud({ root: uiRoot, appState });
  hud.mount();
  hud.showHint();

  const infoCard = new InfoCard({ root: uiRoot });
  infoCard.mount();

  // 7) Interação: picking + controlador de foco.
  const focusController = new FocusController({
    cameraRig,
    appState,
    bodies,
    sun,
    infoCard,
  });

  // Alvos de picking: Sol + planetas (esferas de colisão invisíveis).
  const pickTargets = [
    { id: sun.id, hitMesh: sun.hitMesh },
    ...[...bodies.values()].map((p) => ({ id: p.id, hitMesh: p.hitMesh })),
  ].filter((t) => t.hitMesh);

  const picker = new Picker({
    camera: sceneManager.camera,
    domElement: sceneManager.renderer.domElement,
    targets: pickTargets,
  });
  picker.init();
  picker.onPick((bodyId) => {
    if (bodyId) {
      focusController.focus(bodyId);
    } else {
      focusController.clearFocus();
    }
  });

  // Fechar o InfoCard também limpa o foco.
  infoCard.onClose(() => focusController.clearFocus());

  // Reset (botão/atalho R): limpa foco e restaura velocidade padrão.
  hud.onReset(() => {
    focusController.clearFocus();
    appState.set('speedMultiplier', 1.0);
    appState.set('paused', false);
  });

  // ESC sai do foco.
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') focusController.clearFocus();
  });

  // 8) Laço de render: atualiza tudo a cada frame.
  // Degradação adaptativa (spec seção 10): se o FPS ficar baixo por alguns
  // segundos, desliga o bloom (o pós-processamento mais caro) para recuperar
  // fluidez. Dispara uma única vez.
  const loop = new Loop({
    onDegrade: () => {
      // eslint-disable-next-line no-console
      console.warn('[main] FPS baixo sustentado — desligando bloom (degradação graciosa).');
      sceneManager.setBloomEnabled(false);
    },
  });

  // Frustum reutilizado a cada frame para o culling por corpo (spec seção 5).
  const frustum = new THREE.Frustum();
  const projScreenMatrix = new THREE.Matrix4();

  loop.add((dt, elapsed) => {
    const speedMultiplier = appState.get('speedMultiplier');

    // A câmera é movida por CameraRig/CinematicPath/FocusController; atualizamos
    // esses ANTES de derivar o frustum, para que o culling use a pose do frame.
    const cameraMode = appState.get('cameraMode');
    // Os OrbitControls só devem estar ativos quando o usuário está de fato no
    // comando: modo 'explore' E sem foco ativo (durante o foco o
    // FocusController é dono da câmera; em cinematic é o CinematicPath).
    // setControlsEnabled também ressincroniza os controles com a pose atual na
    // reativação, evitando o "salto" da câmera (bug relatado na revisão).
    const userControlsCamera = cameraMode === 'explore' && !focusController.isActive();
    cameraRig.setControlsEnabled(userControlsCamera);
    cameraRig.update(dt);
    if (cameraMode === 'cinematic') {
      cinematicPath.update(dt);
    }
    focusController.update(dt);

    // Frustum de mundo a partir da câmera já posicionada neste frame.
    const camera = sceneManager.camera;
    camera.updateMatrixWorld();
    projScreenMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    frustum.setFromProjectionMatrix(projScreenMatrix);

    const cameraPos = camera.position;
    sun.update(dt, elapsed, frustum);
    // Passa a posição da câmera (LOD por distância com histerese) e o frustum
    // (culling por corpo) — spec seção 5.
    for (const planet of bodies.values()) {
      planet.update(dt, elapsed, speedMultiplier, cameraPos, frustum);
    }

    sceneManager.render();
  });

  // Pausa/despausa a simulação conforme o AppState.
  appState.subscribe((value, key) => {
    if (key === 'paused') loop.setPaused(value);
  });

  loop.start();

  // Exposição para depuração no console quando ?debug estiver ativo.
  if (debug) {
    window.__SOLAR__ = { appState, sceneManager, cameraRig, bodies, sun, focusController };
  }
}

// Executa após o DOM estar pronto.
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', main);
} else {
  main();
}
