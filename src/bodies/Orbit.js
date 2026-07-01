/**
 * Orbit — trilha orbital (elipse leve) e posição do corpo no tempo
 * (spec seções 3 e 9). Calcula a posição em função de um ângulo acumulado,
 * aplicando excentricidade e inclinação. Opcionalmente cria uma linha/trilha
 * visível da órbita.
 */

import * as THREE from 'three';
import { degToRad } from '../util/math.js';

export class Orbit {
  /**
   * @param {object} options
   * @param {number} options.distance - semi-eixo maior (distância base ao Sol)
   * @param {number} [options.eccentricity=0] - excentricidade (0 = círculo)
   * @param {number} [options.inclination=0] - inclinação do plano orbital em graus
   * @param {number} [options.speed=1] - velocidade angular relativa
   * @param {number} [options.phase] - ângulo inicial em radianos (padrão aleatório)
   * @param {boolean} [options.showTrail=true] - desenhar a linha da órbita
   * @param {number} [options.baseAngularSpeed=0.35] - velocidade angular base (rad/s)
   *   para speed=1 e speedMultiplier=1 (mantém o movimento agradável na tela).
   * @param {number|THREE.Color|string} [options.trailColor=0x3a4a6a] - cor da trilha
   */
  constructor({
    distance,
    eccentricity = 0,
    inclination = 0,
    speed = 1,
    phase = 0,
    showTrail = true,
    baseAngularSpeed = 0.35,
    trailColor = 0x3a4a6a,
  } = {}) {
    /** @type {number} */
    this.distance = distance;
    /** @type {number} */
    this.eccentricity = eccentricity;
    /** @type {number} */
    this.inclination = inclination;
    /** @type {number} */
    this.speed = speed;
    /** @type {number} ângulo acumulado (radianos) */
    this.angle = phase;
    /** @type {boolean} */
    this.showTrail = showTrail;
    /** @type {THREE.Line|null} linha visível da trilha orbital */
    this.trail = null;

    /** @type {number} velocidade angular base em rad/s */
    this._baseAngularSpeed = baseAngularSpeed;
    /** @type {THREE.Color} */
    this._trailColor = new THREE.Color(trailColor);

    // Geometria da elipse: semi-eixo maior (a) = distance; semi-eixo menor (b)
    // derivado da excentricidade: b = a * sqrt(1 - e²). O foco fica no Sol
    // (origem), então deslocamos a elipse pelo valor c = a * e no eixo x.
    /** @type {number} semi-eixo maior */
    this._a = distance;
    /** @type {number} semi-eixo menor */
    this._b = distance * Math.sqrt(Math.max(0, 1 - eccentricity * eccentricity));
    /** @type {number} deslocamento do centro em relação ao foco (Sol) */
    this._c = distance * eccentricity;

    // Rotação do plano orbital em torno do eixo x (inclinação em radianos).
    /** @type {number} */
    this._inclinationRad = degToRad(inclination);
  }

  /**
   * Avança o ângulo orbital e retorna a nova posição.
   * @param {number} dt - delta time em segundos
   * @param {number} [speedMultiplier=1] - multiplicador global de velocidade
   * @param {THREE.Vector3} [target] - vetor de saída opcional
   * @returns {THREE.Vector3} posição do corpo neste instante
   */
  update(dt, speedMultiplier = 1, target = new THREE.Vector3()) {
    // Avança o ângulo proporcional à velocidade relativa do planeta e ao
    // multiplicador global. dt em segundos mantém o movimento independente do FPS.
    this.angle += this._baseAngularSpeed * this.speed * speedMultiplier * dt;
    return this.positionAt(this.angle, target);
  }

  /**
   * Calcula a posição na órbita para um ângulo específico (função pura, testável).
   * Elipse no plano XZ com o Sol num dos focos, opcionalmente inclinada em X.
   * @param {number} angle - ângulo em radianos
   * @param {THREE.Vector3} [target] - vetor de saída opcional
   * @returns {THREE.Vector3}
   */
  positionAt(angle, target = new THREE.Vector3()) {
    // Posição na elipse parametrizada (centro na origem), depois deslocada
    // por -c em x para colocar o foco (Sol) na origem do mundo.
    const x = Math.cos(angle) * this._a - this._c;
    const z = Math.sin(angle) * this._b;

    // Aplica a inclinação girando o ponto em torno do eixo X.
    const cosI = Math.cos(this._inclinationRad);
    const sinI = Math.sin(this._inclinationRad);
    const y = -z * sinI;
    const zRot = z * cosI;

    return target.set(x, y, zRot);
  }

  /**
   * Cria (e retorna) a linha visível da trilha orbital para adicionar à cena.
   * Percorre a elipse inteira em `segments` passos, reaproveitando `positionAt`
   * para que a trilha coincida exatamente com o caminho do corpo.
   * @param {number} [segments=128] - resolução da elipse
   * @returns {THREE.Line}
   */
  buildTrail(segments = 128) {
    // Libera qualquer trilha anterior antes de reconstruir.
    if (this.trail) this.dispose();

    const points = [];
    const tmp = new THREE.Vector3();
    for (let i = 0; i <= segments; i++) {
      const a = (i / segments) * Math.PI * 2;
      this.positionAt(a, tmp);
      points.push(tmp.x, tmp.y, tmp.z);
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(points, 3),
    );

    const material = new THREE.LineBasicMaterial({
      color: this._trailColor,
      transparent: true,
      opacity: 0.35,
      depthWrite: false,
    });

    this.trail = new THREE.LineLoop(geometry, material);
    this.trail.frustumCulled = false;
    return this.trail;
  }

  /**
   * Libera recursos da trilha.
   * @returns {void}
   */
  dispose() {
    if (this.trail) {
      if (this.trail.geometry) this.trail.geometry.dispose();
      if (this.trail.material) this.trail.material.dispose();
      this.trail = null;
    }
  }
}
