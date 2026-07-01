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

// Multiplicadores usados para calcular a distância da câmera ao corpo em foco,
// em função do "tamanho" do corpo. Deixamos o corpo confortavelmente enquadrado.
const FOCUS_DISTANCE_FACTOR = 3.0; // distância = raio * fator (perto → planeta grande na tela)
const MIN_FOCUS_DISTANCE = 5.5; // piso para corpos muito pequenos (ex.: Mercúrio)

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
  constructor({ cameraRig, appState, bodies, sun, infoCard, tweenDuration = 1.5 } = {}) {
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
    /** @type {number} */
    this.tweenDuration = tweenDuration;
    /** @type {boolean} */
    this._tweening = false;

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

    // Estado global + modo de câmera. Em foco ficamos em 'explore' (o passeio
    // cinematográfico não deve interferir).
    if (this.appState) {
      this.appState.set('focusedPlanetId', bodyId);
      this.appState.set('cameraMode', 'explore');
    }

    // Desabilita os OrbitControls durante o tween para que ele não seja
    // "brigado" pela interação/inércia.
    if (this.cameraRig && typeof this.cameraRig.setControlsEnabled === 'function') {
      this.cameraRig.setControlsEnabled(false);
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
  update(dt) {
    const cam = this._camera;
    if (!cam) return;

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
      // Corpo em foco continua orbitando: mantemos a câmera "grudada" nele,
      // preservando a DIREÇÃO de visão mas RENORMALIZANDO a distância para o
      // enquadramento-alvo — assim o planeta fica sempre grande e consistente na
      // tela (antes o offset acumulava e o planeta ia ficando pequeno/longe).
      this._resolveBodyPosition(this._focusedId, this._tmpBodyPos);
      const radius = this._resolveBodyRadius(this._focusedId);
      const targetDist = Math.max(MIN_FOCUS_DISTANCE, radius * FOCUS_DISTANCE_FACTOR);

      this._tmpOffset.copy(cam.position).sub(this._tmpBodyPos);
      if (this._tmpOffset.lengthSq() < 1e-6) this._tmpOffset.set(0, 0.3, 1);
      this._tmpOffset.normalize().multiplyScalar(targetDist);

      cam.position.copy(this._tmpBodyPos).add(this._tmpOffset);
      this._tmpCurTarget.copy(this._tmpBodyPos);
      this._applyTarget(this._tmpCurTarget);
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
}
