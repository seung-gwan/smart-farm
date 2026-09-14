const BASE_CROPS = window.SMART_FARM_CROPS || [];
const CUSTOM_KEY = "smart-farm-custom-crops";

function readCustomCrops() {
  try {
    return JSON.parse(localStorage.getItem(CUSTOM_KEY) || "[]");
  } catch {
    return [];
  }
}

function writeCustomCrops(crops) {
  localStorage.setItem(CUSTOM_KEY, JSON.stringify(crops));
}

function slugify(text) {
  const value = text.trim().toLowerCase().replace(/[^a-z0-9가-힣]+/g, "-").replace(/^-|-$/g, "");
  return value || `custom-${Date.now()}`;
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

function getCropById(id) {
  return getAllCrops().find((crop) => crop.id === id) || getAllCrops()[0];
}

function getParam(name) {
  return new URLSearchParams(window.location.search).get(name);
}

function cropCard(crop) {
  const firstVariety = crop.varieties?.[0];
  const href = firstVariety ? `varieties.html?crop=${encodeURIComponent(crop.id)}` : `varieties.html?crop=${encodeURIComponent(crop.id)}`;
  return `
    <a class="crop-card" href="${href}">
      <span class="crop-mark">${crop.name.slice(0, 1)}</span>
      <strong>${crop.name}</strong>
      <small>${crop.group}</small>
      <p>${crop.summary || "새 품종을 추가해서 관리 기준을 만들 수 있습니다."}</p>
      <span class="card-link">품종 보기</span>
    </a>
  `;
}

function varietyCard(crop, variety) {
  return `
    <a class="crop-card" href="dashboard.html?crop=${encodeURIComponent(crop.id)}&variety=${encodeURIComponent(variety.id)}">
      <span class="crop-mark">${variety.name.slice(0, 1)}</span>
      <strong>${variety.name}</strong>
      <small>${variety.alias || crop.name}</small>
      <p>온도 ${variety.temp[0]}-${variety.temp[1]} C · 습도 ${variety.humidity[0]}-${variety.humidity[1]}%</p>
      <span class="card-link">관리 시작</span>
    </a>
  `;
}

function initHome() {
  const grid = document.querySelector("#cropGrid");
  const nameInput = document.querySelector("#newCropName");
  const groupInput = document.querySelector("#newCropGroup");
  const addButton = document.querySelector("#addCropType");
  const message = document.querySelector("#homeMessage");

  function render() {
    grid.innerHTML = getAllCrops().map(cropCard).join("");
  }

  addButton.addEventListener("click", () => {
    const name = nameInput.value.trim();
    const group = groupInput.value.trim() || "사용자 추가";
    if (!name) {
      message.textContent = "작물 이름을 입력하세요.";
      return;
    }

    const custom = readCustomCrops();
    const id = `custom-${slugify(name)}`;
    if (getAllCrops().some((crop) => crop.id === id || crop.name === name)) {
      message.textContent = "이미 있는 작물입니다.";
      return;
    }

    custom.push({
      id,
      name,
      group,
      summary: "사용자가 추가한 작물입니다. 다음 화면에서 품종을 추가하세요.",
      varieties: [],
    });
    writeCustomCrops(custom);
    nameInput.value = "";
    groupInput.value = "";
    message.textContent = `${name} 작물을 추가했습니다.`;
    render();
  });

  render();
}

function initVarieties() {
  const cropId = getParam("crop") || "apple";
  const crop = getCropById(cropId);
  const grid = document.querySelector("#varietyGrid");
  const title = document.querySelector("#varietyHeroTitle");
  const text = document.querySelector("#varietyHeroText");
  const sectionTitle = document.querySelector("#varietySectionTitle");
  const message = document.querySelector("#varietyMessage");
  const nameInput = document.querySelector("#newVarietyName");
  const tempMin = document.querySelector("#newTempMin");
  const tempMax = document.querySelector("#newTempMax");
  const humidityMin = document.querySelector("#newHumidityMin");
  const humidityMax = document.querySelector("#newHumidityMax");
  const addButton = document.querySelector("#addVariety");

  title.textContent = `${crop.name} 품종을 선택하세요`;
  text.textContent = crop.summary || "품종별 생육 기준을 선택하거나 새 품종을 추가하세요.";
  sectionTitle.textContent = `${crop.name} 품종 목록`;

  const base = crop.varieties?.[0];
  if (base) {
    tempMin.value = base.temp[0];
    tempMax.value = base.temp[1];
    humidityMin.value = base.humidity[0];
    humidityMax.value = base.humidity[1];
  }

  function render() {
    const varieties = crop.varieties || [];
    grid.innerHTML = varieties.length
      ? varieties.map((variety) => varietyCard(crop, variety)).join("")
      : `<div class="empty-state">아직 등록된 품종이 없습니다. 아래에서 첫 품종을 추가하세요.</div>`;
  }

  addButton.addEventListener("click", () => {
    const name = nameInput.value.trim();
    const minTemp = Number(tempMin.value);
    const maxTemp = Number(tempMax.value);
    const minHumidity = Number(humidityMin.value);
    const maxHumidity = Number(humidityMax.value);

    if (!name) {
      message.textContent = "품종 이름을 입력하세요.";
      return;
    }

    if (minTemp >= maxTemp || minHumidity >= maxHumidity) {
      message.textContent = "최소값은 최대값보다 작아야 합니다.";
      return;
    }

    const custom = readCustomCrops();
    let customCrop = custom.find((item) => item.id === crop.id);
    if (!customCrop) {
      customCrop = {
        id: crop.id,
        name: crop.name,
        group: crop.group,
        summary: crop.summary,
        varieties: [],
      };
      custom.push(customCrop);
    }

    const id = `custom-${slugify(name)}`;
    if ([...(crop.varieties || []), ...(customCrop.varieties || [])].some((item) => item.id === id || item.name === name)) {
      message.textContent = "이미 있는 품종입니다.";
      return;
    }

    const reference = crop.varieties?.[0] || {
      soilMoisture: [40, 60],
      soilPh: [6.0, 6.8],
      co2: [500, 900],
      light: [6, 8],
      planting: "지역과 작형에 맞춰 설정",
      notes: "새로 추가한 품종입니다. 현장 데이터로 기준을 보정하세요.",
    };

    customCrop.varieties.push({
      id,
      name,
      alias: "사용자 추가 품종",
      temp: [minTemp, maxTemp],
      humidity: [minHumidity, maxHumidity],
      soilMoisture: reference.soilMoisture,
      soilPh: reference.soilPh,
      co2: reference.co2,
      light: reference.light,
      planting: reference.planting,
      notes: "사용자가 추가한 품종입니다. 실제 재배 데이터로 기준값을 보정하세요.",
    });

    writeCustomCrops(custom);
    message.textContent = `${name} 품종을 추가했습니다.`;
    nameInput.value = "";
    window.location.reload();
  });

  render();
}

const page = document.body.dataset.page;
if (page === "home") initHome();
if (page === "varieties") initVarieties();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.getRegistrations().then((registrations) => {
      registrations.forEach((registration) => registration.unregister());
    });
  });
}
