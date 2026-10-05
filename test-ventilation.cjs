const assert = require('node:assert/strict');
const { decide } = require('./ventilation');
const ranges = { temp: [18, 24], humidity: [55, 70], co2: [500, 900] };
const inside = { temperature: 26, humidity: 65, co2: 700 };
const weather = { temperature: 18, humidity: 50, wind: 0.5, gust: 1, rain: 0, time: Date.now() };
assert.equal(decide(inside, weather, ranges).fan, true);
assert.equal(decide(inside, {...weather, wind: 2}, ranges).fan, false);
assert.equal(decide({...inside, temperature: 22}, weather, ranges, {temperature: 'high'}).opening, 60);
assert.equal(decide({...inside, temperature: 21}, weather, ranges, {temperature: 'high'}).opening, 0);
for (const bad of [{rain: 1}, {wind: 8}, {gust: 12}, {temperature: -5}, {time: 0}]) {
  assert.equal(decide(inside, {...weather, ...bad}, ranges).opening, 0);
}
assert.equal(decide(inside, {...weather, temperature: 35, humidity: 90}, ranges).opening, 0);
assert.equal(decide({...inside, temperature: 17}, weather, ranges).opening, 0);
assert.equal(decide({...inside, temperature: 22, humidity: 85}, weather, ranges).drying, true);
assert.equal(decide({...inside, temperature: 22, humidity: 85}, {...weather, temperature: 22, humidity: 95}, ranges).drying, false);
console.log('Ventilation decision scenarios passed');
