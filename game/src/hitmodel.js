// hitmodel.js — one place that decides what a hit is worth.
//
// One job: turn (weapon, body part, distance) into damage, for BOTH the
// player's raycast shots and the bots' simulated shots, so the headshot
// model can never drift between the two code paths.
//
// The model:
//   - Every actor has TWO hitboxes: a distinct HEAD box (the small box
//     mesh on top of each bot, tagged userData.part === 'head' in
//     bots.js; for the player, headCenter() vs chestCenter() in
//     player.js) and a BODY box (torso + legs).
//   - A head hit multiplies the weapon's base damage by its headMult.
//     The foundry standard is HEADSHOT_MULT = ×4 for single-shot guns
//     (Piston, Rivet Carbine, Forge Lance). Two honest exceptions, both
//     documented on their weapon rows in weapons.js:
//       · Slag Scattergun — ×2 per pellet (8 pellets would make ×4 a
//         guaranteed one-click kill at any range it can reach).
//       · Crucible Longshot — ×2.4 (108 base damage already kills
//         through a body shot; ×4 would be invisible overkill).
//   - Past a weapon's effective range, damage falls to RANGE_FALLOFF
//     of normal — for head and body alike.
//   - A headshot is also a PRESENTATION event, not just a number:
//     callers pass isHead onward so the HUD can flash the gold hitmarker
//     and the kill feed can tag the kill, and audio.js plays the higher
//     head-hit tone. resolveHit() returns that flag with the damage so
//     no caller has to re-derive it.

export const HEADSHOT_MULT = 4;
export const RANGE_FALLOFF = 0.4;

// part: 'head' | 'body' (anything else counts as body).
// Returns { damage, isHead } — a fresh small object per SHOT, never per
// frame, so this stays out of the hot-loop allocation rules.
export function resolveHit(weapon, part, distance) {
  const isHead = part === 'head';
  let damage = weapon.damage * (isHead ? (weapon.headMult || HEADSHOT_MULT) : 1);
  if (distance > weapon.range) damage *= RANGE_FALLOFF;
  return { damage, isHead };
}

// Bots don't raycast; when their hit roll succeeds they pick a body part
// to have struck. Head probability is deliberately low — a bot that
// headshots a third of the time feels like an aimbot, not a foundry hand.
export const BOT_HEAD_CHANCE = 0.14;

export function botHitPart(rng) {
  return rng.chance(BOT_HEAD_CHANCE) ? 'head' : 'body';
}
