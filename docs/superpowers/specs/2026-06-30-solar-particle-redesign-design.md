# Solar — Redesign em Sistema de Partículas 3D (WebGL/Three.js)

**Data:** 2026-06-30
**Status:** Design aprovado (aguardando review do spec)
**Autor:** Leonardo (com Claude)

---

## 1. Visão geral

Reconstruir o projeto `solar` — hoje uma simulação 2D em Python/Pygame com sprites PNG — como uma
**experiência web 3D em Three.js/WebGL**, onde o Sol e os 8 planetas são renderizados como
**nuvens de partículas** (à la [particles.casberry.in](https://particles.casberry.in/)), com brilho
(bloom), cor dinâmica e câmera cinematográfica.

O objetivo é um resultado **visualmente impressionante** ("wow"), otimizado na vista geral e
**"insano" no zoom** de um planeta, servindo como peça de destaque do portfólio.

### Objetivos
- Sol + 8 planetas como esferas de partículas luminosas, orbitando.
- **LOD (nível de detalhe):** econômico de longe, artilharia de partículas de perto.
- Câmera **cinematográfica por padrão**, virando **exploração** ao interagir, e voltando ao passeio após ociosidade.
- Interação: arrastar (orbitar), scroll (zoom), clicar num planeta (focar + card de info).
- Fidelidade **meio-termo**: proporções relativas plausíveis mas comprimidas, órbitas levemente elípticas, velocidades relativas reais.
- Nomes dos planetas em **PT-BR** (herdado do projeto atual).
- Deploy estático (Vercel) sob subdomínio `is-a.dev`.

### Não-objetivos (YAGNI)
- Controle por gestos/webcam (MediaPipe) — firula da referência, fora de escopo.
- Geração de comportamento por IA — fora de escopo.
- Precisão científica de escala real (planetas minúsculos, vazio enorme) — rejeitado por prejudicar o "wow".
- Luas, cinturão de asteroides, cometas — possíveis extras futuros, não agora.
- Backend / persistência — é 100% front-end estático.

---

## 2. Stack técnica

| Camada | Escolha | Motivo |
|---|---|---|
| Render 3D | **Three.js** (puro, ES modules) | Controle total do shader = onde mora o "wow"; melhor caminho de aprendizado vindo de Python |
| Build/dev | **Vite** | HMR rápido, build estático trivial |
| Partículas | `THREE.Points` + **shaders GLSL** próprios | Cor/tamanho por partícula, size attenuation |
| Glow | **`UnrealBloomPass`** (`three/examples/postprocessing`) | Brilho barato e bonito |
| GUI (dev/opcional) | **lil-gui** | Tunar parâmetros em dev; escondível em produção |
| UI (cards/HUD) | **HTML/CSS puro** sobreposto ao canvas | Simples; sem React |
| GPGPU (Fase 2) | `GPUComputationRenderer` (three/examples) | Simulação de partículas na GPU |

Sem React — mantém o GPGPU da Fase 2 mais direto de controlar.

---

## 3. Arquitetura e módulos

Estrutura de pastas proposta (dentro de `solar/`, o código Python legado vai para `legacy/`):

```
solar/
├─ index.html
├─ package.json
├─ vite.config.js
├─ public/
│  └─ (texturas/sprites de partícula, se houver)
├─ src/
│  ├─ main.js              # bootstrap: cria App, loop de render
│  ├─ core/
│  │  ├─ SceneManager.js   # cena, renderer, resize, composer/bloom
│  │  └─ Loop.js           # requestAnimationFrame, delta time, pause
│  ├─ camera/
│  │  ├─ CameraRig.js      # OrbitControls + estado (cinematic|explore)
│  │  └─ CinematicPath.js  # passeio automático + retorno por ociosidade
│  ├─ bodies/
│  │  ├─ ParticleSphere.js # UNIDADE central: esfera de partículas (planeta ou sol)
│  │  ├─ Planet.js         # ParticleSphere + órbita + dados + LOD
│  │  ├─ Sun.js            # ParticleSphere denso + bloom forte
│  │  └─ Orbit.js          # trilha orbital (elipse leve) + posição no tempo
│  ├─ data/
│  │  └─ planets.js        # dados dos 8 planetas (nome, cor, raio, dist, vel, tilt)
│  ├─ shaders/
│  │  ├─ particle.vert / particle.frag
│  │  └─ (Fase 2) sim.frag  # simulação GPGPU
│  ├─ interaction/
│  │  ├─ Picker.js         # raycast → planeta clicado
│  │  └─ FocusController.js # transição de câmera pro planeta + trigger de LOD
│  ├─ ui/
│  │  ├─ InfoCard.js       # card HTML com dados do planeta
│  │  └─ Hud.js            # velocidade/pausa (herdado), dica de controles
│  └─ util/
│     ├─ fibonacciSphere.js # distribuição uniforme de pontos na esfera
│     └─ math.js           # lerp, easing, clamp
└─ docs/superpowers/specs/  # este documento
```

### Unidade central: `ParticleSphere`
- **O que faz:** gera N partículas distribuídas numa casca esférica (via `fibonacciSphere` + jitter radial) e as renderiza como `THREE.Points` com o shader de partícula.
- **Como se usa:** `new ParticleSphere({ radius, count, color, size })` → retorna um `THREE.Object3D` adicionável à cena; método `setLOD(level)` troca a contagem/qualidade; `setColor(c)`, `update(dt)`.
- **Depende de:** Three.js, `particle.vert/frag`, `fibonacciSphere`.

`Planet` e `Sun` compõem `ParticleSphere` (composição, não herança) e adicionam órbita/dados/brilho.

---

## 4. Técnica de partículas (o efeito da referência)

- Cada corpo = `THREE.Points` com `BufferGeometry`. Atributos por partícula: `position` (na casca esférica), `aColor`, `aScale`, `aSeed` (para animação/variação).
- **Vertex shader:** aplica `gl_PointSize` com atenuação por distância; leve "respiração"/rotação animada via `uTime` e `aSeed`.
- **Fragment shader:** ponto circular suave (soft edge via `smoothstep` no `gl_PointCoord`), cor = `aColor` modulada por brilho.
- **Cor dinâmica:** `setColor` reescreve `aColor` (ou um `uColorShift`) — permite trocar cor em tempo real (como a referência).
- **Sol:** contagem alta, cor quente, `additive blending`, alimenta o bloom.
- **Anéis de Saturno:** anel de partículas separado (disco achatado) em torno do planeta.

---

## 5. LOD — otimização por distância

Cada `Planet` tem 3 níveis:

| Nível | Quando | Partículas (aprox.) | Simulação |
|---|---|---|---|
| **FAR** | planeta longe / vista do sistema | baixa (~2–5k) | nenhuma (só rotação) |
| **NEAR** | câmera se aproximando | média (~15–30k) | leve |
| **FOCUS** | planeta é o alvo do zoom/clique | alta (full) | **GPGPU na Fase 2** |

- Transição de nível com histerese (evita "piscar" entre níveis) e crossfade de opacidade.
- Só **um** planeta em FOCUS por vez → o orçamento de partículas concentra nele.
- Planetas fora de vista (frustum culling) não atualizam simulação.

---

## 6. Câmera e modos

- **Cinematográfico (padrão):** `CinematicPath` move a câmera por um trajeto suave ao redor do sistema (curva Catmull-Rom), olhando pro centro/planetas.
- **Exploração:** primeira interação (drag/scroll/clique) → assume `OrbitControls`. Damping ligado.
- **Retorno por ociosidade:** após ~8–12s sem input, transição suave de volta ao modo cinematográfico.
- **Foco em planeta:** clique → `FocusController` faz tween da câmera até o planeta, dispara LOD=FOCUS, abre `InfoCard`. Sair do foco (ESC / clique fora) → volta.

---

## 7. Dados dos planetas (`data/planets.js`)

Herdado e adaptado do projeto Python. Cada entrada:
`{ id, nomePT, corBase, raioRel, distanciaRel, velocidadeRel, excentricidade, inclinacao, anel? }`

- 8 planetas: Mercúrio, Vênus, Terra, Marte, Júpiter, Saturno, Urano, Netuno.
- `raioRel`/`distanciaRel` comprimidos (meio-termo) — Júpiter claramente maior, mas nada minúsculo.
- `velocidadeRel` mantém a ordem real (Mercúrio rápido → Netuno lento), reaproveitando os valores do `solar_system.py`.
- `excentricidade` pequena → órbitas levemente elípticas.
- Texto de info (PT-BR) por planeta pro `InfoCard` (fato curto + dados básicos).

---

## 8. Interação e UI

- **Picking:** `Raycaster` contra esferas de colisão invisíveis (mais barato que raycast em Points).
- **InfoCard:** painel HTML translúcido (canto), aparece no foco, com nome + dados + fato. Fecha ao sair do foco.
- **HUD (herdado):** controle de velocidade (`+/-`, presets), pausa (`ESPAÇO`), reset (`R`) — agora como botões discretos + atalhos de teclado. Dica de controles no primeiro load.
- **lil-gui:** só em dev (query `?debug`), pra tunar cor/densidade/bloom.

---

## 9. Fluxo de dados

```
planets.js (dados) ──► Planet/Sun (constroem ParticleSphere) ──► SceneManager (cena+bloom)
                                   ▲                                      │
Loop(dt) ──► Orbit.update(t) ──► posição dos corpos ──► render          │
Input ──► CameraRig(modo) / FocusController ──► LOD ──► ParticleSphere.setLOD
Picker ──► planeta ──► FocusController ──► InfoCard
```

Estado global mínimo num objeto `AppState` (modo de câmera, planeta focado, velocidade, pausa).

---

## 10. Tratamento de erros / robustez
- **WebGL indisponível:** detectar no boot e mostrar fallback HTML (mensagem + talvez imagem estática) em vez de tela preta.
- **Perda de contexto WebGL:** listener `webglcontextlost/restored` → pausa e re-inicializa.
- **Performance adaptativa:** medir FPS; se cair de um limiar por X segundos, reduzir contagem base de partículas / desligar bloom automaticamente (degradação graciosa).
- **Carga de assets:** se usar textura de partícula, ter fallback procedural (ponto circular no shader) — já é o padrão, então assets são opcionais.

---

## 11. Testes
Projeto majoritariamente visual — estratégia pragmática:
- **Unit (Vitest):** funções puras — `fibonacciSphere` (contagem/uniformidade), `math` (lerp/easing), `Orbit` (posição em t conhecido), montagem de `planets.js`.
- **Visual/manual:** checklist por fase (planetas visíveis, órbitas, bloom, foco, LOD troca, fallback WebGL).
- **Performance:** orçamento-alvo (ex.: 60fps em GPU integrada na vista geral); medir com stats.js em dev.

---

## 12. Fases de entrega

### Fase 1 — Base impressionante (entregável e deployável)
Sistema solar completo em partículas + bloom + LOD (FAR/NEAR + **FOCUS estático**, isto é, foco
aumenta a contagem de partículas mas **sem** simulação GPGPU) + câmera cinematográfica/exploração +
picking + InfoCard + HUD + fallback WebGL. **Deploy na Vercel** sob `solar.<seunome>.is-a.dev`.
→ Já é muito "wow" e fica no ar.

### Fase 2 — O "insano" (upgrade)
Simulação **GPGPU** no nível FOCUS: ao dar zoom num planeta, partículas viram enxame denso que
flui/reage ao mouse e faz morphing. `GPUComputationRenderer`, shaders de simulação (ping-pong FBO).
Opcional: transição de partículas ao entrar/sair de foco.

---

## 13. Deploy
- `vite build` → `dist/` estático.
- Projeto na **Vercel** (import do repo GitHub `MDices/solar` ou novo).
- Domínio custom `solar.<seunome>.is-a.dev` via CNAME `cname.vercel-dns.com` (PR no repo `is-a-dev/register`).
- Amarra com o plano geral de portfólio (leonardo-dev como hub).

---

## 14. Migração do código legado
- Mover `src/*.py`, `assets/`, `requirements.txt`, `venv/` para `legacy/` (preservar histórico/faculdade).
- Ajustar `.gitignore` (adicionar `node_modules/`, `dist/`).
- `README.md` reescrito pra nova stack (com screenshot/gif depois).
