// Skin picker for the player deck. Switching restyles the whole app and redraws the disc.
import { SkinManager, SKINS, PLAYER_SKINS } from './skin.js';

const DOT = { owl: '#d4880a', omitron: '#39ff14', eq: '#00e060', hypno: '#ff3fa4', specimen: '#9fd84a' };

export function skinSwitcherHtml() {
  return `<div class="skin-picker" role="radiogroup" aria-label="Player skin">${
    PLAYER_SKINS.map(key => `<button class="skin-chip" role="radio" data-skin="${key}" style="--dot:${DOT[key]}" title="${SKINS[key].name}" aria-label="${SKINS[key].name}"><span class="skin-chip-dot"></span></button>`).join('')
  }</div>`;
}

// onChange(skin) runs after the skin is applied, so the caller can redraw its canvas.
export function mountSkinSwitcher(container, onChange) {
  const mgr = new SkinManager();
  const current = mgr.restore() || SKINS.owl;
  const update = skin => container.querySelectorAll('.skin-chip').forEach(btn => {
    const on = SKINS[btn.dataset.skin] === skin;
    btn.classList.toggle('active', on);
    btn.setAttribute('aria-checked', on);
  });
  update(current);
  container.addEventListener('click', e => {
    const skin = SKINS[e.target.closest('.skin-chip')?.dataset.skin];
    if (!skin) return;
    mgr.apply(skin);
    update(skin);
    onChange?.(skin);
  });
}
