const assert = require('node:assert/strict');
const { step } = require('./simulation');
const { chromium } = require('playwright');
const base = {temperature: 25, humidity: 65, soilMoisture: 45, co2: 900, soilPh: 6, light: 5};
const weather = {temperature: 18, humidity: 50};
const passive = step(base, weather, [], 0);
for (const [id, key, direction] of [['ac1', 'temperature', -1], ['heater1', 'temperature', 1], ['humid1', 'humidity', 1], ['dry1', 'humidity', -1], ['pump1', 'soilMoisture', 1], ['co21', 'co2', 1], ['light1', 'light', 1], ['fan1', 'temperature', -1], ['window1', 'temperature', -1]]) {
  const output = step(base, weather, [{id, on: true}], id === 'window1' ? 50 : 0);
  assert.ok((output[key] - passive[key]) * direction > 0, id);
}
assert.ok(step(base, {...weather, temperature: 35}, [], 0).temperature > base.temperature);
assert.ok(step(base, {...weather, temperature: -5}, [], 0).temperature < base.temperature);
(async () => {
 const browser = await chromium.launch({channel: 'chrome', headless: true});
 try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('http://127.0.0.1:8765/dashboard.html');
  await page.evaluate(() => { clearInterval(controlTimer); controlTimer = null; });
  const manual = await page.evaluate(() => {
    autoMode = true;
    toggleDevice('heater1');
    const switched = !autoMode;
    const before = sensors.temperature;
    controlTick();
    return {switched, warmed: sensors.temperature > before};
  });
  assert.deepEqual(manual, {switched: true, warmed: true});
  await page.locator('#weatherScenario').selectOption('rain');
  await page.locator('[data-toggle-device="window1"]').click();
  assert.equal(await page.evaluate(() => devices.find(d => d.id === 'window1').on), true);
  await page.locator('#operationMode').selectOption('live');
  assert.equal(await page.locator('#runAutomation').isDisabled(), true);
  assert.equal(await page.locator('#weatherScenario').isDisabled(), true);
  assert.equal(await page.locator('[data-toggle-device="heater1"]').isDisabled(), true);
  assert.match(await page.locator('#metricGrid').innerText(), /수신 대기/);
  await page.route('https://farm.test/readings', route => route.fulfill({ json: {measuredAt: new Date().toISOString(), sensors: {temperature: 27.3, humidity: 73}} }));
  await page.locator('#sensorUrl').fill('https://farm.test/readings');
  await page.getByRole('button', {name: '센서 연결', exact: true}).click();
  await page.waitForFunction(() => sensors.temperature === 27.3);
  const unchanged = await page.evaluate(() => {
    controlTick(); toggleDevice('ac1'); runAutomation(); simulateProblem(); applyClimateControl();
    return sensors.temperature === 27.3 && !autoMode && !simulationRunning && devices.every(d => !d.on);
  });
  assert.equal(unchanged, true);
  await page.evaluate(() => {liveTimestamp -= 20000; renderAll();});
  assert.doesNotMatch(await page.locator('#metricGrid').innerText(), /27.3/);
  await page.unroute('https://farm.test/readings');
  await page.route('https://farm.test/readings', route => route.fulfill({ json: {measuredAt: new Date().toISOString(), sensors: {temperature: 'invalid', humidity: 73}} }));
  await page.evaluate(() => pollLiveSensors());
  assert.match(await page.locator('#sensorStatus').innerText(), /오류/);
  await page.locator('#operationMode').selectOption('test');
  assert.equal(await page.locator('[data-toggle-device="heater1"]').isDisabled(), false);
  for (const width of [390, 1440]) {
    await page.setViewportSize({width, height: 1000});
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  }
  assert.deepEqual(errors, []);
  console.log('9 manual device effects, outside weather, manual takeover, live controls blocked, telemetry, stale and invalid readings, mode restore and responsive layout passed');
 } finally { await browser.close(); }
})().catch(error => {console.error(error); process.exitCode = 1;});
