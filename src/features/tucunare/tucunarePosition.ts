export interface TutorPosition {
  x: number;
  y: number;
}
export const TUTOR_SIZE = 52;
const MARGIN = 12;

export function clampTutorPosition(
  position: TutorPosition,
  width: number,
  height: number,
): TutorPosition {
  return {
    x: Math.max(
      MARGIN,
      Math.min(Number.isFinite(position.x) ? position.x : MARGIN, width - TUTOR_SIZE - MARGIN),
    ),
    y: Math.max(
      MARGIN,
      Math.min(Number.isFinite(position.y) ? position.y : MARGIN, height - TUTOR_SIZE - 88),
    ),
  };
}

export function defaultTutorPosition(width: number, height: number): TutorPosition {
  return clampTutorPosition(
    { x: width - TUTOR_SIZE - 16, y: height - TUTOR_SIZE - 104 },
    width,
    height,
  );
}

export function restoreTutorPosition(
  raw: string | null,
  width: number,
  height: number,
): TutorPosition {
  try {
    const saved = raw ? JSON.parse(raw) : null;
    if (
      saved &&
      Number.isFinite(saved.x) &&
      Number.isFinite(saved.y) &&
      saved.x >= 0 &&
      saved.x <= 1 &&
      saved.y >= 0 &&
      saved.y <= 1
    ) {
      return clampTutorPosition({ x: saved.x * width, y: saved.y * height }, width, height);
    }
  } catch {
    /* Storage is optional. */
  }
  return defaultTutorPosition(width, height);
}

export function serializeTutorPosition(
  position: TutorPosition,
  width: number,
  height: number,
): string {
  return JSON.stringify({
    x: Math.max(0, Math.min(1, position.x / width)),
    y: Math.max(0, Math.min(1, position.y / height)),
  });
}
