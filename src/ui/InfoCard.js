/**
 * InfoCard — painel HTML translúcido que mostra nome, dados e um fato do corpo
 * focado (spec seção 8). Aparece no foco e some ao sair. UI em PT-BR.
 *
 * Constrói o DOM inteiramente via JS e casa com as classes já definidas em
 * `styles.css` (.infocard, .infocard__name, .infocard__fact, .infocard__data,
 * .infocard__close, e o modificador .infocard--visible).
 */

/**
 * @callback CloseCallback
 * @returns {void}
 */

export class InfoCard {
  /**
   * @param {object} options
   * @param {HTMLElement} options.root - contêiner da UI (#ui-root) onde o card é montado
   */
  constructor({ root } = {}) {
    /** @type {HTMLElement} */
    this.root = root;
    /** @type {HTMLElement|null} */
    this.el = null;
    /** @type {boolean} */
    this.visible = false;
    /** @type {Set<CloseCallback>} */
    this._closeCallbacks = new Set();

    // Referências internas para os elementos que mudam a cada `show`.
    /** @type {HTMLElement|null} */
    this._nameEl = null;
    /** @type {HTMLElement|null} */
    this._factEl = null;
    /** @type {HTMLElement|null} */
    this._dataEl = null;
    /** @type {HTMLButtonElement|null} */
    this._closeBtn = null;
    /** @type {((e: MouseEvent) => void)|null} */
    this._onCloseClick = null;
  }

  /**
   * Cria o elemento DOM do card (escondido) e o insere na raiz da UI.
   * @returns {void}
   */
  mount() {
    if (this.el) return; // idempotente

    const card = document.createElement('aside');
    card.className = 'infocard';
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-label', 'Informações do corpo celeste');
    // Escondido do leitor de tela e do foco enquanto invisível.
    card.setAttribute('aria-hidden', 'true');

    // Botão de fechar (X).
    const closeBtn = document.createElement('button');
    closeBtn.className = 'infocard__close';
    closeBtn.type = 'button';
    closeBtn.setAttribute('aria-label', 'Fechar');
    closeBtn.textContent = '×';
    this._onCloseClick = () => this._emitClose();
    closeBtn.addEventListener('click', this._onCloseClick);

    // Nome do corpo.
    const nameEl = document.createElement('h2');
    nameEl.className = 'infocard__name';

    // Fato curto.
    const factEl = document.createElement('p');
    factEl.className = 'infocard__fact';

    // Grade de dados (rótulo/valor).
    const dataEl = document.createElement('div');
    dataEl.className = 'infocard__data';

    card.appendChild(closeBtn);
    card.appendChild(nameEl);
    card.appendChild(factEl);
    card.appendChild(dataEl);

    this.el = card;
    this._nameEl = nameEl;
    this._factEl = factEl;
    this._dataEl = dataEl;
    this._closeBtn = closeBtn;

    this.root.appendChild(card);
  }

  /**
   * Preenche e exibe o card com os dados de um corpo.
   * @param {import('../data/planets.js').PlanetData | typeof import('../data/planets.js').SUN} data
   * @returns {void}
   */
  show(data) {
    if (!this.el) this.mount();
    if (!data) return;

    // Nome.
    this._nameEl.textContent = data.nomePT ?? '';

    // Fato.
    this._factEl.textContent = data.fato ?? '';

    // Dados: reconstrói a grade rótulo/valor. Usa textContent para evitar
    // qualquer injeção de HTML a partir dos dados.
    this._dataEl.replaceChildren();
    const dados = data.dados ?? {};
    for (const [rotulo, valor] of Object.entries(dados)) {
      const dt = document.createElement('span');
      dt.className = 'infocard__data-label';
      dt.textContent = rotulo;

      const dd = document.createElement('span');
      dd.className = 'infocard__data-value';
      dd.textContent = String(valor);

      this._dataEl.appendChild(dt);
      this._dataEl.appendChild(dd);
    }

    // Exibe (a transição de opacidade é feita pelo CSS via .infocard--visible).
    this.el.classList.add('infocard--visible');
    this.el.setAttribute('aria-hidden', 'false');
    this.visible = true;
  }

  /**
   * Esconde o card.
   * @returns {void}
   */
  hide() {
    if (!this.el) return;
    this.el.classList.remove('infocard--visible');
    this.el.setAttribute('aria-hidden', 'true');
    this.visible = false;
  }

  /**
   * Registra callback chamado quando o usuário fecha o card (botão X).
   * Retorna função de remoção.
   * @param {CloseCallback} callback
   * @returns {() => void}
   */
  onClose(callback) {
    this._closeCallbacks.add(callback);
    return () => {
      this._closeCallbacks.delete(callback);
    };
  }

  /**
   * Dispara os callbacks de fechamento.
   * @private
   */
  _emitClose() {
    for (const cb of this._closeCallbacks) cb();
  }

  /**
   * Remove o card do DOM e limpa listeners.
   * @returns {void}
   */
  dispose() {
    if (this._closeBtn && this._onCloseClick) {
      this._closeBtn.removeEventListener('click', this._onCloseClick);
    }
    this._onCloseClick = null;
    this._closeCallbacks.clear();

    if (this.el && this.el.parentNode) {
      this.el.parentNode.removeChild(this.el);
    }
    this.el = null;
    this._nameEl = null;
    this._factEl = null;
    this._dataEl = null;
    this._closeBtn = null;
    this.visible = false;
  }
}
