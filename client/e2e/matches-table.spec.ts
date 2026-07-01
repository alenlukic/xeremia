import { test, expect, type Page } from '@playwright/test';

const MOCK_WEIGHTS = {
  raw_weights: { BPM: 10, CAMELOT: 10, ENERGY: 10, SPECTRAL: 10, FRESHNESS: 10, GENRE: 10, MOOD: 10, INSTRUMENTS: 10, VOCALS: 10 },
  effective_weights: { BPM: 10, CAMELOT: 10, ENERGY: 10, SPECTRAL: 10, FRESHNESS: 10, GENRE: 10, MOOD: 10, INSTRUMENTS: 10, VOCALS: 10 },
  raw_sum: 90, target_sum: 100, is_sum_valid: false, message: null,
};

const MOCK_TRACK = {
  id: 1, title: 'Test Track', artist_names: ['Artist'],
  bpm: 128, key: 'C', camelot_code: '8B', genre: 'Electronic', label: 'TestLabel', energy: 0.7,
};

function makeMatch(id: number, bucket: 'same_key' | 'higher_key' | 'lower_key') {
  return {
    candidate_id: id, title: `Match ${id}`, overall_score: 80 + id, bucket,
    similarity_score: 0.8, camelot_score: 0.9, bpm_score: 0.85,
    genre_similarity_score: 0.75, freshness_score: 0.6, energy_score: 0.7,
    mood_continuity_score: 0.65, instrument_similarity_score: 0.55, vocal_clash_score: 0.5,
  };
}

const MOCK_MATCHES = [
  makeMatch(2, 'same_key'), makeMatch(3, 'same_key'), makeMatch(4, 'same_key'),
  makeMatch(5, 'higher_key'), makeMatch(6, 'lower_key'),
];

const EXPECTED_HEADERS = [
  '', 'Track', 'SCORE', 'Spectral', 'Key', 'BPM', 'Genre', 'Recency',
  'Energy (MIK)', 'Mood', 'Instruments', 'Vocals', 'DETAILS',
];

async function mockAPIs(page: Page) {
  await page.route('/api/tracks**', route => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify([MOCK_TRACK]),
  }));
  await page.route('/api/track-traits', route => route.fulfill({
    status: 200, contentType: 'application/json', body: '[]',
  }));
  await page.route('/api/weights', route => {
    if (route.request().method() === 'PUT') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_WEIGHTS) });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_WEIGHTS) });
  });
  await page.route('/api/weights/defaults', route => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_WEIGHTS.raw_weights),
  }));
  await page.route('/api/search**', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify([{ id: 1, title: 'Test Track', artist_names: ['Artist'], bpm: 128, key: 'C', camelot_code: '8B' }]),
  }));
  await page.route('/api/tracks/1/matches', route => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_MATCHES),
  }));
  await page.route('/api/admin/cache-stats', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({
      used: 5, capacity: 100, usage_ratio: 0.05, hits: 2, misses: 3,
      hit_rate: 0.4, hit_rate_numerator: 2, hit_rate_denominator: 5,
      hit_rate_basis: 'all', key_distribution: [], bpm_distribution: [],
      recent_entries: [], recent_exits: [],
    }),
  }));
}

async function selectTrackAndShowMatches(page: Page) {
  await page.goto('/');
  await page.waitForLoadState('networkidle');

  const searchInput = page.locator('.search-input');
  await searchInput.fill('Test');
  const suggestion = page.locator('.search-item').first();
  await suggestion.waitFor({ state: 'visible', timeout: 5000 });
  await suggestion.click();

  await page.locator('.matches-table thead th').first().waitFor({ state: 'visible', timeout: 5000 });
}

test.describe('Matches table interactions', () => {
  test.beforeEach(async ({ page }) => {
    await mockAPIs(page);
    await selectTrackAndShowMatches(page);
  });

  test('renders correct default header order', async ({ page }) => {
    const headers = page.locator('.matches-table thead th .th-content');
    const count = await headers.count();
    expect(count).toBe(13);
    const labels: string[] = [];
    for (let i = 0; i < count; i++) {
      labels.push((await headers.nth(i).textContent())?.trim() ?? '');
    }
    expect(labels).toEqual(EXPECTED_HEADERS);
  });

  test('column drag-reorder changes header order', async ({ page }) => {
    const headers = page.locator('.matches-table thead th');
    const source = headers.nth(4); // "Key" (0=+Set, 1=Track, 2=SCORE, 3=Spectral, 4=Key)
    const target = headers.nth(3); // "Spectral"

    const srcBox = await source.boundingBox();
    const tgtBox = await target.boundingBox();
    expect(srcBox).toBeTruthy();
    expect(tgtBox).toBeTruthy();

    const srcCenter = { x: srcBox!.x + srcBox!.width / 2, y: srcBox!.y + srcBox!.height / 2 };

    await page.mouse.move(srcCenter.x, srcCenter.y);

    const srcDraggable = source.locator('.th-content');
    const dataTransfer = await page.evaluateHandle(() => new DataTransfer());
    await srcDraggable.dispatchEvent('dragstart', { dataTransfer });
    await target.dispatchEvent('dragover', { dataTransfer });
    await target.dispatchEvent('drop', { dataTransfer });
    await srcDraggable.dispatchEvent('dragend');

    const updatedHeaders = page.locator('.matches-table thead th .th-content');
    const newLabels: string[] = [];
    const count = await updatedHeaders.count();
    for (let i = 0; i < count; i++) {
      newLabels.push((await updatedHeaders.nth(i).textContent())?.trim() ?? '');
    }
    expect(newLabels[1]).toBe('Track');
    expect(newLabels[3]).toBe('Key');
    expect(newLabels[4]).toBe('Spectral');
    expect(newLabels.length).toBe(13);
  });

  test('Track column resize changes header width', async ({ page }) => {
    const trackHeader = page.locator('.matches-table thead th').nth(1);
    const widthBefore = await trackHeader.evaluate(el => el.getBoundingClientRect().width);

    const resizer = trackHeader.locator('.col-resizer');
    const resizerBox = await resizer.boundingBox();
    expect(resizerBox).toBeTruthy();

    const startX = resizerBox!.x + resizerBox!.width / 2;
    const startY = resizerBox!.y + resizerBox!.height / 2;
    const dragDelta = 60;

    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX + dragDelta, startY, { steps: 5 });
    await page.mouse.up();

    const widthAfter = await trackHeader.evaluate(el => el.getBoundingClientRect().width);
    expect(widthAfter).toBeGreaterThan(widthBefore + 10);
  });

  test('add-to-set buttons absent when no set is active', async ({ page }) => {
    const addBtns = page.locator('.matches-table .match-action-btn');
    expect(await addBtns.count()).toBe(0);
    const headers = page.locator('.matches-table thead th');
    const count = await headers.count();
    const lastHeaderText = (await headers.nth(count - 1).locator('.th-content').textContent())?.trim();
    expect(lastHeaderText).toBe('DETAILS');
  });

  test('header and body cells remain aligned after Track resize', async ({ page }) => {
    const trackHeader = page.locator('.matches-table thead th').nth(1);
    const resizer = trackHeader.locator('.col-resizer');
    const resizerBox = await resizer.boundingBox();
    expect(resizerBox).toBeTruthy();

    const startX = resizerBox!.x + resizerBox!.width / 2;
    const startY = resizerBox!.y + resizerBox!.height / 2;

    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX + 80, startY, { steps: 5 });
    await page.mouse.up();

    const headerWidths = await page.locator('.matches-table thead th').evaluateAll(
      els => els.map(el => Math.round(el.getBoundingClientRect().width))
    );
    const firstRow = page.locator('.matches-table tbody tr').first();
    const cellWidths = await firstRow.locator('td').evaluateAll(
      els => els.map(el => Math.round(el.getBoundingClientRect().width))
    );

    expect(headerWidths.length).toBe(cellWidths.length);
    for (let i = 0; i < headerWidths.length; i++) {
      expect(Math.abs(headerWidths[i] - cellWidths[i])).toBeLessThanOrEqual(2);
    }
  });

  test('overflow top-scrollbar syncs with table wrapper', async ({ browser }) => {
    // Launch with a narrow viewport from the start to guarantee horizontal overflow
    const context = await browser.newContext({ viewport: { width: 600, height: 720 } });
    const page = await context.newPage();
    await mockAPIs(page);
    await selectTrackAndShowMatches(page);

    const topScroll = page.locator('.track-table-top-scrollbar');
    const wrapper = page.locator('.track-table-wrapper');

    // The top-scrollbar is conditionally rendered; wait for it to enter the DOM
    await topScroll.waitFor({ state: 'attached', timeout: 5000 });

    // On macOS overlay scrollbar mode the element may have 0 rendered height.
    // Force it to be scrollable by giving it an explicit min-height so Playwright
    // can interact with it, or just drive it via JS evaluate.
    await topScroll.evaluate(el => { (el as HTMLElement).style.minHeight = '12px'; });
    await page.waitForTimeout(100);

    // Scroll the top scrollbar → wrapper should sync
    await topScroll.evaluate(el => { el.scrollLeft = 100; });
    await page.waitForTimeout(200);
    const wrapperScrollLeft = await wrapper.evaluate(el => el.scrollLeft);
    expect(wrapperScrollLeft).toBeGreaterThan(0);

    // Scroll the wrapper → top scrollbar should sync
    await wrapper.evaluate(el => { el.scrollLeft = 50; });
    await page.waitForTimeout(200);
    const topScrollLeft = await topScroll.evaluate(el => el.scrollLeft);
    expect(topScrollLeft).toBe(50);

    await context.close();
  });
});
