"use client";

import { useEffect, useRef } from "react";
import { useThree } from "@react-three/fiber";

export const RightDragVerticalCamera = () => {
  const { camera, gl } = useThree();
  const controls = useThree((state) => state.controls) as
    | { target?: { y: number } }
    | undefined;
  const dragRef = useRef<{ active: boolean; lastY: number }>({
    active: false,
    lastY: 0,
  });

  useEffect(() => {
    const canvas = gl.domElement;

    const handleMouseDown = (event: MouseEvent) => {
      if (event.button !== 2) return;
      dragRef.current = { active: true, lastY: event.clientY };
      event.preventDefault();
    };

    const handleMouseMove = (event: MouseEvent) => {
      if (!dragRef.current.active) return;
      const deltaY = (dragRef.current.lastY - event.clientY) * 0.04;
      dragRef.current.lastY = event.clientY;

      camera.position.y = Math.max(1, Math.min(8, camera.position.y + deltaY));
      if (controls?.target) {
        controls.target.y = Math.max(0.5, Math.min(8, controls.target.y + deltaY));
      }
    };

    const handleMouseUp = (event: MouseEvent) => {
      if (event.button === 2) {
        dragRef.current.active = false;
      }
    };

    const handleContextMenu = (event: MouseEvent) => {
      event.preventDefault();
    };

    canvas.addEventListener("mousedown", handleMouseDown);
    canvas.addEventListener("mousemove", handleMouseMove);
    canvas.addEventListener("mouseup", handleMouseUp);
    canvas.addEventListener("contextmenu", handleContextMenu);

    return () => {
      canvas.removeEventListener("mousedown", handleMouseDown);
      canvas.removeEventListener("mousemove", handleMouseMove);
      canvas.removeEventListener("mouseup", handleMouseUp);
      canvas.removeEventListener("contextmenu", handleContextMenu);
    };
  }, [camera, controls, gl]);

  return null;
};
