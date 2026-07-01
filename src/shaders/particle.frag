// ============================================================================
// particle.frag — fragment shader das partículas.
//
// Cada ponto é um disco procedural pequeno e NÍTIDO (núcleo denso + borda curta),
// para ler como "ponto de luz" e formar a treliça densa da esfera. A cor é
// modulada por vShade (rim/fresnel — borda da esfera mais brilhante), vTwinkle
// (cintilação), uBrightness (brilho global) e uOpacity (crossfade de LOD).
// ============================================================================

precision mediump float;

uniform float uOpacity;    // opacidade global (0..1), usada em crossfade de LOD
uniform float uBrightness; // multiplicador de brilho (alimenta o bloom)

varying vec3 vColor;
varying float vShade;
varying float vTwinkle;

void main() {
  // Distância ao centro do ponto (gl_PointCoord 0..1).
  vec2 coord = gl_PointCoord - vec2(0.5);
  float dist = length(coord);
  if (dist > 0.5) discard;

  // Perfil NÍTIDO: núcleo cheio até ~0.32, queda curta até a borda. Dá pontos
  // definidos (não bolhas fofas), preservando a treliça da esfera.
  float shape = 1.0 - smoothstep(0.16, 0.5, dist);

  // Brilho da partícula: rim/fresnel * cintilação.
  float lum = vShade * vTwinkle;

  vec3 color = vColor * uBrightness * lum;

  gl_FragColor = vec4(color, shape * uOpacity);
}
