// ============================================================================
// swarm-velocity.frag — passo GPGPU que atualiza a VELOCIDADE de cada partícula
// do enxame em foco (Fase 2). Roda via GPUComputationRenderer: os samplers
// `texturePosition` e `textureVelocity` e o uniform `resolution` são injetados
// automaticamente. Trabalha no espaço LOCAL da esfera (centro na origem).
//
// Forças combinadas:
//   - mola para a posição de repouso (uHome) → mantém a forma de esfera;
//   - curl-noise TANGENCIAL → turbilhão vivo sobre a superfície;
//   - repulsão do mouse (uMouse) → o cursor "afasta" as partículas;
//   - amortecimento (atrito) → estabiliza.
// ============================================================================

uniform float uTime;
uniform float uDelta;
uniform vec3  uMouse;        // posição do mouse em espaço LOCAL da esfera
uniform float uMouseActive;  // 1 = mouse influenciando; 0 = sem influência
uniform float uRadius;       // raio da esfera (para escalar forças)

uniform float uSpring;       // força da mola p/ casa
uniform float uFlow;         // intensidade do turbilhão (curl)
uniform float uNoiseScale;   // escala espacial do ruído
uniform float uFlowSpeed;    // velocidade de evolução do turbilhão
uniform float uMouseStrength;// intensidade da repulsão do mouse
uniform float uMouseRadius;  // alcance da repulsão
uniform float uDamping;      // atrito (0..1, perto de 1)

uniform sampler2D uHome;     // posições de repouso (casca da esfera)

// ---------------- simplex noise 3D (Ashima / Stefan Gustavson) --------------
vec4 permute(vec4 x) { return mod(((x * 34.0) + 1.0) * x, 289.0); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

float snoise(vec3 v) {
  const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  i = mod(i, 289.0);
  vec4 p = permute(permute(permute(
    i.z + vec4(0.0, i1.z, i2.z, 1.0)) +
    i.y + vec4(0.0, i1.y, i2.y, 1.0)) +
    i.x + vec4(0.0, i1.x, i2.x, 1.0));
  float n_ = 1.0 / 7.0;
  vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
}

// Curl de um campo potencial vetorial (3 campos de ruído deslocados) → fluxo
// incompressível, sem fontes/sumidouros: ótimo para turbilhão orgânico.
vec3 curlNoise(vec3 p) {
  const float e = 0.1;
  vec3 dx = vec3(e, 0.0, 0.0);
  vec3 dy = vec3(0.0, e, 0.0);
  vec3 dz = vec3(0.0, 0.0, e);

  vec3 p_a = vec3(snoise(p), snoise(p + 100.0), snoise(p + 200.0));
  float x1 = snoise(p + dy + 100.0) - snoise(p - dy + 100.0);
  float x2 = snoise(p + dz + 200.0) - snoise(p - dz + 200.0);
  float y1 = snoise(p + dz + 200.0) - snoise(p - dz + 200.0);
  float y2 = snoise(p + dx) - snoise(p - dx);
  float z1 = snoise(p + dx) - snoise(p - dx);
  float z2 = snoise(p + dy + 100.0) - snoise(p - dy + 100.0);

  return normalize(vec3(x1 - x2, y2 - y1, z1 - z2) / (2.0 * e) + 1e-5);
}

void main() {
  vec2 uv = gl_FragCoord.xy / resolution.xy;
  vec3 pos = texture2D(texturePosition, uv).xyz;
  vec3 vel = texture2D(textureVelocity, uv).xyz;
  vec3 home = texture2D(uHome, uv).xyz;

  vec3 force = vec3(0.0);

  // Mola para a posição de repouso (mantém a esfera).
  force += (home - pos) * uSpring;

  // Curl-noise projetado no plano tangente da esfera → turbilhão na superfície,
  // sem inflar/deflar o raio.
  vec3 n = normalize(pos + 1e-5);
  vec3 c = curlNoise(pos * uNoiseScale + vec3(0.0, uTime * uFlowSpeed, 0.0));
  vec3 tangential = c - dot(c, n) * n;
  force += tangential * uFlow;

  // Repulsão do mouse (gaussiana no alcance uMouseRadius).
  if (uMouseActive > 0.5) {
    vec3 toParticle = pos - uMouse;
    float d2 = dot(toParticle, toParticle);
    float falloff = exp(-d2 / (uMouseRadius * uMouseRadius));
    force += normalize(toParticle + 1e-5) * uMouseStrength * falloff;
  }

  vel += force * uDelta;
  vel *= uDamping; // atrito

  // Segurança: limita a velocidade a uma fração do raio por segundo. Evita que
  // qualquer combinação de forças (ex.: mouse muito perto) arranque partículas
  // para longe da esfera de forma visualmente "quebrada".
  float maxSpeed = uRadius * 2.5;
  float speed = length(vel);
  if (speed > maxSpeed) {
    vel = vel * (maxSpeed / speed);
  }

  gl_FragColor = vec4(vel, 1.0);
}
