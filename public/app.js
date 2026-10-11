(() => {
  const me = Number(document.body.dataset.userId);
  const badge = document.getElementById('unread-badge');
  const box = document.getElementById('chat-messages');
  const form = document.getElementById('chat-form');
  const activeConv = box ? Number(box.dataset.convId) : null;

  const fmt = (iso) =>
    new Date(iso.replace(' ', 'T') + 'Z').toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

  function setBadge(el, n) {
    if (!el) return;
    el.textContent = n;
    el.hidden = !n;
  }

  function appendMessage(m) {
    if (!box || box.querySelector(`[data-id="${m.id}"]`)) return;
    document.getElementById('chat-empty')?.remove();
    const div = document.createElement('div');
    div.className = `bubble ${m.sender_id === me ? 'mine' : 'theirs'}`;
    div.dataset.id = m.id;
    const body = document.createElement('div');
    body.className = 'prewrap';
    body.textContent = m.body;
    const time = document.createElement('time');
    time.textContent = fmt(m.created_at);
    div.append(body, time);
    box.append(div);
    box.scrollTop = box.scrollHeight;
  }

  function updateConvItem(m, incrementUnread) {
    const item = document.querySelector(`.conv-item[data-conv-id="${m.conversation_id}"]`);
    if (!item) return;
    item.querySelector('.conv-last').textContent = m.body;
    item.parentElement.querySelector('h2').after(item);
    if (incrementUnread) {
      const b = item.querySelector('.conv-badge');
      setBadge(b, Number(b.textContent || 0) + 1);
    }
  }

  if (box) box.scrollTop = box.scrollHeight;

  if (form) {
    const textarea = form.querySelector('textarea');
    textarea.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        form.requestSubmit();
      }
    });
    textarea.addEventListener('input', () => {
      textarea.style.height = 'auto';
      textarea.style.height = Math.min(textarea.scrollHeight, 160) + 'px';
    });
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const body = textarea.value.trim();
      if (!body) return;
      textarea.value = '';
      textarea.style.height = 'auto';
      const res = await fetch(`/api/messages/${activeConv}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body }),
      });
      if (res.ok) {
        const m = await res.json();
        appendMessage(m);
        updateConvItem(m, false);
      } else {
        textarea.value = body;
        alert("Le message n'a pas pu être envoyé.");
      }
    });
  }

  const source = new EventSource('/api/stream');
  source.addEventListener('message', async (e) => {
    const m = JSON.parse(e.data);
    if (m.sender_id === me) return appendMessage(m);
    if (m.conversation_id === activeConv && document.visibilityState === 'visible') {
      appendMessage(m);
      updateConvItem(m, false);
      const res = await fetch(`/api/messages/${activeConv}/lu`, { method: 'POST' });
      if (res.ok) setBadge(badge, (await res.json()).unread);
    } else {
      updateConvItem(m, true);
      setBadge(badge, Number(badge?.textContent || 0) + 1);
      if (m.conversation_id === activeConv) appendMessage(m);
    }
  });
})();
