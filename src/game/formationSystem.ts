import type { FormationShape } from './types';

export interface FormationLocalOffset {
  forward: number;
  lateral: number;
}

function centeredGridOffset(index: number, count: number, lateralSpacing: number, depthSpacing: number): FormationLocalOffset {
  const columns = Math.max(1, Math.ceil(Math.sqrt(Math.max(1, count))));
  const rows = Math.max(1, Math.ceil(count / columns));
  const row = Math.min(rows - 1, Math.floor(index / columns));
  const rowStart = row * columns;
  const rowCount = Math.max(1, Math.min(columns, count - rowStart));
  const column = index - rowStart;
  return {
    forward: ((rows - 1) / 2 - row) * depthSpacing,
    lateral: (column - (rowCount - 1) / 2) * lateralSpacing,
  };
}

export function artilleryGunLocalOffset(
  shape: FormationShape,
  index: number,
  guns: number,
  lateralSpacing = 34,
  depthSpacing = 42,
): FormationLocalOffset {
  const count = Math.max(1, guns);
  if (shape === 'column') {
    return { forward: ((count - 1) / 2 - index) * depthSpacing, lateral: 0 };
  }
  if (shape === 'block') return centeredGridOffset(index, count, lateralSpacing, depthSpacing);
  return { forward: 0, lateral: (index - (count - 1) / 2) * lateralSpacing };
}

export function artilleryTargetLocalOffset(
  shape: FormationShape,
  index: number,
  guns: number,
  spacing: number,
): FormationLocalOffset {
  const count = Math.max(1, guns);
  if (shape === 'column') {
    return { forward: ((count - 1) / 2 - index) * spacing, lateral: 0 };
  }
  if (shape === 'block') return centeredGridOffset(index, count, spacing, spacing);
  return { forward: 0, lateral: (index - (count - 1) / 2) * spacing };
}
