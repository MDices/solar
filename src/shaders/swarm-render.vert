// ============================================================================
// swarm-render.vert — renderiza o enxame lendo a POSIÇÃO da textura GPGPU
// (uPositionTexture) via um atributo `reference` (uv da partícula na textura).
// Mesmo visual das esferas de partícula: rim/fresnel + cintilação.
// ============================================================================

attribute vec2 reference;  // uv da partícula na textura de posição
attribute vec3 aColor;
attribute float aScale;
attribute float aSeed;

uniform sampler2D uPositionTexture;
uniform float uTime;
uniform float uSize;
uniform float uPixelRatio;

varying vec3 vColor;
varying float vShade;
varying float vTwinkle;

void main() {
  vColor = aColor;

  // Posição simulada (espaço LOCAL da esfera) vinda da textura GPGPU.
  vec3 pos = texture2D(uPositionTexture, reference).xyz;

  vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);

  // Rim/fresnel usando a direção radial como normal (esfera centrada na origem).
  vec3 viewNormal = normalize(normalMatrix * normalize(pos + 1e-5));
  float facing = clamp(viewNormal.z, 0.0, 1.0);
  float rim = pow(1.0 - facing, 2.0);
  vShade = 0.78 + 1.15 * rim;

  vTwinkle = 0.85 + 0.15 * sin(uTime * 2.4 + aSeed * 12.566);

  float attenuation = 300.0 / -mvPosition.z;
  gl_PointSize = uSize * aScale * attenuation * uPixelRatio;

  gl_Position = projectionMatrix * mvPosition;
}
