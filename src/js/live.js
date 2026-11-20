export const LIVE_QUEUE_IDS = new Set([0, 4, 6, 42, 410, 420, 440, 700, 710]);

const FOUNTAINS = {
  ORDER: { x: 8, y: 92 },
  CHAOS: { x: 92, y: 8 },
};

export function isLiveQueue(queueId, templateId = null) {
  if (queueId === null || queueId === undefined || queueId === "") return false;
  const id = Number(queueId);
  if (!Number.isFinite(id)) return false;
  if (id === 0) return templateId === "tournament";
  return LIVE_QUEUE_IDS.has(id);
}

export function formatGameTime(seconds) {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  return `${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
}

export function liveResultLabel(result) {
  if (result === "Win") return "Victoria";
  if (result === "Lose" || result === "Loss") return "Derrota";
  return "Sin resultado";
}

export function computeLivePositions(players, events) {
  const positions = new Map();
  for (const player of players ?? []) {
    const fountain = FOUNTAINS[player.team] ?? { x: 50, y: 50 };
    positions.set(player.key, { x: fountain.x, y: fountain.y });
  }

  for (const event of events ?? []) {
    if (event.name === "GameStart") {
      for (const player of players ?? []) {
        const fountain = FOUNTAINS[player.team] ?? { x: 50, y: 50 };
        positions.set(player.key, { x: fountain.x, y: fountain.y });
      }
      continue;
    }
    if (event.name === "MinionsSpawning") {
      for (const player of players ?? []) {
        positions.set(player.key, {
          x: Number(player.start_x) || 50,
          y: Number(player.start_y) || 50,
        });
      }
      continue;
    }
    if (!event.location || !event.participants?.length) continue;
    for (const key of event.participants) {
      if (!positions.has(key)) continue;
      positions.set(key, {
        x: Number(event.location.x) || 50,
        y: Number(event.location.y) || 50,
      });
    }
  }

  return positions;
}

export function layoutLivePositions(positions) {
  const groups = new Map();
  for (const [key, position] of positions) {
    const groupKey = `${Math.round(position.x / 3)}:${Math.round(position.y / 3)}`;
    const group = groups.get(groupKey) ?? [];
    group.push({ key, position });
    groups.set(groupKey, group);
  }

  if ([...groups.values()].every((group) => group.length === 1)) {
    return positions;
  }

  const result = new Map();
  for (const group of groups.values()) {
    if (group.length === 1) {
      const entry = group[0];
      result.set(entry.key, entry.position);
      continue;
    }
    const radius =
      group.length >= 5
        ? 11.0
        : group.length === 4
          ? 10.0
          : group.length === 3
            ? 8.5
            : 7.0;
    group.forEach((entry, index) => {
      const angle = (Math.PI * 2 * index) / group.length - Math.PI / 2;
      result.set(entry.key, {
        x: clamp(entry.position.x + Math.cos(angle) * radius, 3, 97),
        y: clamp(entry.position.y + Math.sin(angle) * radius, 3, 97),
      });
    });
  }
  return result;
}

export function liveClusterSizes(positions) {
  const groups = new Map();
  for (const [key, position] of positions) {
    const groupKey = `${Math.round(position.x / 3)}:${Math.round(position.y / 3)}`;
    const group = groups.get(groupKey) ?? [];
    group.push(key);
    groups.set(groupKey, group);
  }

  const sizes = new Map();
  for (const group of groups.values()) {
    for (const key of group) sizes.set(key, group.length);
  }
  return sizes;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
