// ============================================================================
// swarm-render.frag — pontos nítidos do enxame (mesmo perfil das partículas
// estáticas). Opaco + alphaTest recorta o círculo; a cor recebe rim + twinkle.
// ============================================================================

precision mediump float;

uniform float uBrightness;

varying vec3 vColor;
varying float vShade;
varying float vTwinkle;

void main() {
  vec2 coord = gl_PointCoord - vec2(0.5);
  float dist = length(coord);
  if (dist > 0.5) discard;

  float shape = 1.0 - smoothstep(0.16, 0.5, dist);

  vec3 color = vColor * uBrightness * vShade * vTwinkle;

  gl_FragColor = vec4(color, shape);
}
