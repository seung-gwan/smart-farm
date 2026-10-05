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
  { id: "window1", name: "온실 자동 창문", type: "개폐", icon: "assets/device-window.svg", on: false, targetTemp: 22, targetHumidity: 65 },
  { id: "dry1", name: "제습기", type: "제습", icon: "assets/device-humidity.svg", on: false, targetTemp: 22, targetHumidity: 65 },
  { id: "ac1", name: "1번 에어컨", type: "냉방", icon: "assets/device-ac.svg", on: false, targetTemp: 22, targetHumidity: 65 },
  { id: "heater1", name: "2번 히터", type: "난방", icon: "assets/device-heater.svg", on: false, targetTemp: 22, targetHumidity: 65 },
  { id: "fan1", name: "3번 환풍기", type: "환기", icon: "assets/device-fan.svg", on: false, targetTemp: 22, targetHumidity: 65 },
  { id: "pump1", name: "관수 펌프", type: "급수", icon: "assets/device-pump.svg", on: false, targetTemp: 22, targetHumidity: 65 },
  { id: "humid1", name: "가습기", type: "습도", icon: "assets/device-humidity.svg", on: false, targetTemp: 22, targetHumidity: 65 },
  { id: "light1", name: "LED 조명", type: "광량", icon: "assets/device-light.svg", on: false, targetTemp: 22, targetHumidity: 65 },
  { id: "co21", name: "CO2 공급기", type: "가스", icon: "assets/device-co2.svg", on: false, targetTemp: 22, targetHumidity: 65 },
];

const SENSOR_KEYS = ["temperature", "humidity", "soilMoisture", "co2", "light"];
const AUTO_DEVICE_IDS = devices.map(device => device.id);
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
const customTargets = {};
let outdoor = { temperature: 18, humidity: 50, wind: 2, gust: 3, rain: 0, time: Date.now(), source: '시험 날씨: 서늘·건조', demo: true };
let windowPercent = 0;
let ventDecision = null;
let weatherRequest = 0;
let weatherCoordinates = null;
let operationMode = 'test';
let liveEndpoint = '';
let liveTimestamp = 0;
let liveRequest = 0;
let liveController = null;
let liveError = '';
let savedTestSensors = null;

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

function localCodexDashboardUrl() {
  const params = new URLSearchParams({
    crop: selectedFamily.id,
    variety: selectedCrop.id,
  });
  return `${CODEX_BRIDGE_URL}/dashboard.html?${params.toString()}`;
}

function setCodexStatus(state, label) {
  elements.codexStatus.className = `connection-status ${state}`;
  elements.codexStatus.innerHTML = `<span></span>${escapeHtml(label)}`;
  elements.codexStatus.href = localCodexDashboardUrl();
  elements.codexStatus.title = state === "online" ? "로컬 Codex 연결 정상" : "로컬 Codex 진단 화면 열기";
}

async function checkCodexBridge() {
  if (window.location.protocol === "https:") {
    setCodexStatus("offline", "로컬 실행 필요");
    return false;
  }

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
  if (Number.isFinite(customTargets[key])) return customTargets[key];
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
  const targetTemp = targetForSensor('temperature');
  const targetHumidity = targetForSensor('humidity');
  devices.forEach((device) => {
    device.targetTemp = targetTemp;
    device.targetHumidity = targetHumidity;
  });
}

function climateDecision() {
  return SmartVentilation.decide(sensors, outdoor, selectedCrop, correctionStates, Date.now(), customTargets);
}

function activateCustomTargets() {
  for (const [key, target] of Object.entries(customTargets)) {
    delete correctionStates[key];
    if (sensors[key] > target) correctionStates[key] = 'high';
    if (sensors[key] < target) correctionStates[key] = 'low';
  }
}

function setCustomTarget(key, value) {
  if (operationMode !== 'test' || !Number.isFinite(value)) return;
  customTargets[key] = value;
  easeDeviceTargets();
  if (autoMode) activateCustomTargets();
  ventDecision = null;
  renderAll();
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
    elements.farmSummary.textContent = `자동 목표: ${targetForSensor('temperature')} C · ${targetForSensor('humidity')}%. ${Object.keys(customTargets).length ? '사용자 설정 우선 · 설정한 항목은 목표 도달 후 온도 ±1 C, 습도 ±3%p에서 재가동합니다.' : '허용 범위를 벗어나면 목표값까지 보정합니다.'}`;
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
  renderWeather();
  renderMetrics();
  renderDevices();
  renderDeviceDetail();
  renderCropInfo();
  renderHeadline();
  renderControlButtons();
  renderOperatingMode();
}

function liveFresh() {
  return !liveError && liveTimestamp > 0 && Date.now() - liveTimestamp < 15000;
}

function renderOperatingMode() {
  const live = operationMode === 'live';
  document.querySelector('#sensorForm').hidden = !live;
  document.querySelector('#weatherScenario').disabled = live;
  document.querySelector('#resetTargets').disabled = live;
  for (const control of [elements.runAutomation, elements.simulateProblem, elements.selectedToggle, elements.tempSlider, elements.humiditySlider]) control.disabled = live;
  document.querySelectorAll('[data-toggle-device]').forEach(button => { button.disabled = live; });
  document.querySelector('#sensorStatus').textContent = !live ? '시험 모드 · 외기와 수동 장치 효과를 모의 계산 중' :
    liveError || (liveFresh() ? `실제 센서 수신 · 측정 ${new Date(liveTimestamp).toLocaleTimeString('ko-KR')} · 3초마다 조회` : liveTimestamp ? '센서 수신 지연 · 마지막 측정값은 현재값으로 표시하지 않습니다.' : '실제 센서 수신 대기 · 센서 조회 URL을 연결하세요.');
  if (!live) return;
  const fresh = liveFresh();
  const metrics = [ ['temperature', '온도', '°C'], ['humidity', '습도', '%'], ['soilMoisture', '토양 수분', '%'], ['co2', 'CO2', 'ppm'], ['soilPh', '토양 pH', ''], ['light', '일조 시간', 'h'] ];
  const display = (key, unit) => fresh && Number.isFinite(sensors[key]) ? `${Number(sensors[key].toFixed(1))} ${unit}` : '수신 대기';
  elements.metricGrid.innerHTML = metrics.map(([key, label, unit]) => metricTemplate(label, display(key, unit), fresh && Number.isFinite(sensors[key]) ? '실제 센서 측정값' : '유효한 측정값 없음', fresh && Number.isFinite(sensors[key]) ? 'ok' : 'warn')).join('');
  elements.currentTemp.textContent = display('temperature', '°C');
  elements.currentHumidity.textContent = display('humidity', '%');
  elements.currentSoil.textContent = display('soilMoisture', '%');
  elements.currentCo2.textContent = display('co2', 'ppm');
  elements.healthScore.textContent = '--';
  elements.farmSummary.textContent = '실제 센서 조회 전용 · 시험 장치 제어 중지';
  elements.farmMode.textContent = '실제 센서 모드';
  document.querySelectorAll('.device-row small').forEach(label => { label.textContent = '실제 장치 상태 미연결'; });
  document.querySelector('#windowOutput').textContent = '상태 미수신';
}

function changeOperatingMode(mode) {
  if (!['test', 'live'].includes(mode) || mode === operationMode) return;
  liveRequest++;
  liveController?.abort();
  liveController = null;
  if (mode === 'live') savedTestSensors = { ...sensors };
  operationMode = mode;
  autoMode = false;
  simulationRunning = false;
  correctionStates = {};
  lastAutoStates = {};
  driftPlan = {};
  ventDecision = null;
  windowPercent = 0;
  setAutoDevicesIdle();
  sensors = mode === 'test' ? savedTestSensors || sensors : Object.fromEntries(Object.keys(sensors).map(key => [key, NaN]));
  liveTimestamp = 0;
  liveError = '';
  if (mode === 'test') ensureControlLoop();
  else { stopControlLoopIfIdle(); if (liveEndpoint) pollLiveSensors(); }
  renderAll();
}

async function pollLiveSensors() {
  if (operationMode !== 'live' || !liveEndpoint || liveController) return;
  const request = liveRequest;
  const controller = new AbortController();
  liveController = controller;
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch(liveEndpoint, { cache: 'no-store', signal: controller.signal, credentials: 'omit' });
    if (!response.ok) throw new Error(`센서 응답 오류 (${response.status})`);
    const payload = await response.json();
    if (request !== liveRequest || operationMode !== 'live') return;
    const timestamp = typeof payload.measuredAt === 'string' ? Date.parse(payload.measuredAt) : NaN;
    if (!Number.isFinite(timestamp) || Date.now() - timestamp >= 15000 || timestamp > Date.now() + 2000) throw new Error('센서 측정 시각이 오래되었거나 올바르지 않습니다.');
    const readings = payload.sensors;
    const bounds = {temperature: [-50, 80], humidity: [0, 100], soilMoisture: [0, 100], co2: [0, 100000], soilPh: [0, 14], light: [0, 24]};
    if (!readings || !Number.isFinite(readings.temperature) || !Number.isFinite(readings.humidity)) throw new Error('실제 온도·습도 측정값이 없습니다.');
    const next = {};
    for (const [key, range] of Object.entries(bounds)) {
      const value = readings[key];
      if (value == null && !['temperature', 'humidity'].includes(key)) { next[key] = NaN; continue; }
      if (!Number.isFinite(value) || value < range[0] || value > range[1]) throw new Error(`센서 값 확인 필요: ${key}`);
      next[key] = value;
    }
    sensors = next;
    liveTimestamp = timestamp;
    liveError = '';
  } catch (error) {
    if (request === liveRequest && operationMode === 'live') liveError = `센서 연결 오류 · ${error.message}`;
  } finally {
    clearTimeout(timeout);
    if (request === liveRequest) { liveController = null; renderAll(); }
  }
}

document.querySelector('#operationMode').addEventListener('change', event => changeOperatingMode(event.target.value));
document.querySelector('#sensorForm').addEventListener('submit', event => {
  event.preventDefault();
  if (operationMode !== 'live') return;
  const address = new URL(document.querySelector('#sensorUrl').value);
  if (!['http:', 'https:'].includes(address.protocol) || address.username || address.password) return;
  liveRequest++;
  liveController?.abort();
  liveController = null;
  liveEndpoint = address.href;
  liveTimestamp = 0;
  liveError = '';
  pollLiveSensors();
});
window.setInterval(pollLiveSensors, 3000);

function toggleDevice(deviceId) {
  if (operationMode !== 'test') return;
  const device = devices.find((item) => item.id === deviceId);
  if (!device) return;
  if (autoMode) {
    autoMode = false;
    correctionStates = {};
    ventDecision = null;
    addLog('장치 수동 제어로 전환했습니다.');
  }
  if (deviceId === 'window1' || deviceId === 'fan1') {
    if (deviceId === 'window1') windowPercent = device.on ? 0 : 50;
    if (deviceId === 'fan1' && !device.on) { windowPercent = Math.max(windowPercent, 20); setDeviceOn('window1', true); }
    if (deviceId === 'window1' && device.on) setDeviceOn('fan1', false);
  }
  selectedDeviceId = device.id;
  device.on = !device.on;
  ensureControlLoop();
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
  // Climate sensors are corrected together by applyClimateControl, including outside-air effects.
  if (['temperature', 'humidity', 'co2'].includes(key)) return 'idle';
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
  if (operationMode !== 'test' || !autoMode) return;
  easeDeviceTargets();
  let activeCorrection = false;


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

  activeCorrection = applyClimateControl() || activeCorrection;
  if (!activeCorrection && allCoreSensorsInRange()) {
    setAutoDevicesIdle();
    updateAutoState("power", "idle", lastAutoStates.power !== "idle" ? "Device Control을 절전 감시 상태로 전환했습니다. 값이 허용 범위를 벗어나면 다시 필요한 장치만 켜집니다." : "");
  } else {
    updateAutoState("power", "active", "");
  }
}

function enforceVentSafety() {
  const decision = climateDecision();
  if (decision.block && autoMode && operationMode === 'test') {
    windowPercent = 0;
    setDeviceOn('window1', false);
    setDeviceOn('fan1', false);
  }
  return decision;
}

function applyClimateControl() {
  if (operationMode !== 'test') return false;
  let decision = climateDecision();
  for (const key of ['temperature', 'humidity', 'co2']) {
    if (decision.demand[key]) correctionStates[key] = decision.demand[key];
    else delete correctionStates[key];
  }
  windowPercent = decision.block ? 0 : approach(windowPercent, decision.opening, 10);
  if (!decision.opening) windowPercent = 0;
  const exchange = windowPercent / 100 * (decision.fan ? 0.06 : 0.035);
  if (exchange) {
    const previousTemp = sensors.temperature;
    const vapour = sensors.humidity * SmartVentilation.saturation(previousTemp);
    sensors.temperature += (outdoor.temperature - sensors.temperature) * exchange;
    sensors.humidity = clamp((vapour + (outdoor.humidity * SmartVentilation.saturation(outdoor.temperature) - vapour) * exchange) / SmartVentilation.saturation(sensors.temperature), 0, 100);
    sensors.co2 += (420 - sensors.co2) * exchange; // Ambient CO2 is a simulation assumption.
    for (const key of ['temperature', 'humidity', 'co2']) {
      const direction = decision.demand[key];
      if (direction === 'high' && sensors[key] < decision.goals[key] || direction === 'low' && sensors[key] > decision.goals[key]) sensors[key] = decision.goals[key];
    }
  }
  for (const key of ['temperature', 'humidity', 'co2']) {
    const direction = decision.demand[key];
    if (!direction) continue;
    const handled = key === 'temperature' && decision.cooling && outdoor.temperature < decision.goals.temperature - 0.5 ||
      key === 'humidity' && decision.drying && decision.equivalentHumidity < decision.goals.humidity - 1 ||
      key === 'co2' && (decision.purge || decision.opening) && direction === 'high';
    if (!handled && !(key === 'co2' && direction === 'low' && decision.opening) && !(key === 'co2' && direction === 'high')) {
      sensors[key] = approach(sensors[key], decision.goals[key], getSensorConfig(key).correctionStep);
    }
    if (Math.abs(sensors[key] - decision.goals[key]) < (key === 'temperature' ? 0.05 : 0.5)) sensors[key] = decision.goals[key];
  }
  decision = climateDecision();
  for (const key of ['temperature', 'humidity', 'co2']) {
    if (decision.demand[key]) correctionStates[key] = decision.demand[key];
    else delete correctionStates[key];
  }
  if (!decision.opening) windowPercent = 0;
  setDeviceOn('window1', windowPercent > 0);
  setDeviceOn('fan1', windowPercent > 0 && decision.fan);
  setDeviceOn('ac1', decision.demand.temperature === 'high' && !(decision.cooling && outdoor.temperature < decision.goals.temperature - 0.5));
  setDeviceOn('heater1', decision.demand.temperature === 'low');
  setDeviceOn('dry1', decision.demand.humidity === 'high' && !(decision.drying && decision.equivalentHumidity < decision.goals.humidity - 1));
  setDeviceOn('humid1', decision.demand.humidity === 'low');
  setDeviceOn('co21', decision.demand.co2 === 'low' && !windowPercent);
  ventDecision = decision;
  updateAutoState('ventilation', decision.reason, decision.reason);
  return Object.keys(decision.demand).length > 0;
}

function renderWeather() {
  const decision = ventDecision || climateDecision();
  document.querySelector('#weatherSource').textContent = `${outdoor.source} · ${outdoor.time ? new Date(outdoor.time).toLocaleTimeString('ko-KR') : '시간 확인 불가'} · ${outdoor.demo ? '예시값' : '기상 모델 추정값'}`;
  document.querySelector('#weatherMetrics').innerHTML = [
    ['외부 온도', `${outdoor.temperature.toFixed(1)} °C`], ['외부 습도', `${outdoor.humidity}%`],
    ['풍속 / 돌풍', `${outdoor.wind} / ${outdoor.gust} m/s`], ['강수', `${outdoor.rain} mm`],
    ['실내 온도 환산 습도', Number.isFinite(decision.equivalentHumidity) ? `${Math.round(decision.equivalentHumidity)}%` : '수신 대기'],
  ].map(([label, value]) => `<span>${label}<br><strong>${value}</strong></span>`).join('');
  document.querySelector('#ventilationStatus').textContent = operationMode === 'live' ? '실제 센서 조회 전용 · 장치 명령 전송 안 함' : `${autoMode ? decision.reason : '수동 시험 · ' + (decision.block ? decision.block + ' (수동 시험 허용)' : '외기·장치 영향 반영 중')} · 창문 ${windowPercent}% · 배기팬 ${devices.find(d => d.id === 'fan1').on ? '켜짐' : '꺼짐'}${decision.demand.co2 === 'high' && !decision.opening ? ' · CO2 배출 불가: 현장 확인 필요' : ''}`;
  document.querySelector('#windowOpening').value = windowPercent;
  document.querySelector('#windowOpening').disabled = operationMode !== 'test';
  document.querySelector('#windowOutput').textContent = `${windowPercent}%`;
}

async function refreshWeather(latitude, longitude) {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return;
  const request = ++weatherRequest;
  document.querySelector('#weatherSource').textContent = '기상 정보 불러오는 중...';
  try {
    const params = new URLSearchParams({ latitude, longitude, current: 'temperature_2m,relative_humidity_2m,precipitation,wind_speed_10m,wind_gusts_10m', wind_speed_unit: 'ms', timeformat: 'unixtime' });
    const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`, { signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error('기상 서버 응답 오류');
    const { current } = await response.json();
    if (request !== weatherRequest) return;
    if (!current || !['temperature_2m', 'relative_humidity_2m', 'precipitation', 'wind_speed_10m', 'wind_gusts_10m', 'time'].every(k => Number.isFinite(current[k]))) throw new Error('기상 데이터 누락');
    outdoor = { temperature: current.temperature_2m, humidity: current.relative_humidity_2m, wind: current.wind_speed_10m, gust: current.wind_gusts_10m, rain: current.precipitation, time: current.time * 1000, demo: false, source: `Open-Meteo · ${latitude.toFixed(3)}, ${longitude.toFixed(3)}` };
    weatherCoordinates = [latitude, longitude];
    try { localStorage.setItem('smart-farm-weather-location', JSON.stringify(weatherCoordinates)); } catch {}
    document.querySelector('#weatherScenario').selectedIndex = -1;
  } catch (error) {
    if (request !== weatherRequest) return;
    outdoor.time = 0;
    outdoor.source = `기상 연결 실패: ${error.message}`;
    addLog('기상 정보 확인 실패. 창문과 배기팬을 닫습니다.');
  }
  ventDecision = null;
  enforceVentSafety();
  renderAll();
}

document.querySelector('#weatherForm').addEventListener('submit', event => {
  event.preventDefault();
  refreshWeather(Number(document.querySelector('#weatherLat').value), Number(document.querySelector('#weatherLon').value));
});
document.querySelector('#weatherLocate').addEventListener('click', () => {
  if (!navigator.geolocation) { addLog('위치 기능을 사용할 수 없습니다. 농장 좌표를 입력하세요.'); return; }
  navigator.geolocation.getCurrentPosition(position => {
    document.querySelector('#weatherLat').value = position.coords.latitude;
    document.querySelector('#weatherLon').value = position.coords.longitude;
    refreshWeather(position.coords.latitude, position.coords.longitude);
  }, () => addLog('위치를 확인할 수 없습니다. 농장 좌표를 입력하세요.'), { timeout: 10000 });
});
document.querySelector('#weatherScenario').addEventListener('change', event => {
  if (operationMode !== 'test') return;
  weatherRequest++;
  weatherCoordinates = null;
  try { localStorage.removeItem('smart-farm-weather-location'); } catch {}
  const cases = { mild: [18, 50, 0.5, 1, 0], hot: [35, 85, 2, 3, 0], rain: [20, 90, 2, 4, 2], wind: [18, 50, 9, 14, 0], cold: [-5, 70, 2, 4, 0] };
  const [temperature, humidity, wind, gust, rain] = cases[event.target.value];
  outdoor = { temperature, humidity, wind, gust, rain, time: Date.now(), demo: true, source: `시험 날씨: ${event.target.selectedOptions[0].text}` };
  ventDecision = null;
  enforceVentSafety();
  if (autoMode) applyAutomaticControl();
  renderAll();
});
document.querySelector('#windowOpening').addEventListener('input', event => {
  if (operationMode !== 'test') return;
  autoMode = false;
  correctionStates = {};
  ventDecision = null;
  windowPercent = Number(event.target.value);
  setDeviceOn('window1', windowPercent > 0);
  if (!windowPercent) setDeviceOn('fan1', false);
  renderAll();
});
try {
  const saved = JSON.parse(localStorage.getItem('smart-farm-weather-location'));
  if (Array.isArray(saved) && saved.length === 2) {
    document.querySelector('#weatherLat').value = saved[0];
    document.querySelector('#weatherLon').value = saved[1];
    refreshWeather(...saved);
  }
} catch {}
window.setInterval(() => { if (weatherCoordinates) refreshWeather(...weatherCoordinates); }, 10 * 60 * 1000);
window.setInterval(() => { ventDecision = null; enforceVentSafety(); renderAll(); }, 5000);

function controlTick() {
  if (operationMode !== 'test') return;
  tickCount += 1;
  if (outdoor.demo) outdoor.time = Date.now();
  sensors = SmartSimulation.step(sensors, outdoor, autoMode ? [] : devices, autoMode ? 0 : windowPercent, !autoMode);
  applySimulationDrift();
  applyAutomaticControl();
  if (!autoMode) enforceVentSafety();
  renderAll();
}

function ensureControlLoop() {
  if (!controlTimer) {
    controlTimer = window.setInterval(controlTick, TICK_MS);
  }
}

function stopControlLoopIfIdle() {
  if (operationMode !== 'test' && controlTimer) {
    window.clearInterval(controlTimer);
    controlTimer = null;
  }
}

function runAutomation() {
  if (operationMode !== 'test') return;
  autoMode = !autoMode;
  if (autoMode) {
    addLog("자동 조절을 시작했습니다. 기준을 벗어난 항목은 연결 장치가 자동으로 보정합니다.");
    activateCustomTargets();
    applyAutomaticControl();
    ensureControlLoop();
  } else {
    setAutoDevicesIdle();
    windowPercent = 0;
    addLog("자동 조절을 중지했습니다. 창문과 자동 장치를 껐습니다.");
    lastAutoStates = {};
    correctionStates = {};
    stopControlLoopIfIdle();
  }
  renderAll();
}

function simulateProblem() {
  if (operationMode !== 'test') return;
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
  if (operationMode === 'live' && !liveFresh()) {
    elements.diagnosisResult.className = 'diagnosis-result warning';
    elements.diagnosisResult.textContent = '실제 센서 수신 후 사진을 분석하세요. 현재 유효한 생육 환경 데이터가 없습니다.';
    return;
  }
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

  if (window.location.protocol === "https:") {
    setCodexStatus("offline", "로컬 실행 필요");
    elements.diagnosisResult.classList.add("warning");
    elements.diagnosisResult.innerHTML = `
      <strong>로컬 Codex 진단 화면에서 분석하세요</strong>
      <p>브라우저 보안상 공개 HTTPS 사이트는 이 PC의 Codex 연결기에 사진을 보낼 수 없습니다.</p>
      <a class="button primary local-diagnosis-link" href="${localCodexDashboardUrl()}">로컬 진단 화면 열기</a>
      <small class="bridge-help">Smart Farm 폴더의 start-local-codex-bridge.cmd를 먼저 실행하세요.</small>
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
      <a class="button primary local-diagnosis-link" href="${localCodexDashboardUrl()}">로컬 진단 화면 열기</a>
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
  setCustomTarget('temperature', Number(event.target.value));
});

elements.humiditySlider.addEventListener("input", (event) => {
  setCustomTarget('humidity', Number(event.target.value));
});

document.querySelector('#resetTargets').addEventListener('click', () => {
  if (operationMode !== 'test') return;
  delete customTargets.temperature;
  delete customTargets.humidity;
  delete correctionStates.temperature;
  delete correctionStates.humidity;
  easeDeviceTargets();
  ventDecision = null;
  renderAll();
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
ensureControlLoop();
renderAll();
checkCodexBridge();
addLog(`Smart Farm 앱을 시작했습니다. 현재 ${selectedFamily.name} ${selectedCrop.name} 품종을 관리 중입니다.`);
