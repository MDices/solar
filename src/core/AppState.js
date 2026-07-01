/**
 * AppState — estado global mínimo e mutável da aplicação (spec seção 9).
 *
 * Guarda apenas o essencial:
 *  - cameraMode: 'cinematic' | 'explore'
 *  - focusedPlanetId: string | null  (id do planeta em foco, ou null)
 *  - speedMultiplier: number         (multiplicador de velocidade orbital)
 *  - paused: boolean                 (simulação pausada)
 *
 * Padrão observável simples: `get`, `set` e `subscribe`. `set` notifica os
 * assinantes apenas quando o valor realmente muda. Sem dependências externas.
 */

/** @typedef {'cinematic' | 'explore'} CameraMode */

/**
 * @typedef {object} AppStateData
 * @property {CameraMode} cameraMode
 * @property {string|null} focusedPlanetId
 * @property {number} speedMultiplier
 * @property {boolean} paused
 */

/**
 * @callback AppStateListener
 * @param {*} value - novo valor da chave alterada
 * @param {string} key - chave alterada
 * @param {AppStateData} state - snapshot do estado completo
 * @returns {void}
 */

const DEFAULT_STATE = Object.freeze({
  cameraMode: 'cinematic',
  focusedPlanetId: null,
  speedMultiplier: 1.0,
  paused: false,
});

export class AppState {
  /**
   * @param {Partial<AppStateData>} [initial] - sobrescreve valores iniciais
   */
  constructor(initial = {}) {
    /** @type {AppStateData} */
    this._state = { ...DEFAULT_STATE, ...initial };
    /** @type {Set<AppStateListener>} */
    this._listeners = new Set();
  }

  /**
   * Lê o valor de uma chave do estado.
   * @template {keyof AppStateData} K
   * @param {K} key
   * @returns {AppStateData[K]}
   */
  get(key) {
    return this._state[key];
  }

  /**
   * Retorna uma cópia rasa do estado completo (imutável para o chamador).
   * @returns {AppStateData}
   */
  getState() {
    return { ...this._state };
  }

  /**
   * Define o valor de uma chave. Notifica assinantes apenas se o valor mudou.
   * @template {keyof AppStateData} K
   * @param {K} key
   * @param {AppStateData[K]} value
   * @returns {void}
   */
  set(key, value) {
    if (this._state[key] === value) return;
    this._state[key] = value;
    this._notify(value, key);
  }

  /**
   * Inscreve um listener para mudanças de estado. Retorna uma função de
   * cancelamento (unsubscribe).
   * @param {AppStateListener} listener
   * @returns {() => void}
   */
  subscribe(listener) {
    this._listeners.add(listener);
    return () => {
      this._listeners.delete(listener);
    };
  }

  /**
   * Notifica todos os assinantes de uma mudança.
   * @private
   * @param {*} value
   * @param {string} key
   */
  _notify(value, key) {
    const snapshot = this.getState();
    for (const listener of this._listeners) {
      listener(value, key, snapshot);
    }
  }
}
