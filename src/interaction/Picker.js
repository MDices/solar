/**
 * Picker — raycasting do mouse contra as esferas de colisão invisíveis dos
 * corpos, retornando qual planeta/Sol foi clicado (spec seção 8). Usa esferas
 * de colisão em vez de raycast direto em Points (mais barato).
 */

import * as THREE from 'three';

/**
 * @callback PickCallback
 * @param {string|null} bodyId - id do corpo clicado, ou null se clicou no vazio
 * @returns {void}
 */

// Distância (em px de tela) que o ponteiro pode se mover entre pressionar e
// soltar sem deixar de ser considerado um "clique" (evita disparar pick ao
// arrastar/orbitar a câmera).
const CLICK_DRAG_TOLERANCE = 6;

export class Picker {
  /**
   * @param {object} options
   * @param {THREE.PerspectiveCamera} options.camera
   * @param {HTMLElement} options.domElement - elemento que recebe os cliques
   * @param {Array<{ id: string, hitMesh: THREE.Object3D }>} [options.targets] - corpos alvo
   */
  constructor({ camera, domElement, targets = [] } = {}) {
    /** @type {THREE.PerspectiveCamera} */
    this.camera = camera;
    /** @type {HTMLElement} */
    this.domElement = domElement;
    /** @type {Array<{ id: string, hitMesh: THREE.Object3D }>} */
    this.targets = targets;
    /** @type {THREE.Raycaster} */
    this.raycaster = new THREE.Raycaster();
    /** @type {Set<PickCallback>} */
    this._callbacks = new Set();

    // Vetor NDC reutilizável para não alocar por clique.
    this._ndc = new THREE.Vector2();

    // Estado de detecção de clique-vs-arrasto.
    this._downX = 0;
    this._downY = 0;
    this._pointerId = null;

    // Handlers com `this` amarrado (para poder remover no dispose).
    this._onPointerDown = this._handlePointerDown.bind(this);
    this._onPointerUp = this._handlePointerUp.bind(this);
  }

  /**
   * Liga o listener de clique/tap no domElement.
   * @returns {void}
   */
  init() {
    if (!this.domElement) return;
    // Usamos pointer events (cobrem mouse + touch) e distinguimos clique de
    // arrasto comparando as posições de down/up.
    this.domElement.addEventListener('pointerdown', this._onPointerDown);
    this.domElement.addEventListener('pointerup', this._onPointerUp);
  }

  /**
   * Define/atualiza a lista de corpos alvo do raycast.
   * @param {Array<{ id: string, hitMesh: THREE.Object3D }>} targets
   * @returns {void}
   */
  setTargets(targets) {
    this.targets = Array.isArray(targets) ? targets : [];
  }

  /**
   * Registra um callback disparado ao clicar num corpo (ou no vazio).
   * Retorna função de remoção.
   * @param {PickCallback} callback
   * @returns {() => void}
   */
  onPick(callback) {
    this._callbacks.add(callback);
    return () => {
      this._callbacks.delete(callback);
    };
  }

  /**
   * Executa um raycast a partir de coordenadas de tela normalizadas (NDC).
   * @param {number} ndcX - -1..1
   * @param {number} ndcY - -1..1
   * @returns {string|null} id do corpo atingido, ou null
   */
  pickAt(ndcX, ndcY) {
    if (!this.camera || !this.targets || this.targets.length === 0) return null;

    this._ndc.set(ndcX, ndcY);
    this.raycaster.setFromCamera(this._ndc, this.camera);

    // Monta a lista de meshes de colisão, mantendo o vínculo mesh → id.
    // (Reconstruída a cada pick pois `targets` pode mudar de tamanho.)
    let closestId = null;
    let closestDist = Infinity;

    for (const target of this.targets) {
      if (!target || !target.hitMesh) continue;
      // `recursive = false`: as hitMesh são esferas simples e planas.
      const hits = this.raycaster.intersectObject(target.hitMesh, false);
      if (hits.length > 0 && hits[0].distance < closestDist) {
        closestDist = hits[0].distance;
        closestId = target.id;
      }
    }

    return closestId;
  }

  /**
   * Converte coordenadas de tela (clientX/clientY) para NDC relativos ao
   * domElement.
   * @private
   * @param {number} clientX
   * @param {number} clientY
   * @returns {{ x: number, y: number }}
   */
  _clientToNdc(clientX, clientY) {
    const rect = this.domElement.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * 2 - 1;
    const y = -((clientY - rect.top) / rect.height) * 2 + 1;
    return { x, y };
  }

  /**
   * @private
   * @param {PointerEvent} event
   */
  _handlePointerDown(event) {
    // Só rastreamos o botão principal / toque primário.
    if (event.button !== undefined && event.button !== 0) return;
    this._pointerId = event.pointerId;
    this._downX = event.clientX;
    this._downY = event.clientY;
  }

  /**
   * @private
   * @param {PointerEvent} event
   */
  _handlePointerUp(event) {
    if (this._pointerId !== null && event.pointerId !== this._pointerId) return;
    this._pointerId = null;
    if (event.button !== undefined && event.button !== 0) return;

    // Se o ponteiro andou demais entre down e up, foi um arrasto (orbitar a
    // câmera), não um clique — ignoramos para não roubar a interação.
    const dx = event.clientX - this._downX;
    const dy = event.clientY - this._downY;
    if (Math.hypot(dx, dy) > CLICK_DRAG_TOLERANCE) return;

    const { x, y } = this._clientToNdc(event.clientX, event.clientY);
    const bodyId = this.pickAt(x, y);
    this._emit(bodyId);
  }

  /**
   * Notifica todos os callbacks registrados.
   * @private
   * @param {string|null} bodyId
   */
  _emit(bodyId) {
    for (const cb of this._callbacks) {
      cb(bodyId);
    }
  }

  /**
   * Remove listeners.
   * @returns {void}
   */
  dispose() {
    if (this.domElement) {
      this.domElement.removeEventListener('pointerdown', this._onPointerDown);
      this.domElement.removeEventListener('pointerup', this._onPointerUp);
    }
    this._callbacks.clear();
    this._pointerId = null;
  }
}
