import test from "node:test";
import assert from "node:assert/strict";

import {
  computeLivePositions,
  formatGameTime,
  isLiveQueue,
  layoutLivePositions,
  liveClusterSizes,
  liveResultLabel,
} from "./live.js";

const players = [
  {
    key: "a",
    team: "ORDER",
    start_x: 12,
    start_y: 43,
  },
  {
    key: "b",
    team: "CHAOS",
    start_x: 25,
    start_y: 17,
  },
  {
    key: "c",
    team: "ORDER",
    start_x: 30,
    start_y: 70,
  },
];

test("accepts the live queues and rejects normal or ARAM queues", () => {
  assert.equal(isLiveQueue(420), true);
  assert.equal(isLiveQueue(440), true);
  assert.equal(isLiveQueue(42), true);
  assert.equal(isLiveQueue(710), true);
  assert.equal(isLiveQueue(700), true);
  assert.equal(isLiveQueue(0, "tournament"), true);
  assert.equal(isLiveQueue(0, "ranked"), false);
  assert.equal(isLiveQueue(400), false);
  assert.equal(isLiveQueue(430), false);
  assert.equal(isLiveQueue(450), false);
  assert.equal(isLiveQueue(null), false);
  assert.equal(isLiveQueue(undefined), false);
});

test("formats the game clock", () => {
  assert.equal(formatGameTime(0), "00:00");
  assert.equal(formatGameTime(65.9), "01:05");
  assert.equal(formatGameTime(1428.2), "23:48");
  assert.equal(formatGameTime(-5), "00:00");
});

test("labels the result", () => {
  assert.equal(liveResultLabel("Win"), "Victoria");
  assert.equal(liveResultLabel("Lose"), "Derrota");
  assert.equal(liveResultLabel(null), "Sin resultado");
});

test("starts at fountains and moves to lanes when minions spawn", () => {
  const atStart = computeLivePositions(players, [
    { name: "GameStart", participants: [], location: null },
  ]);
  assert.deepEqual(atStart.get("a"), { x: 8, y: 92 });
  assert.deepEqual(atStart.get("b"), { x: 92, y: 8 });

  const atLanes = computeLivePositions(players, [
    { name: "GameStart", participants: [], location: null },
    { name: "MinionsSpawning", participants: [], location: null },
  ]);
  assert.deepEqual(atLanes.get("a"), { x: 12, y: 43 });
  assert.deepEqual(atLanes.get("b"), { x: 25, y: 17 });
  assert.deepEqual(atLanes.get("c"), { x: 30, y: 70 });
});

test("moves only the participants of an event", () => {
  const positions = computeLivePositions(players, [
    { name: "GameStart", participants: [], location: null },
    { name: "MinionsSpawning", participants: [], location: null },
    {
      name: "ChampionKill",
      participants: ["a", "b"],
      location: { x: 44, y: 60 },
    },
  ]);

  assert.deepEqual(positions.get("a"), { x: 44, y: 60 });
  assert.deepEqual(positions.get("b"), { x: 44, y: 60 });
  assert.deepEqual(positions.get("c"), { x: 30, y: 70 });
});

test("moves first blood, multikill and ace participants to their event location", () => {
  const positions = computeLivePositions(players, [
    { name: "GameStart", participants: [], location: null },
    { name: "MinionsSpawning", participants: [], location: null },
    {
      name: "FirstBlood",
      participants: ["a"],
      location: { x: 25, y: 17 },
    },
    {
      name: "Multikill",
      participants: ["b"],
      location: { x: 25, y: 17 },
    },
    {
      name: "Ace",
      participants: ["c"],
      location: { x: 56, y: 40 },
    },
  ]);

  assert.deepEqual(positions.get("a"), { x: 25, y: 17 });
  assert.deepEqual(positions.get("b"), { x: 25, y: 17 });
  assert.deepEqual(positions.get("c"), { x: 56, y: 40 });
});

test("separates champions that share the same event location", () => {
  const base = new Map([
    ["a", { x: 50, y: 50 }],
    ["b", { x: 50, y: 50 }],
    ["c", { x: 50, y: 50 }],
  ]);
  const laidOut = layoutLivePositions(base);
  const positions = [...laidOut.values()];

  assert.equal(new Set(positions.map((position) => `${position.x}:${position.y}`)).size, 3);
  for (const position of positions) {
    assert.ok(position.x >= 3 && position.x <= 97);
    assert.ok(position.y >= 3 && position.y <= 97);
  }
  assert.equal(liveClusterSizes(base).get("a"), 3);
});
