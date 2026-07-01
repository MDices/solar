/**
 * Hud — HUD sobreposto (spec seção 8): título, controle de velocidade (+/−,
 * presets), pausa (ESPAÇO), reset (R) como botões discretos + atalhos de
 * teclado, e a dica de controles no primeiro load. UI em PT-BR. Lê/escreve o
 * AppState (speedMultiplier, paused).
 *
 * Constrói o DOM via JS e casa com as classes de `styles.css` (.hud,
 * .hud__title, .hud__controls, .hud__button, .hud__status, .hint).
 */

import { AppState } from '../core/AppState.js';

/**
 * @callback ResetCallback
 * @returns {void}
 */

/**
 * Presets de velocidade orbital (multiplicador). O "1×" é o padrão do AppState.
 * @type {number[]}
 */
const SPEED_PRESETS = [0.25, 0.5, 1, 2, 4, 8];

/** Limites para os botões +/− (evita valores absurdos). */
const SPEED_MIN = 0.1;
const SPEED_MAX = 16;
/** Fator multiplicativo aplicado pelos botões +/−. */
const SPEED_STEP = 2;

/** Tempo (ms) que a dica de controles fica visível no primeiro load. */
const HINT_DURATION_MS = 6000;

export class Hud {
  /**
   * @param {object} options
   * @param {HTMLElement} options.root - contêiner da UI (#ui-root)
   * @param {AppState} options.appState
   */
  constructor({ root, appState } = {}) {
    /** @type {HTMLElement} */
    this.root = root;
    /** @type {AppState} */
    this.appState = appState;
    /** @type {HTMLElement|null} */
    this.el = null;
    /** @type {Set<ResetCallback>} */
    this._resetCallbacks = new Set();

    // Elementos internos.
    /** @type {HTMLElement|null} */
    this._statusEl = null;
    /** @type {HTMLButtonElement|null} */
    this._pauseBtn = null;
    /** @type {HTMLElement|null} */
    this._hintEl = null;
    /** @type {Map<number, HTMLButtonElement>} */
    this._presetBtns = new Map();

    // Handlers guardados para remoção no dispose.
    /** @type {((e: KeyboardEvent) => void)|null} */
    this._onKeyDown = null;
    /** @type {(() => void)|null} */
    this._unsubscribe = null;
    /** @type {ReturnType<typeof setTimeout>|null} */
    this._hintTimer = null;
  }

  /**
   * Cria os elementos DOM do HUD, insere na raiz e liga os atalhos de teclado.
   * @returns {void}
   */
  mount() {
    if (this.el) return; // idempotente

    const hud = document.createElement('div');
    hud.className = 'hud';

    // Título.
    const title = document.createElement('div');
    title.className = 'hud__title';
    title.textContent = 'Sistema Solar';
    hud.appendChild(title);

    // Linha de controles de velocidade: [−] presets… [+]
    const controls = document.createElement('div');
    controls.className = 'hud__controls';

    const minusBtn = this._makeButton('−', 'Diminuir velocidade', () =>
      this._nudgeSpeed(1 / SPEED_STEP)
    );
    controls.appendChild(minusBtn);

    for (const preset of SPEED_PRESETS) {
      const label = this._formatSpeed(preset);
      const btn = this._makeButton(label, `Velocidade ${label}`, () =>
        this.appState.set('speedMultiplier', preset)
      );
      this._presetBtns.set(preset, btn);
      controls.appendChild(btn);
    }

    const plusBtn = this._makeButton('+', 'Aumentar velocidade', () =>
      this._nudgeSpeed(SPEED_STEP)
    );
    controls.appendChild(plusBtn);

    hud.appendChild(controls);

    // Linha de controles de simulação: [Pausar] [Reiniciar]
    const simControls = document.createElement('div');
    simControls.className = 'hud__controls';

    this._pauseBtn = this._makeButton('Pausar', 'Pausar/retomar (Espaço)', () =>
      this._togglePause()
    );
    simControls.appendChild(this._pauseBtn);

    const resetBtn = this._makeButton('Reiniciar', 'Reiniciar (R)', () =>
      this._emitReset()
    );
    simControls.appendChild(resetBtn);

    hud.appendChild(simControls);

    // Linha de status (velocidade / PAUSADO).
    const status = document.createElement('div');
    status.className = 'hud__status';
    status.setAttribute('aria-live', 'polite');
    this._statusEl = status;
    hud.appendChild(status);

    this.el = hud;
    this.root.appendChild(hud);

    // Atalhos de teclado (ESPAÇO = pausa, R = reset, +/- = velocidade).
    this._onKeyDown = (e) => this._handleKeyDown(e);
    window.addEventListener('keydown', this._onKeyDown);

    // Mantém o HUD sincronizado quando o estado muda por qualquer via.
    this._unsubscribe = this.appState.subscribe((_value, key) => {
      if (key === 'speedMultiplier' || key === 'paused') this.refresh();
    });

    this.refresh();
  }

  /**
   * Cria um botão do HUD já estilizado e com listener.
   * @private
   * @param {string} label
   * @param {string} ariaLabel
   * @param {() => void} onClick
   * @returns {HTMLButtonElement}
   */
  _makeButton(label, ariaLabel, onClick) {
    const btn = document.createElement('button');
    btn.className = 'hud__button';
    btn.type = 'button';
    btn.textContent = label;
    btn.setAttribute('aria-label', ariaLabel);
    btn.addEventListener('click', onClick);
    return btn;
  }

  /**
   * Multiplica a velocidade atual, presa aos limites. Usada pelos botões +/−.
   * @private
   * @param {number} factor
   */
  _nudgeSpeed(factor) {
    const current = this.appState.get('speedMultiplier');
    const next = Math.min(SPEED_MAX, Math.max(SPEED_MIN, current * factor));
    // Arredonda para evitar acúmulo de imprecisão de ponto flutuante.
    this.appState.set('speedMultiplier', Math.round(next * 1000) / 1000);
  }

  /**
   * Alterna o estado de pausa.
   * @private
   */
  _togglePause() {
    this.appState.set('paused', !this.appState.get('paused'));
  }

  /**
   * Formata um multiplicador de velocidade para exibição (ex.: "0.5×", "2×").
   * @private
   * @param {number} value
   * @returns {string}
   */
  _formatSpeed(value) {
    // String(value) já produz a forma enxuta desejada: 1 -> "1", 0.25 -> "0.25".
    const s = String(value);
    return `${s}×`;
  }

  /**
   * Trata os atalhos de teclado globais do HUD.
   * @private
   * @param {KeyboardEvent} e
   */
  _handleKeyDown(e) {
    // Ignora quando o usuário está digitando em um campo editável.
    const target = /** @type {HTMLElement} */ (e.target);
    if (
      target &&
      (target.isContentEditable ||
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT')
    ) {
      return;
    }

    switch (e.code) {
      case 'Space':
        e.preventDefault(); // evita rolagem/ativação de botão focado
        this._togglePause();
        break;
      case 'KeyR':
        this._emitReset();
        break;
      case 'Equal': // '=' / '+'
      case 'NumpadAdd':
        this._nudgeSpeed(SPEED_STEP);
        break;
      case 'Minus': // '-'
      case 'NumpadSubtract':
        this._nudgeSpeed(1 / SPEED_STEP);
        break;
      default:
        break;
    }
  }

  /**
   * Atualiza o texto de status (velocidade / PAUSADO) a partir do AppState e
   * destaca o preset ativo.
   * @returns {void}
   */
  refresh() {
    if (!this.el) return;

    const speed = this.appState.get('speedMultiplier');
    const paused = this.appState.get('paused');

    // Texto de status.
    if (this._statusEl) {
      const speedTxt = `Velocidade ${this._formatSpeed(speed)}`;
      this._statusEl.textContent = paused ? `${speedTxt} · PAUSADO` : speedTxt;
    }

    // Rótulo/estado do botão de pausa.
    if (this._pauseBtn) {
      this._pauseBtn.textContent = paused ? 'Retomar' : 'Pausar';
      this._pauseBtn.setAttribute('aria-pressed', String(paused));
    }

    // Destaca o preset ativo (classe --active; combina com valores aproximados).
    for (const [preset, btn] of this._presetBtns) {
      const active = Math.abs(preset - speed) < 1e-6;
      btn.classList.toggle('hud__button--active', active);
      btn.setAttribute('aria-pressed', String(active));
    }
  }

  /**
   * Exibe a dica de controles (primeiro load); some após alguns segundos.
   * @returns {void}
   */
  showHint() {
    // Cria a dica sob demanda (não faz parte do bloco .hud).
    if (!this._hintEl) {
      const hint = document.createElement('div');
      hint.className = 'hint';
      hint.textContent =
        'Clique num corpo para focar · Arraste para orbitar · Scroll para zoom · Espaço: pausar · R: reiniciar · Esc: sair do foco';
      this._hintEl = hint;
      this.root.appendChild(hint);
    }

    // Reinicia o cronômetro de auto-ocultação.
    if (this._hintTimer) clearTimeout(this._hintTimer);
    this._hintEl.classList.remove('hint--hidden');

    this._hintTimer = setTimeout(() => {
      if (this._hintEl) this._hintEl.classList.add('hint--hidden');
      this._hintTimer = null;
    }, HINT_DURATION_MS);
  }

  /**
   * Registra callback para o botão/atalho de reset (R).
   * Retorna função de remoção.
   * @param {ResetCallback} callback
   * @returns {() => void}
   */
  onReset(callback) {
    this._resetCallbacks.add(callback);
    return () => {
      this._resetCallbacks.delete(callback);
    };
  }

  /**
   * Dispara os callbacks de reset.
   * @private
   */
  _emitReset() {
    for (const cb of this._resetCallbacks) cb();
  }

  /**
   * Remove o HUD do DOM e limpa listeners.
   * @returns {void}
   */
  dispose() {
    if (this._onKeyDown) {
      window.removeEventListener('keydown', this._onKeyDown);
      this._onKeyDown = null;
    }
    if (this._unsubscribe) {
      this._unsubscribe();
      this._unsubscribe = null;
    }
    if (this._hintTimer) {
      clearTimeout(this._hintTimer);
      this._hintTimer = null;
    }
    this._resetCallbacks.clear();
    this._presetBtns.clear();

    if (this.el && this.el.parentNode) {
      this.el.parentNode.removeChild(this.el);
    }
    if (this._hintEl && this._hintEl.parentNode) {
      this._hintEl.parentNode.removeChild(this._hintEl);
    }
    this.el = null;
    this._hintEl = null;
    this._statusEl = null;
    this._pauseBtn = null;
  }
}
