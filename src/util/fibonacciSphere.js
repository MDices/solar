/**
 * Distribuição uniforme de pontos sobre uma esfera unitária usando a
 * "rede de Fibonacci" (fibonacci lattice / golden spiral).
 *
 * É a base geométrica de cada `ParticleSphere`: gera as posições das
 * partículas sobre a casca esférica com espaçamento aproximadamente uniforme,
 * bem melhor que amostragem aleatória (que forma aglomerados).
 */

// Ângulo áureo em radianos: π * (3 − √5). Garante o espaçamento uniforme.
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

/**
 * Gera `count` pontos distribuídos uniformemente sobre uma esfera unitária.
 *
 * Retorna um `Float32Array` "flat" com layout [x0, y0, z0, x1, y1, z1, ...],
 * pronto para ser usado como `THREE.BufferAttribute` de `position` (itemSize 3).
 *
 * @param {number} count - quantidade de pontos (deve ser > 0)
 * @param {object} [options]
 * @param {number} [options.radius=1] - raio da esfera
 * @param {number} [options.jitter=0] - jitter radial em [0, 1]; desloca cada
 *   ponto radialmente por até ±(jitter * radius) para dar volume/"nuvem" à casca.
 *   0 = casca perfeita; ~0.1 = leve espessura.
 * @param {() => number} [options.rng=Math.random] - gerador de aleatórios
 *   injetável (para testes determinísticos). Só é usado quando jitter > 0.
 * @returns {Float32Array} array de tamanho `count * 3`
 */
export function fibonacciSphere(count, options = {}) {
  const { radius = 1, jitter = 0, rng = Math.random } = options;

  if (!Number.isFinite(count) || count <= 0) {
    return new Float32Array(0);
  }

  const positions = new Float32Array(count * 3);

  for (let i = 0; i < count; i++) {
    // y varia linearmente de ~+1 (topo) a ~-1 (base); o +0.5 centraliza a amostra.
    const y = 1 - (i + 0.5) * (2 / count);
    // Raio do anel (no plano xz) na altura y.
    const ringRadius = Math.sqrt(Math.max(0, 1 - y * y));
    // Ângulo em espiral áurea.
    const theta = GOLDEN_ANGLE * i;

    const x = Math.cos(theta) * ringRadius;
    const z = Math.sin(theta) * ringRadius;

    // Aplica jitter radial opcional para dar espessura à casca.
    let r = radius;
    if (jitter > 0) {
      r = radius * (1 + (rng() * 2 - 1) * jitter);
    }

    const idx = i * 3;
    positions[idx] = x * r;
    positions[idx + 1] = y * r;
    positions[idx + 2] = z * r;
  }

  return positions;
}
