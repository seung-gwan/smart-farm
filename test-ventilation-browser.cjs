const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const path = require('node:path');
const os = require('node:os');
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('http://127.0.0.1:8765/dashboard.html?crop=apple&variety=fuji');
    const result = await page.evaluate(() => {
      autoMode = true;
      sensors = { ...sensors, temperature: 26, humidity: 63, co2: 700, soilMoisture: 45, light: 7 };
      outdoor = { temperature: 18, humidity: 60, wind: 0.5, gust: 1, rain: 0, time: Date.now(), demo: true, source: '시험' };
      applyAutomaticControl();
      const started = windowPercent > 0 && devices.find(d => d.id === 'fan1').on;
      let ticks = 0;
      while (correctionStates.temperature && ticks++ < 1000) applyAutomaticControl();
      const target = sensors.temperature;
      const tempOff = !devices.find(d => d.id === 'ac1').on && !devices.find(d => d.id === 'heater1').on;
      sensors = { ...sensors, temperature: 21, humidity: 63, co2: 700 };
      correctionStates = {};
      applyAutomaticControl();
      const closed = windowPercent === 0 && !devices.find(d => d.id === 'fan1').on;
      sensors.temperature = 24;
      applyAutomaticControl();
      const restarted = windowPercent > 0;
      outdoor.rain = 1;
      applyAutomaticControl();
      const rainClosed = windowPercent === 0 && !devices.find(d => d.id === 'fan1').on;
      const backup = devices.find(d => d.id === 'ac1').on;
      renderAll();
      return { started, target, tempOff, closed, restarted, rainClosed, backup, ticks };
    });
    assert.equal(result.started, true);
    assert.equal(result.target, 21);
    for (const key of ['tempOff', 'closed', 'restarted', 'rainClosed', 'backup']) assert.equal(result[key], true, key);
    await page.route('https://api.open-meteo.com/**', route => route.fulfill({ json: { current: { temperature_2m: 19, relative_humidity_2m: 50, wind_speed_10m: 1, wind_gusts_10m: 2, precipitation: 0, time: Math.floor(Date.now()/1000) } } }));
    await page.locator('#weatherLat').fill('35.87');
    await page.locator('#weatherLon').fill('128.6');
    await page.getByRole('button', {name: '기상 갱신'}).click();
    await page.waitForFunction(() => !outdoor.demo);
    await page.locator('#weatherScenario').selectOption('wind');
    assert.match(await page.locator('#ventilationStatus').innerText(), /강풍/);
    const blockedCo2 = await page.evaluate(() => {
      sensors.co2 = 1100;
      const before = sensors.co2;
      applyAutomaticControl();
      return sensors.co2 === before && !devices.find(d => d.id === 'co21').on;
    });
    assert.equal(blockedCo2, true);
    await page.unroute('https://api.open-meteo.com/**');
    await page.route('https://api.open-meteo.com/**', route => route.abort());
    await page.getByRole('button', {name: '기상 갱신'}).click();
    await page.waitForFunction(() => outdoor.time === 0);
    assert.equal(await page.locator('#windowOpening').isDisabled(), true);
    for (const width of [1440, 390]) {
      await page.setViewportSize({width, height: 1000});
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `overflow ${width}`);
      await page.screenshot({path: path.join(os.tmpdir(), `smart-farm-ventilation-${width}.png`), fullPage: true});
    }
    assert.deepEqual(errors, []);
    console.log(JSON.stringify(result));
    console.log('Browser control cycle, weather form, storm cutoff and desktop/mobile layout passed');
  } finally { await browser.close(); }
})().catch(error => {console.error(error); process.exitCode = 1;});
