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

// [line, column] pairs, as `rep.selStart` / `rep.selEnd` store them.
const sameRange = (a, b) =>
  a != null && b != null &&
  a[0][0] === b[0][0] && a[0][1] === b[0][1] &&
  a[1][0] === b[1][0] && a[1][1] === b[1][1];

exports.postAceInit = (hook, context) => {
  // Reading the range is synchronous on purpose: it has to happen in the same
  // tick as `getSelectedText()`, before anything is awaited.
  const getSelectionRange = () => {
    let range = null;
    context.ace.callWithAce((ace) => {
      const rep = ace.ace_getRep();
      range = [rep.selStart.slice(), rep.selEnd.slice()];
    }, 'ep_copy_paste_select_all', false);
    return range;
  };

  const replaceRange = (start, end, text) => {
    context.ace.callWithAce((ace) => {
      ace.ace_replaceRange(start, end, text);
    }, 'ep_copy_paste_select_all', true);
  };

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
    // Writing to the clipboard can take a while - the browser may still be
    // asking the user - and the selection can move while that is pending,
    // either because the user clicked elsewhere or because a collaborator
    // edited the pad. Remember the range that was copied so that the delete
    // below can never hit a different one.
    const copied = getSelectionRange();
    // Only remove the text once it is safely on the clipboard.
    if (!await writeClipboard(text)) {
      window.alert(t('ep_copy_paste_select_all.clipboardBlocked.cut',
          'Your browser did not allow this page to use the clipboard. ' +
          'Please press Ctrl+X (Cmd+X on a Mac) instead.'));
      return;
    }
    // The selection moved: the text is on the clipboard, so Cut quietly
    // degrades to Copy rather than deleting something the user did not pick.
    if (!sameRange(copied, getSelectionRange())) return;
    replaceRange(copied[0], copied[1], '');
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
