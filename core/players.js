// core/players.js
const players = Object.create(null);

const ALLOWED_FIELDS = new Set([
  'position_x', 'position_y', 'direction', 'animation_frame',
  'is_moving', 'move_type', 'username', 'current_area',
  'is_invisible', 'keep_away_mode'
]);

function createDefaultPlayer(id) {
  return {
    id,
    username: '',
    position_x: 600,
    position_y: 400,
    direction: 'front',
    animation_frame: 'idle',
    is_moving: false,
    move_type: 'walk',
    current_area: 'city',
    equipment: {},
    is_invisible: false,
    keep_away_mode: false,
    admin_level: 'user',
    skin_code: 'blue'
  };
}

function safePlayerView(p) {
  if (!p) return null;
  return {
    id: p.id,
    username: p.username,
    position_x: p.position_x,
    position_y: p.position_y,
    direction: p.direction,
    animation_frame: p.animation_frame,
    is_moving: p.is_moving,
    move_type: p.move_type,
    current_area: p.current_area,
    equipment: p.equipment,
    admin_level: p.admin_level,
    skin_code: p.skin_code
  };
}

function mergeRuntimeUpdate(dst, src) {
  for (const key of Object.keys(src || {})) {
    if (ALLOWED_FIELDS.has(key)) dst[key] = src[key];
  }
}

module.exports = { players, createDefaultPlayer, safePlayerView, mergeRuntimeUpdate };

