import {expect, test} from '@playwright/test';
import {
  clearPadContent,
  getPadBody,
  goToNewPad,
  writeToPad,
} from 'ep_etherpad-lite/tests/frontend-new/helper/padHelper';

// The clipboard permissions below are a Chromium-only capability, and the
// async clipboard API also needs a secure context (the test server runs on
// http://localhost, which counts as one).
test.use({permissions: ['clipboard-read', 'clipboard-write']});

const openEditMenu = async (page) => {
  await page.locator('.dropdown-menu > li', {hasText: 'Edit'}).first().hover();
  await expect(page.locator('#copy')).toBeVisible();
};

// The text the user highlighted lives in the inner iframe's own selection.
const selectedText = async (page) => await page.evaluate(() => {
  const outer = document.querySelector('iframe[name="ace_outer"]') as HTMLIFrameElement;
  const inner = outer.contentWindow!.document
      .querySelector('iframe[name="ace_inner"]') as HTMLIFrameElement;
  return inner.contentWindow!.getSelection()!.toString();
});

const clipboardText = async (page) => await page.evaluate(() => navigator.clipboard.readText());

test.describe('ep_copy_paste_select_all', () => {
  test.skip(({browserName}) => browserName !== 'chromium',
      'clipboard permissions can only be granted in Chromium');

  test.beforeEach(async ({page}) => {
    await goToNewPad(page);
    await clearPadContent(page);
    await writeToPad(page, 'alpha\nbeta');
    const padBody = await getPadBody(page);
    await expect.poll(() => padBody.innerText()).toBe('alpha\nbeta');
  });

  test('Select All highlights the whole document, last line included', async ({page}) => {
    await openEditMenu(page);
    await page.locator('#selectAll').click();
    await expect.poll(() => selectedText(page)).toBe('alpha\nbeta');
  });

  test('Copy puts the selection on the clipboard instead of alerting', async ({page}) => {
    // Regression test for #1: Copy used to be an inline
    // `onClick="alert('Please use Control C to copy contents')"`.
    let dialog: string|null = null;
    page.on('dialog', async (d) => { dialog = d.message(); await d.dismiss(); });

    await openEditMenu(page);
    await page.locator('#selectAll').click();
    await openEditMenu(page);
    await page.locator('#copy').click();

    await expect.poll(() => clipboardText(page)).toBe('alpha\nbeta');
    expect(dialog).toBeNull();
  });

  test('Paste inserts the clipboard contents into the pad', async ({page}) => {
    await page.evaluate(() => navigator.clipboard.writeText('gamma'));
    await page.keyboard.press('Control+End');
    await page.keyboard.press('Enter');

    await openEditMenu(page);
    await page.locator('#paste').click();

    const padBody = await getPadBody(page);
    await expect.poll(() => padBody.innerText()).toBe('alpha\nbeta\ngamma');
  });

  test('Cut copies the selection and removes it from the pad', async ({page}) => {
    await openEditMenu(page);
    await page.locator('#selectAll').click();
    await openEditMenu(page);
    await page.locator('#cut').click();

    await expect.poll(() => clipboardText(page)).toBe('alpha\nbeta');
    const padBody = await getPadBody(page);
    await expect.poll(() => padBody.innerText()).toBe('\n');
  });

  test('menu labels come from the plugin locales, not hardcoded markup', async ({page}) => {
    // Every label must carry a data-l10n-id that core can actually resolve:
    // that proves locales/en.json is picked up and shipped to the browser.
    for (const [id, key, label] of [
      ['selectAll', 'ep_copy_paste_select_all.selectAll', 'Select All'],
      ['copy', 'ep_copy_paste_select_all.copy', 'Copy'],
      ['cut', 'ep_copy_paste_select_all.cut', 'Cut'],
      ['paste', 'ep_copy_paste_select_all.paste', 'Paste'],
      ['findAndReplace', 'ep_copy_paste_select_all.findAndReplace', 'Find and Replace'],
    ]) {
      const entry = page.locator(`#${id}`);
      await expect(entry).toHaveAttribute('data-l10n-id', key);
      expect(await entry.innerText()).toBe(label);
      expect(await page.evaluate((k) => (window as any).html10n.get(k), key)).toBe(label);
    }
  });
});
