// Shared pose selection keeps the authored 64px sprite and bullet anatomy in
// agreement. Coordinates are local sprite pixels (origin at its top-left).
export const PLAYER_HEADS = Object.freeze({
  stand: [33, 13], crouch: [38, 36], jumpRise: [36, 12], jumpFall: [32, 13],
  land: [36, 20], vaultPlant: [40, 15], vaultTuck: [43, 22],
  vaultClear: [37, 14], barrierPlant: [40, 18], barrierClear: [37, 26],
  barrierLand: [38, 19], dash: [44, 20],
  roll: [[41, 32], [43, 47], [23, 49], [31, 29]],
});

export function getPlayerPose(p) {
  const moving = Math.abs(p.vx || 0) > 15 && p.grounded;
  let frame = moving ? Math.floor((p.animation || 0) / 1.15) % 4 : 0;
  let pose = p.crouching ? 'crouch' : !p.grounded ? (p.vy < -60 ? 'jumpRise' : 'jumpFall') : p.landingTime > 0 ? 'land' : 'stand';
  let dir = Math.cos(p.aim || 0) >= 0 ? 1 : -1, vaultProgress = 0;
  if (p.vaultTime > 0 && p.vault) {
    vaultProgress = Math.max(0, Math.min(1, p.vault.elapsed / p.vault.duration));
    dir = p.vault.dir || Math.sign(p.vault.endX - p.vault.startX) || dir;
    const thin = p.vault.kind === 'barricade';
    pose = vaultProgress < .16 ? 'stand' : vaultProgress < .24 ? 'jumpRise' : vaultProgress < .33 ? (thin ? 'barrierPlant' : 'vaultPlant') : vaultProgress < .78 ? (thin ? 'barrierClear' : 'vaultTuck') : vaultProgress < .90 ? 'vaultClear' : (thin ? 'barrierLand' : 'land');
    frame = Math.min(3, Math.floor(vaultProgress * 4));
  } else if (p.rollTime > 0) {
    pose = 'roll'; dir = p.rollDir || dir;
    frame = Math.min(3, Math.floor((1 - p.rollTime / (p.rollTotal || .28)) * 4));
  }
  return { pose, frame, dir, vaultProgress };
}
