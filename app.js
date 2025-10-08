const STORAGE_KEY = 'macetaModules';
const MODULES_ENDPOINT = './data/modules.json';

const actuatorsLabels = {
  bomba: { on: 'Bomba ON', off: 'Encender bomba', icon: '🚰' },
  panel: { on: 'Panel ON', off: 'Panel OFF', icon: '🔆' },
  ventilador: { on: 'Ventilador ON', off: 'Ventilador OFF', icon: '🌀' }
};

const potsContainer = document.querySelector('#pots-container');
const addPotButton = document.querySelector('#add-pot');
const potTemplate = document.querySelector('#pot-card-template');

let modules = [];
let simulationInterval;

async function loadModules() {
  const localModules = loadFromStorage();
  if (localModules.length) {
    modules = localModules;
    renderModules();
    startSimulation();
    return;
  }

  try {
    const response = await fetch(MODULES_ENDPOINT);
    if (!response.ok) {
      throw new Error('No se pudieron cargar las macetas');
    }
    const data = await response.json();
    modules = data;
    saveToStorage(modules);
    renderModules();
    startSimulation();
  } catch (error) {
    console.error(error);
    potsContainer.innerHTML = `
      <div class="error-state">
        <p>No pudimos cargar los datos de las macetas.</p>
        <p class="hint">Revisa la conexión o vuelve a intentarlo más tarde.</p>
      </div>
    `;
  }
}

function loadFromStorage() {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    if (!data) return [];
    return JSON.parse(data);
  } catch (error) {
    console.warn('No se pudo leer el almacenamiento local', error);
    return [];
  }
}

function saveToStorage(data) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (error) {
    console.warn('No se pudo guardar en almacenamiento local', error);
  }
}

function renderModules() {
  potsContainer.innerHTML = '';
  modules.forEach((module) => {
    const card = buildPotCard(module);
    potsContainer.appendChild(card);
  });
}

function buildPotCard(module) {
  const { id, nombre, estado, sensores, actuadores } = module;
  const fragment = potTemplate.content.cloneNode(true);
  const card = fragment.querySelector('.pot-card');

  card.dataset.id = id;
  fragment.querySelector('.pot-name').textContent = nombre;

  const connection = fragment.querySelector('.connection-status');
  connection.textContent = estado;
  connection.classList.toggle('connected', estado === 'Conectado');
  connection.classList.toggle('disconnected', estado !== 'Conectado');

  const humidity = fragment.querySelector('.humidity');
  const temperature = fragment.querySelector('.temperature');
  const level = fragment.querySelector('.level');

  humidity.textContent = `${sensores.humedad}%`;
  temperature.textContent = `${sensores.temperatura}°C`;
  level.textContent = `${sensores.nivel}%`;

  applyAlerts(fragment, sensores);
  setupActuatorButtons(fragment, actuadores, id);

  return fragment;
}

function applyAlerts(fragment, sensores) {
  const humidityWrapper = fragment.querySelector('.sensor-value:nth-child(1)');
  const levelWrapper = fragment.querySelector('.sensor-value:nth-child(3)');

  humidityWrapper.classList.remove('alert-active', 'alert-critical');
  levelWrapper.classList.remove('alert-active', 'alert-critical');

  if (sensores.humedad < 40) {
    humidityWrapper.classList.add('alert-active');
    if (sensores.humedad < 25) {
      humidityWrapper.classList.add('alert-critical');
    }
  }

  if (sensores.nivel < 20) {
    levelWrapper.classList.add('alert-active');
    if (sensores.nivel < 10) {
      levelWrapper.classList.add('alert-critical');
    }
  }
}

function setupActuatorButtons(fragment, actuadores, id) {
  fragment.querySelectorAll('.actuator').forEach((button) => {
    const actuatorKey = button.dataset.actuator;
    const state = actuadores[actuatorKey];
    updateActuatorButton(button, actuatorKey, state);

    button.addEventListener('click', () => {
      toggleActuator(id, actuatorKey);
    });
  });
}

function updateActuatorButton(button, actuatorKey, state) {
  const label = actuatorsLabels[actuatorKey];
  const isOn = state === 'ON';
  button.classList.toggle('is-on', isOn);
  const text = isOn ? label.on : label.off;
  button.innerHTML = `<span>${label.icon}</span><span>${text}</span>`;
}

function toggleActuator(id, actuatorKey) {
  modules = modules.map((module) => {
    if (module.id !== id) return module;
    const current = module.actuadores[actuatorKey];
    const next = current === 'ON' ? 'OFF' : 'ON';
    const updatedModule = {
      ...module,
      actuadores: {
        ...module.actuadores,
        [actuatorKey]: next
      }
    };
    updateCardActuator(id, actuatorKey, next);
    return updatedModule;
  });
  saveToStorage(modules);
}

function updateCardActuator(id, actuatorKey, state) {
  const card = potsContainer.querySelector(`.pot-card[data-id="${id}"]`);
  if (!card) return;
  const button = card.querySelector(`.actuator[data-actuator="${actuatorKey}"]`);
  updateActuatorButton(button, actuatorKey, state);
}

function startSimulation() {
  if (simulationInterval) clearInterval(simulationInterval);
  simulationInterval = setInterval(() => {
    modules = modules.map((module) => {
      if (module.estado !== 'Conectado') return module;
      const newSensors = simulateSensorValues(module.sensores);
      const updated = { ...module, sensores: newSensors };
      updateCardSensors(updated);
      return updated;
    });
    saveToStorage(modules);
  }, 5000);
}

function simulateSensorValues(sensores) {
  const humidityVariation = getRandomVariation(-4, 4);
  const levelVariation = getRandomVariation(-3, 2);
  const tempVariation = getRandomVariation(-1, 1);

  return {
    humedad: clamp(sensores.humedad + humidityVariation, 0, 100),
    temperatura: clamp(sensores.temperatura + tempVariation, 10, 40),
    nivel: clamp(sensores.nivel + levelVariation, 0, 100)
  };
}

function getRandomVariation(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function updateCardSensors(module) {
  const card = potsContainer.querySelector(`.pot-card[data-id="${module.id}"]`);
  if (!card) return;
  const humidity = card.querySelector('.humidity');
  const temperature = card.querySelector('.temperature');
  const level = card.querySelector('.level');

  humidity.textContent = `${module.sensores.humedad}%`;
  temperature.textContent = `${module.sensores.temperatura}°C`;
  level.textContent = `${module.sensores.nivel}%`;

  applyAlerts(card, module.sensores);
}

function addNewPot() {
  const nextId = modules.length ? Math.max(...modules.map((m) => m.id)) + 1 : 1;
  const randomName = `Maceta ${nextId}`;
  const newModule = {
    id: nextId,
    nombre: randomName,
    estado: 'Conectado',
    sensores: {
      humedad: getRandomValue(45, 70),
      temperatura: getRandomValue(18, 28),
      nivel: getRandomValue(40, 90)
    },
    actuadores: {
      bomba: 'OFF',
      panel: 'ON',
      ventilador: 'OFF'
    }
  };

  modules = [newModule, ...modules];
  saveToStorage(modules);
  renderModules();
}

function getRandomValue(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

addPotButton.addEventListener('click', addNewPot);

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    clearInterval(simulationInterval);
  } else {
    startSimulation();
  }
});

loadModules();
