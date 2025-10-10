// Store בזיכרון + פונקציות עזר לשחקנים

const players = Object.create(null);

// שדות שמותר לעדכן מתוך player_update (תנועה/אנימציה בלבד)
const RUNTIME_FIELDS = new Set([
  'position_x',
  'position_y',
  'direction',
  'animation_frame',
  'is_moving',
  'move_type'
]);

function makeDefaultPlayer(id) {
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
    equipment: {},           // { hat: "hat_01", body: "skin_brown", ... }
    skin_code: 'blue',
    admin_level: 'user',
    is_invisible: false,
    keep_away_mode: false,
    ready: false             // לא משדרים לשאר עד identify
  };
}

function mergeRuntime(dst, src = {}) {
  for (const k of Object.keys(src)) {
    if (RUNTIME_FIELDS.has(k)) dst[k] = src[k];
  }
}

function safePlayerView(p) {
  if (!p) return null;
  return {
    id: p.id,
    username: p.username || '',
    position_x: p.position_x,
    position_y: p.position_y,
    direction: p.direction,
    animation_frame: p.animation_frame,
    is_moving: p.is_moving,
    move_type: p.move_type || 'walk',
    current_area: p.current_area || 'city',
    equipment: p.equipment || {},
    skin_code: p.skin_code || 'blue',
    admin_level: p.admin_level || 'user',
    is_invisible: !!p.is_invisible,
    keep_away_mode: !!p.keep_away_mode
  };
}

module.exports = {
  players,
  makeDefaultPlayer,
  mergeRuntime,
  safePlayerView
};
