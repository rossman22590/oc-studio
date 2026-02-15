"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useAnimations, useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { SkeletonUtils } from "three-stdlib";

const states = ["Idle", "Walking", "Running", "Dance", "Death", "Sitting", "Standing"] as const;
const emotes = ["Jump", "Yes", "No", "Wave", "Punch", "ThumbsUp"] as const;

const WORLD_BOUNDS = { minX: -16, maxX: 16, minZ: -16, maxZ: 16 };
const PLAYER_RADIUS = 0.45;
const WALK_SPEED = 3.1;
const RUN_SPEED = 5.1;
const JUMP_VELOCITY = 6;
const GRAVITY = 16;
const TURN_LERP = 10;
const AUTO_RESUME_DELAY = 40;
const AUTO_WAYPOINT_REACH = 0.85;
const AUTO_PATROL_CLEARANCE = PLAYER_RADIUS * 1.8;

type ColliderRect = { minX: number; maxX: number; minZ: number; maxZ: number };
type JumpSurface = ColliderRect & { topY: number };
type SolidBlocker = ColliderRect & { blockBelowY?: number };

// Props you can jump onto and stand on.
const JUMP_SURFACES: JumpSurface[] = [
  // Desks (tops at ~0.95)
  { minX: -11.5, maxX: -8.5, minZ: -8.65, maxZ: -7.35, topY: 0.95 },
  { minX: -6.5, maxX: -3.5, minZ: -8.65, maxZ: -7.35, topY: 0.95 },
  { minX: 3.5, maxX: 6.5, minZ: -8.65, maxZ: -7.35, topY: 0.95 },
  { minX: 8.5, maxX: 11.5, minZ: -8.65, maxZ: -7.35, topY: 0.95 },
  { minX: -11.5, maxX: -8.5, minZ: -3.65, maxZ: -2.35, topY: 0.95 },
  { minX: -6.5, maxX: -3.5, minZ: -3.65, maxZ: -2.35, topY: 0.95 },
  { minX: 3.5, maxX: 6.5, minZ: -3.65, maxZ: -2.35, topY: 0.95 },
  { minX: 8.5, maxX: 11.5, minZ: -3.65, maxZ: -2.35, topY: 0.95 },
  // Chairs (seat top ~0.57)
  { minX: -10.26, maxX: -9.74, minZ: -7.14, maxZ: -6.66, topY: 0.57 },
  { minX: -5.26, maxX: -4.74, minZ: -7.14, maxZ: -6.66, topY: 0.57 },
  { minX: 4.74, maxX: 5.26, minZ: -7.14, maxZ: -6.66, topY: 0.57 },
  { minX: 9.74, maxX: 10.26, minZ: -7.14, maxZ: -6.66, topY: 0.57 },
  { minX: -10.26, maxX: -9.74, minZ: -4.34, maxZ: -3.86, topY: 0.57 },
  { minX: -5.26, maxX: -4.74, minZ: -4.34, maxZ: -3.86, topY: 0.57 },
  { minX: 4.74, maxX: 5.26, minZ: -4.34, maxZ: -3.86, topY: 0.57 },
  { minX: 9.74, maxX: 10.26, minZ: -4.34, maxZ: -3.86, topY: 0.57 },
  // Coffee table top (~0.48)
  { minX: -0.8, maxX: 0.8, minZ: 9.2, maxZ: 10.8, topY: 0.48 },
  // Sofa seat tops (~0.52)
  { minX: -2.72, maxX: -2.28, minZ: 7.72, maxZ: 9.88, topY: 0.52 }, // rotated sofa seat-only
  { minX: -1.02, maxX: 1.02, minZ: 11.95, maxZ: 12.35, topY: 0.52 }, // back sofa seat-only
];

// Hard blockers for objects we don't want to stand on.
const SOLID_BLOCKERS: SolidBlocker[] = [
  // File cabinets
  { minX: -10.6, maxX: -9.4, minZ: -11.7, maxZ: -10.3 },
  { minX: -5.6, maxX: -4.4, minZ: -11.7, maxZ: -10.3 },
  { minX: 4.4, maxX: 5.6, minZ: -11.7, maxZ: -10.3 },
  { minX: 9.4, maxX: 10.6, minZ: -11.7, maxZ: -10.3 },
  // Sofa hull blockers: block when below seat-top, allow standing/walking on top.
  { minX: -3.02, maxX: -1.98, minZ: 7.42, maxZ: 10.18, blockBelowY: 0.58 }, // left sofa whole body
  { minX: -1.34, maxX: 1.34, minZ: 11.80, maxZ: 12.74, blockBelowY: 0.58 }, // back sofa whole body
];

const intersectsExpandedRect = (x: number, z: number, rect: ColliderRect, radius: number) => {
  return (
    x >= rect.minX - radius &&
    x <= rect.maxX + radius &&
    z >= rect.minZ - radius &&
    z <= rect.maxZ + radius
  );
};

const isInsideRect = (x: number, z: number, rect: ColliderRect, inset = 0) =>
  x >= rect.minX + inset &&
  x <= rect.maxX - inset &&
  z >= rect.minZ + inset &&
  z <= rect.maxZ - inset;

const getSupportHeightAt = (x: number, z: number) => {
  let support = 0;
  for (const surface of JUMP_SURFACES) {
    if (isInsideRect(x, z, surface, PLAYER_RADIUS * 0.3)) {
      support = Math.max(support, surface.topY);
    }
  }
  return support;
};

const getActiveBlockingRectsAtHeight = (y: number): ColliderRect[] => {
  const rects: ColliderRect[] = [];
  for (const surface of JUMP_SURFACES) {
    if (y < surface.topY - 0.06) rects.push(surface);
  }
  for (const blocker of SOLID_BLOCKERS) {
    if (blocker.blockBelowY != null && y >= blocker.blockBelowY) continue;
    rects.push(blocker);
  }
  return rects;
};

const AUTO_PATROL_POINTS: Array<[number, number, number]> = [
  [0, 0, -14.5],
  [14.5, 0, -14.5],
  [14.5, 0, 0],
  [14.5, 0, 14.5],
  [0, 0, 14.5],
  [-14.5, 0, 14.5],
  [-14.5, 0, 0],
  [-14.5, 0, -14.5],
  [0, 0, -14.5],
];

export const DemoRobotPlayer = ({ position = [0, 0, 2] }: { position?: [number, number, number] }) => {
  const rootRef = useRef<THREE.Group>(null);
  const modelRootRef = useRef<THREE.Group>(null);
  const keysRef = useRef<Set<string>>(new Set());
  const velocityYRef = useRef(0);
  const groundedRef = useRef(true);
  const autoWaypointIndexRef = useRef(0);
  const lastManualInputAtRef = useRef(-1000); // Start with auto-patrol enabled
  const blockedFramesRef = useRef(0);
  const avoidanceSideRef = useRef<1 | -1>(1);

  const activeActionRef = useRef<string | null>(null);
  const activeEmoteRef = useRef<string | null>(null);
  const desiredStateRef = useRef<string>("Idle");

  const { camera } = useThree();
  const controls = useThree((state) => state.controls) as
    | { target?: THREE.Vector3; update?: () => void }
    | undefined;

  const { scene, animations } = useGLTF("/RobotExpressive.glb");
  const model = useMemo(() => SkeletonUtils.clone(scene), [scene]);
  const { actions, names, mixer } = useAnimations(animations, modelRootRef);

  const findActionName = useCallback(
    (target: string): string | null => {
      if (actions[target]) return target;
      const lowerTarget = target.toLowerCase();
      const match = names.find((n) => n.toLowerCase() === lowerTarget) ?? null;
      return match;
    },
    [actions, names]
  );

  const playClip = useCallback(
    (clipName: string, once = false) => {
      const resolved = findActionName(clipName);
      if (!resolved) return;
      if (activeActionRef.current === resolved) return;

      const next = actions[resolved];
      if (!next) return;

      if (activeActionRef.current && actions[activeActionRef.current]) {
        actions[activeActionRef.current]!.fadeOut(0.18);
      }

      next.reset();
      next.fadeIn(0.18);
      if (once) {
        next.setLoop(THREE.LoopOnce, 1);
        next.clampWhenFinished = true;
      } else {
        next.setLoop(THREE.LoopRepeat, Infinity);
        next.clampWhenFinished = false;
      }
      next.play();
      activeActionRef.current = resolved;
    },
    [actions, findActionName]
  );

  const applyLocomotionState = useCallback(
    (stateName: string) => {
      desiredStateRef.current = stateName;
      if (activeEmoteRef.current) return;
      playClip(stateName, false);
    },
    [playClip]
  );

  const triggerEmote = useCallback(
    (emoteName: string) => {
      if (activeEmoteRef.current) return;
      const resolved = findActionName(emoteName);
      if (!resolved) return;
      activeEmoteRef.current = resolved;
      playClip(resolved, true);
    },
    [findActionName, playClip]
  );

  const isBlockedAt = useCallback((x: number, z: number, y: number, radius = PLAYER_RADIUS) => {
    const activeRects = getActiveBlockingRectsAtHeight(y);
    return activeRects.some((rect) => intersectsExpandedRect(x, z, rect, radius));
  }, []);

  const resolvePenetration = useCallback((x: number, z: number, y: number) => {
    let resolvedX = x;
    let resolvedZ = z;
    const activeRects = getActiveBlockingRectsAtHeight(y);

    for (const rect of activeRects) {
      if (!intersectsExpandedRect(resolvedX, resolvedZ, rect, PLAYER_RADIUS)) continue;

      const minX = rect.minX - PLAYER_RADIUS;
      const maxX = rect.maxX + PLAYER_RADIUS;
      const minZ = rect.minZ - PLAYER_RADIUS;
      const maxZ = rect.maxZ + PLAYER_RADIUS;

      const pushLeft = minX - resolvedX;
      const pushRight = maxX - resolvedX;
      const pushDown = minZ - resolvedZ;
      const pushUp = maxZ - resolvedZ;

      const candidates = [
        { axis: "x" as const, value: pushLeft },
        { axis: "x" as const, value: pushRight },
        { axis: "z" as const, value: pushDown },
        { axis: "z" as const, value: pushUp },
      ].sort((a, b) => Math.abs(a.value) - Math.abs(b.value));

      const correction = candidates[0];
      if (!correction) continue;
      if (correction.axis === "x") resolvedX += correction.value;
      else resolvedZ += correction.value;
    }

    resolvedX = THREE.MathUtils.clamp(resolvedX, WORLD_BOUNDS.minX, WORLD_BOUNDS.maxX);
    resolvedZ = THREE.MathUtils.clamp(resolvedZ, WORLD_BOUNDS.minZ, WORLD_BOUNDS.maxZ);
    return { x: resolvedX, z: resolvedZ };
  }, []);

  useEffect(() => {
    applyLocomotionState("Idle");
  }, [applyLocomotionState]);

  useEffect(() => {
    const handleFinished = (event: { action?: THREE.AnimationAction }) => {
      const clipName = event.action?.getClip()?.name ?? null;
      if (!clipName || clipName !== activeEmoteRef.current) return;
      activeEmoteRef.current = null;
      applyLocomotionState(desiredStateRef.current);
    };

    mixer.addEventListener("finished", handleFinished);
    return () => {
      mixer.removeEventListener("finished", handleFinished);
    };
  }, [applyLocomotionState, mixer]);

  useFrame((state, delta) => {
    if (!rootRef.current) return;

    const previousX = rootRef.current.position.x;
    const previousZ = rootRef.current.position.z;
    const previousY = rootRef.current.position.y;

    const keys = keysRef.current;
    const camForward = new THREE.Vector3();
    camera.getWorldDirection(camForward);
    camForward.y = 0;
    camForward.normalize();
    const camRight = new THREE.Vector3().crossVectors(camForward, camera.up).normalize();

    const forward = keys.has("KeyW") || keys.has("ArrowUp");
    const back = keys.has("KeyS") || keys.has("ArrowDown");
    const left = keys.has("KeyA") || keys.has("ArrowLeft");
    const right = keys.has("KeyD") || keys.has("ArrowRight");
    const runningInput = keys.has("ShiftLeft") || keys.has("ShiftRight");
    const manualDirectionalInput = forward || back || left || right;
    if (manualDirectionalInput) {
      lastManualInputAtRef.current = state.clock.elapsedTime;
    }

    // Always auto-patrol in demo (no delay check)
    const shouldAutopatrol = !manualDirectionalInput && groundedRef.current;

    const moveDirection = new THREE.Vector3();
    if (manualDirectionalInput) {
      if (forward) moveDirection.add(camForward);
      if (back) moveDirection.sub(camForward);
      if (left) moveDirection.sub(camRight);
      if (right) moveDirection.add(camRight);
    } else if (shouldAutopatrol) {
      const waypoint = AUTO_PATROL_POINTS[autoWaypointIndexRef.current] ?? AUTO_PATROL_POINTS[0];
      const toWaypoint = new THREE.Vector3(
        waypoint[0] - rootRef.current.position.x,
        0,
        waypoint[2] - rootRef.current.position.z
      );
      if (toWaypoint.lengthSq() <= AUTO_WAYPOINT_REACH * AUTO_WAYPOINT_REACH) {
        autoWaypointIndexRef.current = (autoWaypointIndexRef.current + 1) % AUTO_PATROL_POINTS.length;
        // occasional "checking" gesture when reaching a checkpoint
        if (Math.random() < 0.22) {
          triggerEmote(Math.random() < 0.5 ? "Yes" : "Wave");
        }
      } else {
        moveDirection.copy(toWaypoint.normalize());
      }
    }

    const moving = moveDirection.lengthSq() > 0.0001;
    const running = moving && manualDirectionalInput && runningInput;
    applyLocomotionState(
      moving ? (running ? "Running" : "Walking") : shouldAutopatrol ? "Walking" : "Idle"
    );

    if (moving) {
      moveDirection.normalize();
      const speed = running ? RUN_SPEED : WALK_SPEED;
      const currentY = rootRef.current.position.y;
      const startX = rootRef.current.position.x;
      const startZ = rootRef.current.position.z;
      const stepX = moveDirection.x * speed * delta;
      const stepZ = moveDirection.z * speed * delta;

      const activeRadius = shouldAutopatrol ? AUTO_PATROL_CLEARANCE : PLAYER_RADIUS;
      const tryMove = (x: number, z: number) => {
        const clampedX = THREE.MathUtils.clamp(x, WORLD_BOUNDS.minX, WORLD_BOUNDS.maxX);
        const clampedZ = THREE.MathUtils.clamp(z, WORLD_BOUNDS.minZ, WORLD_BOUNDS.maxZ);
        if (isBlockedAt(clampedX, clampedZ, currentY, activeRadius)) return null;
        return { x: clampedX, z: clampedZ };
      };

      // 1) full move
      let movedTo = tryMove(startX + stepX, startZ + stepZ);
      // 2) slide on one axis
      if (!movedTo) movedTo = tryMove(startX + stepX, startZ);
      if (!movedTo) movedTo = tryMove(startX, startZ + stepZ);
      // 3) auto-patrol detour when still blocked
      if (!movedTo && shouldAutopatrol) {
        const side = avoidanceSideRef.current;
        const perp = new THREE.Vector3(-moveDirection.z * side, 0, moveDirection.x * side);
        movedTo = tryMove(startX + perp.x * speed * delta * 0.9, startZ + perp.z * speed * delta * 0.9);
        if (!movedTo) {
          const otherSide = -side as 1 | -1;
          const perpOther = new THREE.Vector3(-moveDirection.z * otherSide, 0, moveDirection.x * otherSide);
          movedTo = tryMove(
            startX + perpOther.x * speed * delta * 0.9,
            startZ + perpOther.z * speed * delta * 0.9
          );
          if (movedTo) avoidanceSideRef.current = otherSide;
        }
      }

      if (movedTo) {
        rootRef.current.position.x = movedTo.x;
        rootRef.current.position.z = movedTo.z;
        blockedFramesRef.current = 0;
      } else {
        blockedFramesRef.current += 1;
        if (shouldAutopatrol && blockedFramesRef.current > 28) {
          // Skip unreachable checkpoint and alternate avoidance side.
          autoWaypointIndexRef.current = (autoWaypointIndexRef.current + 1) % AUTO_PATROL_POINTS.length;
          avoidanceSideRef.current = (avoidanceSideRef.current === 1 ? -1 : 1);
          blockedFramesRef.current = 0;
        }
      }

      const movedDirX = rootRef.current.position.x - startX;
      const movedDirZ = rootRef.current.position.z - startZ;
      const facingX = Math.abs(movedDirX) + Math.abs(movedDirZ) > 0.0001 ? movedDirX : moveDirection.x;
      const facingZ = Math.abs(movedDirX) + Math.abs(movedDirZ) > 0.0001 ? movedDirZ : moveDirection.z;
      const targetYaw = Math.atan2(facingX, facingZ);
      let yawDelta = targetYaw - rootRef.current.rotation.y;
      yawDelta = ((yawDelta + Math.PI) % (Math.PI * 2)) - Math.PI;
      rootRef.current.rotation.y += yawDelta * Math.min(1, TURN_LERP * delta);
    }

    const supportY = getSupportHeightAt(rootRef.current.position.x, rootRef.current.position.z);
    if (groundedRef.current) {
      // Keep feet glued to current surface; if stepping off, start falling.
      if (rootRef.current.position.y <= supportY + 0.01) {
        rootRef.current.position.y = supportY;
      } else {
        groundedRef.current = false;
      }
    }

    if (!groundedRef.current) {
      velocityYRef.current -= GRAVITY * delta;
      rootRef.current.position.y += velocityYRef.current * delta;
      if (rootRef.current.position.y <= supportY && velocityYRef.current <= 0 && previousY >= supportY - 0.01) {
        rootRef.current.position.y = supportY;
        groundedRef.current = true;
        velocityYRef.current = 0;
      }
    }

    // Safety depenetration: if we somehow end up inside a blocker, push out.
    const depenetrated = resolvePenetration(
      rootRef.current.position.x,
      rootRef.current.position.z,
      rootRef.current.position.y
    );
    rootRef.current.position.x = depenetrated.x;
    rootRef.current.position.z = depenetrated.z;

    // ── Camera follow - Always third-person in demo ──
    const charX = rootRef.current.position.x;
    const charZ = rootRef.current.position.z;
    const charY = rootRef.current.position.y;
    const focusY = charY + 1.0;

    // Always use third-person camera follow in demo
    const FOLLOW_DIST = 8;
    const FOLLOW_HEIGHT = 5;
    const followLerp = Math.min(1, delta * 3);

    // Position camera behind the character's facing direction
    const facingAngle = rootRef.current.rotation.y;
    const idealCamX = charX - Math.sin(facingAngle) * FOLLOW_DIST;
    const idealCamZ = charZ - Math.cos(facingAngle) * FOLLOW_DIST;
    const idealCamY = charY + FOLLOW_HEIGHT;

    camera.position.x = THREE.MathUtils.lerp(camera.position.x, idealCamX, followLerp);
    camera.position.y = THREE.MathUtils.lerp(camera.position.y, idealCamY, followLerp);
    camera.position.z = THREE.MathUtils.lerp(camera.position.z, idealCamZ, followLerp);

    // Always center camera target on character
    if (controls?.target) {
      controls.target.x = THREE.MathUtils.lerp(controls.target.x, charX, followLerp);
      controls.target.y = THREE.MathUtils.lerp(controls.target.y, focusY, followLerp);
      controls.target.z = THREE.MathUtils.lerp(controls.target.z, charZ, followLerp);
      controls.update?.();
    } else {
      // If no controls, use lookAt to center on character
      camera.lookAt(charX, focusY, charZ);
    }
  });

  return (
    <group ref={rootRef} position={position}>
      <group ref={modelRootRef} position={[0, 0, 0]}>
        <primitive object={model} scale={[0.38, 0.38, 0.38]} castShadow receiveShadow />
      </group>
    </group>
  );
};

useGLTF.preload("/RobotExpressive.glb");
