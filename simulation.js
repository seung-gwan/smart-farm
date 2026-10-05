(function (root) {
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  function step(input, weather, devices, opening, manual = true) {
    const next = { ...input };
    const on = id => Boolean(devices.find(device => device.id === id)?.on);
    const exchange = 0.002 + opening / 100 * 0.035 + (on('fan1') ? 0.025 : 0);
    const saturation = t => 6.112 * Math.exp(17.67 * t / (t + 243.5));
    const vapour = next.humidity * saturation(next.temperature);
    // Accelerated test time; not a calibrated greenhouse thermal model.
    if (Number.isFinite(weather.temperature) && Number.isFinite(weather.humidity)) {
      next.temperature += (weather.temperature - next.temperature) * exchange;
      next.humidity = (vapour + (weather.humidity * saturation(weather.temperature) - vapour) * exchange) / saturation(next.temperature);
      next.co2 += (420 - next.co2) * exchange;
    }
    next.soilMoisture -= 0.015;
    if (manual) {
      if (on('ac1')) next.temperature -= 0.35;
      if (on('heater1')) next.temperature += 0.4;
      if (on('humid1')) next.humidity += 1.4;
      if (on('dry1')) { next.humidity -= 1.6; next.temperature += 0.03; }
      if (on('pump1')) next.soilMoisture += 0.9;
      if (on('co21')) next.co2 += 35;
      if (on('light1')) { next.light += 0.02; next.temperature += 0.025; }
    }
    next.temperature = clamp(next.temperature, -30, 60);
    next.humidity = clamp(next.humidity, 1, 100);
    next.soilMoisture = clamp(next.soilMoisture, 0, 100);
    next.co2 = clamp(next.co2, 250, 5000);
    next.light = clamp(next.light, 0, 24);
    return next;
  }
  root.SmartSimulation = { step };
  if (typeof module !== 'undefined') module.exports = root.SmartSimulation;
})(typeof window === 'undefined' ? globalThis : window);
