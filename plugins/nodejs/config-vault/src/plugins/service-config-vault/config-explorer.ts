// Serialized into the page; keep browser navigation independent of form serialization.
export function initConfigExplorer(): void {
  document.querySelectorAll<HTMLElement>('[data-config-explorer]').forEach((workspace) => {
    const sidebar = workspace.querySelector<HTMLElement>('[data-config-navigation]')!;
    const search = sidebar.querySelector<HTMLInputElement>('input')!;
    const tree = sidebar.querySelector<HTMLElement>('[data-config-tree]')!;
    const empty = sidebar.querySelector<HTMLElement>('[data-config-empty]')!;
    const cards = Array.from(workspace.querySelectorAll<HTMLDetailsElement>('.plugin-card'));
    const dirty = new Set<HTMLDetailsElement>();
    const rows = cards.map((card, index) => {
      const form = card.querySelector<HTMLFormElement>('[data-config-form]')!;
      const source = card.closest<HTMLElement>('[data-config-source]')!.dataset.configSource!;
      const category = card.parentElement?.querySelector(':scope > h3')?.textContent ?? '';
      const name = card.querySelector('summary > span')!.textContent!;
      const key = [source, (form.elements.namedItem('section') as HTMLInputElement | null)?.value || 'add', name].map(encodeURIComponent).join('/');
      let parent = Array.from(tree.querySelectorAll<HTMLElement>('[data-source]')).find((item) => item.dataset.source === source);
      if (!parent) {
        parent = document.createElement('details');
        (parent as HTMLDetailsElement).open = true;
        parent.dataset.source = source;
        const heading = document.createElement('summary');
        heading.textContent = source;
        parent.append(heading);
        tree.append(parent);
      }
      if (category) {
        let group = Array.from(parent.querySelectorAll<HTMLElement>('[data-category]')).find((item) => item.dataset.category === category);
        if (!group) {
          group = document.createElement('details');
          (group as HTMLDetailsElement).open = true;
          group.dataset.category = category;
          const heading = document.createElement('summary');
          heading.textContent = category;
          group.append(heading);
          parent.append(group);
        }
        parent = group;
      }
      const row = document.createElement('div');
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = name;
      button.setAttribute('aria-controls', card.id = 'config-editor-' + index);
      const outline = document.createElement('div');
      outline.className = 'config-outline';
      row.append(button, outline);
      parent.append(row);
      const summary = card.querySelector('summary')!;
      const searchable = [source, category, summary.textContent, ...Array.from(form.querySelectorAll<HTMLElement>('[data-config-path],[data-config-group]')).map((field) => field.dataset.configPath ?? field.dataset.configGroup)].join(' ').toLowerCase();
      return { card, button, outline, row, key, searchable, category };
    });
    let active = rows[0];
    function refreshOutline(): void {
      if (!active) return;
      active.outline.replaceChildren();
      const parents = new Map<HTMLElement, HTMLElement>();
      active.card.querySelectorAll<HTMLElement>('[data-config-group]').forEach((group) => {
        if (group.closest('[hidden]')) return;
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = group.dataset.configGroup!;
        button.addEventListener('click', () => {
          group.tabIndex = -1;
          group.focus({ preventScroll: true });
          group.scrollIntoView({ block: 'start' });
        });
        const branch = document.createElement('div');
        branch.append(button);
        const parent = group.parentElement?.closest<HTMLElement>('[data-config-group]');
        (parent && parents.get(parent) || active.outline).append(branch);
        parents.set(group, branch);
        branch.className = 'config-outline';
      });
    }
    function select(row: typeof active, updateUrl = false): void {
      if (!row) return;
      active = row;
      rows.forEach((item) => {
        item.card.hidden = item !== row;
        item.card.open = item === row;
        item.button.setAttribute('aria-current', item === row ? 'true' : 'false');
        item.outline.hidden = item !== row;
      });
      workspace.querySelectorAll<HTMLElement>('[data-config-source], [data-config-source] > section').forEach((section) => {
        section.hidden = !section.contains(row.card);
      });
      refreshOutline();
      if (updateUrl) history.replaceState(null, '', '#config=' + row.key);
      row.card.querySelectorAll<HTMLFormElement>('form[data-redirect]').forEach((form) => {
        form.dataset.redirect = form.dataset.redirect!.split('#')[0] + '#config=' + row.key;
      });
    }
    rows.forEach((row) => row.button.addEventListener('click', () => select(row, true)));
    search.addEventListener('input', () => {
      const query = search.value.trim().toLowerCase();
      rows.forEach((row) => { row.row.hidden = !row.searchable.includes(query); });
      Array.from(tree.querySelectorAll<HTMLDetailsElement>('details')).reverse().forEach((group) => {
        group.hidden = !rows.some((row) => group.contains(row.row) && !row.row.hidden);
        if (query) group.open = true;
      });
      empty.hidden = rows.some((row) => !row.row.hidden);
    });
    function markDirty(event: Event): void {
      if (!(event.target as HTMLElement).closest('[data-config-form]')) return;
      const card = (event.target as HTMLElement).closest<HTMLDetailsElement>('.plugin-card');
      if (card) {
        dirty.add(card);
        const row = rows.find((item) => item.card === card)!;
        row.button.textContent = card.querySelector('summary > span')!.textContent + ' (unsaved)';
      }
    }
    workspace.addEventListener('input', markDirty);
    workspace.addEventListener('click', (event) => {
      if ((event.target as HTMLElement).closest('[data-remove-row],[data-add-array-item],[data-add-record-row]')) markDirty(event);
    });
    workspace.addEventListener('change', () => queueMicrotask(refreshOutline));
    workspace.addEventListener('vault:saved', (event) => {
      const form = event.target as HTMLFormElement;
      const card = form.closest<HTMLDetailsElement>('.plugin-card');
      if (card && form.matches('[data-config-form]')) {
        dirty.delete(card);
        rows.find((row) => row.card === card)!.button.textContent = card.querySelector('summary > span')!.textContent;
      }
    });
    window.addEventListener('beforeunload', (event) => {
      if (dirty.size) { event.preventDefault(); event.returnValue = ''; }
    });
    const fromHash = () => select(rows.find((row) => '#config=' + row.key === location.hash) ?? rows.find((row) => row.category) ?? rows[0]);
    window.addEventListener('hashchange', fromHash);
    sidebar.hidden = false;
    workspace.classList.add('config-explorer-ready');
    empty.hidden = rows.length > 0;
    fromHash();
  });
}
