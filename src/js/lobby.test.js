import test from "node:test";
import assert from "node:assert/strict";

import {
  matchLobbyMembers,
  normalizeLobbyName,
  orderEnemyMembers,
} from "./lobby.js";

const players = [
  { id: "top", name: "Dani", role: "TOP" },
  { id: "jungle", name: "Mario", role: "JUNGLE" },
  { id: "mid", name: "Lucía", role: "MID" },
  { id: "adc", name: "Pablo", role: "ADC" },
  { id: "support", name: "Sara", role: "SUPPORT" },
];

test("normalizes lobby names by trimming the tag and case", () => {
  assert.equal(normalizeLobbyName("Dani#LAS"), "dani");
  assert.equal(normalizeLobbyName("  Dani  "), "dani");
  assert.equal(normalizeLobbyName(""), "");
});

test("matches lobby members by display name first", () => {
  const members = [
    { display_name: "Dani", primary_position: "TOP", secondary_position: "JUNGLE" },
    { display_name: "Mario", primary_position: "JUNGLE", secondary_position: "TOP" },
  ];
  const matched = matchLobbyMembers(players, members);
  assert.equal(matched.get("top")?.display_name, "Dani");
  assert.equal(matched.get("jungle")?.display_name, "Mario");
  assert.equal(matched.get("mid"), undefined);
});

test("falls back to the primary or secondary position", () => {
  const members = [
    { display_name: "Pedro", primary_position: "ADC", secondary_position: "MID" },
    { display_name: "Ana", primary_position: "SUPPORT", secondary_position: "MID" },
  ];
  const matched = matchLobbyMembers(players, members);
  assert.equal(matched.get("adc")?.display_name, "Pedro");
  assert.equal(matched.get("support")?.display_name, "Ana");
});

test("does not assign the same lobby member twice", () => {
  const members = [
    { display_name: "Dani", primary_position: "MID", secondary_position: "TOP" },
  ];
  const matched = matchLobbyMembers(players, members);
  const assigned = [...matched.values()];
  assert.equal(assigned.length, 1);
  assert.equal(assigned[0].display_name, "Dani");
});

test("orders enemy members by their assigned role", () => {
  const members = [
    { display_name: "Rival 1", primary_position: "SUPPORT" },
    { display_name: "Rival 2", primary_position: "JUNGLE" },
    { display_name: "Rival 3", primary_position: null },
    { display_name: "Rival 4", primary_position: "TOP" },
    { display_name: "Rival 5", primary_position: "ADC" },
    { display_name: "Rival 6", primary_position: "MID" },
  ];
  assert.deepEqual(
    orderEnemyMembers(members).map((member) => member.display_name),
    ["Rival 4", "Rival 2", "Rival 6", "Rival 5", "Rival 1", "Rival 3"],
  );
});
