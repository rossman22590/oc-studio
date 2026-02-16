"use client";

import { useState } from "react";
import { X } from "lucide-react";

const GUEST_COLORS = [
  { name: "Indigo", hex: "#6366f1" },
  { name: "Pink", hex: "#ec4899" },
  { name: "Teal", hex: "#14b8a6" },
  { name: "Orange", hex: "#f97316" },
  { name: "Violet", hex: "#8b5cf6" },
  { name: "Cyan", hex: "#06b6d4" },
  { name: "Red", hex: "#ef4444" },
  { name: "Green", hex: "#22c55e" },
  { name: "Yellow", hex: "#eab308" },
  { name: "Rose", hex: "#f43f5e" },
  { name: "Lime", hex: "#84cc16" },
  { name: "Sky", hex: "#0ea5e9" },
];

type GuestColorPickerProps = {
  onConfirm: (color: string) => void;
  onCancel: () => void;
};

export const GuestColorPicker = ({ onConfirm, onCancel }: GuestColorPickerProps) => {
  const [selectedColor, setSelectedColor] = useState(GUEST_COLORS[0].hex);

  const handleConfirm = () => {
    onConfirm(selectedColor);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="relative w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl mx-4">
        {/* Close button */}
        <button
          onClick={onCancel}
          className="absolute right-3 top-3 rounded-full p-1.5 text-muted-foreground transition hover:bg-muted hover:text-foreground"
          aria-label="Cancel and leave"
          tabIndex={0}
        >
          <X className="h-4 w-4" />
        </button>

        {/* Header */}
        <div className="mb-6 text-center">
          <h2 className="text-xl font-bold text-foreground">Welcome to the Office!</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Pick a color for your robot before joining
          </p>
        </div>

        {/* Color grid */}
        <div className="grid grid-cols-6 gap-3 mb-6">
          {GUEST_COLORS.map((c) => (
            <button
              key={c.hex}
              onClick={() => setSelectedColor(c.hex)}
              className={`group relative h-10 w-10 rounded-full border-2 transition-all hover:scale-110 mx-auto ${
                selectedColor === c.hex
                  ? "border-foreground ring-2 ring-foreground/30 scale-110"
                  : "border-transparent"
              }`}
              style={{ backgroundColor: c.hex }}
              aria-label={`Select ${c.name} color`}
              title={c.name}
              tabIndex={0}
            >
              {selectedColor === c.hex && (
                <span className="absolute inset-0 flex items-center justify-center text-white font-bold text-sm drop-shadow-md">
                  ✓
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Preview */}
        <div className="mb-6 flex items-center justify-center gap-3">
          <div
            className="h-12 w-12 rounded-full border-2 border-border shadow-lg"
            style={{ backgroundColor: selectedColor }}
          />
          <span className="text-sm font-medium text-muted-foreground">
            Your robot color
          </span>
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 rounded-lg border border-border px-4 py-2.5 text-sm font-semibold text-muted-foreground transition hover:bg-muted"
            tabIndex={0}
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            className="flex-1 rounded-lg bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground transition hover:bg-primary/90"
            tabIndex={0}
          >
            Join Office
          </button>
        </div>
      </div>
    </div>
  );
};
