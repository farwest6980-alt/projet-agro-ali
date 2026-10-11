(() => {
  // ---------- Galerie photo (scroll-snap = swipe natif sur mobile) ----------
  document.querySelectorAll('[data-gallery]').forEach((gallery) => {
    const main = gallery.querySelector('.gallery-main');
    const thumbs = [...gallery.querySelectorAll('.gallery-thumbs button')];
    if (!main || !thumbs.length) return;
    const setActive = (index) => thumbs.forEach((t, i) => t.classList.toggle('active', i === index));
    thumbs.forEach((thumb, i) =>
      thumb.addEventListener('click', () => {
        main.scrollTo({ left: i * main.clientWidth, behavior: 'smooth' });
        setActive(i);
      })
    );
    let timer;
    main.addEventListener('scroll', () => {
      clearTimeout(timer);
      timer = setTimeout(() => setActive(Math.round(main.scrollLeft / main.clientWidth)), 60);
    });
  });

  // ---------- Sélection de photos avec aperçu et suppression avant envoi ----------
  document.querySelectorAll('[data-photo-picker]').forEach((picker) => {
    const input = picker.querySelector('[data-photo-input]');
    const previews = picker.querySelector('[data-previews]');
    const error = picker.querySelector('[data-photo-error]');
    const addButton = picker.querySelector('.photo-add');
    const max = Number(picker.dataset.max);
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    let files = [];

    const showError = (text) => {
      error.textContent = text;
      error.hidden = !text;
    };

    function sync() {
      const dt = new DataTransfer();
      files.forEach((f) => dt.items.add(f));
      input.files = dt.files;
      previews.replaceChildren(
        ...files.map((file, i) => {
          const item = document.createElement('div');
          item.className = 'photo-preview';
          const img = document.createElement('img');
          img.src = URL.createObjectURL(file);
          img.onload = () => URL.revokeObjectURL(img.src);
          const remove = document.createElement('button');
          remove.type = 'button';
          remove.className = 'photo-remove';
          remove.setAttribute('aria-label', 'Retirer cette photo');
          remove.textContent = '×';
          remove.onclick = () => {
            files.splice(i, 1);
            showError('');
            sync();
          };
          item.append(img, remove);
          if (i === 0) {
            const badge = document.createElement('span');
            badge.className = 'photo-main-badge';
            badge.textContent = 'Principale';
            item.append(badge);
          }
          return item;
        })
      );
      addButton.hidden = files.length >= max;
    }

    input.addEventListener('change', () => {
      const messages = [];
      for (const file of input.files) {
        if (files.length >= max) {
          messages.push(`${max} photos maximum.`);
          break;
        }
        if (!allowed.includes(file.type)) messages.push(`« ${file.name} » : format non accepté.`);
        else if (file.size > 5 * 1024 * 1024) messages.push(`« ${file.name} » dépasse 5 Mo.`);
        else files.push(file);
      }
      showError(messages.join(' '));
      sync();
    });
  });

  // ---------- Boîtes de dialogue ----------
  document.addEventListener('click', (e) => {
    const opener = e.target.closest('[data-open-dialog]');
    if (opener) document.getElementById(opener.dataset.openDialog)?.showModal();
    const closer = e.target.closest('[data-close-dialog]');
    if (closer) closer.closest('dialog')?.close();
  });
})();
