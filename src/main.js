import './styles.css';
import { createAuthService } from './services/auth.js';
import { getSupabaseClient } from './services/supabase.js';
import { createTrackerService } from './services/tracker.js';
import { createAuthView as defaultCreateAuthView } from './ui/auth-view.js';
import { createTrackerView as defaultCreateTrackerView } from './ui/tracker-view.js';

export async function bootstrap({
  root,
  authService,
  trackerService,
  createAuthView = defaultCreateAuthView,
  createTrackerView = defaultCreateTrackerView
}) {
  if (!root) throw new Error('Application root is required.');

  let disposed = false;
  let currentView = null;
  let unsubscribe = null;
  let transition = 0;

  function destroyCurrentView() {
    if (!currentView) return;
    currentView.destroy();
    currentView = null;
  }

  async function showSession(session) {
    const thisTransition = ++transition;
    destroyCurrentView();
    if (disposed) return;

    if (!session) {
      const authView = createAuthView(root, authService);
      currentView = authView;
      authView.show();
      return;
    }

    const trackerView = createTrackerView(root, { trackerService, authService });
    currentView = trackerView;
    await trackerView.mount();
    if (disposed || thisTransition !== transition || currentView !== trackerView) {
      trackerView.destroy();
    }
  }

  root.textContent = '正在加载…';
  let session = null;
  try {
    session = await authService.getSession();
  } catch {
    // Do not surface provider details when restoring a session fails.
    root.textContent = '';
  }
  await showSession(session);

  unsubscribe = authService.onAuthStateChange((_event, nextSession) => showSession(nextSession));

  return {
    destroy() {
      if (disposed) return;
      disposed = true;
      transition += 1;
      if (unsubscribe) unsubscribe();
      unsubscribe = null;
      destroyCurrentView();
    }
  };
}

async function startApplication() {
  const root = document.querySelector('#app');
  if (!root) return;
  try {
    const client = getSupabaseClient();
    await bootstrap({
      root,
      authService: createAuthService(client),
      trackerService: createTrackerService(client)
    });
  } catch {
    root.textContent = '应用暂时无法启动，请检查网络和公开配置后重试。';
  }
}

if (import.meta.env.MODE !== 'test') {
  void startApplication();
}
