"use client";

import { useFrame, useThree } from "@react-three/fiber";

const ROOM_BOUNDS = {
  minX: -18.2,
  maxX: 18.2,
  minY: 1,
  maxY: 7.6,
  minZ: -18.2,
  maxZ: 18.2,
} as const;

export const RoomCameraBounds = () => {
  const { camera } = useThree();
  const controls = useThree((state) => state.controls) as
    | { target?: { x: number; y: number; z: number }; update?: () => void }
    | undefined;

  useFrame(() => {
    const clampedX = Math.max(ROOM_BOUNDS.minX, Math.min(ROOM_BOUNDS.maxX, camera.position.x));
    const clampedY = Math.max(ROOM_BOUNDS.minY, Math.min(ROOM_BOUNDS.maxY, camera.position.y));
    const clampedZ = Math.max(ROOM_BOUNDS.minZ, Math.min(ROOM_BOUNDS.maxZ, camera.position.z));

    const dx = clampedX - camera.position.x;
    const dy = clampedY - camera.position.y;
    const dz = clampedZ - camera.position.z;

    if (dx !== 0 || dy !== 0 || dz !== 0) {
      camera.position.x = clampedX;
      camera.position.y = clampedY;
      camera.position.z = clampedZ;
      if (controls?.target) {
        controls.target.x += dx;
        controls.target.y += dy;
        controls.target.z += dz;
      }
    }

    if (controls?.target) {
      controls.target.x = Math.max(ROOM_BOUNDS.minX, Math.min(ROOM_BOUNDS.maxX, controls.target.x));
      controls.target.y = Math.max(0.5, Math.min(ROOM_BOUNDS.maxY, controls.target.y));
      controls.target.z = Math.max(ROOM_BOUNDS.minZ, Math.min(ROOM_BOUNDS.maxZ, controls.target.z));
    }

    controls?.update?.();
  });

  return null;
};
