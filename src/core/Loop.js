/**
 * Loop — laço de renderização baseado em requestAnimationFrame com cálculo de
 * delta time e suporte a pausa (spec seção 3). Notifica callbacks a cada frame
 * com (dt, elapsed).
 *
 * Também implementa o gancho de degradação adaptativa de performance
 * (spec seção 10): mede o FPS médio numa janela e, se ele ficar abaixo de um
 * limiar por X segundos, dispara `onDegrade()` uma única vez para que o
 * chamador reduza a qualidade (ex.: desligar bloom / baixar LOD).
 */

/**
 * @callback FrameCallback
 * @param {number} dt - delta time em segundos desde o último frame (0 se pausado)
 * @param {number} elapsed - tempo total decorrido em segundos (exclui pausas)
 * @returns {void}
 */

/** Limite superior de dt (segundos) para evitar "saltos" após abas em segundo plano. */
const MAX_DT = 0.1;

/** Configuração padrão do detector de queda de FPS (spec seção 10). */
const DEGRADE_DEFAULTS = Object.freeze({
  fpsThreshold: 40, // abaixo disso é considerado "ruim"
  sustainSeconds: 3, // por quanto tempo precisa ficar ruim antes de degradar
});

export class Loop {
  /**
   * @param {object} [options]
   * @param {number} [options.speedMultiplier=1] - escala aplicada a dt/elapsed
   * @param {() => void} [options.onDegrade] - chamado uma vez ao detectar FPS baixo sustentado
   * @param {number} [options.fpsThreshold=40] - limiar de FPS para degradação
   * @param {number} [options.sustainSeconds=3] - segundos abaixo do limiar até degradar
   */
  constructor({
    speedMultiplier = 1,
    onDegrade = null,
    fpsThreshold = DEGRADE_DEFAULTS.fpsThreshold,
    sustainSeconds = DEGRADE_DEFAULTS.sustainSeconds,
  } = {}) {
    /** @type {boolean} */
    this.running = false;
    /** @type {boolean} */
    this.paused = false;
    /** @type {number} - multiplicador de velocidade da simulação */
    this.speedMultiplier = speedMultiplier;

    /** @type {Set<FrameCallback>} */
    this._callbacks = new Set();

    /** @type {number} - tempo simulado acumulado, em segundos (exclui pausas) */
    this._elapsed = 0;
    /** @type {number|null} - timestamp (ms) do frame anterior */
    this._lastTime = null;
    /** @type {number|null} - handle do requestAnimationFrame pendente */
    this._rafId = null;

    // ---- degradação adaptativa (spec seção 10) ----
    /** @type {(() => void)|null} */
    this._onDegrade = onDegrade;
    this._fpsThreshold = fpsThreshold;
    this._sustainSeconds = sustainSeconds;
    /** @type {number} - tempo (s, real) acumulado abaixo do limiar de FPS */
    this._lowFpsTime = 0;
    /** @type {boolean} - garante que onDegrade dispare só uma vez */
    this._degraded = false;

    // O tick é ligado (bound) uma vez para reuso estável no rAF.
    this._tick = this._tick.bind(this);
  }

  /**
   * Registra um callback chamado a cada frame. Retorna função de remoção.
   * @param {FrameCallback} callback
   * @returns {() => void}
   */
  add(callback) {
    this._callbacks.add(callback);
    return () => {
      this._callbacks.delete(callback);
    };
  }

  /**
   * Inicia o laço (requestAnimationFrame). Idempotente.
   * @returns {void}
   */
  start() {
    if (this.running) return;
    this.running = true;
    this._lastTime = null; // força dt=0 no primeiro frame após (re)iniciar
    this._rafId = requestAnimationFrame(this._tick);
  }

  /**
   * Para o laço (cancela o rAF pendente). Idempotente.
   * @returns {void}
   */
  stop() {
    this.running = false;
    if (this._rafId !== null) {
      cancelAnimationFrame(this._rafId);
      this._rafId = null;
    }
  }

  /**
   * Pausa/retoma a simulação. Quando pausado, dt entregue aos callbacks é 0 e
   * o relógio simulado (elapsed) não avança — mas o laço continua rodando para
   * que o render permaneça responsivo (ex.: rotação de câmera manual).
   * @param {boolean} paused
   * @returns {void}
   */
  setPaused(paused) {
    this.paused = !!paused;
  }

  /**
   * Define o multiplicador de velocidade da simulação (escala dt/elapsed).
   * @param {number} multiplier
   * @returns {void}
   */
  setSpeedMultiplier(multiplier) {
    this.speedMultiplier = Number.isFinite(multiplier) ? multiplier : 1;
  }

  /**
   * Registra (ou substitui) o gancho de degradação adaptativa de performance.
   * @param {() => void} callback
   * @returns {void}
   */
  onDegrade(callback) {
    this._onDegrade = callback;
  }

  // ----------------------- internos -----------------------

  /**
   * Um frame do laço: calcula dt real, aplica pausa/velocidade, avança o
   * relógio simulado, notifica callbacks e monitora o FPS.
   * @private
   * @param {number} now - timestamp em ms fornecido pelo requestAnimationFrame
   */
  _tick(now) {
    if (!this.running) return;
    // Agenda o próximo frame imediatamente (mantém o laço mesmo se um callback lançar).
    this._rafId = requestAnimationFrame(this._tick);

    // dt real (segundos), com clamp para evitar saltos após abas ocultas.
    let realDt = this._lastTime === null ? 0 : (now - this._lastTime) / 1000;
    this._lastTime = now;
    if (realDt > MAX_DT) realDt = MAX_DT;
    if (realDt < 0) realDt = 0;

    // Monitoramento de FPS usa o dt REAL (independe de pausa/velocidade).
    this._monitorFps(realDt);

    // dt simulado: zerado se pausado, senão escalado pela velocidade.
    const simDt = this.paused ? 0 : realDt * this.speedMultiplier;
    this._elapsed += simDt;

    // Notifica os callbacks. Iteramos sobre uma cópia para tolerar
    // add/remove durante a iteração.
    for (const cb of Array.from(this._callbacks)) {
      cb(simDt, this._elapsed);
    }
  }

  /**
   * Acumula tempo abaixo do limiar de FPS e dispara onDegrade uma única vez
   * quando a queda for sustentada (spec seção 10).
   * @private
   * @param {number} realDt - delta real em segundos
   */
  _monitorFps(realDt) {
    if (this._degraded || !this._onDegrade || realDt <= 0) return;

    const fps = 1 / realDt;
    if (fps < this._fpsThreshold) {
      this._lowFpsTime += realDt;
      if (this._lowFpsTime >= this._sustainSeconds) {
        this._degraded = true;
        try {
          this._onDegrade();
        } catch (err) {
          // eslint-disable-next-line no-console
          console.error('[Loop] onDegrade lançou uma exceção:', err);
        }
      }
    } else {
      // Recupera-se: reseta o acumulador para exigir queda contínua.
      this._lowFpsTime = 0;
    }
  }
}
