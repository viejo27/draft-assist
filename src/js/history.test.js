import assert from "node:assert/strict";
import test from "node:test";
import {
  buildHistorySignals,
  buildRivalProfiles,
  computeHistorySummary,
  filterHistoryMatches,
  isCompleteMatch,
} from "./history.js";

const nameOf = (championId) => championId;

function pick(championId, order = 1) {
  return { champion_id: championId, order, role: null, player_name: null, turn: null };
}

function rival(name, role, main, last = []) {
  return {
    name,
    raw_name: name,
    role,
    role_label: null,
    pool_groups: [main, last].filter((group) => group.length),
    pool_raw: "",
    rank: null,
    notes: [],
  };
}

const store = {
  version: 1,
  name_aliases: [],
  matches: [
    {
      id: "m1",
      legacy_index: 1,
      result: "win",
      side: "BLUE",
      first_ban: "them",
      queue: "clash",
      confidence: "high",
      our_picks: ["Lux", "Ahri", "Ornn", "Sejuani", "Nautilus"].map((id, index) => pick(id, index + 1)),
      enemy_picks: ["Caitlyn", "MissFortune", "Lux", "Morgana", "Ornn"].map((id, index) => pick(id, index + 1)),
      our_bans: ["Kled", "Shen", "Yone", "Akali", "Mordekaiser"],
      enemy_bans: ["Caitlyn", "Poppy", "Velkoz", "Viego", "Leblanc"],
      rivals: [rival("RivalTop", "TOP", ["Darius", "Sett"], ["Darius"]), rival("RivalJungle", "JUNGLE", ["Kayn"])],
      notes: [],
      warnings: [],
    },
    {
      id: "m2",
      legacy_index: 2,
      result: "loss",
      side: "RED",
      first_ban: "us",
      queue: "clash",
      confidence: "high",
      our_picks: ["Lux", "Ahri", "Poppy", "Caitlyn", "MissFortune"].map((id, index) => pick(id, index + 1)),
      enemy_picks: ["Caitlyn", "MissFortune", "Ornn", "Nautilus", "Leona"].map((id, index) => pick(id, index + 1)),
      our_bans: ["Kled", "Shen", "Yone", "Akali", "Mordekaiser"],
      enemy_bans: ["Caitlyn", "Poppy", "Velkoz", "Viego", "Leblanc"],
      rivals: [rival("RivalTop", "TOP", ["Jax", "Fiora"]), rival("RivalMid", "MID", ["Azir"])],
      notes: [],
      warnings: [],
    },
    {
      id: "m3",
      legacy_index: 3,
      result: "win",
      side: "BLUE",
      first_ban: "them",
      queue: "clash",
      confidence: "high",
      our_picks: ["Lux", "Ahri", "Poppy", "Caitlyn", "MissFortune"].map((id, index) => pick(id, index + 1)),
      enemy_picks: ["Swain", "Rakan", "Viktor", "Volibear", "Vayne"].map((id, index) => pick(id, index + 1)),
      our_bans: ["Kled", "Shen", "Yone", "Akali", "Mordekaiser"],
      enemy_bans: ["Kled", "Shen", "Poppy", "Jinx", "Velkoz"],
      rivals: [
        {
          ...rival("RivalFill", null, ["Nautilus"]),
          role_label: "fill",
        },
      ],
      notes: [],
      warnings: [],
    },
    {
      id: "m4",
      legacy_index: 4,
      result: "unknown",
      side: null,
      first_ban: null,
      queue: "clash",
      confidence: "low",
      our_picks: [pick("Swain")],
      enemy_picks: [pick("Rakan")],
      our_bans: [],
      enemy_bans: [],
      rivals: [],
      notes: [],
      warnings: [],
    },
  ],
};

test("summary counts results, picks and bans", () => {
  const summary = computeHistorySummary(store.matches, nameOf);
  assert.equal(summary.games, 3);
  assert.equal(summary.wins, 2);
  assert.equal(summary.losses, 1);
  assert.equal(summary.unknown, 1);
  assert.ok(Math.abs(summary.winrate - 66.6667) < 0.1);

  const lux = summary.topPicks.find((row) => row.championId === "Lux");
  assert.equal(lux.games, 3);
  assert.equal(lux.wins, 2);
  assert.equal(lux.losses, 1);

  const caitlyn = summary.topEnemyPicks.find((row) => row.championId === "Caitlyn");
  assert.equal(caitlyn.games, 2);
  assert.equal(caitlyn.wins, 1);
  assert.equal(caitlyn.losses, 1);

  assert.equal(summary.firstBan.them.games, 2);
  assert.equal(summary.firstBan.us.games, 1);
  assert.equal(summary.firstBan.unknown.games, 1);
  assert.equal(summary.sides.BLUE.games, 2);
  assert.equal(summary.sides.RED.games, 1);
  assert.equal(summary.sides.unknown.games, 1);
});

test("filters by result, side, first ban and rival search", () => {
  const base = {
    search: "",
    queue: "ALL",
    result: "ALL",
    side: "ALL",
    firstBan: "ALL",
    onlyComplete: false,
    minGames: 3,
    order: "desc",
  };
  assert.equal(filterHistoryMatches(store.matches, base, nameOf).length, 4);
  assert.equal(
    filterHistoryMatches(store.matches, { ...base, result: "win" }, nameOf).length,
    2,
  );
  assert.equal(
    filterHistoryMatches(store.matches, { ...base, side: "RED" }, nameOf).length,
    1,
  );
  assert.equal(
    filterHistoryMatches(store.matches, { ...base, firstBan: "us" }, nameOf).length,
    1,
  );
  assert.equal(
    filterHistoryMatches(store.matches, { ...base, search: "RivalTop" }, nameOf).length,
    2,
  );
  assert.equal(
    filterHistoryMatches(store.matches, { ...base, onlyComplete: true }, nameOf).length,
    3,
  );
});

test("rival profiles aggregate pools, roles and record", () => {
  const profiles = buildRivalProfiles(store.matches, nameOf);
  const top = profiles.find((profile) => profile.name === "RivalTop");
  assert.equal(top.games, 2);
  assert.equal(top.wins, 1);
  assert.equal(top.losses, 1);
  assert.deepEqual(top.roles, ["TOP"]);
  assert.deepEqual(
    top.champions.map((champion) => champion.championId),
    ["Darius", "Sett", "Jax", "Fiora"],
  );

  const fill = profiles.find((profile) => profile.name === "RivalFill");
  assert.deepEqual(fill.roles, []);
  assert.deepEqual(fill.roleLabels, ["fill"]);
});

test("detects complete matches", () => {
  assert.equal(isCompleteMatch(store.matches[0]), true);
  assert.equal(isCompleteMatch(store.matches[3]), false);
});

test("does not invent a most-banned champion when there are no bans", () => {
  const matches = store.matches.map((match) => ({
    ...match,
    our_bans: [],
    enemy_bans: [],
  }));
  const summary = computeHistorySummary(matches, nameOf);
  assert.equal(summary.mostBannedAgainst, null);
  assert.equal(summary.mostBannedByUs, null);
});

test("builds compact history signals from known results", () => {
  const signals = buildHistorySignals(store);
  assert.equal(signals.sample_matches, 3);
  assert.deepEqual(signals.our_picks.Lux, { games: 3, wins: 2, losses: 1 });
  assert.deepEqual(signals.enemy_picks.Caitlyn, {
    games: 2,
    wins: 1,
    losses: 1,
  });
  assert.equal(signals.our_bans.Kled, 3);
  assert.equal(signals.enemy_bans.Caitlyn, 2);
  assert.equal(signals.enemy_bans.Poppy, 3);
});

test("streak uses played_at for newer manual matches", () => {
  const manual = {
    ...store.matches[0],
    id: "manual-new",
    legacy_index: null,
    played_at: new Date(Date.now() + 60_000).toISOString(),
    result: "loss",
  };
  const summary = computeHistorySummary([store.matches[0], manual], nameOf);
  assert.equal(summary.streak.tone, "loss");
  assert.equal(summary.streak.count, 1);
});
