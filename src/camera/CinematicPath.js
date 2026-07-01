/**
 * CinematicPath — passeio automático da câmera por um trajeto suave ao redor do
 * sistema (curva Catmull-Rom), mirando o centro/planetas (spec seção 6). Ativo
 * enquanto o modo é 'cinematic'; cede à interação e retorna após ociosidade.
 *
 * Detalhes de implementação:
 *  - A câmera percorre uma curva Catmull-Rom FECHADA (loop) que orbita o
 *    sistema em alturas/raios variados, produzindo um movimento de "sobrevoo"
 *    contínuo e sem emendas.
 *  - O ponto de mira (lookAt) oscila suavemente perto do centro para dar
 *    sensação de vida sem enjoar.
 *  - Ao (re)ativar via start(), faz um BLEND suave a partir da posição atual da
 *    câmera para o ponto correspondente da curva (importante para o retorno do
 *    modo explore, evitando "teleporte").
 *  - Também detecta descontinuidades (a câmera foi movida por fora, p.ex. pelos
 *    OrbitControls durante o modo explore) e reengata o blend automaticamente.
 */

import * as THREE from 'three';
import { easeInOutCubic } from '../util/math.js';

export class CinematicPath {
  /**
   * @param {object} options
   * @param {THREE.PerspectiveCamera} options.camera
   * @param {THREE.Vector3[]} [options.waypoints] - pontos de controle do trajeto
   * @param {number} [options.duration=60] - segundos para percorrer o trajeto completo
   * @param {THREE.Vector3} [options.lookAt] - ponto de mira padrão (centro)
   */
  constructor({ camera, waypoints, duration = 60, lookAt } = {}) {
    /** @type {THREE.PerspectiveCamera} */
    this.camera = camera;
    /** @type {number} */
    this.duration = duration;
    /** @type {THREE.Vector3} */
    this.lookAt = lookAt || new THREE.Vector3(0, 0, 0);
    /** @type {number} progresso normalizado ao longo da curva (0..1) @private */
    this._t = 0;

    /** @type {boolean} passeio ativo? @private */
    this._active = false;

    /**
     * Estado do blend de reentrada (transição suave da posição atual da câmera
     * para a curva). Enquanto _blend.t < 1, interpolamos.
     * @private
     */
    this._blend = {
      active: false,
      t: 0,
      duration: 2.5, // segundos do blend de reentrada
      from: new THREE.Vector3(),
      fromLook: new THREE.Vector3(),
    };

    // Vetores reutilizáveis (evita alocação por frame).
    /** @private */ this._pos = new THREE.Vector3();
    /** @private */ this._look = new THREE.Vector3();

    // Constrói a curva a partir dos waypoints (ou de um trajeto padrão).
    const pts = waypoints && waypoints.length >= 2 ? waypoints : this._defaultWaypoints();
    /** @type {THREE.CatmullRomCurve3|null} */
    this.curve = new THREE.CatmullRomCurve3(pts, true, 'catmullrom', 0.5);
  }

  /**
   * Ativa o passeio (ex.: ao entrar no modo cinematic). Faz um blend suave a
   * partir da posição atual da câmera para o ponto atual da curva.
   * @returns {void}
   */
  start() {
    this._active = true;
    this._beginBlend();
  }

  /**
   * Pausa o passeio (ex.: ao entrar no modo explore).
   * @returns {void}
   */
  stop() {
    this._active = false;
    this._blend.active = false;
  }

  /**
   * Avança a câmera pelo trajeto. Só tem efeito quando ativo.
   * @param {number} dt - delta time em segundos
   * @returns {void}
   */
  update(dt) {
    if (!this._active || !this.curve) return;

    // Se a câmera foi movida por fora (modo explore) e ainda não estamos em
    // blend, reengata o blend a partir da posição atual — evita teleporte no
    // retorno por ociosidade mesmo que start() não seja chamado de novo.
    if (!this._blend.active) {
      this.curve.getPointAt(this._t % 1, this._pos);
      if (this.camera.position.distanceToSquared(this._pos) > 4) {
        this._beginBlend();
      }
    }

    // Avança o parâmetro da curva (loop em [0,1)).
    if (this.duration > 0) {
      this._t = (this._t + dt / this.duration) % 1;
    }

    // Ponto-alvo na curva e mira oscilante suave perto do centro.
    this.curve.getPointAt(this._t, this._pos);
    this._computeLookAt(this._look);

    if (this._blend.active) {
      // Interpola da posição/mira capturadas para o alvo da curva.
      this._blend.t += this.duration > 0 ? dt / this._blend.duration : 1;
      const k = easeInOutCubic(this._blend.t);
      this.camera.position.lerpVectors(this._blend.from, this._pos, k);
      this._look.lerpVectors(this._blend.fromLook, this._look, k);
      this.camera.lookAt(this._look);
      if (this._blend.t >= 1) this._blend.active = false;
    } else {
      // Segue a curva exatamente.
      this.camera.position.copy(this._pos);
      this.camera.lookAt(this._look);
    }
  }

  // ----------------------- internos -----------------------

  /**
   * Inicia o blend de reentrada capturando a posição/mira atuais da câmera.
   * @private
   * @returns {void}
   */
  _beginBlend() {
    this._blend.active = true;
    this._blend.t = 0;
    this._blend.from.copy(this.camera.position);
    // Aproxima a mira atual: ponto à frente da câmera (direção de visão).
    this.camera.getWorldDirection(this._blend.fromLook);
    this._blend.fromLook.multiplyScalar(50).add(this.camera.position);
  }

  /**
   * Calcula o ponto de mira, oscilando levemente ao redor do centro para dar
   * dinamismo sem enjoar.
   * @private
   * @param {THREE.Vector3} out
   * @returns {THREE.Vector3}
   */
  _computeLookAt(out) {
    const a = this._t * Math.PI * 2;
    out.set(
      this.lookAt.x + Math.sin(a * 1.3) * 4,
      this.lookAt.y + Math.sin(a * 0.7) * 3,
      this.lookAt.z + Math.cos(a * 1.1) * 4,
    );
    return out;
  }

  /**
   * Waypoints padrão: um anel elevado ao redor do sistema, com raio e altura
   * variados para dar um "sobrevoo" cinematográfico. Dimensionado para o
   * sistema (planeta mais externo ~80 unidades).
   * @private
   * @returns {THREE.Vector3[]}
   */
  _defaultWaypoints() {
    const pts = [];
    const rings = 8; // número de pontos de controle ao redor
    const baseRadius = 130;
    for (let i = 0; i < rings; i++) {
      const a = (i / rings) * Math.PI * 2;
      // Raio e altura oscilando para o trajeto não ser um círculo perfeito.
      const radius = baseRadius + Math.sin(a * 2) * 30;
      const height = 45 + Math.sin(a * 3) * 35;
      pts.push(new THREE.Vector3(Math.cos(a) * radius, height, Math.sin(a) * radius));
    }
    return pts;
  }
}
