// core/players.js
const store = Object.create(null);

// מיפוי שמות שדות שאנחנו כן מאפשרים בעדכוני runtime
const ALLOWED_RUNTIME_FIELDS = new Set([
  'position_x',
  'position_y',
  'direction',
  'animation_frame',
  'is_moving',
  'move_type',
  'username',
  'is_invisible',
  'keep_away_mode',
  'skin_code',
  'admin_level',
]);

function createDefaultPlayer(socketId) {
  return {
    id: socketId,
    username: '',          // יתעדכן ב-identify
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
    skin_code: 'blue',
    ready: false,          // נהפוך ל-true ב-identify
  };
}

// בניגוד לגרסה הישנה — לא מסננים אם אין username!
function safeView(p) {
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
    is_invisible: !!p.is_invisible,
    keep_away_mode: !!p.keep_away_mode,
    admin_level: p.admin_level || 'user',
    skin_code: p.skin_code || 'blue',
  };
}

function mergeRuntimeUpdate(dst, src) {
  for (const k of Object.keys(src || {})) {
    if (ALLOWED_RUNTIME_FIELDS.has(k)) {
      dst[k] = src[k];
    }
  }
}

module.exports = {
  store,
  createDefaultPlayer,
  safeView,
  mergeRuntimeUpdate,
};
