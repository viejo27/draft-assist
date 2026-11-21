export function normalizeLobbyName(value) {
  return String(value ?? "")
    .trim()
    .split("#")[0]
    .trim()
    .toLowerCase();
}

const ROLE_ORDER = ["TOP", "JUNGLE", "MID", "ADC", "SUPPORT"];

export function orderEnemyMembers(members) {
  return [...(members ?? [])]
    .map((member, index) => ({ member, index }))
    .sort((left, right) => {
      const leftRole = ROLE_ORDER.indexOf(left.member.primary_position);
      const rightRole = ROLE_ORDER.indexOf(right.member.primary_position);
      const leftRank = leftRole === -1 ? ROLE_ORDER.length : leftRole;
      const rightRank = rightRole === -1 ? ROLE_ORDER.length : rightRole;
      return leftRank - rightRank || left.index - right.index;
    })
    .map(({ member }) => member);
}

export function matchLobbyMembers(players, members) {
  const result = new Map();
  const remaining = [...(members ?? [])];
  const playerList = players ?? [];

  for (const player of playerList) {
    const name = normalizeLobbyName(player.name);
    if (!name) continue;
    const index = remaining.findIndex((member) => {
      const display = normalizeLobbyName(member.display_name);
      return display === name;
    });
    if (index >= 0) {
      result.set(player.id, remaining.splice(index, 1)[0]);
    }
  }

  for (const player of playerList) {
    if (result.has(player.id)) continue;
    const index = remaining.findIndex(
      (member) => member.primary_position === player.role,
    );
    if (index >= 0) {
      result.set(player.id, remaining.splice(index, 1)[0]);
    }
  }

  for (const player of playerList) {
    if (result.has(player.id)) continue;
    const index = remaining.findIndex(
      (member) => member.secondary_position === player.role,
    );
    if (index >= 0) {
      result.set(player.id, remaining.splice(index, 1)[0]);
    }
  }

  return result;
}
