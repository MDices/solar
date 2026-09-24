/**
 * CameraRig — gerencia a câmera e os OrbitControls, além do estado de modo
 * (cinematic | explore) (spec seção 6). Na primeira interação do usuário
 * (drag/scroll/clique) alterna para 'explore'; após ociosidade, sinaliza para
 * voltar a 'cinematic'.
 *
 * Comportamento:
 *  - Damping ligado nos OrbitControls (suavidade de arrasto/zoom).
 *  - Qualquer input do usuário (pointerdown/wheel/touch/setas) → modo 'explore'
 *    e reinicia o cronômetro de ociosidade.
 *  - Após `idleTimeout` segundos sem input, faz uma transição suave de volta ao
 *    modo 'cinematic': escreve `cameraMode = 'cinematic'` no AppState assim que
 *    a ociosidade é atingida. O `CinematicPath` (peça separada) faz o blend
 *    suave a partir da posição atual da câmera ao ser reativado pelo main loop.
 *
 * API pública consumida por main.js e FocusController:
 *  - init(), update(dt), setTarget(v3), setControlsEnabled(bool), dispose()
 *  - getters: `controls`, `target` (Vector3 do alvo dos controles)
 */

import * as THREE from 'three';
import { AppState } from '../core/AppState.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

/** Limites de zoom padrão dos OrbitControls (visão do sistema). */
const DEFAULT_MIN_DISTANCE = 12;
const DEFAULT_MAX_DISTANCE = 400;

export class CameraRig {
  /**
   * @param {object} options
   * @param {THREE.PerspectiveCamera} options.camera
   * @param {HTMLElement} options.domElement - elemento para os OrbitControls
   * @param {AppState} options.appState - estado global (lê/escreve cameraMode)
   * @param {number} [options.idleTimeout=10] - segundos de ociosidade até voltar ao cinematic
   */
  constructor({ camera, domElement, appState, idleTimeout = 10 } = {}) {
    /** @type {THREE.PerspectiveCamera} */
    this.camera = camera;
    /** @type {HTMLElement} */
    this.domElement = domElement;
    /** @type {AppState} */
    this.appState = appState;
    /** @type {number} */
    this.idleTimeout = idleTimeout;
    /** @type {import('three/addons/controls/OrbitControls.js').OrbitControls|null} */
    this.controls = null;

    /**
     * Segundos decorridos desde a última interação do usuário. Só conta
     * enquanto estamos em modo 'explore'.
     * @type {number}
     * @private
     */
    this._idleTime = 0;

    /**
     * Handlers vinculados (bound) para poder removê-los em dispose().
     * @private
     */
    this._onUserInput = this._handleUserInput.bind(this);

    /**
     * Modo "seguir": os controles orbitam um corpo em foco (limites de zoom
     * próprios, sem contar ociosidade). Ver enterFollow()/exitFollow().
     * @type {boolean}
     * @private
     */
    this._following = false;

    /** @type {string[]} eventos de input que disparam o modo explore @private */
    this._inputEvents = ['pointerdown', 'wheel', 'touchstart', 'keydown'];
  }

  /**
   * Cria os OrbitControls e liga os listeners de interação/ociosidade.
   * @returns {void}
   */
  init() {
    const controls = new OrbitControls(this.camera, this.domElement);

    // Damping ligado → movimento suave e com inércia (spec seção 6).
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;

    // Limites confortáveis para o sistema (planeta mais externo ~80 unidades).
    controls.minDistance = DEFAULT_MIN_DISTANCE;
    controls.maxDistance = DEFAULT_MAX_DISTANCE;

    // Zoom/rotação suaves; sem pan para não "perder" o sistema de vista.
    controls.enablePan = false;
    controls.rotateSpeed = 0.6;
    controls.zoomSpeed = 0.8;

    // Alvo inicial no centro do sistema (o Sol).
    controls.target.set(0, 0, 0);

    this.controls = controls;

    // A primeira interação real do usuário alterna para 'explore'. O evento
    // 'start' dos OrbitControls cobre drag/zoom via mouse/touch; adicionamos
    // também listeners diretos para cobrir wheel/keydown sem depender da
    // captura interna dos controles.
    controls.addEventListener('start', this._onUserInput);
    for (const evt of this._inputEvents) {
      // { passive: true } — apenas observamos, não cancelamos o evento.
      this.domElement.addEventListener(evt, this._onUserInput, { passive: true });
    }
  }

  /**
   * Atualiza controles e detecção de ociosidade a cada frame.
   * @param {number} dt - delta time em segundos
   * @returns {void}
   */
  update(dt) {
    if (!this.controls) return;

    // OrbitControls só devem escrever na câmera quando estão HABILITADOS. Quando
    // desabilitados (cinematic/foco), outra peça é dona da câmera; chamar
    // update() aqui sobrescreveria a pose com o spherical (possivelmente
    // desatualizado). Portanto, só atualizamos quando habilitado.
    if (this.controls.enabled) {
      // Com damping, precisa de update() todo frame.
      this.controls.update();
    }

    // Detecção de ociosidade só faz sentido no modo explore. Não avançamos o
    // cronômetro enquanto há foco ativo (senão a ociosidade jogaria a câmera de
    // volta ao cinematic no meio do foco — bug relatado na revisão): no modo
    // "seguir" os controles ficam ligados, então a guarda é _following.
    if (
      this.appState.get('cameraMode') === 'explore' &&
      this.controls.enabled &&
      !this._following
    ) {
      this._idleTime += dt;
      if (this._idleTime >= this.idleTimeout) {
        // Ficou ocioso: sinaliza retorno ao passeio cinematográfico. O
        // CinematicPath fará o blend suave a partir da posição atual.
        this.appState.set('cameraMode', 'cinematic');
        this._idleTime = 0;
      }
    }
  }

  /**
   * Define o alvo (ponto de mira) da câmera/controls.
   * @param {THREE.Vector3} target
   * @returns {void}
   */
  setTarget(target) {
    if (this.controls) {
      this.controls.target.copy(target);
    }
    // Reorienta a câmera IMEDIATAMENTE para mirar o alvo. Durante o foco e o
    // tween cinematográfico os OrbitControls ficam desabilitados, então
    // controls.update() (que normalmente orienta a câmera) NÃO roda — sem este
    // lookAt, a câmera mudaria de posição mas manteria a orientação antiga,
    // olhando para o vazio (bug do foco). Com os controls habilitados, o próximo
    // update() recomputa a orientação de qualquer forma, tornando isto inócuo.
    if (this.camera) {
      this.camera.lookAt(target);
    }
  }

  /**
   * Alvo atual dos controles (ponto de mira). Útil para o FocusController
   * fazer tween sem acessar `controls` diretamente.
   * @returns {THREE.Vector3|null}
   */
  get target() {
    return this.controls ? this.controls.target : null;
  }

  /**
   * Habilita/desabilita os OrbitControls (ex.: em modo cinematic, ou durante um
   * tween de foco). Ao REABILITAR (false→true), ressincroniza o estado interno
   * dos controles (spherical) com a pose ATUAL da câmera — que pode ter sido
   * movida por fora (CinematicPath/FocusController). Sem isso, o primeiro
   * `controls.update()` recomputaria a câmera a partir de um estado antigo,
   * causando um "salto" visível (bug relatado na revisão).
   * @param {boolean} enabled
   * @returns {void}
   */
  setControlsEnabled(enabled) {
    if (!this.controls) return;
    const was = this.controls.enabled;
    this.controls.enabled = enabled;
    if (enabled && !was) {
      this._resyncControls();
    }
  }

  /**
   * Entra no modo "seguir": habilita os controles orbitando `target` (o corpo
   * em foco), com limites de zoom relativos ao enquadramento. Sincroniza o
   * spherical com a pose atual usando o alvo REAL (não a heurística de
   * _resyncControls), então não há salto. Usado pelo FocusController ao fim do
   * tween de entrada.
   * @param {THREE.Vector3} target
   * @param {number} minDistance
   * @param {number} maxDistance
   * @returns {void}
   */
  enterFollow(target, minDistance, maxDistance) {
    if (!this.controls) return;
    const c = this.controls;
    c.minDistance = minDistance;
    c.maxDistance = maxDistance;
    c.target.copy(target);
    c.enabled = true;
    this._following = true;
    c.update();
  }

  /**
   * Sai do modo "seguir": restaura os limites de zoom padrão. Não mexe em
   * `enabled` (quem chama decide, ex.: desliga para o tween de saída).
   * @returns {void}
   */
  exitFollow() {
    this._following = false;
    if (!this.controls) return;
    this.controls.minDistance = DEFAULT_MIN_DISTANCE;
    this.controls.maxDistance = DEFAULT_MAX_DISTANCE;
  }

  /**
   * Ressincroniza os OrbitControls com a pose atual da câmera. Coloca o alvo
   * (target) num ponto à frente da câmera, na distância média da órbita atual,
   * e chama update() uma vez para que o spherical interno reflita a posição
   * real da câmera — evitando descontinuidades ao reassumir o controle.
   * @private
   * @returns {void}
   */
  _resyncControls() {
    const c = this.controls;
    // Direção de visão atual da câmera.
    this._tmpDir = this._tmpDir || new THREE.Vector3();
    this._tmpTarget = this._tmpTarget || new THREE.Vector3();
    this.camera.getWorldDirection(this._tmpDir);
    // Distância do alvo: mantém o alvo dentro dos limites de zoom, mirando à
    // frente da câmera (ou o centro, o que estiver mais próximo do razoável).
    const dist = THREE.MathUtils.clamp(
      this.camera.position.length(),
      c.minDistance,
      c.maxDistance,
    );
    this._tmpTarget.copy(this.camera.position).addScaledVector(this._tmpDir, dist);
    c.target.copy(this._tmpTarget);
    // Recalcula o estado interno (spherical) a partir da pose atual.
    c.update();
  }

  /**
   * Libera controles e remove listeners.
   * @returns {void}
   */
  dispose() {
    if (this.controls) {
      this.controls.removeEventListener('start', this._onUserInput);
      this.controls.dispose();
      this.controls = null;
    }
    for (const evt of this._inputEvents) {
      this.domElement.removeEventListener(evt, this._onUserInput);
    }
  }

  // ----------------------- internos -----------------------

  /**
   * Reage a uma interação do usuário: entra no modo 'explore' e reinicia o
   * cronômetro de ociosidade.
   * @private
   * @returns {void}
   */
  _handleUserInput() {
    this._idleTime = 0;
    if (this.appState.get('cameraMode') !== 'explore') {
      this.appState.set('cameraMode', 'explore');
    }
  }
}
