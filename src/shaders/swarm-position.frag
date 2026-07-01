// ============================================================================
// swarm-position.frag — passo GPGPU que INTEGRA a posição a partir da
// velocidade (Euler). Samplers `texturePosition`/`textureVelocity` e `resolution`
// são injetados pelo GPUComputationRenderer.
// ============================================================================

uniform float uDelta;

void main() {
  vec2 uv = gl_FragCoord.xy / resolution.xy;
  vec3 pos = texture2D(texturePosition, uv).xyz;
  vec3 vel = texture2D(textureVelocity, uv).xyz;

  pos += vel * uDelta;

  gl_FragColor = vec4(pos, 1.0);
}
