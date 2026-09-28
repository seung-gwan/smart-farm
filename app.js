const BASE_CROPS = window.SMART_FARM_CROPS || [];
const CUSTOM_KEY = "smart-farm-custom-crops";

function readCustomCrops() {
  try {
    return JSON.parse(localStorage.getItem(CUSTOM_KEY) || "[]");
  } catch {
    return [];
  }
}

function getAllCrops() {
  const merged = BASE_CROPS.map((crop) => ({
    ...crop,
    varieties: [...(crop.varieties || [])],
  }));

  readCustomCrops().forEach((crop) => {
    const existing = merged.find((item) => item.id === crop.id);
    if (existing) {
      existing.varieties = [...existing.varieties, ...(crop.varieties || [])];
      existing.summary = existing.summary || crop.summary;
      return;
    }

    merged.push({
      ...crop,
      varieties: [...(crop.varieties || [])],
    });
  });

  return merged;
}

function getParam(name) {
  return new URLSearchParams(window.location.search).get(name);
}

function getSelection() {
  const crops = getAllCrops();
  const cropId = getParam("crop") || "apple";
  const varietyId = getParam("variety") || "fuji";
  const family = crops.find((crop) => crop.id === cropId) || crops[0];
  const variety = family.varieties.find((item) => item.id === varietyId) || family.varieties[0] || crops[0].varieties[0];
  return { family, variety };
}

const { family: selectedFamily, variety: selectedCrop } = getSelection();

const devices = [
  { id: "ac1", name: "1번 에어컨", type: "냉방", icon: "assets/device-ac.svg", on: false, targetTemp: 22, targetHumidity: 65 },
  { id: "heater1", name: "2번 히터", type: "난방", icon: "assets/device-heater.svg", on: false, targetTemp: 22, targetHumidity: 65 },
  { id: "fan1", name: "3번 환풍기", type: "환기", icon: "assets/device-fan.svg", on: false, targetTemp: 22, targetHumidity: 65 },
  { id: "pump1", name: "관수 펌프", type: "급수", icon: "assets/device-pump.svg", on: false, targetTemp: 22, targetHumidity: 65 },
  { id: "humid1", name: "가습기", type: "습도", icon: "assets/device-humidity.svg", on: false, targetTemp: 22, targetHumidity: 65 },
  { id: "light1", name: "LED 조명", type: "광량", icon: "assets/device-light.svg", on: false, targetTemp: 22, targetHumidity: 65 },
  { id: "co21", name: "CO2 공급기", type: "가스", icon: "assets/device-co2.svg", on: false, targetTemp: 22, targetHumidity: 65 },
];

const SENSOR_KEYS = ["temperature", "humidity", "soilMoisture", "co2", "light"];
const AUTO_DEVICE_IDS = ["ac1", "heater1", "fan1", "pump1", "humid1", "light1", "co21"];
const TICK_MS = 1100;
const CODEX_BRIDGE_URL = "http://127.0.0.1:8765";

let selectedDeviceId = devices[0].id;
let autoMode = false;
let simulationRunning = false;
let controlTimer = null;
let driftPlan = {};
let nextDriftChange = 0;
let tickCount = 0;
let lastAutoStates = {};
let correctionStates = {};
let uploadedPhotoDataUrl = "";

let sensors = {
  temperature: selectedCrop.temp[0] + 1.8,
  humidity: selectedCrop.humidity[0] + 8,
  soilMoisture: selectedCrop.soilMoisture[0] + 7,
  co2: selectedCrop.co2[0] + 110,
  soilPh: selectedCrop.soilPh[0] + (selectedCrop.soilPh[1] - selectedCrop.soilPh[0]) / 2,
  light: selectedCrop.light[0] + 0.7,
};

const elements = {
  metricGrid: document.querySelector("#metricGrid"),
  deviceList: document.querySelector("#deviceList"),
  selectedDeviceName: document.querySelector("#selectedDeviceName"),
  selectedToggle: document.querySelector("#selectedToggle"),
  currentTemp: document.querySelector("#currentTemp"),
  currentHumidity: document.querySelector("#currentHumidity"),
  currentSoil: document.querySelector("#currentSoil"),
  currentCo2: document.querySelector("#currentCo2"),
  targetTemp: document.querySelector("#targetTemp"),
  targetHumidity: document.querySelector("#targetHumidity"),
  targetSoil: document.querySelector("#targetSoil"),
  targetCo2: document.querySelector("#targetCo2"),
  tempSlider: document.querySelector("#tempSlider"),
  humiditySlider: document.querySelector("#humiditySlider"),
  tempOutput: document.querySelector("#tempOutput"),
  humidityOutput: document.querySelector("#humidityOutput"),
  runAutomation: document.querySelector("#runAutomation"),
  simulateProblem: document.querySelector("#simulateProblem"),
  cropTitle: document.querySelector("#cropTitle"),
  cropInfo: document.querySelector("#cropInfo"),
  actionLog: document.querySelector("#actionLog"),
  farmMode: document.querySelector("#farmMode"),
  farmHeadline: document.querySelector("#farmHeadline"),
  farmSummary: document.querySelector("#farmSummary"),
  healthScore: document.querySelector("#healthScore"),
  cropPhoto: document.querySelector("#cropPhoto"),
  photoPreview: document.querySelector("#photoPreview"),
  analyzePhoto: document.querySelector("#analyzePhoto"),
  diagnosisResult: document.querySelector("#diagnosisResult"),
  codexStatus: document.querySelector("#codexStatus"),
  backToVarieties: document.querySelector("#backToVarieties"),
};

function inRange(value, range) {
  return value >= range[0] && value <= range[1];
}

function midpoint(range) {
  return Math.round(((range[0] + range[1]) / 2) * 10) / 10;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function renderDiagnosisList(title, items) {
  if (!Array.isArray(items) || items.length === 0) return "";
  return `
    <section class="diagnosis-block">
      <h3>${escapeHtml(title)}</h3>
      <ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
    </section>
  `;
}

function setCodexStatus(state, label) {
  elements.codexStatus.className = `connection-status ${state}`;
  elements.codexStatus.innerHTML = `<span></span>${escapeHtml(label)}`;
}

async function checkCodexBridge() {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 1800);
  try {
    const response = await fetch(`${CODEX_BRIDGE_URL}/health`, {
      cache: "no-store",
      signal: controller.signal,
    });
    if (!response.ok) throw new Error("Bridge unavailable");
    setCodexStatus("online", "Codex 연결됨");
    return true;
  } catch {
    setCodexStatus("offline", "로컬 연결 필요");
    return false;
  } finally {
    window.clearTimeout(timeout);
  }
}

function approach(current, target, step) {
  if (Math.abs(current - target) <= step) return target;
  return current + Math.sign(target - current) * step;
}

function statusFor(value, range) {
  if (inRange(value, range)) return "ok";
  const span = range[1] - range[0];
  if (value >= range[0] - span * 0.25 && value <= range[1] + span * 0.25) return "warn";
  return "danger";
}

function getSensorConfig(key) {
  const configs = {
    temperature: {
      label: "온도",
      range: selectedCrop.temp,
      min: selectedCrop.temp[0] - 8,
      max: selectedCrop.temp[1] + 8,
      driftStep: [0.15, 0.38],
      correctionStep: 0.55,
      margin: [1.8, 4.6],
    },
    humidity: {
      label: "습도",
      range: selectedCrop.humidity,
      min: 30,
      max: 95,
      driftStep: [0.7, 1.8],
      correctionStep: 2.2,
      margin: [6, 14],
    },
    soilMoisture: {
      label: "토양 수분",
      range: selectedCrop.soilMoisture,
      min: 15,
      max: 85,
      driftStep: [0.6, 1.7],
      correctionStep: 2.4,
      margin: [6, 13],
    },
    co2: {
      label: "CO2",
      range: selectedCrop.co2,
      min: 250,
      max: 1500,
      driftStep: [18, 55],
      correctionStep: 65,
      margin: [130, 340],
    },
    light: {
      label: "광량",
      range: selectedCrop.light,
      min: 0,
      max: 16,
      driftStep: [0.15, 0.45],
      correctionStep: 0.5,
      margin: [1.2, 2.8],
    },
  };
  return configs[key];
}

function formatRange(range, unit) {
  return `${range[0]}-${range[1]}${unit}`;
}

function addLog(message) {
  const time = new Date().toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
  const item = document.createElement("li");
  item.textContent = `${time} · ${message}`;
  elements.actionLog.prepend(item);
  while (elements.actionLog.children.length > 8) {
    elements.actionLog.removeChild(elements.actionLog.lastElementChild);
  }
}

function setDeviceOn(deviceId, on) {
  const device = devices.find((item) => item.id === deviceId);
  if (device) device.on = on;
}

function setAutoDevicesIdle() {
  AUTO_DEVICE_IDS.forEach((deviceId) => setDeviceOn(deviceId, false));
}

function targetForSensor(key) {
  const target = midpoint(getSensorConfig(key).range);
  return key === "temperature" ? target : Math.round(target);
}

function targetToleranceForSensor(key) {
  return key === "temperature" ? 0.05 : 0.5;
}

function sensorAtTarget(key) {
  return Math.abs(sensors[key] - targetForSensor(key)) <= targetToleranceForSensor(key);
}

function allCoreSensorsAtTarget() {
  return SENSOR_KEYS.every(sensorAtTarget);
}

function allCoreSensorsInRange() {
  return SENSOR_KEYS.every((key) => inRange(sensors[key], getSensorConfig(key).range));
}

function hasActiveCorrections() {
  return SENSOR_KEYS.some((key) => correctionStates[key]);
}

function easeDeviceTargets() {
  const targetTemp = midpoint(selectedCrop.temp);
  const targetHumidity = Math.round(midpoint(selectedCrop.humidity));
  devices.forEach((device) => {
    device.targetTemp = Math.round(approach(device.targetTemp, targetTemp, 0.4) * 10) / 10;
    device.targetHumidity = Math.round(approach(device.targetHumidity, targetHumidity, 1));
  });
}

function syncDeviceTargetsToCrop() {
  const targetTemp = midpoint(selectedCrop.temp);
  const targetHumidity = Math.round(midpoint(selectedCrop.humidity));
  devices.forEach((device) => {
    device.targetTemp = targetTemp;
    device.targetHumidity = targetHumidity;
  });
}

function metricTemplate(label, value, target, state) {
  const mark = state === "ok" ? "✓" : "!";
  const stateLabel = state === "ok" ? "정상" : state === "warn" ? "주의" : "위험";
  return `
    <article class="metric">
      <div class="metric-top">
        <span>${label}</span>
        <span class="badge ${state}" aria-label="${stateLabel}">${mark}</span>
      </div>
      <strong>${value}</strong>
      <small>${target}</small>
    </article>
  `;
}

function calculateScore() {
  const checks = [
    inRange(sensors.temperature, selectedCrop.temp),
    inRange(sensors.humidity, selectedCrop.humidity),
    inRange(sensors.soilMoisture, selectedCrop.soilMoisture),
    inRange(sensors.co2, selectedCrop.co2),
    inRange(sensors.soilPh, selectedCrop.soilPh),
    inRange(sensors.light, selectedCrop.light),
  ];
  return Math.round(58 + checks.filter(Boolean).length * 7);
}

function renderMetrics() {
  const score = calculateScore();
  const anyDeviceOn = devices.some((device) => device.on);
  const autoValue = autoMode ? (!hasActiveCorrections() && !anyDeviceOn ? "절전 감시" : "보정 중") : anyDeviceOn ? "수동 작동" : "대기";
  const autoTarget = simulationRunning ? "시뮬레이션 감시" : "센서 이상 시 자동 조절";

  const metrics = [
    {
      label: "온도",
      value: `${sensors.temperature.toFixed(1)} C`,
      target: `적정 ${formatRange(selectedCrop.temp, " C")}`,
      state: statusFor(sensors.temperature, selectedCrop.temp),
    },
    {
      label: "습도",
      value: `${Math.round(sensors.humidity)}%`,
      target: `적정 ${formatRange(selectedCrop.humidity, "%")}`,
      state: statusFor(sensors.humidity, selectedCrop.humidity),
    },
    {
      label: "토양 수분",
      value: `${Math.round(sensors.soilMoisture)}%`,
      target: `적정 ${formatRange(selectedCrop.soilMoisture, "%")}`,
      state: statusFor(sensors.soilMoisture, selectedCrop.soilMoisture),
    },
    {
      label: "CO2",
      value: `${Math.round(sensors.co2)} ppm`,
      target: `적정 ${formatRange(selectedCrop.co2, " ppm")}`,
      state: statusFor(sensors.co2, selectedCrop.co2),
    },
    {
      label: "토양 pH",
      value: sensors.soilPh.toFixed(1),
      target: `적정 ${formatRange(selectedCrop.soilPh, "")}`,
      state: statusFor(sensors.soilPh, selectedCrop.soilPh),
    },
    {
      label: "일조 시간",
      value: `${sensors.light.toFixed(1)} h`,
      target: `권장 ${formatRange(selectedCrop.light, " h")}`,
      state: statusFor(sensors.light, selectedCrop.light),
    },
    {
      label: "생육 상태",
      value: score >= 80 ? "양호" : score >= 65 ? "점검 필요" : "위험",
      target: `${selectedFamily.name} ${selectedCrop.name} 기준`,
      state: score >= 80 ? "ok" : score >= 65 ? "warn" : "danger",
    },
    {
      label: "자동 제어",
      value: autoValue,
      target: autoTarget,
      state: autoMode || devices.some((device) => device.on) ? "ok" : "warn",
    },
  ];

  elements.metricGrid.innerHTML = metrics.map((metric) => metricTemplate(metric.label, metric.value, metric.target, metric.state)).join("");
}

function renderDevices() {
  elements.deviceList.innerHTML = devices
    .map(
      (device) => `
      <div class="device-row ${device.id === selectedDeviceId ? "active" : ""}" data-device="${device.id}" role="button" tabindex="0">
        <img src="${device.icon}" alt="" />
        <span>
          <strong>${device.name}</strong>
          <small>${device.type} · ${device.on ? "켜짐" : "꺼짐"}</small>
        </span>
        <button class="mini-toggle ${device.on ? "on" : ""}" data-toggle-device="${device.id}" type="button" aria-pressed="${device.on}" aria-label="${device.name} 전원">
          <span></span>
        </button>
      </div>
    `
    )
    .join("");
}

function renderDeviceDetail() {
  const device = devices.find((item) => item.id === selectedDeviceId);
  elements.selectedDeviceName.textContent = device.name;
  elements.selectedToggle.classList.toggle("on", device.on);
  elements.selectedToggle.setAttribute("aria-pressed", String(device.on));
  elements.currentTemp.textContent = `${sensors.temperature.toFixed(1)} C`;
  elements.currentHumidity.textContent = `${Math.round(sensors.humidity)}%`;
  elements.currentSoil.textContent = `${Math.round(sensors.soilMoisture)}%`;
  elements.currentCo2.textContent = `${Math.round(sensors.co2)} ppm`;
  elements.targetTemp.textContent = `적정 ${formatRange(selectedCrop.temp, " C")}`;
  elements.targetHumidity.textContent = `적정 ${formatRange(selectedCrop.humidity, "%")}`;
  elements.targetSoil.textContent = `적정 ${formatRange(selectedCrop.soilMoisture, "%")}`;
  elements.targetCo2.textContent = `적정 ${formatRange(selectedCrop.co2, " ppm")}`;
  elements.tempSlider.value = device.targetTemp;
  elements.humiditySlider.value = device.targetHumidity;
  elements.tempOutput.value = `${device.targetTemp} C`;
  elements.humidityOutput.value = `${device.targetHumidity}%`;
}

function renderCropInfo() {
  elements.cropTitle.textContent = `${selectedFamily.name} ${selectedCrop.name} 재배 기준`;
  elements.cropInfo.innerHTML = `
    <article class="crop-info-item">
      <span>관리 품종</span>
      <strong>${selectedFamily.name} · ${selectedCrop.name}</strong>
      <p>${selectedCrop.alias || selectedFamily.group}</p>
    </article>
    <article class="crop-info-item">
      <span>온도</span>
      <strong>${formatRange(selectedCrop.temp, " C")}</strong>
      <p>${selectedCrop.notes}</p>
    </article>
    <article class="crop-info-item">
      <span>습도</span>
      <strong>${formatRange(selectedCrop.humidity, "%")}</strong>
      <p>습도 편차가 크면 병해 위험이 높아집니다.</p>
    </article>
    <article class="crop-info-item">
      <span>토양</span>
      <strong>pH ${formatRange(selectedCrop.soilPh, "")}</strong>
      <p>토양수분 ${formatRange(selectedCrop.soilMoisture, "%")} 기준</p>
    </article>
    <article class="crop-info-item">
      <span>광량</span>
      <strong>${formatRange(selectedCrop.light, " h")}</strong>
      <p>부족하면 LED 조명 또는 차광막 설정을 조정합니다.</p>
    </article>
    <article class="crop-info-item">
      <span>심는 날짜</span>
      <strong>${selectedCrop.planting}</strong>
      <p>지역과 품종에 따라 실제 일정은 보정합니다.</p>
    </article>
  `;
}

function renderHeadline() {
  const score = calculateScore();
  elements.healthScore.textContent = score;
  elements.farmMode.textContent = `${selectedFamily.group} · ${selectedCrop.alias || "품종 관리"}`;
  elements.farmHeadline.textContent = `${selectedFamily.name} ${selectedCrop.name} 생육 환경 관리 중`;
  elements.backToVarieties.href = `varieties.html?crop=${encodeURIComponent(selectedFamily.id)}`;

  if (simulationRunning && autoMode) {
    elements.farmSummary.textContent = "시뮬레이션 값이 계속 변하고 있습니다. 허용 범위를 벗어난 항목만 장치가 켜지고 목표값에 도달하면 꺼집니다.";
  } else if (simulationRunning) {
    elements.farmSummary.textContent = "문제 상황 시뮬레이션이 실행 중입니다. 온도, 습도, 토양 수분, CO2 중 일부 값이 서서히 변합니다.";
  } else if (autoMode) {
    elements.farmSummary.textContent = "자동 제어가 절전 감시 중입니다. 허용 범위 안에서는 장치를 꺼두고, 범위를 벗어나면 목표값까지 보정합니다.";
  } else if (score >= 85) {
    elements.farmSummary.textContent = "현재 주요 센서 값이 적정 범위에 가깝습니다. 자동 제어는 대기 상태입니다.";
  } else if (score >= 70) {
    elements.farmSummary.textContent = "일부 환경값이 기준을 벗어났습니다. 자동 조절을 실행하면 연결 장치가 반응합니다.";
  } else {
    elements.farmSummary.textContent = "온실 환경이 불안정합니다. 자동 조절을 실행해 장치를 보정하세요.";
  }
}

function renderControlButtons() {
  elements.runAutomation.textContent = autoMode ? "자동 조절 중지" : "자동 조절 실행";
  elements.runAutomation.classList.toggle("primary", !autoMode);
  elements.simulateProblem.textContent = simulationRunning ? "시뮬레이션 중지" : "문제 상황 시뮬레이션";
}

function renderAll() {
  renderMetrics();
  renderDevices();
  renderDeviceDetail();
  renderCropInfo();
  renderHeadline();
  renderControlButtons();
}

function toggleDevice(deviceId) {
  const device = devices.find((item) => item.id === deviceId);
  if (!device) return;
  selectedDeviceId = device.id;
  device.on = !device.on;
  addLog(`${device.name}을 ${device.on ? "켰습니다" : "껐습니다"}.`);
  renderAll();
}

function chooseDriftPlan() {
  const count = Math.floor(randomBetween(2, 4.99));
  const shuffled = [...SENSOR_KEYS].sort(() => Math.random() - 0.5);
  driftPlan = {};

  shuffled.slice(0, count).forEach((key) => {
    const config = getSensorConfig(key);
    const high = Math.random() > 0.5;
    const margin = randomBetween(config.margin[0], config.margin[1]);
    const target = high ? config.range[1] + margin : config.range[0] - margin;
    driftPlan[key] = {
      target: clamp(target, config.min, config.max),
      step: randomBetween(config.driftStep[0], config.driftStep[1]),
    };
  });

  nextDriftChange = tickCount + Math.floor(randomBetween(7, 13));
}

function applySimulationDrift() {
  if (!simulationRunning) return;
  if (tickCount >= nextDriftChange || Object.keys(driftPlan).length === 0) {
    chooseDriftPlan();
  }

  Object.entries(driftPlan).forEach(([key, plan]) => {
    const config = getSensorConfig(key);
    const jitter = randomBetween(-plan.step * 0.25, plan.step * 0.25);
    sensors[key] = clamp(approach(sensors[key], plan.target, plan.step + jitter), config.min, config.max);
  });
}

function updateAutoState(key, state, message) {
  if (lastAutoStates[key] !== state) {
    lastAutoStates[key] = state;
    if (message) addLog(message);
  }
}

function correctSensorValue(key) {
  const config = getSensorConfig(key);
  const value = sensors[key];
  const target = targetForSensor(key);
  const activeDirection = correctionStates[key];

  if (activeDirection) {
    if (sensorAtTarget(key)) {
      sensors[key] = target;
      delete correctionStates[key];
      return "target";
    }

    sensors[key] = clamp(approach(value, target, config.correctionStep), config.min, config.max);
    if (sensorAtTarget(key)) {
      sensors[key] = target;
      delete correctionStates[key];
      return "target";
    }
    return activeDirection;
  }

  if (value > config.range[1]) {
    correctionStates[key] = "high";
    sensors[key] = clamp(approach(value, target, config.correctionStep), config.min, config.max);
    if (sensorAtTarget(key)) {
      sensors[key] = target;
      delete correctionStates[key];
      return "target";
    }
    return "high";
  }

  if (value < config.range[0]) {
    correctionStates[key] = "low";
    sensors[key] = clamp(approach(value, target, config.correctionStep), config.min, config.max);
    if (sensorAtTarget(key)) {
      sensors[key] = target;
      delete correctionStates[key];
      return "target";
    }
    return "low";
  }

  return "idle";
}

function applyAutomaticControl() {
  if (!autoMode) return;
  easeDeviceTargets();
  let activeCorrection = false;

  const tempState = correctSensorValue("temperature");
  if (tempState === "high") {
    activeCorrection = true;
    setDeviceOn("ac1", true);
    setDeviceOn("heater1", false);
    setDeviceOn("fan1", true);
    updateAutoState("temperature", "high", "온도가 목표값보다 높아 에어컨과 환풍기를 켜고 목표 온도로 낮추는 중입니다.");
  } else if (tempState === "low") {
    activeCorrection = true;
    setDeviceOn("heater1", true);
    setDeviceOn("ac1", false);
    updateAutoState("temperature", "low", "온도가 목표값보다 낮아 히터를 켜고 목표 온도로 올리는 중입니다.");
  } else {
    setDeviceOn("ac1", false);
    setDeviceOn("heater1", false);
    updateAutoState("temperature", tempState, tempState === "target" ? "온도가 목표값에 도달해 냉난방 장치를 대기 상태로 전환했습니다." : "");
  }

  const humidityState = correctSensorValue("humidity");
  if (humidityState === "high") {
    activeCorrection = true;
    setDeviceOn("fan1", true);
    setDeviceOn("humid1", false);
    updateAutoState("humidity", "high", "습도가 목표값보다 높아 환풍기를 켜고 습도를 낮추는 중입니다.");
  } else if (humidityState === "low") {
    activeCorrection = true;
    setDeviceOn("humid1", true);
    updateAutoState("humidity", "low", "습도가 목표값보다 낮아 가습기를 켜고 습도를 올리는 중입니다.");
  } else {
    setDeviceOn("humid1", false);
    updateAutoState("humidity", humidityState, humidityState === "target" ? "습도가 목표값에 도달해 습도 장치를 대기 상태로 전환했습니다." : "");
  }

  const soilState = correctSensorValue("soilMoisture");
  if (soilState === "low") {
    activeCorrection = true;
    setDeviceOn("pump1", true);
    updateAutoState("soilMoisture", "low", "토양 수분이 목표값보다 낮아 관수 펌프를 켜고 수분을 회복하는 중입니다.");
  } else if (soilState === "high") {
    activeCorrection = true;
    setDeviceOn("pump1", false);
    updateAutoState("soilMoisture", "high", "토양 수분이 목표값보다 높아 관수 펌프를 끄고 목표값까지 서서히 낮추는 중입니다.");
  } else {
    setDeviceOn("pump1", false);
    updateAutoState("soilMoisture", soilState, soilState === "target" ? "토양 수분이 목표값에 도달해 관수 펌프를 대기 상태로 전환했습니다." : "");
  }

  const co2State = correctSensorValue("co2");
  if (co2State === "low") {
    activeCorrection = true;
    setDeviceOn("co21", true);
    updateAutoState("co2", "low", "CO2가 목표값보다 낮아 CO2 공급기를 켜고 농도를 올리는 중입니다.");
  } else if (co2State === "high") {
    activeCorrection = true;
    setDeviceOn("co21", false);
    setDeviceOn("fan1", true);
    updateAutoState("co2", "high", "CO2가 목표값보다 높아 공급기를 끄고 환풍기로 농도를 낮추는 중입니다.");
  } else {
    setDeviceOn("co21", false);
    updateAutoState("co2", co2State, co2State === "target" ? "CO2가 목표값에 도달해 가스 장치를 대기 상태로 전환했습니다." : "");
  }

  const lightState = correctSensorValue("light");
  if (lightState === "low") {
    activeCorrection = true;
    setDeviceOn("light1", true);
    updateAutoState("light", "low", "광량이 허용 범위보다 낮아 LED 조명을 켜고 목표 광량으로 올리는 중입니다.");
  } else if (lightState === "high") {
    activeCorrection = true;
    setDeviceOn("light1", false);
    updateAutoState("light", "high", "광량이 허용 범위보다 높아 LED 조명을 끄고 목표 광량까지 낮추는 중입니다.");
  } else {
    setDeviceOn("light1", false);
    updateAutoState("light", lightState, lightState === "target" ? "광량이 목표값에 도달해 LED 조명을 대기 상태로 전환했습니다." : "");
  }

  if (!activeCorrection && allCoreSensorsInRange()) {
    setAutoDevicesIdle();
    updateAutoState("power", "idle", lastAutoStates.power !== "idle" ? "Device Control을 절전 감시 상태로 전환했습니다. 값이 허용 범위를 벗어나면 다시 필요한 장치만 켜집니다." : "");
  } else {
    updateAutoState("power", "active", "");
  }
}

function controlTick() {
  tickCount += 1;
  applySimulationDrift();
  applyAutomaticControl();
  renderAll();
}

function ensureControlLoop() {
  if (!controlTimer) {
    controlTimer = window.setInterval(controlTick, TICK_MS);
  }
}

function stopControlLoopIfIdle() {
  if (!simulationRunning && !autoMode && controlTimer) {
    window.clearInterval(controlTimer);
    controlTimer = null;
  }
}

function runAutomation() {
  autoMode = !autoMode;
  if (autoMode) {
    addLog("자동 조절을 시작했습니다. 기준을 벗어난 항목은 연결 장치가 자동으로 보정합니다.");
    applyAutomaticControl();
    ensureControlLoop();
  } else {
    addLog("자동 조절을 중지했습니다. 장치는 현재 상태를 유지합니다.");
    lastAutoStates = {};
    correctionStates = {};
    stopControlLoopIfIdle();
  }
  renderAll();
}

function simulateProblem() {
  simulationRunning = !simulationRunning;
  if (simulationRunning) {
    chooseDriftPlan();
    ensureControlLoop();
    addLog("문제 상황 시뮬레이션을 시작했습니다. 일부 센서값이 서서히 랜덤하게 변합니다.");
  } else {
    driftPlan = {};
    addLog("문제 상황 시뮬레이션을 중지했습니다.");
    stopControlLoopIfIdle();
  }
  renderAll();
}

function currentDiagnosisContext() {
  return {
    crop: selectedFamily.name,
    variety: selectedCrop.name,
    alias: selectedCrop.alias || "",
    capturedAt: new Date().toISOString(),
    sensors: {
      temperatureC: Number(sensors.temperature.toFixed(1)),
      humidityPercent: Math.round(sensors.humidity),
      soilMoisturePercent: Math.round(sensors.soilMoisture),
      co2Ppm: Math.round(sensors.co2),
      soilPh: Number(sensors.soilPh.toFixed(1)),
      lightHours: Number(sensors.light.toFixed(1)),
    },
    targets: {
      temperatureC: selectedCrop.temp,
      humidityPercent: selectedCrop.humidity,
      soilMoisturePercent: selectedCrop.soilMoisture,
      co2Ppm: selectedCrop.co2,
      soilPh: selectedCrop.soilPh,
      lightHours: selectedCrop.light,
    },
  };
}

function renderCodexDiagnosis(result) {
  const statusClass = result.status === "healthy" ? "good" : result.status === "uncertain" ? "uncertain" : "warning";
  const confidence = Number.isFinite(Number(result.confidencePercent)) ? Math.round(Number(result.confidencePercent)) : 0;
  const morePhotos = result.needsMorePhotos && result.additionalPhotoGuide
    ? `<section class="diagnosis-block more-photos"><h3>추가 확인 사진</h3><p>${escapeHtml(result.additionalPhotoGuide)}</p></section>`
    : "";

  elements.diagnosisResult.className = `diagnosis-result ${statusClass}`;
  elements.diagnosisResult.innerHTML = `
    <div class="diagnosis-title-row">
      <div>
        <small>${escapeHtml(result.affectedPart || "부위 확인 필요")}</small>
        <strong>${escapeHtml(result.likelyDiagnosis || "판단 보류")}</strong>
      </div>
      <span class="confidence">가능성 ${confidence}%</span>
    </div>
    <p class="diagnosis-summary">${escapeHtml(result.summary || "사진만으로 상태를 판단하기 어렵습니다.")}</p>
    ${renderDiagnosisList("사진에서 확인한 근거", result.evidence)}
    ${renderDiagnosisList("생육 환경 분석", result.environmentAssessment)}
    ${renderDiagnosisList("지금 해야 할 조치", result.immediateActions)}
    ${renderDiagnosisList("재발 예방", result.prevention)}
    ${renderDiagnosisList("다른 가능성", result.alternativeDiagnoses)}
    ${morePhotos}
    <p class="diagnosis-disclaimer">${escapeHtml(result.disclaimer || "사진 기반 선별 결과이므로 현장 전문가의 확인이 필요합니다.")}</p>
  `;
}

async function analyzePhoto() {
  const hasPhoto = elements.cropPhoto.files && elements.cropPhoto.files.length > 0;
  elements.diagnosisResult.className = "diagnosis-result";

  if (!hasPhoto) {
    elements.diagnosisResult.classList.add("warning");
    elements.diagnosisResult.innerHTML = `
      <strong>사진이 필요합니다</strong>
      <p>잎이나 과실 사진을 업로드하면 현재 센서값과 함께 진단 결과를 보여줍니다.</p>
    `;
    return;
  }

  elements.analyzePhoto.disabled = true;
  elements.analyzePhoto.textContent = "Codex 분석 중...";
  elements.diagnosisResult.classList.add("loading");
  elements.diagnosisResult.innerHTML = `
    <div class="analysis-progress"><span></span><strong>사진과 생육 환경을 함께 분석하고 있습니다</strong></div>
    <p>작물의 병징과 현재 센서값을 비교하는 중입니다.</p>
  `;

  try {
    const response = await fetch(`${CODEX_BRIDGE_URL}/diagnose`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        imageDataUrl: uploadedPhotoDataUrl,
        context: currentDiagnosisContext(),
      }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.ok) {
      throw new Error(payload.error || "Codex 분석 요청에 실패했습니다.");
    }

    setCodexStatus("online", "Codex 연결됨");
    renderCodexDiagnosis(payload.result);
    addLog(`Codex 사진 분석 완료: ${payload.result.likelyDiagnosis || "판단 보류"}`);
  } catch (error) {
    setCodexStatus("offline", "로컬 연결 필요");
    elements.diagnosisResult.className = "diagnosis-result warning";
    elements.diagnosisResult.innerHTML = `
      <strong>Codex 연결기를 확인하세요</strong>
      <p>${escapeHtml(error.message || "로컬 Codex 연결기에 접속할 수 없습니다.")}</p>
      <small class="bridge-help">Smart Farm 폴더의 start-local-codex-bridge.cmd를 실행한 뒤 다시 분석하세요.</small>
    `;
  } finally {
    elements.analyzePhoto.disabled = false;
    elements.analyzePhoto.textContent = "사진 분석";
  }
}

elements.deviceList.addEventListener("click", (event) => {
  const toggle = event.target.closest("[data-toggle-device]");
  if (toggle) {
    event.stopPropagation();
    toggleDevice(toggle.dataset.toggleDevice);
    return;
  }

  const row = event.target.closest(".device-row");
  if (!row) return;
  selectedDeviceId = row.dataset.device;
  renderAll();
});

elements.deviceList.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" && event.key !== " ") return;
  const row = event.target.closest(".device-row");
  if (!row) return;
  event.preventDefault();
  selectedDeviceId = row.dataset.device;
  renderAll();
});

elements.selectedToggle.addEventListener("click", () => toggleDevice(selectedDeviceId));

elements.tempSlider.addEventListener("input", (event) => {
  const device = devices.find((item) => item.id === selectedDeviceId);
  device.targetTemp = Number(event.target.value);
  elements.tempOutput.value = `${device.targetTemp} C`;
});

elements.humiditySlider.addEventListener("input", (event) => {
  const device = devices.find((item) => item.id === selectedDeviceId);
  device.targetHumidity = Number(event.target.value);
  elements.humidityOutput.value = `${device.targetHumidity}%`;
});

elements.runAutomation.addEventListener("click", runAutomation);
elements.simulateProblem.addEventListener("click", simulateProblem);
elements.analyzePhoto.addEventListener("click", analyzePhoto);

elements.cropPhoto.addEventListener("change", () => {
  const file = elements.cropPhoto.files[0];
  if (!file) {
    uploadedPhotoDataUrl = "";
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    uploadedPhotoDataUrl = String(reader.result);
    elements.photoPreview.innerHTML = `<img src="${uploadedPhotoDataUrl}" alt="업로드한 작물 사진 미리보기" />`;
  };
  reader.readAsDataURL(file);
});

window.addEventListener("beforeunload", () => {
  if (controlTimer) window.clearInterval(controlTimer);
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.getRegistrations().then((registrations) => {
      registrations.forEach((registration) => registration.unregister());
    });
  });
}

syncDeviceTargetsToCrop();
renderAll();
checkCodexBridge();
addLog(`Smart Farm 앱을 시작했습니다. 현재 ${selectedFamily.name} ${selectedCrop.name} 품종을 관리 중입니다.`);
