export type PlaybackLine = {
  start: number;
  end: number;
  stopAt?: number;
  gapIndexes: number[];
};

export function unresolvedGaps(
  line: PlaybackLine | undefined,
  lineIndex: number,
  resolved: Record<string, unknown>,
) {
  return line?.gapIndexes.filter((wordIndex) => !resolved[`${lineIndex}-${wordIndex}`]) ?? [];
}

export function findCrossedPendingLine(
  lines: PlaybackLine[],
  previousTime: number,
  time: number,
  resolved: Record<string, unknown>,
) {
  return lines.findIndex((line, lineIndex) => {
    const stopAt = line.stopAt ?? line.end;
    const crossedEnd = previousTime < stopAt - 0.03 && time >= stopAt - 0.03;
    return crossedEnd && unresolvedGaps(line, lineIndex, resolved).length > 0;
  });
}

export function lineAtTime(lines: PlaybackLine[], time: number) {
  let found = -1;
  for (let index = 0; index < lines.length; index += 1) {
    if (time >= lines[index].start - 0.03) found = index;
    else break;
  }
  return found;
}
