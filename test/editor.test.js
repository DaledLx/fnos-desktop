const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { _electron } = require('playwright-core');

test('account dialogs stay above the NAS view and restore it on close', { skip: process.platform !== 'win32' }, async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'fnos-editor-'));
  const server = http.createServer((_request, response) => response.end('<h1>NAS</h1>'));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const app = await _electron.launch({
    executablePath: require('electron'),
    args: ['.', `--user-data-dir=${directory}`]
  });
  t.after(async () => {
    await app.close();
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(directory, { recursive: true, force: true });
  });
  const page = await app.firstWindow();
  const windowSize = await app.evaluate(({ BrowserWindow, screen }) => ({
    size: BrowserWindow.getAllWindows()[0].getSize(),
    workArea: screen.getPrimaryDisplay().workAreaSize
  }));
  assert.deepEqual(windowSize.size, [
    Math.min(1600, Math.max(760, Math.floor(windowSize.workArea.width * 0.92))),
    Math.min(960, Math.max(520, Math.floor(windowSize.workArea.height * 0.92)))
  ]);
  const viewVisible = () => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].contentView.children[0]?.getVisible());
  async function waitForView(expected) {
    for (let attempt = 0; attempt < 30; attempt++) {
      if (await viewVisible() === expected) return;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    assert.equal(await viewVisible(), expected);
  }

  await page.locator('#add').click();
  await page.locator('#name').fill('测试账号');
  await page.locator('#url').fill(`http://127.0.0.1:${server.address().port}`);
  await page.locator('#save').click();
  await waitForView(true);

  await page.locator('#edit').click();
  await page.locator('#editor').waitFor({ state: 'visible' });
  await waitForView(false);
  await page.locator('#name').fill('已修改');
  await page.locator('#cancel').click();
  await waitForView(true);

  await page.locator('#add').click();
  await page.locator('#editor').waitFor({ state: 'visible' });
  await waitForView(false);
  await page.keyboard.press('Escape');
  await waitForView(true);

  await page.locator('#edit').click();
  await page.locator('#name').fill('已修改');
  await page.locator('#save').click();
  await waitForView(true);
  assert.equal(await page.locator('.profile.active .profile-name').innerText(), '已修改');
});
