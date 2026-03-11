import { SkinManager, SKINS } from './skin.js';

const DOTS = [
  { key: 'classic', title: 'Classic', dot: '#4ecdc4' },
  { key: 'vagc77',  title: 'VAGC-77', dot: '#00e5ff' },
  { key: 'omitron', title: 'OMITRON', dot: '#39ff14' },
  { key: 'owl',     title: 'OWL',     dot: '#d4880a' },
  { key: 'eq',      title: 'EQ',      dot: '#00e060' },
];

export function skinSwitcherHtml() {
  return `<div class="skin-switcher" id="pageSkinSwitcher">${
    DOTS.map(d =>
      `<button class="skin-dot" data-skin="${d.key}" title="${d.title}" style="--dot:${d.dot}"></button>`
    ).join('')
  }</div>`;
}

export function mountSkinSwitcher() {
  const mgr = new SkinManager();
  const restored = mgr.restore();
  const current = restored || SKINS.owl;
  if (!restored) mgr.apply(current);

  const container = document.getElementById('pageSkinSwitcher');
  if (!container) return;

  const update = (skin) => {
    container.querySelectorAll('.skin-dot').forEach(btn => {
      btn.classList.toggle('active', SKINS[btn.dataset.skin] === skin);
    });
  };

  update(current);

  container.addEventListener('click', e => {
    const btn = e.target.closest('.skin-dot');
    if (!btn) return;
    const skin = SKINS[btn.dataset.skin];
    if (!skin) return;
    mgr.apply(skin);
    update(skin);
  });
}
