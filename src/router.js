const routes = {};
let currentCleanup = null;

export function route(path, handler) {
  routes[path] = handler;
}

export async function navigate(path) {
  history.pushState(null, '', path);
  await _render(path);
}

async function _render(path) {
  if (currentCleanup) { currentCleanup(); currentCleanup = null; }

  let handler = routes[path];
  let params = {};

  if (!handler) {
    for (const [pattern, fn] of Object.entries(routes)) {
      const match = _matchRoute(pattern, path);
      if (match) { handler = fn; params = match; break; }
    }
  }

  if (!handler) {
    document.getElementById('view').innerHTML =
      '<p style="color:#888;padding:40px;text-align:center">Page not found</p>';
    return;
  }

  const cleanup = await handler(params);
  currentCleanup = cleanup || null;
}

function _matchRoute(pattern, path) {
  const pp = pattern.split('/');
  const pathP = path.split('/');
  if (pp.length !== pathP.length) return null;
  const params = {};
  for (let i = 0; i < pp.length; i++) {
    if (pp[i].startsWith(':')) {
      params[pp[i].slice(1)] = decodeURIComponent(pathP[i]);
    } else if (pp[i] !== pathP[i]) {
      return null;
    }
  }
  return params;
}

window.addEventListener('popstate', () => _render(location.pathname));
export const start = () => _render(location.pathname);
