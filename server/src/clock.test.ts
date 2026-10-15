import { test } from "node:test";
import assert from "node:assert/strict";
import { gameTimeForAbsence, timeOfDayFor, formatGameTime, GRACE_MS, CAP_MS } from "./clock.js";

const MIN = 60_000, HOUR = 60 * MIN, DAY = 24 * HOUR;

test("a reload or short break costs no game time", () => {
  assert.equal(gameTimeForAbsence(0), 0);
  assert.equal(gameTimeForAbsence(5 * MIN), 0);
  assert.equal(gameTimeForAbsence(GRACE_MS), 0);
});

test("past the grace period time passes 1:1 for the first six game-hours", () => {
  assert.equal(gameTimeForAbsence(GRACE_MS + 90 * MIN), 90 * MIN);
  assert.equal(gameTimeForAbsence(GRACE_MS + 6 * HOUR), 6 * HOUR);
});

test("beyond that it tapers to a quarter rate", () => {
  const dayAway = gameTimeForAbsence(DAY);
  assert.ok(dayAway > 9 * HOUR && dayAway < 11 * HOUR, `a day away should be ~10 game-hours, got ${dayAway / HOUR}`);
  const weekAway = gameTimeForAbsence(7 * DAY);
  assert.ok(weekAway > 1.5 * DAY && weekAway < 2.5 * DAY, `a week away should be ~2 game-days, got ${weekAway / DAY}`);
});

test("never more than a game-week per absence", () => {
  assert.equal(gameTimeForAbsence(365 * DAY), CAP_MS);
});

test("the curve is monotonic", () => {
  let prev = -1;
  for (let ms = 0; ms <= 40 * DAY; ms += 17 * MIN) {
    const v = gameTimeForAbsence(ms);
    assert.ok(v >= prev);
    prev = v;
  }
});

test("time of day bands and labels", () => {
  const base = Date.UTC(2026, 9, 14, 23, 48);
  assert.equal(timeOfDayFor(base), "night");
  assert.equal(timeOfDayFor(base + 7 * HOUR), "dawn");
  assert.equal(timeOfDayFor(base + 10 * HOUR), "day");
  assert.equal(timeOfDayFor(base + 20 * HOUR), "dusk");
  assert.equal(formatGameTime(base), "11:48 PM, Wed Oct 14");
});
