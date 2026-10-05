const assert = require('node:assert/strict');
const {chromium} = require('playwright');
(async () => {
 const browser = await chromium.launch({channel:'chrome', headless:true});
 try {
  const page = await browser.newPage();
  await page.goto('http://127.0.0.1:8765/dashboard.html');
  const results = await page.evaluate(() => {
    clearInterval(controlTimer); controlTimer = null;
    function scenario(start, outside, goal, device) {
      setAutoDevicesIdle(); correctionStates = {}; windowPercent = 0;
      autoMode = true;
      sensors = {...sensors, temperature: start, humidity: 65, co2: 700};
      outdoor = {temperature: outside, humidity: 50, wind: 2, gust: 3, rain: 0, time: Date.now()};
      customTargets.temperature = goal;
      activateCustomTargets();
      applyClimateControl();
      const first = {open: windowPercent > 0, electric: devices.find(d => d.id === device).on};
      let switchedAt = null;
      for (let i=0;i<1200 && sensors.temperature !== goal;i++) {
        applyClimateControl();
        if (switchedAt === null && devices.find(d => d.id === device).on) switchedAt = sensors.temperature;
      }
      return {first, switchedAt, final: sensors.temperature, electric: devices.find(d => d.id === device).on, opening: windowPercent};
    }
    const cooling = scenario(30,26,22,'ac1');
    const warming = scenario(16,19,21,'heater1');
    const full = scenario(30,18,22,'ac1');
    const cold = scenario(20,-9,9,'ac1');
    outdoor.rain = 1; sensors.temperature = 30; activateCustomTargets(); applyClimateControl();
    return {cooling,warming,full,cold, rain: windowPercent === 0 && devices.find(d => d.id === 'ac1').on};
  });
  for (const entry of [results.cooling, results.warming, results.full]) {
    assert.deepEqual(entry.first, {open:true,electric:false}); assert.equal(entry.electric,false);
  }
  assert.equal(results.cooling.final,22);
  assert.ok(results.cooling.switchedAt <=26.3 && results.cooling.switchedAt >=26);
  assert.equal(results.warming.final,21);
  assert.ok(results.warming.switchedAt >=18.7 && results.warming.switchedAt <=19);
  assert.equal(results.full.switchedAt,null);
  assert.equal(results.full.final,22);
  assert.deepEqual(results.cold.first,{open:true,electric:false});
  assert.equal(results.cold.switchedAt,null);
  assert.equal(results.cold.final,9);
  assert.equal(results.cold.electric,false);
  assert.equal(results.cold.opening,0);
  assert.equal(results.rain,true);
  console.log(JSON.stringify(results));
 } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
