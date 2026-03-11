"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useAnimations, useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { SkeletonUtils } from "three-stdlib";
import type { PlayerData } from "./usePositionSync";

type GuestPlayerProps = {
  player: PlayerData;
};

/**
 * Renders a remote player's robot with smooth interpolation.
 *
 * Smoothing strategy:
 * - Stores the last two received positions to estimate velocity
 * - Each frame, moves toward (target + velocity * lookahead) using
 *   a critically-damped spring (SmoothDamp-style) for jitter-free motion
 * - Animation crossfades are fast (0.15s) so walk/idle transitions feel snappy
 */
export const GuestPlayer = ({ player }: GuestPlayerProps) => {
  const rootRef = useRef<THREE.Group>(null);
  const modelRootRef = useRef<THREE.Group>(null);
  const activeActionRef = useRef<string | null>(null);
  const colorAppliedRef = useRef<string | null>(null);

  const { scene, animations } = useGLTF("/RobotExpressive.glb");
  const model = useMemo(() => SkeletonUtils.clone(scene), [scene]);
  const { actions, names } = useAnimations(animations, modelRootRef);

  /* ── Interpolation state ── */
  const targetPos = useRef(new THREE.Vector3(player.position[0], player.position[1], player.position[2]));
  const prevTargetPos = useRef(new THREE.Vector3(player.position[0], player.position[1], player.position[2]));
  const velocity = useRef(new THREE.Vector3(0, 0, 0));
  const targetRot = useRef(player.rotation);
  const targetAnim = useRef(player.animation || "Idle");
  const lastUpdateTime = useRef(Date.now());

  // Smoothing parameters
  const SMOOTH_TIME = 0.08; // seconds — lower = snappier (critically-damped spring feel)
  const ROTATION_SMOOTH = 12; // higher = snappier rotation

  // Update targets every render from latest player data
  const newTarget = new THREE.Vector3(player.position[0], player.position[1], player.position[2]);
  if (!newTarget.equals(targetPos.current)) {
    const now = Date.now();
    const dt = Math.max(0.016, (now - lastUpdateTime.current) / 1000); // seconds since last update

    // Estimate velocity from position delta
    velocity.current.copy(newTarget).sub(targetPos.current).divideScalar(dt);

    prevTargetPos.current.copy(targetPos.current);
    targetPos.current.copy(newTarget);
    lastUpdateTime.current = now;
  }
  targetRot.current = player.rotation;
  targetAnim.current = player.animation || "Idle";

  /* ── Color tinting ── */
  useEffect(() => {
    if (!model) return;

    // Owner: original model colors, no tint
    if (player.role === "owner") {
      colorAppliedRef.current = null;
      return;
    }

    // Guest: apply their chosen color
    if (!player.color) return;
    if (colorAppliedRef.current === player.color) return;
    colorAppliedRef.current = player.color;

    const tintColor = new THREE.Color(player.color);
    model.traverse((child) => {
      if (child instanceof THREE.Mesh && child.material) {
        const materials = Array.isArray(child.material) ? child.material : [child.material];
        const newMaterials = materials.map((mat) => {
          if (mat instanceof THREE.MeshStandardMaterial) {
            const clonedMat = mat.clone();
            clonedMat.color.set(tintColor);
            clonedMat.emissive.copy(tintColor).multiplyScalar(0.2);
            return clonedMat;
          }
          return mat;
        });
        child.material = Array.isArray(child.material) ? newMaterials : newMaterials[0];
      }
    });
  }, [model, player.color, player.role]);

  /* ── Animation helpers ── */
  const findActionName = useCallback(
    (target: string): string | null => {
      if (actions[target]) return target;
      const lower = target.toLowerCase();
      return names.find((n) => n.toLowerCase() === lower) ?? null;
    },
    [actions, names]
  );

  const playClip = useCallback(
    (clipName: string) => {
      const resolved = findActionName(clipName);
      if (!resolved || activeActionRef.current === resolved) return;

      const next = actions[resolved];
      if (!next) return;

      if (activeActionRef.current && actions[activeActionRef.current]) {
        actions[activeActionRef.current]!.fadeOut(0.15);
      }

      next.reset().fadeIn(0.15).setLoop(THREE.LoopRepeat, Infinity);
      next.clampWhenFinished = false;
      next.play();
      activeActionRef.current = resolved;
    },
    [actions, findActionName]
  );

  useEffect(() => {
    playClip("Idle");
  }, [playClip]);

  /* ── Per-frame interpolation ── */
  // Reusable vectors to avoid GC
  const _smoothTarget = useRef(new THREE.Vector3());

  useFrame((_, delta) => {
    if (!rootRef.current) return;

    // Predict slightly ahead using velocity for smoother motion
    const lookahead = Math.min(delta * 2, 0.1); // small lookahead
    _smoothTarget.current
      .copy(targetPos.current)
      .addScaledVector(velocity.current, lookahead);

    // Critically-damped spring interpolation (SmoothDamp approximation)
    // t approaches 1 as SMOOTH_TIME → 0
    const t = 1 - Math.exp(-delta / Math.max(SMOOTH_TIME, 0.001));
    rootRef.current.position.lerp(_smoothTarget.current, t);

    // Smooth rotation (shortest path)
    let yawDelta = targetRot.current - rootRef.current.rotation.y;
    // Wrap to [-PI, PI]
    yawDelta = yawDelta - Math.PI * 2 * Math.round(yawDelta / (Math.PI * 2));
    rootRef.current.rotation.y += yawDelta * Math.min(1, ROTATION_SMOOTH * delta);

    // Animation
    if (targetAnim.current !== activeActionRef.current) {
      playClip(targetAnim.current);
    }
  });

  return (
    <group
      ref={rootRef}
      position={[player.position[0], player.position[1], player.position[2]]}
    >
      <group ref={modelRootRef}>
        <primitive object={model} scale={[0.38, 0.38, 0.38]} castShadow receiveShadow />
      </group>
      {/* Colored dot above head for guest players */}
      {player.role === "guest" && player.color && (
        <mesh position={[0, 1.8, 0]}>
          <sphereGeometry args={[0.12, 16, 16]} />
          <meshStandardMaterial
            color={player.color}
            emissive={player.color}
            emissiveIntensity={0.5}
          />
        </mesh>
      )}
    </group>
  );
};
