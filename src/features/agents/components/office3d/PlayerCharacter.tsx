"use client";

import { useRef, useEffect, useMemo, useCallback, type ComponentProps } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useGLTF, useAnimations, useKeyboardControls } from "@react-three/drei";
import * as THREE from "three";

/* ─── World bounds (match office walls) ────────────────── */
const BOUNDS = { minX: -16, maxX: 16, minZ: -16, maxZ: 16 };
const PLAYER_Y = 0;
const WALK_SPEED = 4.2;
const RUN_SPEED = 7.2;
const ROTATION_SPEED = 10;
const TARGET_LERP = 8; // how fast orbit target snaps to player

type MotionState = "idle" | "walk" | "run";
type ControlKey = "forward" | "back" | "left" | "right" | "run";

const PLAYER_MODEL_SCALE = 0.000001;
const PLAYER_HEAD_HEIGHT = 0.1;
const PLAYER_SHADOW_RADIUS = 0.16;

function PlayerModel({
  scale = PLAYER_MODEL_SCALE,
  ...props
}: { scale?: number } & ComponentProps<"group">) {
  const { scene } = useGLTF("/hicks.glb");
  const clonedScene = useMemo(() => scene.clone(), [scene]);
  return (
    <group scale={[scale, scale, scale]} {...props}>
      <primitive object={clonedScene} />
    </group>
  );
}

export const PlayerCharacter = () => {
  const groupRef = useRef<THREE.Group>(null);
  const { animations } = useGLTF("/hicks.glb");
  const { actions, names } = useAnimations(animations, groupRef);
  const [, get] = useKeyboardControls<ControlKey>();

  const { camera } = useThree();
  const controls = useThree((s) => s.controls) as any;

  const currentAction = useRef<string | null>(null);
  const motionStateRef = useRef<MotionState>("idle");

  /* ── figure out idle / walk clip names ── */
  const idleClip = useMemo(() => {
    const lower = names.map((n) => n.toLowerCase());
    const idx =
      lower.findIndex((n) => n.includes("idle")) ??
      lower.findIndex((n) => n.includes("stand")) ??
      0;
    return idx >= 0 ? names[idx] : names[0] ?? null;
  }, [names]);

  const walkClip = useMemo(() => {
    const lower = names.map((n) => n.toLowerCase());
    const idx =
      lower.findIndex((n) => n.includes("walk")) ??
      lower.findIndex((n) => n.includes("run")) ??
      lower.findIndex((n) => n.includes("jog")) ??
      -1;
    return idx >= 0 ? names[idx] : null;
  }, [names]);

  const runClip = useMemo(() => {
    const lower = names.map((n) => n.toLowerCase());
    const idx =
      lower.findIndex((n) => n.includes("run")) ??
      lower.findIndex((n) => n.includes("sprint")) ??
      -1;
    return idx >= 0 ? names[idx] : null;
  }, [names]);

  /* ── play animation helper ── */
  const playAnimation = useCallback(
    (clipName: string | null) => {
      if (!clipName || currentAction.current === clipName) return;
      if (currentAction.current && actions[currentAction.current]) {
        actions[currentAction.current]!.fadeOut(0.25);
      }
      const action = clipName ? actions[clipName] : null;
      if (action) {
        action.reset().fadeIn(0.25).play();
      }
      currentAction.current = clipName;
    },
    [actions]
  );

  const getClipForState = useCallback(
    (state: MotionState): string | null => {
      if (state === "run") return runClip ?? walkClip ?? idleClip;
      if (state === "walk") return walkClip ?? idleClip;
      return idleClip;
    },
    [idleClip, runClip, walkClip]
  );

  /* ── start idle on mount ── */
  useEffect(() => {
    if (idleClip) {
      playAnimation(idleClip);
    }
  }, [idleClip, playAnimation]);

  /* ── per-frame: move character + anchor orbit target on character ── */
  useFrame((_, delta) => {
    if (!groupRef.current) return;

    /* ── build movement direction from camera facing ── */
    const camForward = new THREE.Vector3();
    camera.getWorldDirection(camForward);
    camForward.y = 0;
    camForward.normalize();
    const camRight = new THREE.Vector3()
      .crossVectors(camForward, camera.up)
      .normalize();

    const moveDir = new THREE.Vector3();
    const controlState = get();
    const forward = Boolean(controlState.forward);
    const back = Boolean(controlState.back);
    const left = Boolean(controlState.left);
    const right = Boolean(controlState.right);
    const run = Boolean(controlState.run);
    if (forward) moveDir.add(camForward);
    if (back) moveDir.sub(camForward);
    if (left) moveDir.sub(camRight);
    if (right) moveDir.add(camRight);

    const moving = moveDir.lengthSq() > 0.001;
    const running = moving && run;
    const nextMotionState: MotionState = moving ? (running ? "run" : "walk") : "idle";

    /* ── animation state machine: idle/walk/run ── */
    if (motionStateRef.current !== nextMotionState) {
      motionStateRef.current = nextMotionState;
      playAnimation(getClipForState(nextMotionState));
    }

    /* ── move character ── */
    if (moving) {
      moveDir.normalize();
      const speed = running ? RUN_SPEED : WALK_SPEED;
      const pos = groupRef.current.position;
      pos.x += moveDir.x * speed * delta;
      pos.z += moveDir.z * speed * delta;

      // clamp to office bounds
      pos.x = Math.max(BOUNDS.minX, Math.min(BOUNDS.maxX, pos.x));
      pos.z = Math.max(BOUNDS.minZ, Math.min(BOUNDS.maxZ, pos.z));

      // rotate character to face movement direction
      const targetAngle = Math.atan2(moveDir.x, moveDir.z);
      const currentAngle = groupRef.current.rotation.y;
      let diff = targetAngle - currentAngle;
      diff = ((diff + Math.PI) % (Math.PI * 2)) - Math.PI;
      groupRef.current.rotation.y += diff * Math.min(1, ROTATION_SPEED * delta);
    }

    /* ── anchor OrbitControls target on character ── */
    if (controls?.target) {
      const playerHead = groupRef.current.position.clone();
      playerHead.y += PLAYER_HEAD_HEIGHT;
      controls.target.lerp(playerHead, TARGET_LERP * delta);
    }
  });

  return (
    <group ref={groupRef} position={[0, PLAYER_Y, -6]}>
      <PlayerModel scale={PLAYER_MODEL_SCALE} />
      {/* Soft shadow disc under feet */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
        <circleGeometry args={[PLAYER_SHADOW_RADIUS, 24]} />
        <meshBasicMaterial
          color="black"
          transparent
          opacity={0.25}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
};

useGLTF.preload("/hicks.glb");
