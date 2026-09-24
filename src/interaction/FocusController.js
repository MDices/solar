/**
 * FocusController — orquestra o foco em um planeta (spec seções 6 e 9): faz o
 * tween da câmera até o corpo, dispara LOD=FOCUS nele (e reduz os demais),
 * abre o InfoCard e escreve `focusedPlanetId` no AppState. Sair do foco
 * (ESC / clique fora) reverte tudo.
 *
 * FASE 1: FOCUS é estático (apenas aumenta a contagem de partículas via
 * ParticleSphere.setLOD(FOCUS)), SEM simulação GPGPU.
 */

import * as THREE from 'three';
import { AppState } from '../core/AppState.js';
import { LOD } from '../bodies/ParticleSphere.js';
import { getBodyById } from '../data/planets.js';
import { easeInOutCubic } from '../util/math.js';
import { FocusSwarm } from '../bodies/FocusSwarm.js';

// Teto de partículas do enxame GPGPU (Fase 2) por corpo.
const SWARM_MAX_COUNT = 40000;

// Contagem de referência do enxame quando o planeta preenche o enquadramento
// de foco — a mesma da referência (casberry: 20k pontos). Ver _createSwarm.
const SWARM_REFERENCE_COUNT = 20000;

// Tamanho do ponto do enxame em pixels (dpr 1). ~2px como os tetraedros da
// referência projetados — pequeno o bastante para o fundo aparecer entre os
// pontos; o bloom faz o resto.
const SWARM_POINT_PX = 2.0;

// Brilho (HDR) das partículas do enxame.
const SWARM_BRIGHTNESS = 1.0;

// Multiplicadores usados para calcular a distância da câmera ao corpo em foco,
// em função do "tamanho" do corpo. Deixamos o corpo confortavelmente enquadrado.
const FOCUS_DISTANCE_FACTOR = 3.0; // distância = raio * fator (perto → planeta grande na tela)
const MIN_FOCUS_DISTANCE = 5.5; // piso para corpos muito pequenos (ex.: Mercúrio)

// Faixa de zoom permitida ao usuário enquanto segue um corpo, como múltiplos
// da distância de foco: chega perto o bastante para "entrar" na casca de
// partículas, e longe o bastante para ver o planeta pequeno com a órbita.
const FOLLOW_ZOOM_RANGE = [0.35, 3.0];

export class FocusController {
  /**
   * @param {object} options
   * @param {import('../camera/CameraRig.js').CameraRig} options.cameraRig
   * @param {AppState} options.appState
   * @param {Map<string, import('../bodies/Planet.js').Planet>} options.bodies - id → corpo
   * @param {import('../bodies/Sun.js').Sun} [options.sun] - o Sol (fora do Map de planetas)
   * @param {import('../ui/InfoCard.js').InfoCard} [options.infoCard]
   * @param {number} [options.tweenDuration=1.5] - duração do tween da câmera (s)
   */
  constructor({ cameraRig, appState, bodies, sun, infoCard, renderer, tweenDuration = 1.5 } = {}) {
    /** @type {import('../camera/CameraRig.js').CameraRig} */
    this.cameraRig = cameraRig;
    /** @type {AppState} */
    this.appState = appState;
    /** @type {Map<string, import('../bodies/Planet.js').Planet>} */
    this.bodies = bodies;
    /** @type {import('../bodies/Sun.js').Sun|undefined} */
    this.sun = sun;
    /** @type {import('../ui/InfoCard.js').InfoCard|undefined} */
    this.infoCard = infoCard;
    /** @type {THREE.WebGLRenderer|undefined} necessário p/ o enxame GPGPU (Fase 2) */
    this.renderer = renderer;
    /** @type {number} */
    this.tweenDuration = tweenDuration;
    /** @type {boolean} */
    this._tweening = false;

    // ------- Fase 2: enxame GPGPU do corpo em foco -------
    /** @type {FocusSwarm|null} */
    this._swarm = null;
    /** @type {import('../bodies/Planet.js').Planet|null} */
    this._swarmPlanet = null;
    /** @type {THREE.Raycaster} */
    this._raycaster = new THREE.Raycaster();
    /** @type {THREE.Plane} plano p/ projetar o mouse perto do corpo */
    this._pointerPlane = new THREE.Plane();
    /** @type {THREE.Vector2} posição do mouse em NDC (-1..1) */
    this._ndc = new THREE.Vector2();
    /** @type {boolean} mouse sobre a cena? */
    this._pointerActive = false;
    /** @type {THREE.Vector3} vetores de trabalho (mouse) */
    this._tmpWorld = new THREE.Vector3();
    this._tmpNormal = new THREE.Vector3();
    this._tmpLocal = new THREE.Vector3();

    // ------- estado interno do tween/foco -------
    /**
     * Fase atual: 'idle' (sem foco), 'entering' (tween até o corpo),
     * 'following' (câmera trava no corpo em foco), 'exiting' (tween de volta).
     * @type {'idle'|'entering'|'following'|'exiting'}
     */
    this._phase = 'idle';
    /** @type {string|null} id do corpo em foco */
    this._focusedId = null;

    // Progresso do tween [0..1] e velocidade (1/duração).
    this._t = 0;

    // Poses de câmera para o tween (posição + alvo/lookAt).
    this._fromPos = new THREE.Vector3();
    this._toPos = new THREE.Vector3();
    this._fromTarget = new THREE.Vector3();
    this._toTarget = new THREE.Vector3();

    // Pose salva para restaurar ao sair do foco.
    this._savedPos = new THREE.Vector3();
    this._savedTarget = new THREE.Vector3();
    this._savedCameraMode = 'cinematic';

    // Vetores de trabalho reutilizáveis (evita alocação por frame).
    this._tmpBodyPos = new THREE.Vector3();
    this._tmpOffset = new THREE.Vector3();
    this._tmpCurPos = new THREE.Vector3();
    this._tmpCurTarget = new THREE.Vector3();
    /** Posição do corpo no frame anterior (fase following) @private */
    this._prevBodyPos = new THREE.Vector3();
  }

  /**
   * Há foco ativo (tween de entrada/saída ou seguindo um corpo)? Usado pelo
   * main loop para NÃO reabilitar os OrbitControls enquanto o FocusController é
   * dono da câmera.
   * @returns {boolean}
   */
  isActive() {
    return this._phase !== 'idle';
  }

  /**
   * Há tween de câmera em andamento (entrada ou saída do foco)? Enquanto SEGUE
   * um corpo (fase 'following') os OrbitControls ficam ligados em volta dele —
   * o usuário pode girar/zoom; só durante os tweens o controlador é dono
   * exclusivo da câmera.
   * @returns {boolean}
   */
  isTweening() {
    return this._phase === 'entering' || this._phase === 'exiting';
  }

  /**
   * @returns {THREE.PerspectiveCamera}
   * @private
   */
  get _camera() {
    return this.cameraRig ? this.cameraRig.camera : null;
  }

  /**
   * Lê o alvo (ponto de mira) atual dos controls, se existirem, senão a origem.
   * @private
   * @param {THREE.Vector3} out
   * @returns {THREE.Vector3}
   */
  _readCurrentTarget(out) {
    const controls = this.cameraRig && this.cameraRig.controls;
    if (controls && controls.target) {
      return out.copy(controls.target);
    }
    return out.set(0, 0, 0);
  }

  /**
   * Retorna o corpo (Planet ou Sun) associado a um id, ou null. O Sol não fica
   * no Map de planetas; é tratado à parte.
   * @private
   * @param {string} bodyId
   * @returns {(import('../bodies/Planet.js').Planet|import('../bodies/Sun.js').Sun)|null}
   */
  _getBody(bodyId) {
    if (this.sun && bodyId === this.sun.id) return this.sun;
    return this.bodies ? this.bodies.get(bodyId) || null : null;
  }

  /**
   * Itera todos os corpos focáveis (planetas + Sol) com seus ids.
   * @private
   * @returns {Array<[string, (import('../bodies/Planet.js').Planet|import('../bodies/Sun.js').Sun)]>}
   */
  _allBodies() {
    const entries = this.bodies ? [...this.bodies.entries()] : [];
    if (this.sun) entries.push([this.sun.id, this.sun]);
    return entries;
  }

  /**
   * Resolve a posição de mundo de um corpo pelo id (planeta ou Sol).
   * @private
   * @param {string} bodyId
   * @param {THREE.Vector3} out
   * @returns {THREE.Vector3}
   */
  _resolveBodyPosition(bodyId, out) {
    const body = this._getBody(bodyId);
    if (body && typeof body.getWorldPosition === 'function') {
      return body.getWorldPosition(out);
    }
    // Corpo sem posição própria: centro da cena.
    return out.set(0, 0, 0);
  }

  /**
   * Estima um "raio" do corpo (unidades de cena) para calcular a distância de
   * enquadramento da câmera.
   * @private
   * @param {string} bodyId
   * @returns {number}
   */
  _resolveBodyRadius(bodyId) {
    const data = getBodyById(bodyId);
    if (data && typeof data.raioRel === 'number') return data.raioRel;
    return 1;
  }

  /**
   * Calcula a posição-alvo da câmera para focar num corpo: um ponto afastado do
   * corpo ao longo da direção atual câmera→corpo, mantendo um leve ângulo por
   * cima para uma composição agradável.
   * @private
   * @param {THREE.Vector3} bodyPos - posição de mundo do corpo
   * @param {number} radius - raio estimado do corpo
   * @param {THREE.Vector3} out
   * @returns {THREE.Vector3}
   */
  _computeFocusCameraPos(bodyPos, radius, out) {
    const distance = Math.max(MIN_FOCUS_DISTANCE, radius * FOCUS_DISTANCE_FACTOR);

    // Direção corpo→câmera atual (para não "pular" pro outro lado do planeta).
    const cam = this._camera;
    this._tmpOffset.copy(cam.position).sub(bodyPos);
    if (this._tmpOffset.lengthSq() < 1e-6) {
      // Câmera exatamente sobre o corpo: usa um offset padrão.
      this._tmpOffset.set(0, 0.3, 1);
    }
    this._tmpOffset.normalize();

    // Adiciona uma leve elevação para uma vista mais cinematográfica.
    this._tmpOffset.y += 0.25;
    this._tmpOffset.normalize();

    return out.copy(bodyPos).addScaledVector(this._tmpOffset, distance);
  }

  /**
   * Foca em um corpo pelo id: tween da câmera + LOD FOCUS + InfoCard.
   * @param {string} bodyId
   * @returns {void}
   */
  focus(bodyId) {
    if (!bodyId || !this._camera) return;

    // Já focado neste mesmo corpo (e não saindo): nada a fazer.
    if (this._focusedId === bodyId && this._phase !== 'exiting') return;

    // Trocando de corpo (ou re-focando após sair): desmonta o enxame anterior.
    this._teardownSwarm();

    const cam = this._camera;

    // Se estamos partindo do estado sem foco, salvamos a pose atual da câmera
    // para poder restaurá-la ao sair. (Se já havia foco, mantemos a pose salva
    // original — assim ESC volta ao ponto de partida real.)
    if (this._phase === 'idle') {
      this._savedPos.copy(cam.position);
      this._readCurrentTarget(this._savedTarget);
      this._savedCameraMode = this.appState ? this.appState.get('cameraMode') : 'cinematic';
    }

    // Troca de LOD: o corpo focado vai para FOCUS, os demais para FAR (concentra
    // o orçamento de partículas — spec seção 5).
    this._applyFocusLOD(bodyId);

    // Fase 2: cria o enxame GPGPU do planeta focado (o Sol permanece estático).
    this._createSwarm(bodyId);

    // Estado global + modo de câmera. Em foco ficamos em 'explore' (o passeio
    // cinematográfico não deve interferir).
    if (this.appState) {
      this.appState.set('focusedPlanetId', bodyId);
      this.appState.set('cameraMode', 'explore');
    }

    // Desabilita os OrbitControls durante o tween para que ele não seja
    // "brigado" pela interação/inércia. (Se estávamos seguindo outro corpo,
    // saímos do modo "seguir" — os limites são refeitos ao fim do tween.)
    if (this.cameraRig) {
      if (typeof this.cameraRig.exitFollow === 'function') this.cameraRig.exitFollow();
      if (typeof this.cameraRig.setControlsEnabled === 'function') {
        this.cameraRig.setControlsEnabled(false);
      }
    }

    // Monta o tween: da pose atual até a pose de foco.
    const radius = this._resolveBodyRadius(bodyId);
    this._resolveBodyPosition(bodyId, this._tmpBodyPos);

    this._fromPos.copy(cam.position);
    this._readCurrentTarget(this._fromTarget);
    this._computeFocusCameraPos(this._tmpBodyPos, radius, this._toPos);
    this._toTarget.copy(this._tmpBodyPos);

    this._focusedId = bodyId;
    this._phase = 'entering';
    this._tweening = true;
    this._t = 0;

    // Abre o InfoCard com os dados do corpo.
    if (this.infoCard && typeof this.infoCard.show === 'function') {
      const data = getBodyById(bodyId);
      if (data) this.infoCard.show(data);
    }
  }

  /**
   * Sai do foco atual: reverte câmera/LOD e fecha o InfoCard.
   * @returns {void}
   */
  clearFocus() {
    if (this._phase === 'idle') return;

    // Fase 2: desmonta o enxame GPGPU e reexibe a esfera estática.
    this._teardownSwarm();

    // Restaura o LOD de todos os corpos para o padrão (NEAR).
    this._restoreLOD();

    // Limpa o estado global.
    if (this.appState) {
      this.appState.set('focusedPlanetId', null);
      this.appState.set('cameraMode', this._savedCameraMode || 'explore');
    }

    // Fecha o InfoCard.
    if (this.infoCard && typeof this.infoCard.hide === 'function') {
      this.infoCard.hide();
    }

    // Sai do modo "seguir" (restaura limites de zoom) e desliga os controles
    // durante o tween de saída.
    if (this.cameraRig) {
      if (typeof this.cameraRig.exitFollow === 'function') this.cameraRig.exitFollow();
      if (typeof this.cameraRig.setControlsEnabled === 'function') {
        this.cameraRig.setControlsEnabled(false);
      }
    }

    // Tween de volta à pose salva.
    const cam = this._camera;
    if (cam) {
      this._fromPos.copy(cam.position);
      this._readCurrentTarget(this._fromTarget);
      this._toPos.copy(this._savedPos);
      this._toTarget.copy(this._savedTarget);
    }

    this._focusedId = null;
    this._phase = 'exiting';
    this._tweening = true;
    this._t = 0;
  }

  /**
   * Avança tweens de câmera em andamento.
   * @param {number} dt - delta time em segundos
   * @returns {void}
   */
  update(dt, elapsed = 0) {
    const cam = this._camera;
    if (!cam) return;

    // Fase 2: dirige o enxame GPGPU (mouse + simulação) enquanto existir.
    if (this._swarm) this._updateSwarm(dt, elapsed);

    if (this._phase === 'entering' || this._phase === 'exiting') {
      // Avança o progresso do tween.
      const dur = this.tweenDuration > 0 ? this.tweenDuration : 0.001;
      this._t = Math.min(1, this._t + dt / dur);
      const k = easeInOutCubic(this._t);

      if (this._phase === 'entering') {
        // Enquanto entramos, o corpo pode se mover; recomputamos o destino a
        // cada frame para não "errar" um planeta que orbita durante o tween.
        const radius = this._resolveBodyRadius(this._focusedId);
        this._resolveBodyPosition(this._focusedId, this._tmpBodyPos);
        this._computeFocusCameraPos(this._tmpBodyPos, radius, this._toPos);
        this._toTarget.copy(this._tmpBodyPos);
      }

      // Interpola posição e alvo.
      this._tmpCurPos.copy(this._fromPos).lerp(this._toPos, k);
      this._tmpCurTarget.copy(this._fromTarget).lerp(this._toTarget, k);

      cam.position.copy(this._tmpCurPos);
      this._applyTarget(this._tmpCurTarget);

      if (this._t >= 1) {
        // Fim do tween.
        this._tweening = false;
        if (this._phase === 'entering') {
          this._phase = 'following';
          // Liga os OrbitControls em volta do corpo: o usuário pode girar e
          // dar zoom no planeta em foco. Limites de zoom relativos ao
          // enquadramento (não os do sistema, cujo mínimo é maior que a
          // distância de foco dos corpos pequenos).
          this._prevBodyPos.copy(this._toTarget);
          if (this.cameraRig && typeof this.cameraRig.enterFollow === 'function') {
            const radius = this._resolveBodyRadius(this._focusedId);
            const dist = Math.max(MIN_FOCUS_DISTANCE, radius * FOCUS_DISTANCE_FACTOR);
            this.cameraRig.enterFollow(
              this._toTarget,
              dist * FOLLOW_ZOOM_RANGE[0],
              dist * FOLLOW_ZOOM_RANGE[1],
            );
          }
        } else {
          // exiting → volta a idle e devolve os controls ao usuário.
          this._phase = 'idle';
          if (this.cameraRig && typeof this.cameraRig.setControlsEnabled === 'function') {
            this.cameraRig.setControlsEnabled(true);
          }
        }
      }
      return;
    }

    if (this._phase === 'following' && this._focusedId) {
      // Corpo em foco continua orbitando: transladamos a câmera junto com ele.
      // O offset é medido em relação à posição do corpo no frame ANTERIOR —
      // que era o alvo dos OrbitControls quando eles moveram a câmera neste
      // frame — então rotação/zoom do usuário ficam preservados e o
      // deslocamento do corpo não acumula no offset (o zoom fica nos limites
      // dados em enterFollow).
      this._resolveBodyPosition(this._focusedId, this._tmpBodyPos);

      this._tmpOffset.copy(cam.position).sub(this._prevBodyPos);
      if (this._tmpOffset.lengthSq() < 1e-6) this._tmpOffset.set(0, 0.3, 1);

      cam.position.copy(this._tmpBodyPos).add(this._tmpOffset);
      this._applyTarget(this._tmpBodyPos);
      this._prevBodyPos.copy(this._tmpBodyPos);
    }
  }

  // ----------------------- internos -----------------------

  /**
   * Aplica o ponto de mira à câmera e aos controls (se existirem).
   * @private
   * @param {THREE.Vector3} target
   */
  _applyTarget(target) {
    if (this.cameraRig && typeof this.cameraRig.setTarget === 'function') {
      this.cameraRig.setTarget(target);
    } else if (this._camera) {
      this._camera.lookAt(target);
    }
  }

  /**
   * Coloca o corpo indicado em LOD.FOCUS e os demais em LOD.FAR.
   * @private
   * @param {string} bodyId
   */
  _applyFocusLOD(bodyId) {
    for (const [id, body] of this._allBodies()) {
      if (!body || typeof body.setLOD !== 'function') continue;
      body.setLOD(id === bodyId ? LOD.FOCUS : LOD.FAR);
    }
  }

  /**
   * Restaura o LOD padrão (NEAR) de todos os corpos (planetas + Sol).
   * @private
   */
  _restoreLOD() {
    for (const [, body] of this._allBodies()) {
      if (body && typeof body.setLOD === 'function') {
        body.setLOD(LOD.NEAR);
      }
    }
  }

  /**
   * Registra a posição do mouse (NDC -1..1) e se está sobre a cena. Usado pelo
   * enxame GPGPU para a repulsão do cursor (Fase 2).
   * @param {number} ndcX
   * @param {number} ndcY
   * @param {boolean} active
   * @returns {void}
   */
  setPointer(ndcX, ndcY, active) {
    this._ndc.set(ndcX, ndcY);
    this._pointerActive = !!active;
  }

  /**
   * Cria o enxame GPGPU (Fase 2) para um planeta focado. O Sol não recebe
   * enxame (permanece estático). Falha graciosa → mantém a esfera estática.
   * @private
   * @param {string} bodyId
   * @returns {void}
   */
  _createSwarm(bodyId) {
    const planet = this.bodies ? this.bodies.get(bodyId) : null;
    if (!planet || !this.renderer) return;

    const data = getBodyById(bodyId);
    const radius = this._resolveBodyRadius(bodyId);

    // Calibração pela referência (particles.casberry.in): 20k pontos de ~3px
    // numa esfera que ocupa ~55% da altura da tela, com o fundo aparecendo
    // ENTRE os pontos — é uma casca esparsa que o bloom acende, não uma
    // superfície fechada. Nosso enquadramento em foco é equivalente (FOV 60,
    // distância = 3·raio → ~58% da altura), então:
    //  - tamanho: fixamos o ponto em PIXELS (SWARM_POINT_PX) e convertemos para
    //    o uSize do shader (px = uSize·300/distância);
    //  - contagem: SWARM_REFERENCE_COUNT quando o planeta preenche o
    //    enquadramento; corpos pequenos (distância travada em
    //    MIN_FOCUS_DISTANCE) aparecem menores e recebem menos pontos, na
    //    proporção da área aparente, mantendo o mesmo espaçamento entre pontos.
    const focusDistance = Math.max(MIN_FOCUS_DISTANCE, radius * FOCUS_DISTANCE_FACTOR);
    const size = (SWARM_POINT_PX * focusDistance) / 300;
    const apparent = (radius * FOCUS_DISTANCE_FACTOR) / focusDistance; // 0..1
    const count = Math.min(
      SWARM_MAX_COUNT,
      Math.round(SWARM_REFERENCE_COUNT * apparent * apparent),
    );

    let swarm = new FocusSwarm({
      renderer: this.renderer,
      radius,
      count,
      color: data ? data.corBase : 0xffffff,
      size,
      brightness: SWARM_BRIGHTNESS,
    });
    try {
      swarm.build();
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[FocusSwarm] indisponível, mantendo esfera estática:', e && e.message);
      swarm = null;
    }
    if (!swarm) return;

    planet.setStaticVisible(false);
    planet.group.add(swarm.object3d);
    this._swarm = swarm;
    this._swarmPlanet = planet;
  }

  /**
   * Desmonta o enxame GPGPU e reexibe a esfera estática do planeta.
   * @private
   * @returns {void}
   */
  _teardownSwarm() {
    if (this._swarm && this._swarmPlanet) {
      this._swarmPlanet.group.remove(this._swarm.object3d);
      this._swarm.dispose();
      this._swarmPlanet.setStaticVisible(true);
    }
    this._swarm = null;
    this._swarmPlanet = null;
  }

  /**
   * Projeta o mouse num plano no centro do planeta, converte para o espaço
   * LOCAL do Group e avança a simulação do enxame.
   * @private
   * @param {number} dt
   * @param {number} elapsed
   * @returns {void}
   */
  _updateSwarm(dt, elapsed) {
    const swarm = this._swarm;
    const planet = this._swarmPlanet;
    if (!swarm || !planet) return;

    if (this._pointerActive) {
      const cam = this._camera;
      planet.getWorldPosition(this._tmpWorld);
      cam.getWorldDirection(this._tmpNormal).negate(); // normal do plano → câmera
      this._pointerPlane.setFromNormalAndCoplanarPoint(this._tmpNormal, this._tmpWorld);
      this._raycaster.setFromCamera(this._ndc, cam);
      const hit = this._raycaster.ray.intersectPlane(this._pointerPlane, this._tmpLocal);
      if (hit) {
        planet.group.worldToLocal(this._tmpLocal); // mundo → local do planeta
        swarm.setMouse(this._tmpLocal);
      } else {
        swarm.setMouse(null);
      }
    } else {
      swarm.setMouse(null);
    }

    swarm.update(dt, elapsed);
  }
}
