// Simulation controller. Weather estimates are not on-site safety sensors.
(function (root) {
  const saturation = (t) => 6.112 * Math.exp(17.67 * t / (t + 243.5));
  function decide(inside, outside, ranges, previous = {}, now = Date.now(), targets = {}) {
    const goals = { temperature: (ranges.temp[0] + ranges.temp[1]) / 2,
      humidity: Math.round((ranges.humidity[0] + ranges.humidity[1]) / 2),
      co2: Math.round((ranges.co2[0] + ranges.co2[1]) / 2) };
    const limits = { temperature: ranges.temp, humidity: ranges.humidity, co2: ranges.co2 };
    for (const key of ['temperature', 'humidity']) {
      if (!Number.isFinite(targets[key])) continue;
      goals[key] = targets[key];
      const margin = key === 'temperature' ? 1 : 3;
      limits[key] = [goals[key] - margin, goals[key] + margin];
    }
    const demand = {};
    for (const key of Object.keys(goals)) {
      const old = previous[key];
      if (inside[key] === goals[key]) continue;
      if (old === 'high' && inside[key] > goals[key]) demand[key] = old;
      else if (old === 'low' && inside[key] < goals[key]) demand[key] = old;
      else if (inside[key] >= limits[key][1]) demand[key] = 'high';
      else if (inside[key] <= limits[key][0]) demand[key] = 'low';
    }
    const valid = outside && ['temperature', 'humidity', 'wind', 'gust', 'rain', 'time'].every(k => Number.isFinite(outside[k]));
    const stale = !valid || now - outside.time > 30 * 60 * 1000 || outside.time > now + 60000;
    let block = stale ? '외부 기상 정보 없음 또는 30분 경과' :
      outside.rain > 0 ? '강수 감지' : outside.wind >= 8 || outside.gust >= 12 ? '강풍·돌풍 감지' :
      outside.temperature < ranges.temp[0] - 5 ? '외기 저온' : '';
    const equivalentHumidity = valid ? outside.humidity * saturation(outside.temperature) / saturation(inside.temperature) : NaN;
    const cooling = demand.temperature === 'high' && outside.temperature < inside.temperature - 0.3 && equivalentHumidity <= Math.max(ranges.humidity[1], goals.humidity + 3);
    const warming = demand.temperature === 'low' && outside.temperature > inside.temperature + 0.3 && equivalentHumidity <= Math.max(ranges.humidity[1], goals.humidity + 3);
    const drying = demand.humidity === 'high' && equivalentHumidity < inside.humidity - 3 && outside.temperature >= ranges.temp[0] && outside.temperature <= ranges.temp[1];
    const purge = demand.co2 === 'high' && outside.temperature >= ranges.temp[0] && outside.temperature <= ranges.temp[1] && equivalentHumidity >= ranges.humidity[0] && equivalentHumidity <= ranges.humidity[1];
    const ventilate = !block && (cooling || warming || (demand.temperature !== 'low' && (drying || purge)));
    const opening = ventilate ? (outside.wind >= 4 ? 20 : 60) : 0;
    return { goals, demand, opening, fan: ventilate && outside.wind < 1.5,
      cooling: ventilate && cooling, warming: ventilate && warming, drying: ventilate && drying, purge: ventilate && purge,
      equivalentHumidity, block,
      reason: block ? `${block}: 창문 닫힘` : ventilate ? `${cooling ? '외기 냉방 우선' : warming ? '외기 난방 우선' : drying ? '외기 제습 우선' : 'CO2 배출'} · ${outside.wind < 1.5 ? '배기팬 보조' : '자연 환기'}` :
        Object.keys(demand).length ? '외기 유입 이점 없음 · 내부 장치 조절' : '목표 회복 · 절전 감시' };
  }
  root.SmartVentilation = { decide, saturation };
  if (typeof module !== 'undefined') module.exports = root.SmartVentilation;
})(typeof window === 'undefined' ? globalThis : window);
