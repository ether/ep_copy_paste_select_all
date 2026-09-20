'use strict';

// Etherpad exposes the localization helper as `window._ = html10n.get`, which
// drops the `this` binding, so `window._('key')` returns undefined. Always go
// through html10n itself. The fallback is only used when html10n has not
// loaded yet or the key is missing, so an alert never says "undefined".
const t = (key, fallback) => {
  const html10n = window.html10n;
  if (!html10n || typeof html10n.get !== 'function') return fallback;
  return html10n.get(key) || fallback;
};

// The editable document lives two iframes down from the pad page.
const getInnerWindow = () => {
  const outer = $('iframe[name="ace_outer"]')[0];
  if (!outer || !outer.contentWindow) return null;
  const inner = outer.contentWindow.document.querySelector('iframe[name="ace_inner"]');
  return inner ? inner.contentWindow : null;
};

// The editor keeps its selection when the pointer moves to the menu, so the
// text the user highlighted is still readable from the inner document here.
const getSelectedText = () => {
  const win = getInnerWindow();
  const selection = win && win.getSelection();
  return selection ? selection.toString() : '';
};

// navigator.clipboard only exists in a secure context (https:// or
// http://localhost). Everywhere else the user has to use the keyboard.
const clipboardApi = () => {
  if (!window.isSecureContext) return null;
  return navigator.clipboard || null;
};

const writeClipboard = async (text) => {
  const clipboard = clipboardApi();
  if (!clipboard || typeof clipboard.writeText !== 'function') return false;
  try {
    await clipboard.writeText(text);
    return true;
  } catch (err) {
    // Permission denied, or the document lost user activation.
    return false;
  }
};

const readClipboard = async () => {
  const clipboard = clipboardApi();
  if (!clipboard || typeof clipboard.readText !== 'function') return null;
  try {
    return await clipboard.readText();
  } catch (err) {
    // Firefox only grants readText() to extensions, and Chrome asks the user.
    return null;
  }
};

exports.postAceInit = (hook, context) => {
  const replaceSelection = (text) => {
    context.ace.callWithAce((ace) => {
      const rep = ace.ace_getRep();
      ace.ace_replaceRange(rep.selStart, rep.selEnd, text);
    }, 'ep_copy_paste_select_all', true);
  };

  $('#selectAll').on('click', (e) => {
    e.preventDefault();
    context.ace.callWithAce((ace) => {
      const rep = ace.ace_getRep();
      const lastLine = rep.lines.length() - 1;
      const lastColumn = rep.lines.atIndex(lastLine).text.length;
      ace.ace_performSelectionChange([0, 0], [lastLine, lastColumn], false);
      // Without this the new selection only exists in the internal
      // representation and the browser shows nothing as highlighted.
      ace.ace_focus();
    }, 'selectAll', true);
  });

  $('#copy').on('click', async (e) => {
    e.preventDefault();
    const text = getSelectedText();
    if (!text) return;
    if (!await writeClipboard(text)) {
      window.alert(t('ep_copy_paste_select_all.clipboardBlocked.copy',
          'Your browser did not allow this page to use the clipboard. ' +
          'Please press Ctrl+C (Cmd+C on a Mac) instead.'));
    }
  });

  $('#cut').on('click', async (e) => {
    e.preventDefault();
    const text = getSelectedText();
    if (!text) return;
    // Only remove the text once it is safely on the clipboard.
    if (!await writeClipboard(text)) {
      window.alert(t('ep_copy_paste_select_all.clipboardBlocked.cut',
          'Your browser did not allow this page to use the clipboard. ' +
          'Please press Ctrl+X (Cmd+X on a Mac) instead.'));
      return;
    }
    replaceSelection('');
  });

  $('#paste').on('click', async (e) => {
    e.preventDefault();
    const text = await readClipboard();
    if (text == null) {
      window.alert(t('ep_copy_paste_select_all.clipboardBlocked.paste',
          'Your browser did not allow this page to read the clipboard. ' +
          'Please press Ctrl+V (Cmd+V on a Mac) instead.'));
      return;
    }
    if (!text) return;
    replaceSelection(text);
  });

  $('#findAndReplace').on('click', (e) => {
    e.preventDefault();
    const from = window.prompt(t('ep_copy_paste_select_all.searchFor', 'Search for...'));
    const to = window.prompt(t('ep_copy_paste_select_all.replaceWith', 'Replace with...'));
    const HTMLLines = $('iframe[name="ace_outer"]').contents()
        .find('iframe').contents().find('#innerdocbody').children('div');
    $(HTMLLines).each(function () { // For each line
      findAndReplace(from, to, this);
    });
  });
};

const findAndReplace = (searchText, replacement, searchNode) => {
  if (!searchText || typeof replacement === 'undefined') {
    // Throw error here if you want...
    return;
  }
  const regex = typeof searchText === 'string'
    ? new RegExp(searchText, 'gi') : searchText;
  const childNodes = (searchNode || document.body).childNodes;
  let cnLength = childNodes.length;
  const excludes = ['html', 'head', 'style', 'title', 'meta', 'script', 'object', 'iframe', 'link'];

  while (cnLength--) {
    const currentNode = childNodes[cnLength];
    if (currentNode.nodeType === 1) {
      if (excludes.indexOf(currentNode.nodeName.toLowerCase()) === -1) {
        findAndReplace(searchText, replacement, currentNode);
      }
    }
    if (currentNode.nodeType !== 3 || !regex.test(currentNode.data)) {
      continue;
    }
    const parent = currentNode.parentNode;
    const frag = (() => {
      const html = currentNode.data.replace(regex, replacement);
      const wrap = document.createElement('div');
      const frag = document.createDocumentFragment();
      wrap.innerHTML = html;
      while (wrap.firstChild) {
        frag.appendChild(wrap.firstChild);
      }
      return frag;
    })();
    parent.insertBefore(frag, currentNode);
    parent.removeChild(currentNode);
  }
};
