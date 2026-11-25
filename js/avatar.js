// Inline SVG art: the stag silhouette (rest screen), the muscle map (exercise card)
// and the tappable labeled body for soreness and pain entry.
const OUTLINE = '<g fill="none" stroke="#c7c7cc" stroke-width="2"><circle cx="50" cy="16" r="11"/><path d="M42 27 L38 34 Q22 36 18 44 L14 92 Q14 98 20 98 Q25 98 25 92 L28 58 L30 88 Q32 104 38 112 L62 112 Q68 104 70 88 L72 58 L75 92 Q75 98 80 98 Q86 98 86 92 L82 44 Q78 36 62 34 L58 27"/><path d="M38 112 Q34 150 37 168 L36 192 Q40 196 46 192 L48 168 Q50 150 49 118 M62 112 Q66 150 63 168 L64 192 Q60 196 54 192 L52 168 Q50 150 51 118"/></g>';

const el = (cx, cy, rx, ry) => `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}"/>`;
const dot = (cx, cy) => `<circle cx="${cx}" cy="${cy}" r="3.6"/>`;
// Shapes for the image-left half (x < 50). Paired regions are mirrored for the other half.
const FRONT = {
  side_delts: el(22, 42, 7, 6), chest: el(40, 52, 10, 8), biceps: el(20, 62, 4.5, 10), forearms: el(17, 82, 3.6, 9),
  quads: el(42, 128, 7, 16), joint_shoulder: dot(27, 39), joint_elbow: dot(20, 73), joint_wrist: dot(17, 95),
  joint_hip: dot(41, 114), joint_knee: dot(41, 148), joint_ankle: dot(40, 184) };
const FRONT_CENTER = { abs: '<rect x="41" y="64" width="18" height="28" rx="6"/>' };
const BACK = {
  traps: el(42, 38, 9, 5), rear_delts: el(22, 42, 7, 6), lats: el(40, 62, 10, 14), triceps: el(20, 62, 4.5, 10), forearms: el(17, 82, 3.6, 9),
  glutes: el(42, 104, 8, 7), hamstrings: el(42, 128, 7, 16), calves: el(41, 162, 5, 12), joint_shoulder: dot(27, 39), joint_elbow: dot(20, 73),
  joint_wrist: dot(17, 95), joint_hip: dot(41, 114), joint_knee: dot(41, 148), joint_ankle: dot(40, 184) };
const BACK_CENTER = { lower_back: '<rect x="42" y="84" width="16" height="14" rx="5"/>' };
const MIRROR = 'translate(100 0) scale(-1 1)';

// Muscle map for the exercise card: every region in `regions` highlighted on both views.
export function bodyMapSvg(regions) {
  const hot = (set, center, dx) => `<g transform="translate(${dx} 0)" fill="var(--hot)" opacity=".85">${regions.map(r => (set[r] ? `<g>${set[r]}</g><g transform="${MIRROR}">${set[r]}</g>` : '') + (center[r] || '')).join('')}</g>`;
  return `<svg viewBox="0 0 210 200" role="img" aria-label="Front and back body outline with ${regions.join(', ').replace(/_/g, ' ')} highlighted">
    <g>${OUTLINE}</g><g transform="translate(110 0)">${OUTLINE}</g>${hot(FRONT, FRONT_CENTER, 0)}${hot(BACK, BACK_CENTER, 110)}</svg>`;
}

// Tappable labeled body. view: 'front' | 'back'. In the front view the person's left is on the viewer's right.
export function pickerSvg(view, sel) {
  const set = view === 'front' ? FRONT : BACK, center = view === 'front' ? FRONT_CENTER : BACK_CENTER;
  const personSide = half => (view === 'front' ? (half === 'imgL' ? 'right' : 'left') : (half === 'imgL' ? 'left' : 'right'));
  const piece = (id, shape, side, mirrored) => {
    const on = sel && sel.region === id && (sel.side === side);
    return `<g data-a="avpick" data-r="${id}" data-s="${side}" class="rg${on ? ' on' : ''}" ${mirrored ? `transform="${MIRROR}"` : ''}>${shape}</g>`;
  };
  const parts = [];
  for (const [id, shape] of Object.entries(set)) {
    parts.push(piece(id, shape, personSide('imgL'), false));
    parts.push(piece(id, shape, personSide('imgR'), true));
  }
  for (const [id, shape] of Object.entries(center)) parts.push(piece(id, shape, 'center', false));
  const L = view === 'front' ? ['R', 'L'] : ['L', 'R']; // letters at image-left and image-right
  return `<svg viewBox="0 0 100 200" class="picker" role="img" aria-label="${view} view of the body. Tap a region.">
    ${OUTLINE}${parts.join('')}
    <text x="4" y="14" class="lr">${L[0]}</text><text x="96" y="14" class="lr" text-anchor="end">${L[1]}</text></svg>`;
}

// Clean stag silhouette (side view, facing right). Breathing animation is CSS.
export function stagSvg() {
  const body = 'M58 98 C75 88 100 90 125 92 C145 93 160 90 175 86 C190 78 204 60 216 48 L224 44 L219 29 L233 41 C244 48 260 58 271 71 C275 76 273 83 266 84 C257 85 249 81 241 77 C240 96 228 114 215 128 C209 134 205 140 204 148 L205 180 C206 190 206 200 207 218 L210 226 L197 226 L198 218 L197 182 C196 168 195 156 192 148 C189 143 187 141 184 140 C160 147 130 147 112 138 C108 150 104 158 99 178 L100 204 L103 226 L90 226 L91 218 L90 196 L84 178 C80 160 72 148 67 136 C56 124 50 110 58 98 Z';
  const far = 'M216 140 L218 182 C219 192 220 204 221 218 L224 226 L211 226 L212 218 L211 184 L208 146 Z M120 142 C117 156 114 164 112 178 L114 204 L117 226 L104 226 L105 218 L103 196 L100 176 C102 160 108 150 112 142 Z';
  const antler = 'M222 42 C218 22 206 0 190 -16 C180 -26 170 -34 158 -40 M221 36 C232 28 244 26 254 32 M216 24 C228 16 240 14 248 8 M208 8 C218 0 228 -4 236 -14 M196 -8 C204 -16 210 -26 212 -38 M182 -22 C190 -30 194 -40 192 -48 M158 -40 C164 -46 172 -48 178 -46 M158 -40 C154 -48 150 -50 146 -52';
  return `<svg viewBox="40 -60 250 295" class="stag" aria-hidden="true" preserveAspectRatio="xMidYMid meet">
    <g fill="currentColor" opacity=".42"><path d="${far}"/></g>
    <g fill="none" stroke="currentColor" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round" opacity=".42" transform="translate(-10 5)"><path d="${antler}"/></g>
    <g fill="currentColor"><path d="${body}"/></g>
    <g fill="none" stroke="currentColor" stroke-width="4.4" stroke-linecap="round" stroke-linejoin="round"><path d="${antler}"/></g>
  </svg>`;
}
