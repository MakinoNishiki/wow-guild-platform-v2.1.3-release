// Keep form values and keyboard interaction on the native select.
window.GuildChoiceVisuals = (() => {
  'use strict';
  const richSelect = CSS.supports('appearance','base-select') && 'HTMLSelectedContentElement' in window;

  function label(title, src, color) {
    const content = document.createElement('span');
    content.className = 'choice-visual';
    if (color) content.style.color = color;
    if (src) {
      const img = document.createElement('img');
      img.src = src;
      img.alt = '';
      content.append(img);
    }
    content.append(document.createTextNode(title));
    return content;
  }

  function decorate(select, visualFor) {
    select.classList.add('visual-select');
    const options = [...select.options];
    for (const option of options) {
      const {src,color} = visualFor(option.value);
      const title = option.text;
      option.style.color = color || '';
      if (richSelect) option.replaceChildren(label(title,src,color));
    }
    if (richSelect) {
      if (!select.querySelector('selectedcontent')) {
        const button = document.createElement('button');
        button.type = 'button';
        button.append(document.createElement('selectedcontent'));
        select.prepend(button);
      }
    } else {
      function syncMark() {
        const {src,color} = visualFor(select.value);
        select.style.color = color || '';
        select.style.setProperty('--selected-icon',src ? 'url("'+src+'")' : 'none');
        select.classList.toggle('with-selected-icon',!!src);
      }
      // Class/spec changes rebuild all three menus. Retain only their current lookup.
      if (select.syncMark) select.removeEventListener('change',select.syncMark);
      select.syncMark = syncMark;
      select.addEventListener('change',syncMark);
      syncMark();
    }
  }
  function gameMark({icon,color}) {
    return {src:icon || '',color};
  }
  function voiceMark(name) {
    return {src:Object.hasOwn(GuildVoiceBrands,name) ? GuildVoiceBrands[name] : ''};
  }
  return {label,decorate,gameMark,voiceMark};
})();
