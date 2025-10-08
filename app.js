const STORAGE_KEY = 'macetaModules';
const MODULES_ENDPOINT = './data/modules.json';
const USERS_ENDPOINT = './data/users.json';

const actuatorsLabels = {
  bomba: { on: 'Bomba ON', off: 'Encender bomba', icon: '🚰' },
  panel: { on: 'Panel ON', off: 'Panel OFF', icon: '🔆' },
  ventilador: { on: 'Ventilador ON', off: 'Ventilador OFF', icon: '🌀' }
};

const potsContainer = document.querySelector('#pots-container');
const addPotButton = document.querySelector('#add-pot');
const potTemplate = document.querySelector('#pot-card-template');
const summaryElements = {
  total: document.querySelector('#summary-total'),
  connected: document.querySelector('#summary-connected'),
  alerts: document.querySelector('#summary-alerts'),
  humidity: document.querySelector('#summary-humidity')
};
const filterButtons = document.querySelectorAll('.filter-button');
const adminToggleButton = document.querySelector('#toggle-admin');
const adminPanel = document.querySelector('#admin-panel');
const adminCloseControls = document.querySelectorAll('[data-close-admin]');
const adminUsersList = document.querySelector('#admin-users');
const adminModulesList = document.querySelector('#admin-modules');

let modules = [];
let simulationInterval;
let users = [];
let activeFilter = 'all';

async function loadModules() {
  const localModules = loadFromStorage();
  if (localModules.length) {
    modules = localModules;
    syncModulesUI();
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
    syncModulesUI();
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

async function loadUsers() {
  if (!adminUsersList) return;
  try {
    const response = await fetch(USERS_ENDPOINT);
    if (!response.ok) {
      throw new Error('No se pudieron cargar los usuarios');
    }
    const data = await response.json();
    users = Array.isArray(data) ? data : [];
    renderAdminUsers();
  } catch (error) {
    console.warn('No se pudieron cargar los usuarios', error);
    adminUsersList.innerHTML = `
      <li class="admin-user">
        <div class="admin-user__meta">
          <strong>Sin información disponible</strong>
          <span class="role-pill">Temporal</span>
        </div>
      </li>
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
  if (!potsContainer) return;
  potsContainer.innerHTML = '';
  const filteredModules = getFilteredModules();

  if (!filteredModules.length) {
    potsContainer.innerHTML = `
      <div class="empty-state">
        <p>No hay macetas para mostrar con el filtro seleccionado.</p>
        <p class="hint">Ajusta los filtros o agrega una nueva maceta.</p>
      </div>
    `;
    return;
  }

  filteredModules.forEach((module) => {
    const card = buildPotCard(module);
    potsContainer.appendChild(card);
  });
}

function getFilteredModules() {
  if (activeFilter === 'connected') {
    return modules.filter((module) => module.estado === 'Conectado');
  }

  if (activeFilter === 'alerts') {
    return modules.filter((module) => hasActiveAlert(module));
  }

  return modules;
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

function hasActiveAlert(module) {
  if (!module || !module.sensores) return false;
  const { humedad, nivel } = module.sensores;
  return humedad < 40 || nivel < 20;
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
  renderAdminModules();
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
    updateSummary();
    renderAdminModules();
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
  syncModulesUI();
}

function getRandomValue(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function syncModulesUI() {
  renderModules();
  updateSummary();
  renderAdminModules();
}

function updateSummary() {
  if (!summaryElements.total) return;
  const total = modules.length;
  const connected = modules.filter((module) => module.estado === 'Conectado').length;
  const alerts = modules.filter((module) => hasActiveAlert(module)).length;
  const humidityAverage =
    total > 0
      ? Math.round(
          modules.reduce(
            (acc, module) => acc + (module?.sensores?.humedad ?? 0),
            0
          ) / total
        )
      : null;

  summaryElements.total.textContent = total;
  summaryElements.connected.textContent = connected;
  summaryElements.alerts.textContent = alerts;
  summaryElements.humidity.textContent = humidityAverage !== null ? `${humidityAverage}%` : '--';
}

function renderAdminModules() {
  if (!adminModulesList) return;
  if (!modules.length) {
    adminModulesList.innerHTML = `
      <li class="admin-module">
        <div class="admin-module__info">
          <strong>No hay macetas registradas</strong>
          <span>Agrega una nueva maceta para comenzar el monitoreo.</span>
        </div>
      </li>
    `;
    return;
  }

  adminModulesList.innerHTML = modules
    .map((module) => {
      const sensors = module.sensores ?? { humedad: 0, temperatura: 0, nivel: 0 };
      const alerts = [];
      if (sensors.humedad < 40) alerts.push('Humedad baja');
      if (sensors.nivel < 20) alerts.push('Nivel de agua bajo');
      const alertsText = alerts.length ? alerts.join(' · ') : 'Sensores estables';
      const hasAlerts = alerts.length > 0;
      const statusOffline = module.estado !== 'Conectado';
      const actuatorText = formatActuators(module.actuadores);

      return `
        <li class="admin-module">
          <div class="admin-module__info">
            <strong>${module.nombre}</strong>
            <span>${sensors.humedad}% 💧 · ${sensors.temperatura}°C 🌡️ · ${sensors.nivel}% 🔋</span>
            <span class="admin-module__alerts ${hasAlerts ? 'is-active' : ''}">${alertsText}</span>
            <span class="admin-module__actuators">Actuadores: ${actuatorText}</span>
          </div>
          <div class="admin-module__actions">
            <span class="status-pill ${statusOffline ? 'is-offline' : ''}">${module.estado}</span>
            <button class="admin-toggle ${statusOffline ? 'is-offline' : ''}" data-action="toggle-connection" data-id="${module.id}" type="button">
              ${statusOffline ? 'Reconectar' : 'Pausar módulo'}
            </button>
          </div>
        </li>
      `;
    })
    .join('');
}

function formatActuators(actuadores = {}) {
  const labels = {
    bomba: 'Bomba',
    panel: 'Panel solar',
    ventilador: 'Ventilador'
  };
  const entries = Object.entries(actuadores);
  if (!entries.length) return 'Sin configuración';
  return entries.map(([key, value]) => `${labels[key] ?? key}: ${value}`).join(' · ');
}

function renderAdminUsers() {
  if (!adminUsersList) return;
  if (!users.length) {
    adminUsersList.innerHTML = `
      <li class="admin-user">
        <div class="admin-user__meta">
          <strong>No hay responsables asignados</strong>
          <span class="role-pill">Pendiente</span>
        </div>
      </li>
    `;
    return;
  }

  adminUsersList.innerHTML = users
    .map((user) => {
      const contact = user.correo ? `<span class="admin-user__contact">${user.correo}</span>` : '';
      return `
        <li class="admin-user">
          <div class="admin-user__meta">
            <strong>${user.nombre}</strong>
            <span class="role-pill">${formatRole(user.rol)}</span>
          </div>
          ${contact}
        </li>
      `;
    })
    .join('');
}

function formatRole(role = '') {
  const map = {
    admin: 'Administrador',
    operador: 'Operador',
    soporte: 'Soporte',
    invitado: 'Invitado'
  };
  return map[role] ?? role;
}

function setFilter(filter) {
  if (activeFilter === filter) return;
  activeFilter = filter;
  updateFilterButtons();
  renderModules();
}

function updateFilterButtons() {
  filterButtons.forEach((button) => {
    const isActive = button.dataset.filter === activeFilter;
    button.classList.toggle('is-active', isActive);
    button.setAttribute('aria-pressed', String(isActive));
  });
}

function openAdminPanel() {
  if (!adminPanel) return;
  adminPanel.classList.add('is-open');
  adminPanel.setAttribute('aria-hidden', 'false');
  if (adminToggleButton) {
    adminToggleButton.setAttribute('aria-expanded', 'true');
  }
  renderAdminModules();
}

function closeAdminPanel() {
  if (!adminPanel) return;
  adminPanel.classList.remove('is-open');
  adminPanel.setAttribute('aria-hidden', 'true');
  if (adminToggleButton) {
    adminToggleButton.setAttribute('aria-expanded', 'false');
  }
}

function toggleConnection(id) {
  modules = modules.map((module) => {
    if (module.id !== id) return module;
    const isConnected = module.estado === 'Conectado';
    const nextState = isConnected ? 'Desconectado' : 'Conectado';
    return {
      ...module,
      estado: nextState,
      actuadores: isConnected
        ? Object.keys(module.actuadores).reduce(
            (acc, key) => ({
              ...acc,
              [key]: 'OFF'
            }),
            {}
          )
        : module.actuadores
    };
  });
  saveToStorage(modules);
  syncModulesUI();
}

if (addPotButton) {
  addPotButton.addEventListener('click', addNewPot);
}

filterButtons.forEach((button) => {
  button.addEventListener('click', () => {
    const { filter } = button.dataset;
    if (!filter) return;
    setFilter(filter);
  });
});

updateFilterButtons();

if (adminToggleButton) {
  adminToggleButton.addEventListener('click', openAdminPanel);
}

adminCloseControls.forEach((control) => {
  control.addEventListener('click', () => {
    closeAdminPanel();
  });
});

if (adminModulesList) {
  adminModulesList.addEventListener('click', (event) => {
    const button = event.target.closest('[data-action="toggle-connection"]');
    if (!button) return;
    const id = Number(button.dataset.id);
    toggleConnection(id);
  });
}

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && adminPanel?.classList.contains('is-open')) {
    closeAdminPanel();
  }
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    clearInterval(simulationInterval);
  } else {
    startSimulation();
  }
});

loadModules();
loadUsers();
renderAdminUsers();
