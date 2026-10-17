// The drawn look: a three-step toon ramp, flat colours from the tokens, an
// ink outline as an inverted hull (a back-face copy pushed out along its
// normals, scaled with distance so it stays near 2px on screen), and the sky
// dome gradient. No specular, no env maps, no shadows, no post-processing.
import {
  BackSide, Color, DataTexture, Group, Mesh, MeshToonMaterial, NearestFilter, RGBAFormat, ShaderMaterial, UnsignedByteType,
} from 'three';
import type { SceneTokens } from './tokens';

export function toonRamp(): DataTexture {
  // Shadow step, base, highlight: 3 bands. Values are brightness multipliers.
  const data = new Uint8Array([120, 120, 120, 255, 200, 200, 200, 255, 255, 255, 255, 255]);
  const tex = new DataTexture(data, 3, 1, RGBAFormat, UnsignedByteType);
  tex.magFilter = NearestFilter;
  tex.minFilter = NearestFilter;
  tex.needsUpdate = true;
  return tex;
}

export function toonMaterial(colorHex: string, ramp: DataTexture): MeshToonMaterial {
  return new MeshToonMaterial({ color: new Color(colorHex), gradientMap: ramp });
}

const OUTLINE_VERT = /* glsl */ `
  uniform float width;
  void main() {
    vec4 viewPos = modelViewMatrix * vec4(position, 1.0);
    // Screen-constant width: push along the normal in proportion to view depth.
    vec3 n = normalize(normalMatrix * normal);
    viewPos.xyz += n * width * -viewPos.z;
    gl_Position = projectionMatrix * viewPos;
  }
`;
const OUTLINE_FRAG = /* glsl */ `
  uniform vec3 ink;
  void main() { gl_FragColor = vec4(ink, 1.0); }
`;

export function outlineMaterial(inkHex: string, width = 0.012): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: { ink: { value: new Color(inkHex) }, width: { value: width } },
    vertexShader: OUTLINE_VERT,
    fragmentShader: OUTLINE_FRAG,
    side: BackSide,
  });
}

/** Returns a group: the mesh plus its outline shell (same geometry, drawn first). */
export function withOutline(mesh: Mesh, outline: ShaderMaterial): Group {
  const shell = new Mesh(mesh.geometry, outline);
  shell.renderOrder = -1;
  mesh.renderOrder = 0;
  const g = new Group();
  g.add(mesh, shell);
  return g;
}

const SKY_VERT = /* glsl */ `
  varying float vY;
  void main() {
    vY = normalize(position).y;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const SKY_FRAG = /* glsl */ `
  uniform vec3 dawnTop; uniform vec3 dawnBottom; uniform vec3 dayTop; uniform vec3 dayBottom;
  uniform vec3 lateTop; uniform vec3 lateBottom; uniform float mix_;
  varying float vY;
  void main() {
    float h = clamp(vY * 1.6 + 0.2, 0.0, 1.0);
    vec3 top = mix_ < 0.5 ? mix(dawnTop, dayTop, mix_ * 2.0) : mix(dayTop, lateTop, (mix_ - 0.5) * 2.0);
    vec3 bottom = mix_ < 0.5 ? mix(dawnBottom, dayBottom, mix_ * 2.0) : mix(dayBottom, lateBottom, (mix_ - 0.5) * 2.0);
    // Two hard bands plus a soft top: the sky is drawn, not rendered.
    vec3 c = h < 0.35 ? bottom : h < 0.7 ? mix(bottom, top, 0.5) : top;
    gl_FragColor = vec4(c, 1.0);
  }
`;

export function skyMaterial(t: SceneTokens): ShaderMaterial {
  const lighten = (hex: string, k: number) => new Color(hex).lerp(new Color(t.chart), k);
  const m = new ShaderMaterial({
    uniforms: {
      dawnTop: { value: new Color(t.skyDawn) }, dawnBottom: { value: lighten(t.skyDawn, 0.5) },
      dayTop: { value: new Color(t.skyDay) }, dayBottom: { value: lighten(t.skyDay, 0.5) },
      lateTop: { value: new Color(t.skyLate) }, lateBottom: { value: lighten(t.skyLate, 0.5) },
      mix_: { value: 0 },
    },
    vertexShader: SKY_VERT,
    fragmentShader: SKY_FRAG,
    side: BackSide,
    depthWrite: false,
  });
  // Expose `mix` as the public uniform name the tests and the sky module use.
  (m.uniforms as Record<string, { value: unknown }>).mix = m.uniforms.mix_!;
  return m;
}
