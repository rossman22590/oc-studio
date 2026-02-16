"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useAnimations, useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { SkeletonUtils } from "three-stdlib";
import type { PlayerData } from "./usePositionSync";

type GuestPlayerProps = {
  player: PlayerData;
  /** Interpolation speed factor (higher = snappier) */
  lerpSpeed?: number;
};

/**
 * Renders a remote player's robot with interpolated position/rotation.
 * Uses the same RobotExpressive.glb model but tinted to the player's chosen color.
 */
export const GuestPlayer = ({ player, lerpSpeed = 10 }: GuestPlayerProps) => {
  const rootRef = useRef<THREE.Group>(null);
  const modelRootRef = useRef<THREE.Group>(null);
  const activeActionRef = useRef<string | null>(null);
  const colorAppliedRef = useRef<string | null>(null);

  const { scene, animations } = useGLTF("/RobotExpressive.glb");
  const model = useMemo(() => SkeletonUtils.clone(scene), [scene]);
  const { actions, names } = useAnimations(animations, modelRootRef);

  // Use refs for target values — updated every render, consumed in useFrame
  const targetPosRef = useRef(new THREE.Vector3(player.position[0], player.position[1], player.position[2]));
  const targetRotRef = useRef(player.rotation);
  const targetAnimRef = useRef(player.animation || "Idle");

  // Update targets every render (no useEffect needed — refs are always current)
  targetPosRef.current.set(player.position[0], player.position[1], player.position[2]);
  targetRotRef.current = player.rotation;
  targetAnimRef.current = player.animation || "Idle";

  // Apply color tint ONLY for guests (not owners)
  // Owner (role="owner") uses original model colors - NO tinting
  useEffect(() => {
    if (!model) return;
    
    // Owner: use original model colors, never apply tint
    if (player.role === "owner") {
      colorAppliedRef.current = null;
      return; // Owner appears with original colors
    }
    
    // Guest: apply their chosen color tint
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

  const findActionName = useCallback(
    (target: string): string | null => {
      if (actions[target]) return target;
      const lowerTarget = target.toLowerCase();
      return names.find((n) => n.toLowerCase() === lowerTarget) ?? null;
    },
    [actions, names]
  );

  const playClip = useCallback(
    (clipName: string) => {
      const resolved = findActionName(clipName);
      if (!resolved) return;
      if (activeActionRef.current === resolved) return;

      const next = actions[resolved];
      if (!next) return;

      if (activeActionRef.current && actions[activeActionRef.current]) {
        actions[activeActionRef.current]!.fadeOut(0.2);
      }

      next.reset();
      next.fadeIn(0.2);
      next.setLoop(THREE.LoopRepeat, Infinity);
      next.clampWhenFinished = false;
      next.play();
      activeActionRef.current = resolved;
    },
    [actions, findActionName]
  );

  // Start with Idle animation
  useEffect(() => {
    playClip("Idle");
  }, [playClip]);

  // Interpolate position, rotation, and animation each frame
  useFrame((_, delta) => {
    if (!rootRef.current) return;

    const t = Math.min(1, lerpSpeed * delta);

    // Interpolate position smoothly
    rootRef.current.position.lerp(targetPosRef.current, t);

    // Interpolate rotation (shortest path)
    let yawDelta = targetRotRef.current - rootRef.current.rotation.y;
    yawDelta = ((yawDelta + Math.PI) % (Math.PI * 2)) - Math.PI;
    rootRef.current.rotation.y += yawDelta * t;

    // Update animation if changed
    const desiredAnim = targetAnimRef.current;
    if (desiredAnim !== activeActionRef.current) {
      playClip(desiredAnim);
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
      {/* Colored dot above head to identify the player */}
      {/* Owner: no dot (original colors), Guest: colored dot */}
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
