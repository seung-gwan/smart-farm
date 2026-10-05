const assert = require('node:assert/strict');
const { chromium } = require('playwright');
(async () => {
 const browser = await chromium.launch({channel: 'chrome', headless: true});
 try {
  const page = await browser.newPage();
  await page.goto('http://127.0.0.1:8765/dashboard.html');
  await page.evaluate(() => {
    clearInterval(controlTimer); controlTimer = null;
    outdoor.rain = 1;
    sensors = {...sensors, temperature: 22, humidity: 65, co2: 700};
  });
  const setSlider = async (id, value) => page.locator(id).evaluate((element, value) => {
    element.value = value;
    element.dispatchEvent(new Event('input', {bubbles: true}));
  }, value);
  await setSlider('#tempSlider', 28);
  await setSlider('#humiditySlider', 80);
  await page.getByRole('button', {name: '자동 조절 실행', exact: true}).click();
  const result = await page.evaluate(() => {
    clearInterval(controlTimer); controlTimer = null;
    for (let i = 0; i < 60; i++) applyAutomaticControl();
    return {t: sensors.temperature, h: sensors.humidity, off: ['ac1', 'heater1', 'dry1', 'humid1'].every(id => !devices.find(d => d.id === id).on), shared: devices.every(d => d.targetTemp === 28 && d.targetHumidity === 80)};
  });
  assert.deepEqual(result, {t: 28, h: 80, off: true, shared: true});
  await setSlider('#tempSlider', 19);
  await setSlider('#humiditySlider', 55);
  assert.equal(await page.evaluate(() => correctionStates.temperature), 'high');
  const next = await page.evaluate(() => {
    for (let i = 0; i < 60; i++) applyAutomaticControl();
    sensors.temperature = 19.5;
    sensors.humidity = 57;
    applyAutomaticControl();
    const idle = !devices.find(d => d.id === 'ac1').on && !devices.find(d => d.id === 'dry1').on;
    sensors.temperature = 20.2;
    sensors.humidity = 59;
    applyAutomaticControl();
    return {idle, cooling: devices.find(d => d.id === 'ac1').on, drying: devices.find(d => d.id === 'dry1').on};
  });
  assert.deepEqual(next, {idle: true, cooling: true, drying: true});
  await page.getByRole('button', {name: '권장 목표 복원'}).click();
  assert.equal(await page.locator('#tempSlider').inputValue(), '21');
  assert.equal(await page.locator('#humiditySlider').inputValue(), '63');
  console.log('Custom goals outside crop range, common device targets, live edits, idle/restart and defaults restored: passed');
 } finally { await browser.close(); }
})().catch(error => {console.error(error); process.exitCode = 1;});
