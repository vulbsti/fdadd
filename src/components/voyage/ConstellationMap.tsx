'use client';

import { useEffect, useRef } from 'react';
import * as THREE from 'three';

/**
 * ConstellationMap — the roadmap rendered as a star chart.
 *
 * "SELF" sits at the center of a constellation; the disciplines Aidoraa
 * will grow into are stars around it. Live instruments (fashion, dating)
 * burn gold; horizon domains stay dim until their expedition begins.
 * Slow drift rotation, pointer parallax, hover raycasting brightens a
 * star and lifts its label.
 */

type Star = {
  name: string;
  status: 'live' | 'horizon';
  position: [number, number, number];
};

const STARS: Star[] = [
  { name: 'SELF', status: 'live', position: [0, 0, 0] },
  { name: 'Fashion', status: 'live', position: [-2.6, 0.7, 0.9] },
  { name: 'Dating', status: 'live', position: [2.3, -0.6, 1.1] },
  { name: 'Health', status: 'horizon', position: [-2.2, -1.4, -1.4] },
  { name: 'Astrology', status: 'horizon', position: [0.4, 2.3, -1.7] },
  { name: 'Spirituality', status: 'horizon', position: [3.1, 1.5, -0.8] },
  { name: 'Neuroscience', status: 'horizon', position: [-0.7, -2.5, -0.6] },
  { name: 'Behaviour Science', status: 'horizon', position: [1.6, -1.8, 1.9] },
];

// Faint cross-links between horizon stars — a chart still being drawn.
const LINKS: Array<[number, number]> = [
  [0, 1],
  [0, 2],
  [0, 3],
  [0, 4],
  [0, 5],
  [0, 6],
  [0, 7],
  [1, 4], // fashion ↔ astrology
  [2, 7], // dating ↔ behaviour
  [3, 6], // health ↔ neuroscience
  [5, 4], // spirituality ↔ astrology
];

const GOLD = new THREE.Color('#d9a851');
const CREAM = new THREE.Color('#efe4cf');

export default function ConstellationMap() {
  const mountRef = useRef<HTMLDivElement>(null);
  const labelsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mount = mountRef.current;
    const labelsLayer = labelsRef.current;
    if (!mount || !labelsLayer) return;

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let width = mount.clientWidth || 1;
    let height = mount.clientHeight || 320;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();

    const camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 100);
    camera.position.set(0, 0.4, 8);

    const world = new THREE.Group();
    scene.add(world);

    // ---- Stars ---------------------------------------------------------------
    const starGeo = new THREE.SphereGeometry(0.085, 24, 24);
    const meshes: THREE.Mesh[] = [];
    const materials: THREE.MeshStandardMaterial[] = [];

    scene.add(new THREE.AmbientLight(0xffffff, 0.9));
    const keyLight = new THREE.PointLight(0xf2e7d3, 12, 30);
    keyLight.position.set(4, 5, 6);
    scene.add(keyLight);

    STARS.forEach((star) => {
      const isLive = star.status === 'live';
      const mat = new THREE.MeshStandardMaterial({
        color: isLive ? GOLD : CREAM,
        emissive: isLive ? GOLD : CREAM,
        emissiveIntensity: isLive ? 0.85 : 0.12,
        roughness: 0.4,
        metalness: 0.1,
      });
      const mesh = new THREE.Mesh(starGeo, mat);
      mesh.position.set(...star.position);
      if (!isLive) mesh.scale.setScalar(0.75);
      mesh.userData.index = meshes.length;
      world.add(mesh);
      meshes.push(mesh);
      materials.push(mat);
    });

    // ---- Links -----------------------------------------------------------------
    const linePositions: number[] = [];
    LINKS.forEach(([a, b]) => {
      linePositions.push(...STARS[a].position, ...STARS[b].position);
    });
    const lineGeo = new THREE.BufferGeometry();
    lineGeo.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(linePositions, 3)
    );
    const lineMat = new THREE.LineBasicMaterial({
      color: CREAM,
      transparent: true,
      opacity: 0.14,
    });
    world.add(new THREE.LineSegments(lineGeo, lineMat));

    // Backdrop dust so the chart feels embedded in sky, not floating on CSS.
    const DUST = reducedMotion ? 120 : 380;
    const dustPos = new Float32Array(DUST * 3);
    for (let i = 0; i < DUST; i++) {
      dustPos[i * 3] = (Math.random() - 0.5) * 18;
      dustPos[i * 3 + 1] = (Math.random() - 0.5) * 10;
      dustPos[i * 3 + 2] = (Math.random() - 0.5) * 10 - 2;
    }
    const dustGeo = new THREE.BufferGeometry();
    dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
    const dustMat = new THREE.PointsMaterial({
      color: CREAM,
      size: 0.02,
      transparent: true,
      opacity: 0.25,
    });
    world.add(new THREE.Points(dustGeo, dustMat));

    // ---- HTML labels -------------------------------------------------------------
    const labelEls = STARS.map((star) => {
      const el = document.createElement('span');
      el.textContent = star.name.toUpperCase();
      el.style.position = 'absolute';
      el.style.transform = 'translate(-50%, -160%)';
      el.style.fontSize = '11px';
      el.style.letterSpacing = '0.22em';
      el.style.fontWeight = '600';
      el.style.pointerEvents = 'none';
      el.style.whiteSpace = 'nowrap';
      el.style.transition = 'opacity 0.4s ease';
      el.style.opacity = star.status === 'live' ? '0.95' : '0.45';
      el.className = star.status === 'live' ? 'text-gold-bright' : 'text-foreground/60';
      labelsLayer.appendChild(el);
      return el;
    });

    // ---- Interaction ----------------------------------------------------------------
    const pointer = { x: 0, y: 0 };
    const smooth = { x: 0, y: 0 };
    const ndc = new THREE.Vector2();
    const raycaster = new THREE.Raycaster();
    let hovered = -1;

    const onPointerMove = (e: PointerEvent) => {
      const rect = mount.getBoundingClientRect();
      pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      ndc.set(pointer.x, pointer.y);
      raycaster.setFromCamera(ndc, camera);
      const hits = raycaster.intersectObjects(meshes, false);
      const next = hits.length > 0 ? (hits[0].object.userData.index as number) : -1;
      if (next !== hovered) {
        hovered = next;
        mount.style.cursor = hovered >= 0 ? 'pointer' : 'default';
      }
    };
    mount.addEventListener('pointermove', onPointerMove, { passive: true });
    const onPointerLeave = () => {
      hovered = -1;
      pointer.x = 0;
      pointer.y = 0;
      mount.style.cursor = 'default';
    };
    mount.addEventListener('pointerleave', onPointerLeave);

    // ---- Resize / lifecycle ------------------------------------------------------------
    const resizeObserver = new ResizeObserver(() => {
      width = mount.clientWidth || 1;
      height = mount.clientHeight || 320;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    });
    resizeObserver.observe(mount);

    let visible = true;
    const intersection = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
    });
    intersection.observe(mount);

    // ---- Frame loop ----------------------------------------------------------------------
    const clock = new THREE.Clock();
    let rafId = 0;
    const projected = new THREE.Vector3();

    const scaleTmp = new THREE.Vector3();
    const renderFrame = () => {
      const elapsed = clock.getElapsedTime();

      smooth.x += (pointer.x - smooth.x) * 0.05;
      smooth.y += (pointer.y - smooth.y) * 0.05;

      world.rotation.y = elapsed * 0.06 + smooth.x * 0.25;
      world.rotation.x = smooth.y * 0.12;

      meshes.forEach((mesh, i) => {
        const isHovered = i === hovered;
        const targetScale = (STARS[i].status === 'live' ? 1 : 0.75) * (isHovered ? 1.7 : 1);
        mesh.scale.lerp(scaleTmp.setScalar(targetScale), 0.12);
        const mat = materials[i];
        const targetEmissive = isHovered ? 1.6 : STARS[i].status === 'live' ? 0.85 : 0.12;
        mat.emissiveIntensity += (targetEmissive - mat.emissiveIntensity) * 0.12;

        // Project to screen space for the HTML label.
        projected.copy(mesh.position).applyMatrix4(world.matrixWorld).project(camera);
        const el = labelEls[i];
        el.style.left = `${((projected.x + 1) / 2) * width}px`;
        el.style.top = `${((-projected.y + 1) / 2) * height}px`;
        el.style.opacity =
          projected.z < 1
            ? isHovered
              ? '1'
              : STARS[i].status === 'live'
                ? '0.95'
                : '0.45'
            : '0';
      });

      renderer.render(scene, camera);
    };

    if (reducedMotion) {
      renderFrame();
    } else {
      const tick = () => {
        rafId = requestAnimationFrame(tick);
        if (!visible) return;
        renderFrame();
      };
      tick();
    }

    // ---- Teardown ---------------------------------------------------------------------------
    return () => {
      cancelAnimationFrame(rafId);
      mount.removeEventListener('pointermove', onPointerMove);
      mount.removeEventListener('pointerleave', onPointerLeave);
      resizeObserver.disconnect();
      intersection.disconnect();
      labelEls.forEach((el) => el.remove());
      starGeo.dispose();
      lineGeo.dispose();
      lineMat.dispose();
      dustGeo.dispose();
      dustMat.dispose();
      materials.forEach((m) => m.dispose());
      renderer.dispose();
      if (renderer.domElement.parentNode === mount) {
        mount.removeChild(renderer.domElement);
      }
    };
  }, []);

  return (
    <div className="relative w-full" style={{ minHeight: 420 }}>
      <div ref={mountRef} aria-hidden="true" className="absolute inset-0" />
      <div ref={labelsRef} className="pointer-events-none absolute inset-0 overflow-hidden" />
    </div>
  );
}
