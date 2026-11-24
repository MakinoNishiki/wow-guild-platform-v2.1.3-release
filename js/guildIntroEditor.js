// REQ-212. Guild introductions share one restricted document format and one reader.
window.GuildIntroEditor = (() => {
  'use strict';
  const prefix = 'WB-GUILD-INTRO/1\n';
  const tags = new Set(['p','br','h3','blockquote','strong','em','ul','ol','li']);
  const aliases = { b:'strong', i:'em', div:'p' };

  function readChildren(parent) {
    const children = [];
    for (const node of parent.childNodes) {
      if (node.nodeType === Node.TEXT_NODE) {
        if (node.data) children.push(node.data);
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        const tag = aliases[node.localName] || node.localName;
        const nested = readChildren(node);
        if (tags.has(tag)) children.push([tag,...nested]);
        else children.push(...nested);
      }
    }
    return children;
  }

  function makeNode(value, depth) {
    if (typeof value === 'string') return document.createTextNode(value);
    if (!Array.isArray(value) || !tags.has(value[0]) || depth > 64) throw new Error('Unknown intro format');
    const node = document.createElement(value[0]);
    for (let i = 1; i < value.length; i++) node.append(makeNode(value[i], depth + 1));
    return node;
  }

  function render(target, stored) {
    const value = String(stored ?? '');
    target.classList.add('wb-intro-prose');
    if (value.startsWith(prefix)) {
      try {
        const blocks = JSON.parse(value.slice(prefix.length));
        if (!Array.isArray(blocks)) throw new Error('Unknown intro format');
        const content = document.createDocumentFragment();
        for (const block of blocks) content.append(makeNode(block,0));
        target.replaceChildren(content);
        return;
      } catch { /* Old free text can begin with the format marker. */ }
    }
    target.textContent = value;
  }

  function mount(host, {label = '公会介绍', id} = {}) {
    const bar = document.createElement('div');
    bar.className = 'wb-intro-toolbar';
    bar.setAttribute('role','group');
    bar.setAttribute('aria-label', label + '排版');
    const box = document.createElement('div');
    box.className = 'wb-intro-input wb-intro-prose';
    box.id = id || '';
    box.contentEditable = 'true';
    box.setAttribute('aria-label',label);
    box.setAttribute('role','textbox');
    box.setAttribute('aria-multiline','true');
    host.classList.add('wb-intro-editor');
    host.replaceChildren(bar,box);
    let savedRange = null;

    function remember() {
      const sel = window.getSelection();
      if (sel.rangeCount && box.contains(sel.anchorNode) && box.contains(sel.focusNode)) {
        savedRange = sel.getRangeAt(0).cloneRange();
      }
    }

    function run(command,value) {
      if (!box.isContentEditable) return;
      box.focus();
      if (savedRange && box.contains(savedRange.commonAncestorContainer)) {
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(savedRange);
      }
      // Native editing commands preserve the browser's editing history and IME behavior.
      document.execCommand(command,false,value);
      remember();
      syncToolbar();
    }

    const block = document.createElement('select');
    block.setAttribute('aria-label','段落样式');
    for (const [name,value] of [['正文','p'],['小标题','h3'],['引用','blockquote']]) block.add(new Option(name,value));
    bar.append(block);
    block.addEventListener('mousedown',remember);
    block.addEventListener('change',() => run('formatBlock',block.value));
    const buttons = [];
    for (const [name,mark,command,toggle] of [
      ['加粗','B','bold',true], ['斜体','I','italic',true],
      ['无序列表','• 列表','insertUnorderedList',true], ['有序列表','1. 列表','insertOrderedList',true],
      ['撤销','↶','undo',false], ['重做','↷','redo',false]
    ]) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = mark;
      button.title = name;
      button.setAttribute('aria-label',name);
      button.dataset.command = command;
      if (toggle) { button.setAttribute('aria-pressed','false'); buttons.push(button); }
      bar.append(button);
      button.addEventListener('mousedown', event => { remember(); event.preventDefault(); });
      button.addEventListener('click', () => run(command));
    }

    function syncToolbar() {
      const value = String(document.queryCommandValue('formatBlock')).toLowerCase();
      block.value = value === 'h3' || value === 'blockquote' ? value : 'p';
      for (const button of buttons) button.setAttribute('aria-pressed', String(document.queryCommandState(button.dataset.command)));
    }
    for (const event of ['keyup','mouseup','input','focusout']) {
      box.addEventListener(event, () => { remember(); syncToolbar(); });
    }
    box.addEventListener('paste', event => {
      event.preventDefault();
      const text = event.clipboardData?.getData('text/plain');
      if (text) document.execCommand('insertText',false,text);
    });
    // External drops can contain HTML or files. Keep all imported text on the plain-text paste path.
    box.addEventListener('drop', event => event.preventDefault());

    return {
      setValue(value) {
        savedRange = null;
        render(box,value);
        block.value = 'p';
        for (const button of buttons) button.setAttribute('aria-pressed','false');
      },
      getValue() {
        if (!box.textContent.trim()) return '';
        const tree = readChildren(box);
        if (tree.every(node => typeof node === 'string') && !box.textContent.startsWith(prefix)) return box.textContent;
        return prefix + JSON.stringify(tree);
      },
      setDisabled(disabled) {
        box.contentEditable = disabled ? 'false' : 'true';
        box.setAttribute('aria-disabled',String(disabled));
        for (const control of bar.children) control.disabled = disabled;
      },
      focus() { box.focus(); }
    };
  }
  return {mount,render};
})();
