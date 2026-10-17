import {
  DepthTexture,
  HalfFloatType,
  LinearFilter,
  Mesh,
  NearestFilter,
  OrthographicCamera,
  PlaneGeometry,
  Scene,
  ShaderMaterial,
  UnsignedByteType,
  UnsignedIntType,
  Vector2,
  WebGLRenderTarget,
} from 'three';

/**
 * Compact, mobile-first post-processing chain.
 *
 * Rather than pulling in EffectComposer + UnrealBloomPass (which alone costs
 * several render-target round trips per frame), this runs a short, tunable chain:
 *
 *   scene -> HDR target -> bright pass -> separable blur -> composite -> screen
 *
 * The composite folds in depth-based ambient occlusion, radial speed blur, a
 * vignette, ACES tone mapping and the sRGB transfer in a single pass. Everything
 * is driven by a quality tier, and the whole thing degrades to a direct render if
 * the device cannot provide the render targets it needs.
 *
 * Note: three skips tone mapping and the output transfer function when rendering
 * into a render target, so the composite has to do both — which is why the ACES
 * fit and sRGB transfer below mirror three's own shader chunks exactly. Turning
 * post-processing off therefore produces a pixel-identical image.
 */

const QUAD_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const BRIGHT_FRAG = /* glsl */ `
  uniform sampler2D uSource;
  uniform float uThreshold;
  uniform float uKnee;
  varying vec2 vUv;

  void main() {
    vec3 c = texture2D(uSource, vUv).rgb;
    float l = max(max(c.r, c.g), c.b);
    float soft = clamp(l - uThreshold + uKnee, 0.0, 2.0 * uKnee);
    soft = soft * soft / (4.0 * uKnee + 1e-4);
    float contrib = max(soft, l - uThreshold) / max(l, 1e-4);
    gl_FragColor = vec4(c * contrib, 1.0);
  }
`;

const BLUR_FRAG = /* glsl */ `
  uniform sampler2D uSource;
  uniform vec2 uDirection;
  varying vec2 vUv;

  void main() {
    const float w0 = 0.2270270;
    const float w1 = 0.1945945;
    const float w2 = 0.1216216;
    const float w3 = 0.0540540;
    const float w4 = 0.0162162;

    vec3 sum = texture2D(uSource, vUv).rgb * w0;
    vec2 o1 = uDirection * 1.4;
    vec2 o2 = uDirection * 2.8;
    vec2 o3 = uDirection * 4.2;
    vec2 o4 = uDirection * 5.6;
    sum += (texture2D(uSource, vUv + o1).rgb + texture2D(uSource, vUv - o1).rgb) * w1;
    sum += (texture2D(uSource, vUv + o2).rgb + texture2D(uSource, vUv - o2).rgb) * w2;
    sum += (texture2D(uSource, vUv + o3).rgb + texture2D(uSource, vUv - o3).rgb) * w3;
    sum += (texture2D(uSource, vUv + o4).rgb + texture2D(uSource, vUv - o4).rgb) * w4;
    gl_FragColor = vec4(sum, 1.0);
  }
`;

const ADD_FRAG = /* glsl */ `
  uniform sampler2D uBase;
  uniform sampler2D uAdd;
  uniform float uAmount;
  varying vec2 vUv;

  void main() {
    gl_FragColor = vec4(texture2D(uBase, vUv).rgb + texture2D(uAdd, vUv).rgb * uAmount, 1.0);
  }
`;

const COMPOSITE_FRAG = /* glsl */ `
  uniform sampler2D uScene;
  uniform sampler2D uBloom;
  uniform sampler2D uDepth;
  uniform mat4 uProjInvProjection;
  uniform vec2 uTexel;
  uniform float uNear;
  uniform float uFar;
  uniform float uBloomStrength;
  uniform float uAOIntensity;
  uniform float uAORadius;
  uniform float uAOSamples;
  uniform float uMotion;
  uniform float uMotionSamples;
  uniform float uVignette;
  uniform float uGrain;
  uniform float uExposure;
  uniform float uTime;
  /** 1 when the scene target already holds tone-mapped sRGB (LDR fallback). */
  uniform float uEncoded;
  varying vec2 vUv;

  float rawDepth(vec2 uv) {
    return texture2D(uDepth, uv).r;
  }

  vec3 viewPosition(vec2 uv, float depth) {
    vec4 clip = vec4(uv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
    vec4 view = uProjInvProjection * clip;
    return view.xyz / max(view.w, 1e-6);
  }

  /** Depth-sampled normal, so the shader needs no derivative extension. */
  vec3 surfaceNormal(vec2 uv, vec3 P) {
    vec2 ox = vec2(uTexel.x, 0.0);
    vec2 oy = vec2(0.0, uTexel.y);
    vec3 px = viewPosition(uv + ox, rawDepth(uv + ox));
    vec3 py = viewPosition(uv + oy, rawDepth(uv + oy));
    vec3 n = normalize(cross(px - P, py - P));
    return n.z < 0.0 ? -n : n;
  }

  float ambientOcclusion(vec2 uv, vec3 P, vec3 N) {
    float radius = uAORadius / max(0.05, -P.z);
    float occlusion = 0.0;
    float taken = 0.0;

    for (int i = 0; i < 12; i++) {
      if (float(i) >= uAOSamples) break;
      float fi = float(i) + 0.5;
      float angle = fi * 2.39996323;
      float rad = sqrt(fi / max(1.0, uAOSamples)) * radius;
      vec2 offset = vec2(cos(angle), sin(angle)) * rad;
      vec2 sUv = uv + offset;
      float sd = rawDepth(sUv);
      if (sd >= 0.99995) continue;
      vec3 sp = viewPosition(sUv, sd);
      vec3 diff = sp - P;
      float dist = length(diff);
      if (dist < 1e-4) continue;
      float rangeCheck = smoothstep(0.0, 1.0, uAORadius / dist);
      occlusion += max(0.0, dot(N, diff) / dist - 0.02) * rangeCheck;
      taken += 1.0;
    }

    if (taken < 1.0) return 1.0;
    return clamp(1.0 - (occlusion / taken) * uAOIntensity * 2.2, 0.0, 1.0);
  }

  vec3 radialBlur(vec2 uv, float amount) {
    if (amount < 0.002) return texture2D(uScene, uv).rgb;
    vec2 dir = uv - vec2(0.5);
    if (dot(dir, dir) < 1e-7) return texture2D(uScene, uv).rgb;
    vec3 sum = vec3(0.0);
    float count = 0.0;
    for (int i = 0; i < 6; i++) {
      if (float(i) >= uMotionSamples) break;
      float t = float(i) / max(1.0, uMotionSamples - 1.0) - 0.5;
      sum += texture2D(uScene, uv - dir * amount * t * 2.0).rgb;
      count += 1.0;
    }
    return sum / max(count, 1.0);
  }

  // ---- three.js ACESFilmicToneMapping, reproduced exactly -------------------
  vec3 rrtAndOdtFit(vec3 v) {
    vec3 a = v * (v + 0.0245786) - 0.000090537;
    vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081;
    return a / b;
  }

  vec3 acesFilmic(vec3 color) {
    const mat3 acesInput = mat3(
      vec3(0.59719, 0.07600, 0.02840),
      vec3(0.35458, 0.90834, 0.13383),
      vec3(0.04823, 0.01566, 0.83777)
    );
    const mat3 acesOutput = mat3(
      vec3(1.60475, -0.10208, -0.00327),
      vec3(-0.53108, 1.10813, -0.07276),
      vec3(-0.07367, -0.00605, 1.07602)
    );
    color *= uExposure / 0.6;
    color = acesInput * color;
    color = rrtAndOdtFit(color);
    color = acesOutput * color;
    return clamp(color, 0.0, 1.0);
  }

  vec3 sRGBTransferOETF(vec3 value) {
    return mix(
      pow(max(value, vec3(0.0)), vec3(0.41666)) * 1.055 - vec3(0.055),
      value * 12.92,
      vec3(lessThanEqual(value, vec3(0.0031308)))
    );
  }

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }

  void main() {
    vec3 color = radialBlur(vUv, uMotion);

    vec3 bloom = texture2D(uBloom, vUv).rgb;
    color += bloom * uBloomStrength;

    float depth = rawDepth(vUv);
    if (uAOIntensity > 0.001 && depth < 0.99995) {
      vec3 P = viewPosition(vUv, depth);
      vec3 N = surfaceNormal(vUv, P);
      color *= ambientOcclusion(vUv, P, N);
    }

    // HDR path: tone map here. LDR fallback: the scene pass already did it.
    if (uEncoded < 0.5) {
      color = acesFilmic(color);
    }

    float vignette = 1.0 - uVignette * pow(length(vUv - 0.5) * 1.42, 2.4);
    color *= clamp(vignette, 0.0, 1.0);

    if (uGrain > 0.0) {
      color += (hash(vUv * 1024.0 + uTime) - 0.5) * uGrain;
    }

    if (uEncoded > 0.5) {
      gl_FragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
    } else {
      gl_FragColor = vec4(sRGBTransferOETF(clamp(color, 0.0, 1.0)), 1.0);
    }
  }
`;

export const POST_QUALITY = {
  off: { enabled: false },
  low: { enabled: false },
  medium: {
    enabled: true,
    bloomLevels: 1,
    bloomStrength: 0.42,
    bloomThreshold: 0.82,
    aoSamples: 5,
    aoIntensity: 0.34,
    aoRadius: 0.5,
    motionSamples: 4,
    motionStrength: 0.028,
    vignette: 0.3,
    grain: 0.012,
  },
  high: {
    enabled: true,
    bloomLevels: 2,
    bloomStrength: 0.5,
    bloomThreshold: 0.78,
    aoSamples: 9,
    aoIntensity: 0.42,
    aoRadius: 0.6,
    motionSamples: 6,
    motionStrength: 0.04,
    vignette: 0.34,
    grain: 0.016,
  },
};

export class PostFX {
  constructor(renderer) {
    this.renderer = renderer;
    this.enabled = false;
    this.settings = { ...POST_QUALITY.medium };
    this.available = false;
    this.width = 0;
    this.height = 0;
    this.time = 0;
    this.motion = 0;
    /** True when the scene target can hold values above 1.0 (half float). */
    this.hdr = false;

    this.texel = new Vector2();
    this._size = new Vector2();

    try {
      this.quadScene = new Scene();
      this.quadCamera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
      this.quadGeometry = new PlaneGeometry(2, 2);
      this.quad = new Mesh(this.quadGeometry, null);
      this.quad.frustumCulled = false;
      this.quadScene.add(this.quad);

      this.brightMaterial = new ShaderMaterial({
        vertexShader: QUAD_VERT,
        fragmentShader: BRIGHT_FRAG,
        uniforms: {
          uSource: { value: null },
          uThreshold: { value: 0.8 },
          uKnee: { value: 0.35 },
        },
        depthTest: false,
        depthWrite: false,
      });
      this.blurMaterial = new ShaderMaterial({
        vertexShader: QUAD_VERT,
        fragmentShader: BLUR_FRAG,
        uniforms: {
          uSource: { value: null },
          uDirection: { value: new Vector2() },
        },
        depthTest: false,
        depthWrite: false,
      });
      this.addMaterial = new ShaderMaterial({
        vertexShader: QUAD_VERT,
        fragmentShader: ADD_FRAG,
        uniforms: {
          uBase: { value: null },
          uAdd: { value: null },
          uAmount: { value: 0.75 },
        },
        depthTest: false,
        depthWrite: false,
      });
      this.compositeMaterial = new ShaderMaterial({
        vertexShader: QUAD_VERT,
        fragmentShader: COMPOSITE_FRAG,
        uniforms: {
          uScene: { value: null },
          uBloom: { value: null },
          uDepth: { value: null },
          uProjInvProjection: { value: null },
          uTexel: { value: new Vector2() },
          uNear: { value: 0.35 },
          uFar: { value: 1400 },
          uBloomStrength: { value: 0.45 },
          uAOIntensity: { value: 0.35 },
          uAORadius: { value: 0.5 },
          uAOSamples: { value: 8 },
          uMotion: { value: 0 },
          uMotionSamples: { value: 6 },
          uVignette: { value: 0.32 },
          uGrain: { value: 0.014 },
          uExposure: { value: 1.12 },
          uTime: { value: 0 },
          uEncoded: { value: 0 },
        },
        depthTest: false,
        depthWrite: false,
      });

      this.available = true;
    } catch {
      this.available = false;
    }
  }

  setQuality(settings) {
    if (!settings) return;
    this.settings = { ...settings };
    this.enabled = this.available && settings.enabled === true;
    if (this.brightMaterial) {
      this.brightMaterial.uniforms.uThreshold.value = settings.bloomThreshold ?? 0.8;
      this.brightMaterial.uniforms.uKnee.value = 0.35;
    }
    if (this.compositeMaterial) {
      const u = this.compositeMaterial.uniforms;
      u.uBloomStrength.value = settings.bloomStrength ?? 0.45;
      u.uAOIntensity.value = settings.aoIntensity ?? 0;
      u.uAORadius.value = settings.aoRadius ?? 0.5;
      u.uAOSamples.value = settings.aoSamples ?? 6;
      u.uMotionSamples.value = settings.motionSamples ?? 5;
      u.uVignette.value = settings.vignette ?? 0.3;
      u.uGrain.value = settings.grain ?? 0.014;
    }
  }

  setExposure(exposure) {
    if (this.compositeMaterial) this.compositeMaterial.uniforms.uExposure.value = exposure;
  }

  setSize(width, height) {
    if (!this.available) return;
    this.width = Math.max(4, Math.floor(width));
    this.height = Math.max(4, Math.floor(height));
    const w = this.width;
    const h = this.height;

    this.disposeTargets();

    const type = this._hdrType();
    this.hdr = type === HalfFloatType;
    this.sceneTarget = new WebGLRenderTarget(w, h, {
      minFilter: LinearFilter,
      magFilter: LinearFilter,
      type,
      depthBuffer: true,
      stencilBuffer: false,
    });
    this.depthTexture = new DepthTexture(w, h);
    this.depthTexture.type = UnsignedIntType;
    this.depthTexture.minFilter = NearestFilter;
    this.depthTexture.magFilter = NearestFilter;
    this.depthTexture.compareFunction = null;
    this.sceneTarget.depthTexture = this.depthTexture;

    const levels = Math.min(2, this.settings.bloomLevels ?? 1);
    this.bloomA = this._bloomPair(Math.max(4, w >> 1), Math.max(4, h >> 1), type);
    this.bloomB = levels > 1 ? this._bloomPair(Math.max(4, w >> 2), Math.max(4, h >> 2), type) : null;
  }

  _hdrType() {
    const caps = this.renderer.capabilities;
    if (caps.isWebGL2 && this.renderer.extensions.has('EXT_color_buffer_half_float')) return HalfFloatType;
    if (caps.isWebGL2 && this.renderer.extensions.has('EXT_color_buffer_float')) return HalfFloatType;
    return UnsignedByteType;
  }

  _bloomPair(w, h, type) {
    const options = { minFilter: LinearFilter, magFilter: LinearFilter, type, depthBuffer: false, stencilBuffer: false };
    return {
      a: new WebGLRenderTarget(w, h, options),
      b: new WebGLRenderTarget(w, h, options),
      w,
      h,
    };
  }

  _pass(material, target) {
    this.quad.material = material;
    this.renderer.setRenderTarget(target ?? null);
    this.renderer.render(this.quadScene, this.quadCamera);
  }

  _blur(pair, source, direction) {
    this.blurMaterial.uniforms.uSource.value = source;
    this.blurMaterial.uniforms.uDirection.value.set(direction[0] / pair.w, direction[1] / pair.h);
    this._pass(this.blurMaterial, pair.b);
    this.blurMaterial.uniforms.uSource.value = pair.b.texture;
    this.blurMaterial.uniforms.uDirection.value.set(direction[0] / pair.w, direction[1] / pair.h);
    this._pass(this.blurMaterial, pair.a);
    return pair.a.texture;
  }

  /**
   * @param {THREE.Scene} scene
   * @param {THREE.Camera} camera
   * @param {{ speed01?: number, bloom?: number }} [state]
   * @returns {boolean} true when the frame was post-processed
   */
  render(scene, camera, state = {}) {
    if (!this.enabled || !this.sceneTarget) return false;

    const { speed01 = 0, bloom = 1 } = state;

    // 1. Scene into a linear HDR target (tone mapping stays off here).
    this.renderer.setRenderTarget(this.sceneTarget);
    this.renderer.render(scene, camera);

    // 2. Bright pass, then a separable blur at half resolution.
    this.brightMaterial.uniforms.uSource.value = this.sceneTarget.texture;
    this._pass(this.brightMaterial, this.bloomA.a);
    const tight = this._blur(this.bloomA, this.bloomA.a.texture, [1, 0]);
    let bloomTexture = tight;

    // A second, wider octave at quarter resolution gives the glow a soft falloff.
    if (this.bloomB) {
      this.brightMaterial.uniforms.uSource.value = this.bloomA.a.texture;
      this._pass(this.brightMaterial, this.bloomB.a);
      const wide = this._blur(this.bloomB, this.bloomB.a.texture, [1, 0]);
      this.addMaterial.uniforms.uBase.value = tight;
      this.addMaterial.uniforms.uAdd.value = wide;
      this._pass(this.addMaterial, this.bloomA.b);
      bloomTexture = this.bloomA.b.texture;
    }

    // 3. Composite back to the canvas.
    this.time += 0.016;
    const u = this.compositeMaterial.uniforms;
    u.uScene.value = this.sceneTarget.texture;
    u.uBloom.value = bloomTexture;
    u.uDepth.value = this.depthTexture;
    u.uProjInvProjection.value = camera.projectionMatrixInverse;
    u.uNear.value = camera.near;
    u.uFar.value = camera.far;
    u.uBloomStrength.value = (this.settings.bloomStrength ?? 0.45) * bloom;
    u.uMotion.value = (this.settings.motionStrength ?? 0.03) * Math.pow(Math.max(0, speed01), 1.6);
    u.uTexel.value.set(1 / this.width, 1 / this.height);
    u.uTime.value = this.time;
    u.uEncoded.value = this.hdr ? 0 : 1;

    this._pass(this.compositeMaterial, null);
    this.renderer.setRenderTarget(null);
    return true;
  }

  disposeTargets() {
    for (const target of [this.sceneTarget, this.bloomA?.a, this.bloomA?.b, this.bloomB?.a, this.bloomB?.b]) {
      if (target) target.dispose();
    }
    this.sceneTarget = null;
    this.bloomA = null;
    this.bloomB = null;
    this.depthTexture = null;
  }

  dispose() {
    this.disposeTargets();
    this.quadGeometry?.dispose();
    this.brightMaterial?.dispose();
    this.blurMaterial?.dispose();
    this.addMaterial?.dispose();
    this.compositeMaterial?.dispose();
    this.quadScene?.clear();
  }
}
