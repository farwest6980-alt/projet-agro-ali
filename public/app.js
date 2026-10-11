(() => {
  const badge = document.getElementById('unread-badge');
  const box = document.getElementById('chat-messages');
  const form = document.getElementById('chat-form');
  const quoteForm = document.getElementById('quote-form');
  const warning = document.getElementById('chat-warning');
  const activeConv = box ? Number(box.dataset.convId) : null;

  const setBadge = (el, n) => {
    if (!el) return;
    el.textContent = n;
    el.hidden = !n;
  };

  function showWarning(text) {
    if (!warning) return alert(text);
    warning.querySelector('span').textContent = text;
    warning.hidden = !text;
  }

  // Insère ou remplace un message (HTML rendu par le serveur pour ce lecteur).
  function upsertMessage(data) {
    if (!box || data.conversation_id !== activeConv) return;
    document.getElementById('chat-empty')?.remove();
    const tpl = document.createElement('template');
    tpl.innerHTML = data.html.trim();
    const el = tpl.content.firstElementChild;
    const existing = box.querySelector(`[data-id="${data.id}"]`);
    if (existing) return existing.replaceWith(el);
    const atBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 80;
    box.append(el);
    if (atBottom || data.sender_id === Number(document.body.dataset.userId)) box.scrollTop = box.scrollHeight;
  }

  function updateConvItem(data, incrementUnread) {
    const item = document.querySelector(`.conv-item[data-conv-id="${data.conversation_id}"]`);
    if (!item) return;
    item.querySelector('.conv-last').textContent = data.preview;
    item.parentElement.querySelector('h2').after(item);
    if (incrementUnread) {
      const b = item.querySelector('.conv-badge');
      setBadge(b, Number(b.textContent || 0) + 1);
    }
  }

  async function post(url, payload) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload || {}),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "L'action n'a pas pu aboutir.");
    showWarning('');
    return data;
  }

  const formData = (f) => Object.fromEntries(new FormData(f).entries());

  if (box) box.scrollTop = box.scrollHeight;

  // ---------- Envoi de message ----------
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
      try {
        await post(`/api/messages/${activeConv}`, { body });
      } catch (err) {
        textarea.value = body;
        showWarning(err.message);
      }
    });
  }

  // ---------- Devis ----------
  document.addEventListener('click', async (e) => {
    if (e.target.closest('[data-toggle-quote]') && quoteForm) {
      quoteForm.hidden = !quoteForm.hidden;
      if (!quoteForm.hidden) quoteForm.querySelector('input').focus();
      return;
    }
    const negotiate = e.target.closest('[data-quote-negotiate]');
    if (negotiate) {
      const counter = box.querySelector(`[data-counter-for="${negotiate.dataset.quoteNegotiate}"]`);
      counter.hidden = !counter.hidden;
      return;
    }
    const action = e.target.closest('[data-quote-action]');
    if (action) {
      if (action.dataset.quoteAction === 'refuser' && !confirm('Refuser ce devis ?')) return;
      action.disabled = true;
      try {
        await post(`/api/quotes/${action.dataset.quoteId}/${action.dataset.quoteAction}`);
      } catch (err) {
        action.disabled = false;
        showWarning(err.message);
      }
    }
  });

  document.addEventListener('submit', async (e) => {
    const f = e.target;
    if (f === quoteForm) {
      e.preventDefault();
      try {
        await post(`/api/conversations/${activeConv}/devis`, formData(f));
        f.hidden = true;
      } catch (err) {
        showWarning(err.message);
      }
    } else if (f.matches('.counter-form')) {
      e.preventDefault();
      try {
        await post(`/api/quotes/${f.dataset.counterFor}/negocier`, formData(f));
      } catch (err) {
        showWarning(err.message);
      }
    }
  });

  // ---------- Temps réel ----------
  const source = new EventSource('/api/stream');
  const me = Number(document.body.dataset.userId);

  source.addEventListener('update', (e) => upsertMessage(JSON.parse(e.data)));

  source.addEventListener('message', async (e) => {
    const data = JSON.parse(e.data);
    upsertMessage(data);
    if (data.sender_id === me) return updateConvItem(data, false);
    if (data.conversation_id === activeConv && document.visibilityState === 'visible') {
      updateConvItem(data, false);
      const res = await fetch(`/api/messages/${activeConv}/lu`, { method: 'POST' });
      if (res.ok) setBadge(badge, (await res.json()).unread);
    } else {
      updateConvItem(data, true);
      setBadge(badge, Number(badge?.textContent || 0) + 1);
    }
  });
})();
