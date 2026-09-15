'use client';

import { useEffect, useRef } from 'react';
import * as THREE from 'three';

/**
 * VoyageCanvas — the hero "window into the voyage".
 *
 * A slowly rotating particle galaxy in deep navy, a pulsing wireframe
 * "core self" at its center. Pointer position parallaxes the camera;
 * page scroll dollies the camera inward and spins the galaxy faster,
 * so leaving the hero reads as embarking on the voyage.
 *
 * Renders nothing until mounted client-side; pauses off-screen and on
 * hidden tabs; renders a single static frame under reduced motion.
 */

type Props = {
  /** Fired once the scene has rendered its first frame. */
  onReady?: () => void;
};

const NAVY = new THREE.Color('#141b2e');
const CREAM = new THREE.Color('#f2e7d3');
const GOLD = new THREE.Color('#d9a851');
const PALE = new THREE.Color('#9db4d6');

export default function VoyageCanvas({ onReady }: Props) {
  const mountRef = useRef<HTMLDivElement>(null);
  const readyRef = useRef(false);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let width = mount.clientWidth || 1;
    let height = mount.clientHeight || 1;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    renderer.setClearColor(NAVY, 1);
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(NAVY.getHex(), 0.028);

    const camera = new THREE.PerspectiveCamera(55, width / height, 0.1, 100);
    camera.position.set(0, 2.2, 7.5);
    camera.lookAt(0, 0, 0);

    // ---- Galaxy particle field -------------------------------------------
    // Three spiral arms; density falls off radially and vertically so the
    // disc reads as a galaxy rather than a flat plate.
    const COUNT = reducedMotion ? 2500 : 7000;
    const positions = new Float32Array(COUNT * 3);
    const colors = new Float32Array(COUNT * 3);
    const ARMS = 3;

    for (let i = 0; i < COUNT; i++) {
      const arm = i % ARMS;
      const distance = Math.pow(Math.random(), 1.6) * 9;
      const armAngle = (arm / ARMS) * Math.PI * 2;
      const spin = distance * 0.42;
      const spread = Math.pow(Math.random(), 3) * (Math.random() < 0.5 ? 1 : -1);

      const angle = armAngle + spin + spread * 0.45;
      const radius = distance + spread * 0.9;

      positions[i * 3] = Math.cos(angle) * radius;
      positions[i * 3 + 1] = spread * 0.5 * (1 - distance / 10);
      positions[i * 3 + 2] = Math.sin(angle) * radius;

      // Inner stars run gold→cream (warm hearth), outer fade to pale blue.
      const t = Math.min(distance / 9, 1);
      const c = CREAM.clone().lerp(PALE, Math.pow(t, 1.4));
      if (Math.random() < 0.22) c.lerp(GOLD, 0.65);
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }

    const galaxyGeo = new THREE.BufferGeometry();
    galaxyGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    galaxyGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const galaxyMat = new THREE.PointsMaterial({
      size: 0.038,
      vertexColors: true,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
    });

    const galaxy = new THREE.Points(galaxyGeo, galaxyMat);
    galaxy.rotation.x = 0.35;
    scene.add(galaxy);

    // A sparse near-field dust layer adds depth between camera and galaxy.
    const DUST = reducedMotion ? 150 : 450;
    const dustPos = new Float32Array(DUST * 3);
    for (let i = 0; i < DUST; i++) {
      dustPos[i * 3] = (Math.random() - 0.5) * 16;
      dustPos[i * 3 + 1] = (Math.random() - 0.5) * 9;
      dustPos[i * 3 + 2] = (Math.random() - 0.5) * 12 + 2;
    }
    const dustGeo = new THREE.BufferGeometry();
    dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
    const dustMat = new THREE.PointsMaterial({
      color: GOLD,
      size: 0.02,
      transparent: true,
      opacity: 0.35,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const dust = new THREE.Points(dustGeo, dustMat);
    scene.add(dust);

    // ---- The core self ------------------------------------------------------
    const coreGroup = new THREE.Group();

    const outerGeo = new THREE.IcosahedronGeometry(1.05, 1);
    const outerMat = new THREE.MeshBasicMaterial({
      color: GOLD,
      wireframe: true,
      transparent: true,
      opacity: 0.42,
    });
    const outer = new THREE.Mesh(outerGeo, outerMat);

    const innerGeo = new THREE.IcosahedronGeometry(0.62, 2);
    const innerMat = new THREE.MeshBasicMaterial({
      color: CREAM,
      transparent: true,
      opacity: 0.08,
    });
    const inner = new THREE.Mesh(innerGeo, innerMat);

    coreGroup.add(outer, inner);
    coreGroup.position.set(-3.4, -1.7, 0.6);
    coreGroup.scale.setScalar(0.85);
    scene.add(coreGroup);

    // ---- Interaction state --------------------------------------------------
    const pointer = { x: 0, y: 0 };
    const smoothPointer = { x: 0, y: 0 };
    let scrollProgress = 0; // 0 at hero top → 1 as hero scrolls away

    const onPointerMove = (e: PointerEvent) => {
      pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
      pointer.y = -(e.clientY / window.innerHeight) * 2 + 1;
    };

    const onScroll = () => {
      const heroHeight = Math.max(height, window.innerHeight * 0.9);
      scrollProgress = Math.min(Math.max(window.scrollY / heroHeight, 0), 1);
    };

    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();

    // ---- Resize / visibility ------------------------------------------------
    const resizeObserver = new ResizeObserver(() => {
      height = mount.clientHeight || 1;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    });
    resizeObserver.observe(mount);

    let visible = true;
    const intersection = new IntersectionObserver(
      ([entry]) => {
        visible = entry.isIntersecting;
      },
      { threshold: 0 }
    );
    intersection.observe(mount);

    const onVisibility = () => {
      visible = !document.hidden && visible !== false ? true : visible && !document.hidden;
    };
    document.addEventListener('visibilitychange', onVisibility);

    // ---- Frame loop -----------------------------------------------------------
    const clock = new THREE.Clock();
    let rafId = 0;

    const renderFrame = () => {
      const elapsed = clock.getElapsedTime();

      smoothPointer.x += (pointer.x - smoothPointer.x) * 0.04;
      smoothPointer.y += (pointer.y - smoothPointer.y) * 0.04;

      galaxy.rotation.y = elapsed * 0.05 + scrollProgress * 0.6;

      // Camera: gentle breathing dolly + pointer parallax + scroll push-in.
      const targetZ = 7.5 - scrollProgress * 2.4;
      camera.position.z += (targetZ - camera.position.z) * 0.06;
      camera.position.x = smoothPointer.x * 0.7;
      camera.position.y = 2.2 + smoothPointer.y * 0.35 - scrollProgress * 0.8;
      camera.lookAt(0, 0, 0);

      coreGroup.rotation.y = elapsed * 0.18;
      coreGroup.rotation.x = Math.sin(elapsed * 0.24) * 0.22 + smoothPointer.y * 0.15;

      // Breath: slow inhale/exhale of the core.
      const breath = 1 + Math.sin(elapsed * 0.9) * 0.06;
      outer.scale.setScalar(breath);
      inner.scale.setScalar(2 - breath); // counter-pulse

      dust.rotation.y = -elapsed * 0.012;

      renderer.render(scene, camera);
    };

    if (reducedMotion) {
      renderFrame();
      if (!readyRef.current) {
        readyRef.current = true;
        onReady?.();
      }
    } else {
      const tick = () => {
        rafId = requestAnimationFrame(tick);
        // Pause work while the tab is hidden; keep rendering while mounted
        // but scrolled away only during the exit transition.
        if (!visible && scrollProgress >= 1) return;
        renderFrame();
        if (!readyRef.current) {
          readyRef.current = true;
          onReady?.();
        }
      };
      tick();
    }

    // ---- Teardown -------------------------------------------------------------
    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('scroll', onScroll);
      document.removeEventListener('visibilitychange', onVisibility);
      resizeObserver.disconnect();
      intersection.disconnect();
      galaxyGeo.dispose();
      galaxyMat.dispose();
      dustGeo.dispose();
      dustMat.dispose();
      outerGeo.dispose();
      outerMat.dispose();
      innerGeo.dispose();
      innerMat.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === mount) {
        mount.removeChild(renderer.domElement);
      }
    };
    // onReady is stable enough for our usage; re-running this effect would
    // rebuild the whole scene, which we never want.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      ref={mountRef}
      aria-hidden="true"
      className="absolute inset-0 h-full w-full"
      style={{ contain: 'strict' }}
    />
  );
}
