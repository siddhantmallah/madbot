"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";

/**
 * The opportunity map, live and in three dimensions.
 *
 * The product's core visual is a graph: one site at the centre, the things
 * worth doing arranged around it by score, the brightest routes nearest. The
 * landing page carried that as a flat PNG. This is the same idea drawn with
 * WebGL — a few hundred nodes on a loose shell around a bright core, joined to
 * their neighbours, turning slowly and leaning towards the pointer.
 *
 * Two draw calls: one Points cloud and one LineSegments. That is cheap enough
 * to run at a steady frame rate on an integrated GPU, which matters more for a
 * marketing page than any effect that needs a discrete one.
 *
 * Off under prefers-reduced-motion (renders one still frame) and absent when
 * WebGL is unavailable, in which case the caller's fallback shows instead.
 */

const ORANGE = new THREE.Color("#FF6A1A");
const PURPLE = new THREE.Color("#A855F7");
const EMBER = new THREE.Color("#FF9557");
const DIM = new THREE.Color("#5C5670");

// A soft round sprite, drawn once. Square points look like confetti; this is
// what makes them read as light.
function makeGlowTexture() {
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.35, "rgba(255,255,255,.55)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

// Deterministic, so the scene is the same on every load. A random layout that
// reshuffles on refresh reads as noise; a stable one reads as a thing.
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildGraph({ count = 260, seed = 7 }) {
  const rand = rng(seed);
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  const phase = new Float32Array(count);

  // The core: one bright node at the origin, the "site".
  positions.set([0, 0, 0], 0);
  colors.set([ORANGE.r, ORANGE.g, ORANGE.b], 0);
  sizes[0] = 34;
  phase[0] = 0;

  // Two shells. The inner ring holds the high-scoring work — bigger, warmer,
  // nearer. The outer scatter is everything else.
  for (let i = 1; i < count; i++) {
    const inner = i < 40;
    const r = inner ? 1.15 + rand() * 0.55 : 2.1 + rand() * 1.9;
    // Even spread over a sphere, squashed a little so it reads as a disc with
    // depth rather than a ball.
    const u = rand() * 2 - 1;
    const theta = rand() * Math.PI * 2;
    const s = Math.sqrt(1 - u * u);
    const x = r * s * Math.cos(theta);
    const y = r * u * 0.62;
    const z = r * s * Math.sin(theta);
    positions.set([x, y, z], i * 3);

    const roll = rand();
    const c = inner ? (roll < 0.55 ? ORANGE : roll < 0.85 ? EMBER : PURPLE) : roll < 0.18 ? PURPLE : roll < 0.3 ? ORANGE : DIM;
    colors.set([c.r, c.g, c.b], i * 3);
    sizes[i] = inner ? 12 + rand() * 11 : 4 + rand() * 5.5;
    phase[i] = rand() * Math.PI * 2;
  }

  // Edges: each node links to its two nearest neighbours, and every inner node
  // links back to the core. Nearest-neighbour rather than random, so the lines
  // look like structure rather than a cat's cradle.
  const edges = [];
  const p = (i) => new THREE.Vector3(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]);
  for (let i = 1; i < count; i++) {
    const a = p(i);
    let best = [];
    for (let j = 1; j < count; j++) {
      if (j === i) continue;
      const d = a.distanceToSquared(p(j));
      if (best.length < 2) best.push({ j, d });
      else {
        const worst = best[0].d > best[1].d ? 0 : 1;
        if (d < best[worst].d) best[worst] = { j, d };
      }
    }
    for (const b of best) if (b.j > i) edges.push(i, b.j);
    if (i < 40) edges.push(0, i);
  }

  const linePositions = new Float32Array(edges.length * 3);
  const lineColors = new Float32Array(edges.length * 3);
  edges.forEach((idx, k) => {
    linePositions.set([positions[idx * 3], positions[idx * 3 + 1], positions[idx * 3 + 2]], k * 3);
    // Lines take the colour of the node at each end, dimmed hard — they are
    // context, not the subject.
    lineColors.set([colors[idx * 3] * 0.45, colors[idx * 3 + 1] * 0.45, colors[idx * 3 + 2] * 0.45], k * 3);
  });

  return { positions, colors, sizes, phase, linePositions, lineColors, count };
}

const VERT = /* glsl */ `
  attribute float size;
  attribute float phase;
  attribute vec3 color;
  uniform float uTime;
  uniform float uPixelRatio;
  varying vec3 vColor;
  varying float vPulse;
  void main() {
    vColor = color;
    // The bright ones breathe. Small ones hold still, so the eye has somewhere
    // to rest.
    float breathe = size > 8.0 ? 0.82 + 0.18 * sin(uTime * 1.4 + phase) : 1.0;
    vPulse = breathe;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = size * breathe * uPixelRatio * (9.0 / -mv.z);
  }
`;

const FRAG = /* glsl */ `
  uniform sampler2D uTex;
  varying vec3 vColor;
  varying float vPulse;
  void main() {
    vec4 t = texture2D(uTex, gl_PointCoord);
    gl_FragColor = vec4(vColor, t.a * (0.65 + 0.35 * vPulse));
  }
`;

export default function HeroScene({ className, style, children }) {
  const hostRef = useRef(null);
  // Set when WebGL can't start, so the caller's fallback (passed as children)
  // shows in place of an empty box.
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;

    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: "high-performance" });
    } catch {
      setFailed(true);
      return undefined;
    }

    const calm = window.matchMedia("(prefers-reduced-motion: reduce)");
    const fine = window.matchMedia("(hover: hover) and (pointer: fine)");

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0x000000, 0);
    host.appendChild(renderer.domElement);
    renderer.domElement.style.display = "block";
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
    camera.position.set(0, 0.6, 7.2);
    camera.lookAt(0, 0, 0);

    const graph = buildGraph({});
    const group = new THREE.Group();
    scene.add(group);

    const pointsGeo = new THREE.BufferGeometry();
    pointsGeo.setAttribute("position", new THREE.BufferAttribute(graph.positions, 3));
    pointsGeo.setAttribute("color", new THREE.BufferAttribute(graph.colors, 3));
    pointsGeo.setAttribute("size", new THREE.BufferAttribute(graph.sizes, 1));
    pointsGeo.setAttribute("phase", new THREE.BufferAttribute(graph.phase, 1));

    const tex = makeGlowTexture();
    const pointsMat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uPixelRatio: { value: renderer.getPixelRatio() }, uTex: { value: tex } },
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    group.add(new THREE.Points(pointsGeo, pointsMat));

    const lineGeo = new THREE.BufferGeometry();
    lineGeo.setAttribute("position", new THREE.BufferAttribute(graph.linePositions, 3));
    lineGeo.setAttribute("color", new THREE.BufferAttribute(graph.lineColors, 3));
    const lineMat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.72, depthWrite: false, blending: THREE.AdditiveBlending });
    group.add(new THREE.LineSegments(lineGeo, lineMat));

    // A resting tilt so the disc has depth from the first frame, then a slow
    // turn. The pointer adds a lean on top; it eases back when the pointer goes.
    group.rotation.x = 0.28;
    let targetLeanX = 0;
    let targetLeanY = 0;
    let leanX = 0;
    let leanY = 0;

    const zone = host.closest("[data-hero-zone]") || host;
    const onMove = (e) => {
      if (e.pointerType && e.pointerType !== "mouse") return;
      const r = zone.getBoundingClientRect();
      targetLeanY = ((e.clientX - r.left) / r.width - 0.5) * 0.55;
      targetLeanX = ((e.clientY - r.top) / r.height - 0.5) * 0.35;
    };
    const onLeave = () => {
      targetLeanX = 0;
      targetLeanY = 0;
    };
    if (fine.matches) {
      zone.addEventListener("pointermove", onMove, { passive: true });
      zone.addEventListener("pointerleave", onLeave);
    }

    const resize = () => {
      const w = host.clientWidth || 1;
      const h = host.clientHeight || 1;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      // On a wide viewport the copy sits left, so the graph's bright core moves
      // right — out from behind the headline, into the clear where the vignette
      // fades. On a phone the copy spans the width and the core stays centred.
      group.position.x = camera.aspect > 1.15 ? 2.2 : 0;
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(host);

    let raf = 0;
    let running = true;
    const t0 = performance.now();

    const frame = (now) => {
      if (!running) return;
      const t = (now - t0) / 1000;
      pointsMat.uniforms.uTime.value = t;
      // Ease toward the pointer target; the divisor is the "weight".
      leanX += (targetLeanX - leanX) / 14;
      leanY += (targetLeanY - leanY) / 14;
      group.rotation.y = t * 0.09 + leanY;
      group.rotation.x = 0.28 + leanX;
      renderer.render(scene, camera);
      raf = requestAnimationFrame(frame);
    };

    // Don't burn a GPU on a tab nobody is looking at.
    const io = new IntersectionObserver(
      ([entry]) => {
        const visible = entry.isIntersecting;
        if (visible && !running && !calm.matches) {
          running = true;
          raf = requestAnimationFrame(frame);
        } else if (!visible && running) {
          running = false;
          cancelAnimationFrame(raf);
        }
      },
      { threshold: 0.05 }
    );
    io.observe(host);

    if (calm.matches) {
      // One still frame: the picture without the motion.
      running = false;
      renderer.render(scene, camera);
    } else {
      raf = requestAnimationFrame(frame);
    }

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      zone.removeEventListener("pointermove", onMove);
      zone.removeEventListener("pointerleave", onLeave);
      pointsGeo.dispose();
      lineGeo.dispose();
      pointsMat.dispose();
      lineMat.dispose();
      tex.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === host) host.removeChild(renderer.domElement);
    };
  }, []);

  return (
    <>
      <div ref={hostRef} className={className} style={{ position: "absolute", inset: 0, ...style }} aria-hidden="true" />
      {failed ? children : null}
    </>
  );
}
