// ============================================================================
// particle.vert — vertex shader das partículas de cada corpo (THREE.Points).
//
// Dá VOLUME à esfera com borda brilhante (rim / fresnel): partículas cuja normal
// tangencia a linha de visão (na borda do disco) brilham mais que as do centro —
// é o que faz a esfera de partículas "acender" nas bordas (como a referência),
// em vez de virar um borrão chapado. O Sol (uShade=0) ignora isso e brilha
// uniforme (emissivo).
//
// Atributos por partícula (ParticleSphere.js): position, aColor, aScale, aSeed.
// ============================================================================

attribute vec3 aColor;
attribute float aScale;
attribute float aSeed;

uniform float uTime;       // tempo decorrido em segundos
uniform float uSize;       // tamanho base das partículas
uniform float uPixelRatio; // devicePixelRatio
uniform float uShade;      // 1 = rim shading (planeta); 0 = emissivo (Sol)

varying vec3 vColor;
varying float vShade;    // multiplicador de brilho (rim + ambiente, ou 1 no Sol)
varying float vTwinkle;  // cintilação individual

void main() {
  vColor = aColor;

  // "Respiração" sutil: cada partícula pulsa radialmente com fase própria.
  float breathe = sin(uTime * 0.8 + aSeed * 6.2831853) * 0.012;
  vec3 displaced = position * (1.0 + breathe);

  vec4 mvPosition = modelViewMatrix * vec4(displaced, 1.0);

  // Normal da casca (≈ radial) em espaço de visão. facing≈1 no centro do disco
  // (encara a câmera), ≈0 na borda (tangente). rim = brilho de borda (fresnel).
  vec3 viewNormal = normalize(normalMatrix * normalize(position));
  float facing = clamp(viewNormal.z, 0.0, 1.0);
  float rim = pow(1.0 - facing, 2.0);
  // Planeta: sem escurecer o centro (a referência não sombreia — a borda fica
  // mais densa naturalmente pela projeção da casca); só um leve realce de rim
  // que o bloom transforma em halo. Sol: uniforme (1.0).
  vShade = mix(1.0, 1.0 + 0.35 * rim, uShade);

  // Cintilação temporal leve (glitter vivo).
  vTwinkle = 0.85 + 0.15 * sin(uTime * 2.4 + aSeed * 12.566);

  // Atenuação por distância (perspectiva).
  float attenuation = 300.0 / -mvPosition.z;
  gl_PointSize = uSize * aScale * attenuation * uPixelRatio;

  gl_Position = projectionMatrix * mvPosition;
}
