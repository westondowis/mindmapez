import * as THREE from "three";

/** Shown in the corner of the brain view so you can tell which build is live. */
// NOTE: Increment this semantic patch version (e.g., v5.19 -> v5.20) on every single feature commit or bug fix.
// v5.20: memory synapse current is CSS stroke-dashoffset (iOS WebKit froze the SMIL-only comet); synapse animations ignore reduced-motion.
export const BRAIN_BUILD = "v5.21";

/** Resting vs hovered sector lightning: pulse = flicker speed multiplier, amp = brightness. */
export const HOT_REST = { pulse: 1, amp: 1 } as const;
export const HOT_ACTIVE = { pulse: 3, amp: 2.2 } as const;

const NOISE = /* glsl */ `
vec3 mod289(vec3 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 mod289(vec4 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 permute(vec4 x){return mod289(((x*34.0)+1.0)*x);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-0.85373472095314*r;}
float snoise(vec3 v){
  const vec2 C=vec2(1.0/6.0,1.0/3.0);
  const vec4 D=vec4(0.0,0.5,1.0,2.0);
  vec3 i=floor(v+dot(v,C.yyy));
  vec3 x0=v-i+dot(i,C.xxx);
  vec3 g=step(x0.yzx,x0.xyz);
  vec3 l=1.0-g;
  vec3 i1=min(g.xyz,l.zxy);
  vec3 i2=max(g.xyz,l.zxy);
  vec3 x1=x0-i1+C.xxx;
  vec3 x2=x0-i2+C.yyy;
  vec3 x3=x0-D.yyy;
  i=mod289(i);
  vec4 p=permute(permute(permute(i.z+vec4(0.0,i1.z,i2.z,1.0))+i.y+vec4(0.0,i1.y,i2.y,1.0))+i.x+vec4(0.0,i1.x,i2.x,1.0));
  float n_=0.142857142857;
  vec3 ns=n_*D.wyz-D.xzx;
  vec4 j=p-49.0*floor(p*ns.z*ns.z);
  vec4 x_=floor(j*ns.z);
  vec4 y_=floor(j-7.0*x_);
  vec4 x=x_*ns.x+ns.yyyy;
  vec4 y=y_*ns.x+ns.yyyy;
  vec4 h=1.0-abs(x)-abs(y);
  vec4 b0=vec4(x.xy,y.xy);
  vec4 b1=vec4(x.zw,y.zw);
  vec4 s0=floor(b0)*2.0+1.0;
  vec4 s1=floor(b1)*2.0+1.0;
  vec4 sh=-step(h,vec4(0.0));
  vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy;
  vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
  vec3 p0=vec3(a0.xy,h.x);
  vec3 p1=vec3(a0.zw,h.y);
  vec3 p2=vec3(a1.xy,h.z);
  vec3 p3=vec3(a1.zw,h.w);
  vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
  p0*=norm.x;p1*=norm.y;p2*=norm.z;p3*=norm.w;
  vec4 m=max(0.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.0);
  m=m*m;
  return 42.0*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
}
float fbm(vec3 p){
  float a=0.5;
  float s=0.0;
  for(int i=0;i<3;i++){s+=a*snoise(p);p*=2.03;a*=0.5;}
  return s;
}
float ridge(vec3 p){return 1.0-abs(snoise(p));}
vec3 brainBump(vec3 surfPos,vec3 surfNorm,vec2 dHdxy,float faceDirection){
  vec3 sx=normalize(dFdx(surfPos));
  vec3 sy=normalize(dFdy(surfPos));
  vec3 r1=cross(sy,surfNorm);
  vec3 r2=cross(surfNorm,sx);
  float det=dot(sx,r1)*faceDirection;
  vec3 grad=sign(det)*(dHdxy.x*r1+dHdxy.y*r2);
  return normalize(abs(det)*surfNorm-grad);
}
`;

export type BrainMaterialHandle = {
  material: THREE.MeshStandardMaterial;
  /** Advance the vein animation; call once per frame. */
  tick: (seconds: number) => void;
  /** Light up one region (centre in the brain's normalised noise space); null returns to rest. */
  setHot: (centre: THREE.Vector3 | null, radius?: number) => void;
  dispose: () => void;
};

/**
 * One shared material for the whole brain: a dark rocky surface with a violet
 * rim light and animated lightning veins. Everything is procedural (object-space
 * noise), so it needs no UVs and no texture files.
 * @param {THREE.Vector3} center Centre of the model in its own (unscaled) coordinates.
 * @param {number} invSize 1 / longest model dimension, to normalise noise space.
 * @param {boolean} reduced True for prefers-reduced-motion: dim, static veins.
 * @returns {BrainMaterialHandle}
 */
export function createBrainMaterial(
  center: THREE.Vector3,
  invSize: number,
  reduced: boolean,
): BrainMaterialHandle {
  const material = new THREE.MeshStandardMaterial({
    color: new THREE.Color("#120d1c"),
    roughness: 0.72,
    metalness: 0.08,
  });
  const uniforms = {
    uTime: { value: 0 },
    uCenter: { value: center.clone() },
    uInv: { value: invSize },
    uVein: { value: reduced ? 0.45 : 1 },
    uFlashO: { value: new THREE.Vector3() },
    uFlashT: { value: 2 },
    uHotC: { value: new THREE.Vector3() },
    uHotR: { value: 0.2 },
    uHot: { value: 0 },
    /** Lightning flicker frequency multiplier for the hovered sector (1 = rest). */
    uHotPulse: { value: HOT_REST.pulse as number },
    /** Brightness/amplitude multiplier for the hovered sector. */
    uHotAmp: { value: HOT_REST.amp as number },
  };
  let hotTarget = 0;
  let pulseTarget: number = HOT_REST.pulse;
  let ampTarget: number = HOT_REST.amp;
  let flashStart = -10;
  let nextFlash = 1.2;

  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        "#include <common>\nvarying vec3 vBP;\nuniform vec3 uCenter;\nuniform float uInv;",
      )
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvBP=(position-uCenter)*uInv;");

    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
varying vec3 vBP;
uniform float uTime;
uniform float uVein;
uniform vec3 uFlashO;
uniform float uFlashT;
uniform vec3 uHotC;
uniform float uHotR;
uniform float uHot;
uniform float uHotPulse;
uniform float uHotAmp;
${NOISE}`,
      )
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
float hb = fbm(vBP*30.0)*0.55 + fbm(vBP*90.0)*0.3 + fbm(vBP*210.0)*0.25;
diffuseColor.rgb *= 0.4 + 1.0*smoothstep(-0.6,0.6,hb);`,
      )
      .replace(
        "#include <normal_fragment_maps>",
        `#include <normal_fragment_maps>
normal = brainBump(-vViewPosition, normal, vec2(dFdx(hb), dFdy(hb))*2.2, faceDirection);`,
      )
      .replace(
        "#include <emissivemap_fragment>",
        `#include <emissivemap_fragment>
{
  vec3 wp = vBP;
  vec3 warpSeed = wp*6.0 + vec3(0.0, uTime*0.03, 0.0);
  vec3 warp = vec3(snoise(warpSeed), snoise(warpSeed+7.3), snoise(warpSeed+13.1));
  float r1 = ridge(wp*8.5 + warp*0.55);
  float r2 = ridge(wp*19.0 + warp*0.8 + 3.7);
  float region = smoothstep(0.0, 0.5, snoise(wp*2.2 + 1.3));
  float core1 = smoothstep(0.958, 0.992, r1);
  float halo1 = smoothstep(0.88, 0.985, r1);
  float core2 = smoothstep(0.974, 0.996, r2) * 0.5;
  float veins = (core1 + core2) * region;
  float halo = halo1 * region;
  float pulse = 0.55 + 0.45*sin(uTime*2.1 + snoise(wp*4.0)*9.0 + wp.z*11.0);
  // A strike: a bright band races outward from a random point along the veins.
  float ft = clamp(uFlashT, 0.0, 1.0);
  float band = exp(-pow((distance(wp, uFlashO) - ft*1.3)*7.0, 2.0)) * (1.0 - ft);
  float strike = band * 2.6 * step(uFlashT, 1.0);
  vec3 vc = mix(vec3(0.5,0.1,1.0), vec3(0.96,0.8,1.0), clamp(core1*region, 0.0, 1.0));
  totalEmissiveRadiance += (vc*(veins*(3.8*pulse + strike)) + vec3(0.42,0.08,0.85)*halo*(0.5 + strike*0.5)) * uVein;
  float rim = pow(1.0 - saturate(dot(normalize(vViewPosition), normal)), 3.0);
  totalEmissiveRadiance += vec3(0.36,0.14,0.78) * rim * 0.5;
  float fib = smoothstep(0.92, 0.985, ridge(wp*52.0 + warp*0.35 + 9.1)) * smoothstep(0.25, 0.9, rim);
  totalEmissiveRadiance += vec3(0.5,0.34,1.0) * fib * 1.1 * uVein;
  // Hovered sector: electric cyan-gold lightning confined to that region.
  if (uHot > 0.001) {
    float m = uHot * (1.0 - smoothstep(uHotR * 0.55, uHotR, distance(wp, uHotC)));
    float flick = 0.45 + 0.55 * sin(uTime * 22.0 * uHotPulse + snoise(wp * 9.0) * 7.0);
    float bolt = smoothstep(0.90, 0.99, ridge(wp * 14.0 + warp * 0.9 + uTime * 0.6 * uHotPulse));
    float arc = smoothstep(0.93, 0.995, ridge(wp * 31.0 + warp * 1.2 - uTime * 0.9 * uHotPulse));
    vec3 hotCol = mix(vec3(0.1, 0.85, 1.0), vec3(1.0, 0.86, 0.35), clamp(bolt * flick, 0.0, 1.0));
    totalEmissiveRadiance += hotCol * (bolt * 7.0 * (0.6 + flick) + arc * 3.5 + 0.35) * m * uHotAmp;
  }
}`,
      );
  };
  material.customProgramCacheKey = () => "brain-veins-v7";

  return {
    material,
    setHot: (centre, radius = 0.2) => {
      hotTarget = centre ? 1 : 0;
      pulseTarget = centre ? HOT_ACTIVE.pulse : HOT_REST.pulse;
      ampTarget = centre ? HOT_ACTIVE.amp : HOT_REST.amp;
      if (centre) {
        uniforms.uHotC.value.copy(centre);
        uniforms.uHotR.value = radius;
      }
      // Reduced motion: no tween, just a steady, dimmer highlight.
      if (reduced) {
        uniforms.uHot.value = centre ? 0.5 : 0;
        uniforms.uHotPulse.value = HOT_REST.pulse;
        uniforms.uHotAmp.value = centre ? 1.2 : HOT_REST.amp;
      }
    },
    tick: (seconds) => {
      uniforms.uTime.value = seconds;
      uniforms.uHot.value += (hotTarget - uniforms.uHot.value) * 0.16;
      uniforms.uHotPulse.value += (pulseTarget - uniforms.uHotPulse.value) * 0.1;
      uniforms.uHotAmp.value += (ampTarget - uniforms.uHotAmp.value) * 0.12;
      if (reduced) return;
      if (seconds >= nextFlash) {
        flashStart = seconds;
        nextFlash = seconds + 1.6 + Math.random() * 2.2;
        uniforms.uFlashO.value.randomDirection().multiplyScalar(0.45);
      }
      uniforms.uFlashT.value = (seconds - flashStart) / 1.1;
    },
    dispose: () => material.dispose(),
  };
}
