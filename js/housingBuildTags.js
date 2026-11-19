// REQ-207. The work editor, owner cards and public gallery share the same author-selected tags.
window.HousingBuildTags = (() => {
  const byId = id => document.getElementById(id);
  let preset = [];
  let custom = [];
  let original = '';

  function button(text, onClick) {
    const node = document.createElement('button');
    node.type = 'button';
    node.className = 'hb-tag-choice';
    node.textContent = text;
    node.onclick = onClick;
    return node;
  }
  function refresh() {
    byId('hbPresetCount').textContent = preset.length + ' / 6';
    byId('hbCustomCount').textContent = custom.length + ' / 3';
    byId('hbPresetGroups').querySelectorAll('button').forEach(node =>
      node.setAttribute('aria-pressed', String(preset.includes(node.textContent))));
    function selected(target, list) {
      target.replaceChildren(...list.map(tag => {
        const chip = button(tag + ' ×', () => {
          list.splice(list.indexOf(tag), 1);
          byId('hbTagMessage').textContent = '';
          refresh();
          if (list === custom) byId('hbCustomInput').focus();
          else byId('hbPresetGroups').querySelector('summary').focus();
        });
        chip.setAttribute('aria-label', '移除标签 ' + tag);
        return chip;
      }));
    }
    selected(byId('hbPresetSelected'), preset);
    selected(byId('hbCustomSelected'), custom);
  }
  function addCustom() {
    const input = byId('hbCustomInput');
    const tag = input.value.trim();
    if (!tag) return true;
    const error = DecorDict.validateBuildTags(preset, [...custom, tag]);
    byId('hbTagMessage').textContent = error;
    if (error) { input.focus(); return false; }
    custom.push(tag);
    input.value = '';
    refresh();
    input.focus();
    return true;
  }
  function edit(row) {
    preset = [...(row?.preset_tags || [])];
    custom = [...(row?.custom_tags || [])];
    original = JSON.stringify([preset, custom]);
    const input = byId('hbCustomInput');
    input.value = '';
    input.oninput = () => { byId('hbTagMessage').textContent = ''; };
    input.onkeydown = event => {
      if (event.key === 'Enter' && !event.isComposing && event.keyCode !== 229) {
        event.preventDefault();
        addCustom();
      }
    };
    byId('hbCustomAdd').onclick = addCustom;
    byId('hbTagMessage').textContent = '';
    const groups = DecorDict.BUILD_TAG_GROUPS.map(group => {
      const details = document.createElement('details');
      const summary = document.createElement('summary');
      summary.textContent = group.label;
      const choices = document.createElement('div');
      choices.className = 'hb-tag-choices';
      for (const tag of group.tags) {
        choices.append(button(tag, () => {
          const index = preset.indexOf(tag);
          if (index >= 0) preset.splice(index, 1);
          else {
            const error = DecorDict.validateBuildTags([...preset, tag], custom);
            if (error) { byId('hbTagMessage').textContent = error; return; }
            preset.push(tag);
          }
          byId('hbTagMessage').textContent = '';
          refresh();
        }));
      }
      details.append(summary, choices);
      return details;
    });
    byId('hbPresetGroups').replaceChildren(...groups);
    refresh();
  }
  function changed() {
    return Boolean(original && (JSON.stringify([preset, custom]) !== original || byId('hbCustomInput').value.trim()));
  }
  function read() {
    if (!addCustom()) return null;
    return { preset_tags: [...preset], custom_tags: [...custom] };
  }
  function append(card, row) {
    const tags = [...(row.preset_tags || []), ...(row.custom_tags || [])];
    if (!tags.length) return;
    const list = document.createElement('ul');
    list.className = 'hb-work-tags';
    list.setAttribute('aria-label', '作品标签');
    for (const tag of tags) {
      const chip = document.createElement('li');
      chip.textContent = tag;
      list.append(chip);
    }
    card.append(list);
  }
  return { edit, read, changed, append };
})();
