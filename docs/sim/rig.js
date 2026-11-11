import * as T from 'three';
import { OrbitControls } from '../vendor/three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from '../vendor/three/examples/jsm/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from '../vendor/three/examples/jsm/geometries/RoundedBoxGeometry.js';

// All dimensions below are schematic scene units; equilibrium sag is omitted.
// drive 'freeDecay': drag and release the mass. 'forced': an amber arrow on the mass shows F(t).
// 'base': the amber frame (plate, posts, beam, spring anchor) is the shaking base; it rides a fixed
// pedestal, and a fixed white rail plus a ghost outline of the mass mark the ground frame.
export const FREE_LENGTH = 1.65;
export function createRig(canvas, { drive = 'freeDecay', onPull, onRelease, onFailure, reducedMotion }) {
  const based = drive === 'base', forced = drive === 'forced';
  const LIFT = based ? .62 : 0, ORBIT = based ? 8.7 : 7.94, EYE = based ? 3.45 : 3.1, ARROW = .8;
  const renderer = new T.WebGLRenderer({ canvas, antialias: true, alpha: false });
  let environment, pmrem, room, controls;
  const scene = new T.Scene();
  const geometries = new Set(), materials = new Set();
  let disposed = false;
  const clean = () => {
    if (disposed) return;
    disposed = true;
    canvas.removeEventListener('pointerdown', down, true);
    canvas.removeEventListener('pointermove', move);
    canvas.removeEventListener('pointerup', up);
    canvas.removeEventListener('pointercancel', up);
    canvas.removeEventListener('webglcontextlost', lost);
    controls?.dispose();
    geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose());
    environment?.dispose(); room?.dispose(); pmrem?.dispose();
    renderer.dispose(); renderer.forceContextLoss();
  };
  let pulling = false, pointerID = null, offset = 0, intro = !reducedMotion, displacement = 0;
  const ray = new T.Raycaster(), mouse = new T.Vector2(), hit = new T.Vector3();
  const plane = new T.Plane();
  let mass, camera;
  function pointer(e) {
    const r = canvas.getBoundingClientRect();
    mouse.set((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1);
    ray.setFromCamera(mouse, camera);
  }
  function down(e) {
    intro = false;
    if (drive !== 'freeDecay') return;                // driven rigs start from rest; the pointer only orbits
    pointer(e);
    if (!ray.intersectObject(mass).length || pointerID !== null) return;
    const normal = camera.getWorldDirection(new T.Vector3()); normal.y = 0; normal.normalize();
    plane.setFromNormalAndCoplanarPoint(normal, mass.position);
    if (!ray.ray.intersectPlane(plane, hit)) return;
    offset = hit.y - mass.position.y;
    pulling = true; pointerID = e.pointerId; controls.enabled = false;
    canvas.setPointerCapture(e.pointerId); e.stopImmediatePropagation();
    onPull(displacement / FREE_LENGTH);
  }
  function move(e) {
    if (!pulling || e.pointerId !== pointerID) return;
    pointer(e);
    if (ray.ray.intersectPlane(plane, hit)) onPull(T.MathUtils.clamp((1.25 - hit.y + offset) / FREE_LENGTH, -.4, .4));
  }
  function up(e) {
    if (e.pointerId !== pointerID) return;
    pulling = false; pointerID = null; controls.enabled = true;
    if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
    onRelease();
  }
  function lost(e) { e.preventDefault(); onFailure('Graphics connection interrupted'); }
  try {
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.PCFSoftShadowMap;
    renderer.toneMapping = T.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;
    scene.background = new T.Color('#101e2a');
    scene.fog = new T.Fog('#101e2a', 12, 25);
    pmrem = new T.PMREMGenerator(renderer); room = new RoomEnvironment();
    environment = pmrem.fromScene(room, 0.04); scene.environment = environment.texture; scene.environmentIntensity = .8;
    room.dispose(); room = null; pmrem.dispose(); pmrem = null;
    camera = new T.PerspectiveCamera(38, 1, .1, 40);
    camera.position.set(4.1, 3.1, 6.8);
    if (based) camera.position.set(4.1 * ORBIT / 7.94, EYE, 6.8 * ORBIT / 7.94);
    controls = new OrbitControls(camera, canvas);
    controls.target.set(0, 1.65 + LIFT / 2, 0); controls.enableDamping = true;
    controls.enablePan = false; controls.minDistance = 5.8; controls.maxDistance = 11;
    controls.minPolarAngle = .45; controls.maxPolarAngle = Math.PI / 2 + .05;
    const material = (opts) => { const m = new T.MeshStandardMaterial(opts); materials.add(m); return m; };
    const chrome = material({ color: '#e4eef3', metalness: 1, roughness: .2 });
    const dark = material({ color: '#233444', metalness: .8, roughness: .34 });
    const teal = material({ color: '#009d93', metalness: .4, roughness: .25 });
    const rubber = material({ color: '#0a121a', metalness: .15, roughness: .65 });
    const amber = material({ color: '#e58a1f', metalness: .55, roughness: .32 });
    const mesh = (geo, mat, x, y, z, parent = scene) => {
      geometries.add(geo); const m = new T.Mesh(geo, mat); m.position.set(x, y, z);
      m.castShadow = true; m.receiveShadow = true; parent.add(m); return m;
    };
    const box = (x, y, z, w, h, d, mat, parent) => mesh(new RoundedBoxGeometry(w, h, d, 3, .045), mat, x, y, z, parent);
    // Everything the spring and dashpot hang from. Fixed for freeDecay/forced; it is the moving base for 'base'.
    const frame = new T.Group(); frame.position.y = LIFT; scene.add(frame);
    const plate = based ? amber : dark;
    box(0, .08, 0, 2.65, .22, 1.8, plate, frame);
    for (const x of [-1, 1]) for (const z of [-.65, .65]) {
      if (!based) mesh(new T.CylinderGeometry(.12, .12, .09, 20), rubber, x, -.055, z);
      mesh(new T.CylinderGeometry(.065, .065, .025, 6), chrome, x, .202, z, frame);
    }
    for (const x of [-1.08, 1.08]) box(x, 1.8, -.48, .12, 3.3, .15, dark, frame);
    box(0, 3.48, -.1, 2.45, .18, 1.05, plate, frame);
    mass = box(0, 1.25 + LIFT, 0, 1.38, .56, .94, teal);
    const basic = (color, opacity) => { const m = new T.MeshBasicMaterial({ color, transparent: true, opacity }); materials.add(m); return m; };
    const marker = (x, y, z, w, h, d, mat) => { const m = mesh(new T.BoxGeometry(w, h, d), mat, x, y, z); m.castShadow = false; m.receiveShadow = false; return m; };
    let arrow, shaft, head, band = [];
    if (based || forced) {                            // ghost outline: where the mass rests in the ground frame
      const edges = new T.EdgesGeometry(new T.BoxGeometry(1.4, .58, .96)); geometries.add(edges);
      const lineMat = new T.LineBasicMaterial({ color: '#b8fff5', transparent: true, opacity: .7 }); materials.add(lineMat);
      const ghost = new T.LineSegments(edges, lineMat); ghost.position.set(0, 1.25 + LIFT, 0); scene.add(ghost);
    }
    if (based) {
      box(0, .04, 0, 2.2, .3, 1.45, dark);            // fixed shaker pedestal on the floor
      mesh(new T.CylinderGeometry(.2, .2, .57, 32), chrome, 0, -.315, 0, frame); // piston moves with the base
      const white = basic('#f2f8ff', .95);            // fixed ground rail at the resting height of the plate top
      marker(0, LIFT + .19, 1.0, 3.2, .022, .022, white);
      for (const x of [-1.56, 1.56]) marker(x, (LIFT + .19 - .11) / 2, 1.0, .03, LIFT + .19 + .11, .03, white);
    }
    if (forced) {
      const white = basic('#f2f8ff', .9);             // fixed lines at rest ± x_static (moved by setReference)
      band = [1, -1].map(side => { const m = marker(0, 1.25, .5, 1.5, .016, .016, white); m.userData.side = side; return m; });
      const hot = material({ color: '#ffb347', emissive: '#c05a00', emissiveIntensity: .7, metalness: .2, roughness: .4 });
      arrow = new T.Group(); arrow.position.set(0, 1.25, .64); scene.add(arrow);
      const shaftGeo = new T.CylinderGeometry(.04, .04, 1, 16); shaftGeo.translate(0, .5, 0);
      const headGeo = new T.ConeGeometry(.12, .26, 24); headGeo.translate(0, .13, 0);
      shaft = mesh(shaftGeo, hot, 0, 0, 0, arrow); head = mesh(headGeo, hot, 0, 0, 0, arrow);
      mesh(new T.SphereGeometry(.07, 20, 12), hot, 0, 0, 0, arrow);
    }
    // Spring anchored at y=3.18 and at the mass top y=1.53 (free length 1.65).
    const springGeometry = new T.BufferGeometry();
    const segments = 240, sides = 8, turns = 9, radius = .24, wire = .035;
    const pos = new Float32Array((segments + 1) * (sides + 1) * 3);
    const normals = new Float32Array(pos.length), indices = [];
    for (let i = 0; i < segments; i++) for (let j = 0; j < sides; j++) {
      const a = i * (sides + 1) + j, b = a + sides + 1;
      indices.push(a, b, a + 1, b, b + 1, a + 1);
    }
    springGeometry.setAttribute('position', new T.BufferAttribute(pos, 3).setUsage(T.DynamicDrawUsage));
    springGeometry.setAttribute('normal', new T.BufferAttribute(normals, 3).setUsage(T.DynamicDrawUsage));
    springGeometry.setIndex(indices);
    const spring = mesh(springGeometry, chrome, -.32, 0, 0, frame); spring.frustumCulled = false;
    // Constant circular wire section in the helix's local normal/binormal plane.
    function coil(length) {
      const pitch = length / (2 * Math.PI * turns), norm = Math.hypot(radius, pitch);
      for (let i = 0; i <= segments; i++) {
        const t = i / segments, a = t * turns * 2 * Math.PI, ca = Math.cos(a), sa = Math.sin(a);
        for (let j = 0; j <= sides; j++) {
          const b = j / sides * 2 * Math.PI, cb = Math.cos(b), sb = Math.sin(b);
          const nx = ca * cb - pitch / norm * sa * sb, ny = radius / norm * sb, nz = sa * cb + pitch / norm * ca * sb;
          const k = (i * (sides + 1) + j) * 3;
          pos[k] = radius * ca + wire * nx; pos[k + 1] = 3.18 - t * length + wire * ny; pos[k + 2] = radius * sa + wire * nz;
          normals[k] = nx; normals[k + 1] = ny; normals[k + 2] = nz;
        }
      }
      springGeometry.attributes.position.needsUpdate = true; springGeometry.attributes.normal.needsUpdate = true;
    }
    mesh(new T.CylinderGeometry(.1, .1, .25, 24), chrome, -.32, 3.3, 0, frame);
    mesh(new T.CylinderGeometry(.13, .13, .85, 32), dark, .45, 2.78, 0, frame);
    const rod = mesh(new T.CylinderGeometry(.045, .045, 1, 20), chrome, .45, 2.1, 0, frame);
    const ringMat = new T.MeshBasicMaterial({ color: '#60fff0', transparent: true, opacity: 0 }); materials.add(ringMat);
    const ring = mesh(new T.TorusGeometry(.72, .018, 8, 64), ringMat, 0, .22, 0, frame); ring.rotation.x = Math.PI / 2;
    const floor = mesh(new T.PlaneGeometry(200, 200), material({ color: '#0b1721', metalness: .15, roughness: .85 }), 0, -.11, 0);
    floor.rotation.x = -Math.PI / 2; floor.castShadow = false;
    scene.add(new T.HemisphereLight('#c1e5ff', '#273240', .8));
    const key = new T.DirectionalLight('#e4f4ff', 2.8); key.position.set(-3, 7, 5); key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024); key.shadow.camera.left = -4; key.shadow.camera.right = 4;
    key.shadow.camera.top = 5; key.shadow.camera.bottom = -3; key.shadow.normalBias = .025; scene.add(key);
    const rim = new T.DirectionalLight('#20b9b0', 2.8); rim.position.set(3, 4, -4); scene.add(rim);
    const warm = new T.DirectionalLight('#ffd6a8', 1.5); warm.position.set(-5, 2, -2); scene.add(warm);
    canvas.addEventListener('pointerdown', down, true); canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
    canvas.addEventListener('webglcontextlost', lost);
    let verified = false, pixelRange = 0;
    return {
      // x, base: displacement of the mass and of the frame in scene units, positive down, both in the
      // ground frame. force: −1..1, positive up (forced rig only). Spring and dashpot span x − base.
      draw(x, age, flash, base = 0, force = 0) {
        displacement = x; mass.position.y = 1.25 + LIFT - x; frame.position.y = LIFT - base; coil(FREE_LENGTH + x - base);
        const lower = 1.25 - (x - base) + .28, upper = 2.6;   // frame-local
        rod.position.y = (lower + upper) / 2; rod.scale.y = upper - lower;
        if (arrow) {
          const length = Math.abs(force) * ARROW, tip = Math.min(1, length / .26);
          arrow.position.y = mass.position.y; arrow.rotation.z = force < 0 ? Math.PI : 0;
          shaft.scale.y = Math.max(length - .26 * tip, 1e-4); head.position.y = shaft.scale.y; head.scale.setScalar(Math.max(tip, 1e-4));
        }
        ringMat.opacity = flash * .8; ring.scale.setScalar(1 + (1 - flash) * .15);
        if (intro && age < 2.5) {
          const u = age / 2.5, smooth = u * u * (3 - 2 * u);
          const a = Math.atan2(4.1, 6.8) + (1 - smooth) * Math.PI * 2 / 3;
          const r = ORBIT + (1 - smooth) * 2;
          camera.position.set(r * Math.sin(a), EYE + (1 - smooth) * 1.4, r * Math.cos(a));
        } else intro = false;
        controls.update(); renderer.render(scene, camera);
        if (!verified) {
          const gl = renderer.getContext(), w = canvas.width, h = canvas.height;
          const pixels = new Uint8Array(w * h * 4); gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
          let min = 255, max = 0;
          for (let i = 0; i < pixels.length; i += 16) { min = Math.min(min, pixels[i]); max = Math.max(max, pixels[i]); }
          pixelRange = max - min;
          if (pixelRange < 12 || gl.isContextLost()) throw new Error('The 3D frame could not be drawn');
          verified = true;
        }
      },
      // Scene units per unit of normalized displacement; places the ± x_static lines of the forced rig.
      setReference(unit) { for (const m of band) m.position.y = 1.25 + m.userData.side * unit; },
      resize(w, h) { renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); },
      snapshot() {
        const p = mass.position.clone().project(camera), r = canvas.getBoundingClientRect();
        // massY, baseY: mesh displacement from rest in scene units, positive up, ground frame.
        return { camera: camera.position.toArray(), pulling, pixelRange, vertices: pos.length / 3,
          massY: mass.position.y - 1.25 - LIFT, baseY: frame.position.y - LIFT, arrow: arrow ? (arrow.rotation.z ? -1 : 1) * (shaft.scale.y + .26 * head.scale.y) : 0,
          massScreen: { x: r.left + (p.x + 1) * r.width / 2, y: r.top + (1 - p.y) * r.height / 2 } };
      },
      dispose: clean
    };
  } catch (error) { clean(); throw error; }
}
