// Bell toggle: subscribe/unsubscribe this device to Web Push. On iOS this only
// works in the installed (Home Screen) PWA, and permission must come from a tap.

function urlBase64ToUint8Array(base64) {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

const btn = document.getElementById('notify-btn');
const supported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

if (!btn) {
  // no-op (not on the timeline page)
} else if (!supported) {
  btn.hidden = true;
} else {
  btn.hidden = false;
  init();
}

function setState(enabled) {
  btn.classList.toggle('on', enabled);
  btn.title = enabled ? 'Notifications on — tap to turn off' : 'Turn on 7am notifications';
  btn.setAttribute('aria-pressed', String(enabled));
}

async function init() {
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  setState(!!sub);
  btn.addEventListener('click', () => onClick(reg));
}

async function onClick(reg) {
  btn.disabled = true;
  try {
    const existing = await reg.pushManager.getSubscription();
    if (existing) {
      await fetch('/push/unsubscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint: existing.endpoint })
      });
      await existing.unsubscribe();
      setState(false);
      return;
    }

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      alert('Notifications are blocked. Enable them for this app in your device settings.');
      return;
    }

    const { key } = await (await fetch('/push/public-key')).json();
    if (!key) {
      alert('Push is not configured on the server yet.');
      return;
    }

    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(key)
    });
    await fetch('/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(sub.toJSON())
    });
    setState(true); // a confirmation notification arrives from the server
  } catch (err) {
    console.error('[push] toggle failed:', err);
    alert('Could not change notification settings.');
  } finally {
    btn.disabled = false;
  }
}
