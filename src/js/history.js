export function emptyHistoryFilters() {
  return {
    search: "",
    queue: "ALL",
    result: "ALL",
    side: "ALL",
    firstBan: "ALL",
    onlyComplete: false,
    minGames: 3,
    order: "desc",
  };
}

export function isCompleteMatch(match) {
  return (
    (match.our_picks?.length ?? 0) >= 5 &&
    (match.enemy_picks?.length ?? 0) >= 5 &&
    (match.our_bans?.length ?? 0) >= 4 &&
    (match.enemy_bans?.length ?? 0) >= 4
  );
}

function idList(values) {
  return (values ?? []).map((value) => (typeof value === "string" ? value : value.champion_id));
}

function nameOfChampion(nameOf, championId) {
  return nameOf(championId) || championId;
}

export function matchSearchText(match, nameOf) {
  const parts = [
    ...(match.rivals ?? []).map((rival) => rival.name),
    ...(match.rivals ?? []).flatMap((rival) => rival.pool_groups ?? []).flat(),
    ...idList(match.our_picks),
    ...idList(match.enemy_picks),
    ...(match.our_bans ?? []),
    ...(match.enemy_bans ?? []),
    ...(match.notes ?? []),
  ];
  return parts
    .map((value) => nameOfChampion(nameOf, value))
    .join(" ")
    .toLowerCase();
}

export function filterHistoryMatches(matches, filters, nameOf) {
  const search = (filters.search ?? "").trim().toLowerCase();
  const result = (matches ?? []).filter((match) => {
    const side = match.side ?? "unknown";
    const firstBan = match.first_ban ?? "unknown";
    if (filters.queue !== "ALL" && match.queue !== filters.queue) return false;
    if (filters.result !== "ALL" && match.result !== filters.result) return false;
    if (filters.side !== "ALL" && side !== filters.side) return false;
    if (filters.firstBan !== "ALL" && firstBan !== filters.firstBan) return false;
    if (filters.onlyComplete && !isCompleteMatch(match)) return false;
    if (search && !matchSearchText(match, nameOf).includes(search)) return false;
    return true;
  });
  return result.sort((left, right) => {
    const leftKey = historySortKey(left);
    const rightKey = historySortKey(right);
    return filters.order === "asc" ? leftKey - rightKey : rightKey - leftKey;
  });
}

function historySortKey(match) {
  if (match.played_at) {
    const timestamp = Date.parse(match.played_at);
    if (!Number.isNaN(timestamp)) return timestamp;
  }
  return match.legacy_index ?? 0;
}

function emptyLine() {
  return { games: 0, wins: 0, losses: 0 };
}

function addResult(line, result) {
  line.games += 1;
  if (result === "win") {
    line.wins += 1;
  } else if (result === "loss") {
    line.losses += 1;
  }
}

function winrate(wins, losses) {
  const games = wins + losses;
  return games > 0 ? (wins / games) * 100 : null;
}

function ensureChampion(map, championId) {
  if (!map.has(championId)) {
    map.set(championId, {
      ...emptyLine(),
      championId,
      bansAgainst: 0,
      ourBans: 0,
      enemyBans: 0,
      count: 0,
    });
  }
  return map.get(championId);
}

function toChampionRows(map, nameOf, minimumGames = 0) {
  return [...map.values()]
    .filter((entry) => entry.games >= minimumGames)
    .map((entry) => ({
      ...entry,
      name: nameOfChampion(nameOf, entry.championId),
      winrate: winrate(entry.wins, entry.losses),
    }))
    .sort((left, right) => {
      if (right.games !== left.games) return right.games - left.games;
      return (right.winrate ?? 0) - (left.winrate ?? 0);
    });
}

function streakFrom(matches) {
  const ordered = [...matches].sort(
    (left, right) => historySortKey(left) - historySortKey(right),
  );
  let streak = 0;
  let tone = null;
  for (let index = ordered.length - 1; index >= 0; index -= 1) {
    const result = ordered[index].result;
    if (result !== "win" && result !== "loss") continue;
    if (!tone) {
      tone = result;
      streak = 1;
    } else if (result === tone) {
      streak += 1;
    } else {
      break;
    }
  }
  return { count: streak, tone };
}

export function computeHistorySummary(matches, nameOf) {
  const ourPicks = new Map();
  const enemyPicks = new Map();
  const ourBans = new Map();
  const enemyBans = new Map();
  const firstBan = {
    us: { ...emptyLine() },
    them: { ...emptyLine() },
    unknown: { ...emptyLine() },
  };
  const sides = {
    BLUE: { ...emptyLine() },
    RED: { ...emptyLine() },
    unknown: { ...emptyLine() },
  };

  let wins = 0;
  let losses = 0;
  let unknown = 0;

  for (const match of matches) {
    if (match.result === "win") wins += 1;
    else if (match.result === "loss") losses += 1;
    else unknown += 1;

    const result = match.result;
    for (const championId of idList(match.our_picks)) {
      const line = ensureChampion(ourPicks, championId);
      addResult(line, result);
    }
    for (const championId of idList(match.enemy_picks)) {
      const line = ensureChampion(enemyPicks, championId);
      addResult(line, result);
    }
    for (const championId of match.enemy_bans ?? []) {
      ensureChampion(ourPicks, championId).bansAgainst += 1;
      const enemyBanLine = ensureChampion(enemyBans, championId);
      enemyBanLine.count += 1;
      enemyBanLine.enemyBans += 1;
      addResult(enemyBanLine, result);
      ensureChampion(ourBans, championId).enemyBans += 1;
    }
    for (const championId of match.our_bans ?? []) {
      const ourBanLine = ensureChampion(ourBans, championId);
      ourBanLine.count += 1;
      ourBanLine.ourBans += 1;
      addResult(ourBanLine, result);
      ensureChampion(enemyBans, championId).ourBans += 1;
    }
    const starter = firstBan[match.first_ban] ?? firstBan.unknown;
    addResult(starter, result);
    const side = sides[match.side] ?? sides.unknown;
    addResult(side, result);
  }

  const games = wins + losses;
  const allPicks = toChampionRows(ourPicks, nameOf, 1).sort(
    (left, right) => right.games - left.games,
  );
  const allEnemyPicks = toChampionRows(enemyPicks, nameOf, 1).sort(
    (left, right) => right.games - left.games,
  );
  const allOurBans = toChampionRows(ourBans, nameOf, 0).sort(
    (left, right) => right.count - left.count,
  );
  const allEnemyBans = toChampionRows(enemyBans, nameOf, 0).sort(
    (left, right) => right.count - left.count,
  );
  const topPicks = allPicks.slice(0, 12);
  const topEnemyPicks = allEnemyPicks.slice(0, 12);
  const topOurBans = allOurBans.slice(0, 12);
  const topEnemyBans = allEnemyBans.slice(0, 12);

  const bestChampion =
    allPicks
      .filter((entry) => entry.wins + entry.losses >= 3 && entry.winrate !== null)
      .sort((left, right) => {
        if ((right.winrate ?? 0) !== (left.winrate ?? 0)) {
          return (right.winrate ?? 0) - (left.winrate ?? 0);
        }
        return right.games - left.games;
      })[0] ?? null;
  const worstMatchup =
    allEnemyPicks
      .filter((entry) => entry.wins + entry.losses >= 3 && entry.winrate !== null)
      .sort((left, right) => {
        if ((left.winrate ?? 100) !== (right.winrate ?? 100)) {
          return (left.winrate ?? 100) - (right.winrate ?? 100);
        }
        return right.games - left.games;
      })[0] ?? null;
  const mostBannedAgainst =
    allEnemyBans.find((entry) => entry.count > 0) ?? null;
  const mostBannedByUs = allOurBans.find((entry) => entry.count > 0) ?? null;
  const streak = streakFrom(matches);

  return {
    games,
    wins,
    losses,
    unknown,
    winrate: winrate(wins, losses),
    streak,
    topPicks,
    topEnemyPicks,
    topOurBans,
    topEnemyBans,
    firstBan,
    sides,
    bestChampion,
    worstMatchup,
    mostBannedAgainst,
    mostBannedByUs,
  };
}

export function buildRivalProfiles(matches, nameOf) {
  const profiles = new Map();

  for (const match of matches) {
    for (const rival of match.rivals ?? []) {
      const key = rival.name.trim().toLowerCase();
      if (!key) continue;
      if (!profiles.has(key)) {
        profiles.set(key, {
          key,
          name: rival.name,
          roles: new Set(),
          roleLabels: new Set(),
          ranks: new Set(),
          notes: new Set(),
          matches: [],
          matchIds: new Set(),
          poolWeights: new Map(),
          poolOrder: [],
        });
      }
      const profile = profiles.get(key);
      if (rival.role) profile.roles.add(rival.role);
      if (rival.role_label) profile.roleLabels.add(rival.role_label);
      if (rival.rank) profile.ranks.add(rival.rank);
      for (const note of rival.notes ?? []) profile.notes.add(note);
      if (!profile.matchIds.has(match.id)) {
        profile.matchIds.add(match.id);
        profile.matches.push(match);
      }

      for (const [groupIndex, group] of (rival.pool_groups ?? []).entries()) {
        for (const championId of group) {
          if (!profile.poolWeights.has(championId)) {
            profile.poolWeights.set(championId, 0);
            profile.poolOrder.push(championId);
          }
          const weight = groupIndex === 0 ? 3 : 1;
          profile.poolWeights.set(championId, profile.poolWeights.get(championId) + weight);
        }
      }
    }
  }

  return [...profiles.values()]
    .map((profile) => {
      const wins = profile.matches.filter((match) => match.result === "win").length;
      const losses = profile.matches.filter((match) => match.result === "loss").length;
      const champions = [...profile.poolWeights.entries()]
        .sort((left, right) => right[1] - left[1])
        .map(([championId, weight]) => ({
          championId,
          weight,
          name: nameOfChampion(nameOf, championId),
        }));
      return {
        ...profile,
        roles: [...profile.roles],
        roleLabels: [...profile.roleLabels],
        ranks: [...profile.ranks],
        notes: [...profile.notes],
        champions,
        games: profile.matches.length,
        wins,
        losses,
        winrate: winrate(wins, losses),
        lastIndex: Math.max(...profile.matches.map((match) => match.legacy_index ?? 0)),
      };
    })
    .sort((left, right) => {
      if (right.games !== left.games) return right.games - left.games;
      return left.name.localeCompare(right.name);
    });
}

export function filterRivalProfiles(profiles, search, role) {
  const needle = (search ?? "").trim().toLowerCase();
  return profiles.filter((profile) => {
    if (role && role !== "ALL") {
      const hasRole = profile.roles.includes(role);
      const hasLabel = profile.roleLabels.includes(role.toLowerCase());
      if (!hasRole && !hasLabel) return false;
    }
    if (!needle) return true;
    return (
      profile.name.toLowerCase().includes(needle) ||
      profile.champions.some((champion) => champion.name.toLowerCase().includes(needle))
    );
  });
}

export function queueLabel(queue) {
  return (
    {
      clash: "Clash",
      ranked_solo: "Ranked Solo",
      ranked_flex: "Ranked Flex",
      normal_draft: "Normal Draft",
      custom: "Custom",
      unknown: "Sin cola",
    }[queue] ?? queue
  );
}

export function resultLabel(result) {
  return (
    {
      win: "Victoria",
      loss: "Derrota",
      unknown: "Sin resultado",
    }[result] ?? "Sin resultado"
  );
}

export function confidenceLabel(confidence) {
  return (
    {
      high: "Alta",
      medium: "Media",
      low: "Baja",
    }[confidence] ?? "Baja"
  );
}

export function banStarterLabel(starter) {
  return (
    {
      us: "Nosotros",
      them: "Ellos",
      unknown: "Sin dato",
    }[starter] ?? "Sin dato"
  );
}

export function historySideLabel(side) {
  if (side === "BLUE") return "Azul";
  if (side === "RED") return "Rojo";
  return "Sin lado";
}

export function formatHistoryDate(match) {
  if (!match.played_at) {
    return match.legacy_index ? `Partida #${String(match.legacy_index).padStart(3, "0")}` : "Sin fecha";
  }
  const date = new Date(match.played_at);
  if (Number.isNaN(date.getTime())) return match.played_at;
  return date.toLocaleDateString("es-ES", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function winrateText(value) {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return `${Math.round(value)}%`;
}

export function recordText(wins, losses) {
  return `${wins}-${losses}`;
}
