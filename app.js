const STORAGE_KEY = 'macetaModulesV2';
const MODULES_ENDPOINT = './data/modules.json';
const USERS_ENDPOINT = './data/users.json';

const DEFAULT_CONFIG = {
  humedadMin: 40,
  temperaturaMax: 35,
  aguaMin: 25
};

const DEFAULT_SENSORS = ['humedad', 'temperatura', 'nivel'];
const DEFAULT_ACTUATORS = ['bomba', 'panel', 'ventilador'];
const ADMIN_ROLE = 'admin';
const USER_ROLE = 'user';
const DEFAULT_ROLE_VISIBILITY = [ADMIN_ROLE, USER_ROLE];

const SENSOR_META = {
  humedad: {
    icon: '💧',
    label: 'Humedad',
    unit: '%',
    getValue: (sensores) => `${sensores.humedad ?? '--'}%`,
    isAlert: (module) =>
      module.sensoresDisponibles.includes('humedad') &&
      typeof module.sensores.humedad === 'number' &&
      module.sensores.humedad < module.configuracion.humedadMin,
    isWarning: (module) =>
      module.sensoresDisponibles.includes('humedad') &&
      typeof module.sensores.humedad === 'number' &&
      module.sensores.humedad < module.configuracion.humedadMin + 5
  },
  temperatura: {
    icon: '🌡️',
    label: 'Temperatura',
    unit: '°C',
    getValue: (sensores) => `${sensores.temperatura ?? '--'}°C`,
    isAlert: (module) =>
      module.sensoresDisponibles.includes('temperatura') &&
      typeof module.sensores.temperatura === 'number' &&
      module.sensores.temperatura > module.configuracion.temperaturaMax,
    isWarning: (module) =>
      module.sensoresDisponibles.includes('temperatura') &&
      typeof module.sensores.temperatura === 'number' &&
      module.sensores.temperatura > module.configuracion.temperaturaMax - 2
  },
  nivel: {
    icon: '🔋',
    label: 'Nivel de agua',
    unit: '%',
    getValue: (sensores) => `${sensores.nivel ?? '--'}%`,
    isAlert: (module) =>
      module.sensoresDisponibles.includes('nivel') &&
      typeof module.sensores.nivel === 'number' &&
      module.sensores.nivel < module.configuracion.aguaMin,
    isWarning: (module) =>
      module.sensoresDisponibles.includes('nivel') &&
      typeof module.sensores.nivel === 'number' &&
      module.sensores.nivel < module.configuracion.aguaMin + 5
  }
};

const ACTUATOR_META = {
  bomba: { label: 'Bomba', icon: '🚰' },
  panel: { label: 'Panel solar', icon: '🔆' },
  ventilador: { label: 'Ventilador', icon: '🌀' }
};

const LOG_LIMIT = 8;
const HISTORY_LIMIT = 60;

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
const roleSelector = document.querySelector('#role-selector');
const modalOverlay = document.querySelector('#modal-overlay');
const moduleEditor = document.querySelector('#module-editor');
const moduleForm = document.querySelector('#module-form');
const historyModal = document.querySelector('#history-modal');
const historyTableBody = document.querySelector('#history-table-body');
const moduleTitle = document.querySelector('#module-editor-title');
const historyTitle = document.querySelector('#history-title');
const closeModalButtons = document.querySelectorAll('[data-close-modal]');

let modules = [];
let simulationInterval;
let users = [];
let activeFilter = 'all';
let userRole = roleSelector?.value ?? ADMIN_ROLE;
let editingModuleId = null;
let historyModuleId = null;

init();

function init() {
  attachEventListeners();
  loadModules();
  loadUsers();
  renderAdminUsers();
  updateFilterButtons();
  applyRoleRestrictions();
}

function attachEventListeners() {
  if (addPotButton) {
    addPotButton.addEventListener('click', () => {
      if (userRole !== 'admin') return;
      openModuleEditor();
    });
  }

  filterButtons.forEach((button) => {
    button.addEventListener('click', () => {
      const { filter } = button.dataset;
      if (!filter) return;
      setFilter(filter);
    });
  });

  if (adminToggleButton) {
    adminToggleButton.addEventListener('click', () => {
      if (userRole !== 'admin') return;
      openAdminPanel();
    });
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

  if (potsContainer) {
    potsContainer.addEventListener('click', (event) => {
      const actuatorButton = event.target.closest('.actuator');
      if (actuatorButton) {
        const card = actuatorButton.closest('.pot-card');
        const id = Number(card?.dataset.id ?? 0);
        const actuatorKey = actuatorButton.dataset.actuator;
        if (!Number.isNaN(id) && actuatorKey) {
          toggleActuator(id, actuatorKey);
        }
        return;
      }

      const actionButton = event.target.closest('[data-card-action]');
      if (!actionButton) return;
      const action = actionButton.dataset.cardAction;
      const card = actionButton.closest('.pot-card');
      const id = Number(card?.dataset.id ?? 0);
      if (Number.isNaN(id)) return;
      handleCardAction(action, id);
    });
  }

  if (moduleForm) {
    moduleForm.addEventListener('submit', (event) => {
      event.preventDefault();
      handleModuleSubmit(new FormData(moduleForm));
    });
  }

  closeModalButtons.forEach((button) => {
    button.addEventListener('click', () => {
      closeActiveModal();
    });
  });

  if (modalOverlay) {
    modalOverlay.addEventListener('click', () => {
      closeActiveModal();
    });
  }

  if (roleSelector) {
    roleSelector.addEventListener('change', (event) => {
      userRole = event.target.value;
      applyRoleRestrictions();
      renderModules();
      updateSummary();
      renderAdminModules();
    });
  }

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      if (adminPanel?.classList.contains('is-open')) {
        closeAdminPanel();
        return;
      }
      closeActiveModal();
    }
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      clearInterval(simulationInterval);
    } else {
      startSimulation();
    }
  });
}

async function loadModules() {
  const localModules = loadFromStorage();
  if (localModules.length) {
    modules = localModules.map((module, index) => normalizeModule(module, index + 1));
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
    modules = Array.isArray(data)
      ? data.map((module, index) => normalizeModule(module, index + 1))
      : [];
    saveToStorage(modules);
    syncModulesUI();
    startSimulation();
  } catch (error) {
    console.error(error);
    if (potsContainer) {
      potsContainer.innerHTML = `
        <div class="error-state">
          <p>No pudimos cargar los datos de las macetas.</p>
          <p class="hint">Revisa la conexión o vuelve a intentarlo más tarde.</p>
        </div>
      `;
    }
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

function normalizeModule(module = {}, fallbackId = Date.now()) {
  const sensores = {
    humedad: typeof module?.sensores?.humedad === 'number' ? module.sensores.humedad : getRandomValue(40, 70),
    temperatura:
      typeof module?.sensores?.temperatura === 'number'
        ? module.sensores.temperatura
        : getRandomValue(18, 28),
    nivel:
      typeof module?.sensores?.nivel === 'number' ? module.sensores.nivel : getRandomValue(40, 80)
  };

  const configuracion = {
    humedadMin: Number(module?.configuracion?.humedadMin ?? DEFAULT_CONFIG.humedadMin),
    temperaturaMax: Number(module?.configuracion?.temperaturaMax ?? DEFAULT_CONFIG.temperaturaMax),
    aguaMin: Number(module?.configuracion?.aguaMin ?? DEFAULT_CONFIG.aguaMin)
  };

  const sensoresDisponibles = Array.isArray(module?.sensoresDisponibles)
    ? module.sensoresDisponibles
    : [...DEFAULT_SENSORS];

  const actuadoresDisponibles = Array.isArray(module?.actuadoresDisponibles)
    ? module.actuadoresDisponibles
    : [...DEFAULT_ACTUATORS];

  const actuadores = sanitizeActuators(module?.actuadores, actuadoresDisponibles);

  const historial = Array.isArray(module?.historial)
    ? module.historial.map(normalizeHistoryEntry)
    : [];

  const eventos = Array.isArray(module?.eventos)
    ? module.eventos.map(normalizeEvent)
    : [];

  const sanitizedHistory = historial.map((entry) => ({
    ...entry,
    actuadores: sanitizeActuators(entry.actuadores, actuadoresDisponibles)
  }));

  const rawRoles =
    Array.isArray(module?.rolesPermitidos) && module.rolesPermitidos.length
      ? module.rolesPermitidos
      : DEFAULT_ROLE_VISIBILITY;
  const rolesPermitidos = Array.from(new Set([...rawRoles, ADMIN_ROLE])).filter(Boolean);
  if (!rolesPermitidos.length) {
    rolesPermitidos.push(ADMIN_ROLE);
  }

  const lastHistoryTimestamp = sanitizedHistory.length
    ? sanitizedHistory[sanitizedHistory.length - 1].timestamp
    : null;
  const lastEventTimestamp = eventos.length ? eventos[eventos.length - 1].timestamp : null;
  const ultimaActualizacion = normalizeTimestamp(
    module?.ultimaActualizacion ?? lastHistoryTimestamp ?? lastEventTimestamp
  );

  const normalizedModule = {
    id: module.id ?? fallbackId,
    nombre: module.nombre ?? `Maceta ${fallbackId}`,
    estado: module.estado ?? 'Conectado',
    sensores,
    configuracion,
    sensoresDisponibles,
    actuadoresDisponibles,
    actuadores,
    historial: sanitizedHistory,
    eventos,
    alertasActivas: [],
    rolesPermitidos,
    ultimaActualizacion
  };

  normalizedModule.alertasActivas = detectAlerts(normalizedModule);
  return normalizedModule;
}

function sanitizeActuators(actuadores = {}, disponibles = []) {
  const sanitized = {};
  disponibles.forEach((key) => {
    const upper = String(actuadores?.[key] ?? 'OFF').toUpperCase();
    sanitized[key] = upper === 'ON' ? 'ON' : 'OFF';
  });
  return sanitized;
}

function normalizeHistoryEntry(entry = {}) {
  const timestamp = normalizeTimestamp(entry.timestamp ?? entry.fecha);
  const sensores = {
    humedad: entry?.sensores?.humedad ?? entry?.humedad ?? null,
    temperatura: entry?.sensores?.temperatura ?? entry?.temperatura ?? null,
    nivel: entry?.sensores?.nivel ?? entry?.agua ?? null
  };
  const actuadores = sanitizeActuators(entry?.actuadores, DEFAULT_ACTUATORS);
  const alertas = Array.isArray(entry?.alertas)
    ? entry.alertas
    : entry?.alerta
    ? [entry.alerta]
    : [];
  return {
    timestamp,
    sensores,
    actuadores,
    alertas
  };
}

function normalizeEvent(event = {}) {
  const timestamp = normalizeTimestamp(event.timestamp ?? event.fecha);
  const tipo = event.tipo ?? (event.alerta ? 'alert' : 'info');
  const mensaje = event.mensaje ?? event.descripcion ?? 'Evento registrado';
  return { timestamp, tipo, mensaje };
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

function syncModulesUI() {
  renderModules();
  updateSummary();
  renderAdminModules();
}

function renderModules() {
  if (!potsContainer) return;
  const filteredModules = getFilteredModules();
  potsContainer.innerHTML = '';

  if (!filteredModules.length) {
    const emptyMessage =
      userRole === USER_ROLE
        ? {
            title: 'No tienes macetas asignadas con este filtro.',
            hint: 'Solicita a un administrador acceso o revisa otros filtros disponibles.'
          }
        : {
            title: 'No hay macetas para mostrar con el filtro seleccionado.',
            hint: 'Ajusta los filtros o agrega una nueva maceta.'
          };
    potsContainer.innerHTML = `
      <div class="empty-state">
        <p>${emptyMessage.title}</p>
        <p class="hint">${emptyMessage.hint}</p>
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
  const scopedModules = getModulesForRole();
  if (activeFilter === 'connected') {
    return scopedModules.filter((module) => module.estado === 'Conectado');
  }

  if (activeFilter === 'alerts') {
    return scopedModules.filter((module) => module.alertasActivas?.length);
  }

  return scopedModules;
}

function getModulesForRole() {
  return modules.filter((module) => module.rolesPermitidos?.includes(userRole));
}

function buildPotCard(module) {
  const fragment = potTemplate.content.cloneNode(true);
  const card = fragment.querySelector('.pot-card');
  card.dataset.id = module.id;

  const updateTimestamp = normalizeTimestamp(module.ultimaActualizacion);

  const nameElement = fragment.querySelector('.pot-name');
  nameElement.textContent = module.nombre;

  const updatedElement = fragment.querySelector('[data-last-update]');
  if (updatedElement) {
    updatedElement.textContent = formatLastUpdate(updateTimestamp);
    updatedElement.setAttribute('datetime', updateTimestamp);
    updatedElement.setAttribute('title', formatDateTime(updateTimestamp));
  }

  const accessBadge = fragment.querySelector('[data-access-badge]');
  if (accessBadge) {
    const isSharedWithUsers = module.rolesPermitidos?.includes(USER_ROLE);
    accessBadge.textContent = isSharedWithUsers
      ? 'Compartida con usuarios'
      : 'Solo administración';
    accessBadge.classList.toggle('is-restricted', !isSharedWithUsers);
  }

  const connection = fragment.querySelector('.connection-status');
  connection.textContent = module.estado;
  connection.classList.toggle('connected', module.estado === 'Conectado');
  connection.classList.toggle('disconnected', module.estado !== 'Conectado');
  connection.setAttribute('aria-label', `Estado de conexión: ${module.estado}`);

  const sensorsContainer = fragment.querySelector('[data-sensors]');
  sensorsContainer.innerHTML = '';
  module.sensoresDisponibles.forEach((sensorKey) => {
    if (!SENSOR_META[sensorKey]) return;
    const sensorElement = createSensorElement(module, sensorKey);
    sensorsContainer.appendChild(sensorElement);
  });

  const actuatorsContainer = fragment.querySelector('[data-actuators]');
  actuatorsContainer.innerHTML = '';
  module.actuadoresDisponibles.forEach((actuatorKey) => {
    if (!ACTUATOR_META[actuatorKey]) return;
    const actuatorButton = createActuatorButton(module, actuatorKey);
    actuatorsContainer.appendChild(actuatorButton);
  });

  const actionButtons = fragment.querySelectorAll('[data-card-action]');
  actionButtons.forEach((button) => {
    const action = button.dataset.cardAction;
    const isAdminAction = action === 'edit' || action === 'delete';
    if (isAdminAction && userRole !== 'admin') {
      button.classList.add('is-disabled');
      button.setAttribute('disabled', 'true');
    } else {
      button.classList.remove('is-disabled');
      button.removeAttribute('disabled');
    }
  });

  const logList = fragment.querySelector('[data-log]');
  const badge = fragment.querySelector('[data-log-count]');
  renderEventLog(module, logList, badge);

  return fragment;
}

function createSensorElement(module, sensorKey) {
  const meta = SENSOR_META[sensorKey];
  const wrapper = document.createElement('div');
  wrapper.className = 'sensor-value';
  wrapper.dataset.sensor = sensorKey;

  const icon = document.createElement('span');
  icon.className = 'icon';
  icon.textContent = meta.icon;

  const info = document.createElement('div');
  const label = document.createElement('p');
  label.className = 'label';
  label.textContent = meta.label;
  const value = document.createElement('p');
  value.className = 'value';
  value.textContent = meta.getValue(module.sensores);
  info.appendChild(label);
  info.appendChild(value);

  const alertFlag = document.createElement('span');
  alertFlag.className = 'alert-flag';

  if (meta.isAlert(module)) {
    wrapper.classList.add('alert-active');
  } else if (meta.isWarning(module)) {
    wrapper.classList.add('alert-warning');
  }

  wrapper.appendChild(icon);
  wrapper.appendChild(info);
  wrapper.appendChild(alertFlag);
  return wrapper;
}

function createActuatorButton(module, actuatorKey) {
  const button = document.createElement('button');
  button.className = 'actuator';
  button.type = 'button';
  button.dataset.actuator = actuatorKey;
  const meta = ACTUATOR_META[actuatorKey];
  const state = module.actuadores[actuatorKey];
  if (state === 'ON') {
    button.classList.add('is-on');
  }

  const label = document.createElement('span');
  label.innerHTML = `${meta.icon} ${meta.label}`;
  const status = document.createElement('span');
  status.textContent = state === 'ON' ? 'ON' : 'OFF';

  button.appendChild(label);
  button.appendChild(status);

  if (userRole !== 'admin') {
    button.setAttribute('disabled', 'true');
  }

  return button;
}

function renderEventLog(module, listElement, badgeElement) {
  if (!listElement) return;
  listElement.innerHTML = '';
  const events = module.eventos?.slice(-3).reverse() ?? [];

  if (!events.length) {
    const empty = document.createElement('li');
    empty.className = 'event-log__item';
    empty.textContent = 'Sin eventos registrados';
    listElement.appendChild(empty);
    if (badgeElement) {
      badgeElement.textContent = '0';
    }
    return;
  }

  events.forEach((event) => {
    const item = document.createElement('li');
    item.className = 'event-log__item';
    if (event.tipo === 'alert') item.classList.add('is-alert');
    if (event.tipo === 'warning') item.classList.add('is-warning');

    const time = document.createElement('time');
    time.dateTime = event.timestamp;
    time.textContent = formatTime(event.timestamp);

    const message = document.createElement('span');
    message.textContent = event.mensaje;

    item.appendChild(time);
    item.appendChild(message);
    listElement.appendChild(item);
  });

  if (badgeElement) {
    badgeElement.textContent = String(module.eventos?.length ?? 0);
  }
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
      const alerts = module.alertasActivas ?? [];
      const hasAlerts = alerts.length > 0;
      const actuatorText = formatActuators(module.actuadores, module.actuadoresDisponibles);
      const thresholds = `H:${module.configuracion.humedadMin}% · T:${module.configuracion.temperaturaMax}°C · N:${module.configuracion.aguaMin}%`;
      const updateTimestamp = normalizeTimestamp(module.ultimaActualizacion);
      const lastUpdateText = formatLastUpdate(updateTimestamp);
      const visibilityLabel = module.rolesPermitidos?.includes(USER_ROLE)
        ? 'Compartida con usuarios'
        : 'Solo administradores';

      return `
        <li class="admin-module">
          <div class="admin-module__info">
            <strong>${module.nombre}</strong>
            <span>${sensors.humedad}% 💧 · ${sensors.temperatura}°C 🌡️ · ${sensors.nivel}% 🔋</span>
            <span class="admin-module__alerts ${hasAlerts ? 'is-active' : ''}">
              ${hasAlerts ? alerts.join(' · ') : 'Sensores estables'}
            </span>
            <span class="admin-module__actuators">Actuadores: ${actuatorText}</span>
            <span class="admin-module__actuators">Umbrales: ${thresholds}</span>
            <span class="admin-module__meta">${lastUpdateText}</span>
            <span class="admin-module__meta">Visibilidad: ${visibilityLabel}</span>
          </div>
          <div class="admin-module__actions">
            <span class="status-pill ${module.estado === 'Conectado' ? '' : 'is-offline'}">${module.estado}</span>
            <button class="admin-toggle" data-action="toggle-connection" data-id="${module.id}" type="button">
              ${module.estado === 'Conectado' ? 'Pausar módulo' : 'Reconectar'}
            </button>
          </div>
        </li>
      `;
    })
    .join('');
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
    invitado: 'Invitado',
    user: 'Usuario'
  };
  return map[role] ?? role;
}

function updateSummary() {
  if (!summaryElements.total) return;
  const scopedModules = getModulesForRole();
  const total = scopedModules.length;
  const connected = scopedModules.filter((module) => module.estado === 'Conectado').length;
  const alerts = scopedModules.filter((module) => module.alertasActivas?.length).length;
  const humidityValues = scopedModules
    .filter((module) => module.sensoresDisponibles.includes('humedad'))
    .map((module) => module.sensores.humedad)
    .filter((value) => typeof value === 'number');

  const humidityAverage = humidityValues.length
    ? Math.round(humidityValues.reduce((acc, value) => acc + value, 0) / humidityValues.length)
    : null;

  summaryElements.total.textContent = total;
  summaryElements.connected.textContent = connected;
  summaryElements.alerts.textContent = alerts;
  summaryElements.humidity.textContent = humidityAverage !== null ? `${humidityAverage}%` : '--';
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

function openModuleEditor(module) {
  if (!moduleEditor || !modalOverlay) return;
  moduleEditor.classList.add('is-open');
  moduleEditor.setAttribute('aria-hidden', 'false');
  modalOverlay.classList.add('is-active');
  modalOverlay.setAttribute('aria-hidden', 'false');

  const isEditing = Boolean(module);
  editingModuleId = module?.id ?? null;
  moduleTitle.textContent = isEditing ? `Editar ${module.nombre}` : 'Nueva maceta';

  const nameInput = document.querySelector('#module-name');
  const humidityInput = document.querySelector('#threshold-humidity');
  const temperatureInput = document.querySelector('#threshold-temperature');
  const levelInput = document.querySelector('#threshold-level');

  const sensorCheckboxes = moduleForm.querySelectorAll('input[name="sensors"]');
  const actuatorCheckboxes = moduleForm.querySelectorAll('input[name="actuators"]');
  const roleCheckboxes = moduleForm.querySelectorAll('input[name="roles"][type="checkbox"]');

  if (isEditing) {
    nameInput.value = module.nombre;
    humidityInput.value = module.configuracion.humedadMin;
    temperatureInput.value = module.configuracion.temperaturaMax;
    levelInput.value = module.configuracion.aguaMin;

    sensorCheckboxes.forEach((checkbox) => {
      checkbox.checked = module.sensoresDisponibles.includes(checkbox.value);
    });

    actuatorCheckboxes.forEach((checkbox) => {
      checkbox.checked = module.actuadoresDisponibles.includes(checkbox.value);
    });

    roleCheckboxes.forEach((checkbox) => {
      checkbox.checked = module.rolesPermitidos?.includes(checkbox.value) ?? false;
    });
  } else {
    nameInput.value = '';
    humidityInput.value = DEFAULT_CONFIG.humedadMin;
    temperatureInput.value = DEFAULT_CONFIG.temperaturaMax;
    levelInput.value = DEFAULT_CONFIG.aguaMin;
    sensorCheckboxes.forEach((checkbox) => {
      checkbox.checked = true;
    });
    actuatorCheckboxes.forEach((checkbox) => {
      checkbox.checked = true;
    });
    roleCheckboxes.forEach((checkbox) => {
      checkbox.checked = DEFAULT_ROLE_VISIBILITY.includes(checkbox.value);
    });
  }
}

function openHistoryModal(module) {
  if (!historyModal || !modalOverlay) return;
  historyModal.classList.add('is-open');
  historyModal.setAttribute('aria-hidden', 'false');
  modalOverlay.classList.add('is-active');
  modalOverlay.setAttribute('aria-hidden', 'false');
  historyModuleId = module.id;
  historyTitle.textContent = `Historial de ${module.nombre}`;
  renderHistoryTable(module);
}

function closeActiveModal() {
  if (!modalOverlay) return;
  modalOverlay.classList.remove('is-active');
  modalOverlay.setAttribute('aria-hidden', 'true');
  if (moduleEditor?.classList.contains('is-open')) {
    moduleEditor.classList.remove('is-open');
    moduleEditor.setAttribute('aria-hidden', 'true');
    moduleForm?.reset();
    editingModuleId = null;
  }
  if (historyModal?.classList.contains('is-open')) {
    historyModal.classList.remove('is-open');
    historyModal.setAttribute('aria-hidden', 'true');
    historyTableBody.innerHTML = '';
    historyModuleId = null;
  }
}

function renderHistoryTable(module) {
  if (!historyTableBody) return;
  const records = module.historial?.slice(-HISTORY_LIMIT).reverse() ?? [];
  if (!records.length) {
    historyTableBody.innerHTML = `
      <tr>
        <td colspan="6">Sin registros históricos disponibles</td>
      </tr>
    `;
    return;
  }

  historyTableBody.innerHTML = records
    .map((record) => {
      const sensors = record.sensores ?? {};
      const actuators = record.actuadores ?? {};
      const alertas = record.alertas?.length ? record.alertas.join(' · ') : '—';
      return `
        <tr>
          <td>${formatDateTime(record.timestamp)}</td>
          <td>${formatValue(sensors.humedad, '%')}</td>
          <td>${formatValue(sensors.temperatura, '°C')}</td>
          <td>${formatValue(sensors.nivel, '%')}</td>
          <td>${formatActuators(actuators, Object.keys(actuators))}</td>
          <td>${alertas}</td>
        </tr>
      `;
    })
    .join('');
}

function handleModuleSubmit(formData) {
  if (userRole !== 'admin') return;
  const name = String(formData.get('name') ?? '').trim();
  const humidity = Number(formData.get('humidity'));
  const temperature = Number(formData.get('temperature'));
  const level = Number(formData.get('level'));
  const selectedSensors = formData.getAll('sensors');
  const selectedActuators = formData.getAll('actuators');
  const selectedRoles = new Set(formData.getAll('roles'));
  selectedRoles.add(ADMIN_ROLE);
  const rolesPermitidos = Array.from(selectedRoles);

  if (!name) {
    alert('El nombre de la maceta es obligatorio.');
    return;
  }

  if (!selectedSensors.length) {
    alert('Selecciona al menos un sensor.');
    return;
  }

  if (!selectedActuators.length) {
    alert('Selecciona al menos un actuador.');
    return;
  }

  if (editingModuleId) {
    modules = modules.map((module) => {
      if (module.id !== editingModuleId) return module;
      const updatedModule = {
        ...module,
        nombre: name,
        sensoresDisponibles: selectedSensors,
        actuadoresDisponibles: selectedActuators,
        configuracion: {
          humedadMin: humidity,
          temperaturaMax: temperature,
          aguaMin: level
        },
        actuadores: sanitizeActuators(module.actuadores, selectedActuators)
      };

      if (rolesPermitidos.length) {
        updatedModule.rolesPermitidos = rolesPermitidos;
      }

      const previousAlerts = module.alertasActivas ?? [];
      const recalculatedAlerts = detectAlerts(updatedModule);
      const triggered = recalculatedAlerts.filter((alert) => !previousAlerts.includes(alert));
      const resolved = previousAlerts.filter((alert) => !recalculatedAlerts.includes(alert));

      const eventsToAppend = [createEvent('Configuración actualizada por administrador', 'info')];
      triggered.forEach((alert) => eventsToAppend.push(createEvent(`Alerta: ${alert}`, 'alert')));
      resolved.forEach((alert) => eventsToAppend.push(createEvent(`Alerta resuelta: ${alert}`, 'info')));

      updatedModule.alertasActivas = recalculatedAlerts;
      updatedModule.eventos = appendEvents(module.eventos, eventsToAppend);
      const historyEntry = createHistoryEntry(updatedModule, recalculatedAlerts);
      updatedModule.historial = appendHistory(module.historial, historyEntry);
      updatedModule.ultimaActualizacion = historyEntry.timestamp;

      return updatedModule;
    });
  } else {
    const nextId = modules.length ? Math.max(...modules.map((module) => module.id)) + 1 : 1;
    const newSensors = generateSensorsSnapshot();
    const actuators = sanitizeActuators({}, selectedActuators);
    const newModule = {
      id: nextId,
      nombre: name || `Maceta ${nextId}`,
      estado: 'Conectado',
      sensores: newSensors,
      configuracion: {
        humedadMin: humidity || DEFAULT_CONFIG.humedadMin,
        temperaturaMax: temperature || DEFAULT_CONFIG.temperaturaMax,
        aguaMin: level || DEFAULT_CONFIG.aguaMin
      },
      sensoresDisponibles: selectedSensors,
      actuadoresDisponibles: selectedActuators,
      actuadores,
      historial: [],
      eventos: [],
      alertasActivas: [],
      rolesPermitidos,
      ultimaActualizacion: new Date().toISOString()
    };
    const initialAlerts = detectAlerts(newModule);
    const eventsToAppend = [createEvent('Módulo creado', 'info')];
    if (initialAlerts.length) {
      initialAlerts.forEach((alert) => {
        eventsToAppend.push(createEvent(`Alerta: ${alert}`, 'alert'));
      });
    }
    newModule.alertasActivas = initialAlerts;
    const historyEntry = createHistoryEntry(newModule, initialAlerts);
    newModule.historial = appendHistory(newModule.historial, historyEntry);
    newModule.ultimaActualizacion = historyEntry.timestamp;
    newModule.eventos = appendEvents(newModule.eventos, eventsToAppend);
    modules = [newModule, ...modules];
  }

  saveToStorage(modules);
  syncModulesUI();
  closeActiveModal();
}

function handleCardAction(action, id) {
  const module = modules.find((item) => item.id === id);
  if (!module) return;

  if (action === 'edit') {
    if (userRole !== 'admin') return;
    openModuleEditor(module);
    return;
  }

  if (action === 'delete') {
    if (userRole !== 'admin') return;
    const confirmed = confirm(`¿Deseas eliminar "${module.nombre}"?`);
    if (!confirmed) return;
    modules = modules.filter((item) => item.id !== id);
    saveToStorage(modules);
    syncModulesUI();
    return;
  }

  if (action === 'history') {
    openHistoryModal(module);
  }
}

function toggleActuator(id, actuatorKey) {
  if (userRole !== 'admin') return;
  modules = modules.map((module) => {
    if (module.id !== id) return module;
    if (!module.actuadoresDisponibles.includes(actuatorKey)) return module;
    const current = module.actuadores[actuatorKey];
    const next = current === 'ON' ? 'OFF' : 'ON';
    const updatedActuators = {
      ...module.actuadores,
      [actuatorKey]: next
    };
    const meta = ACTUATOR_META[actuatorKey];
    const message = `${meta.label} ${next === 'ON' ? 'activado' : 'apagado'}`;
    const event = createEvent(message, 'info');
    const historyEntry = createHistoryEntry({ ...module, actuadores: updatedActuators }, module.alertasActivas);
    return {
      ...module,
      actuadores: updatedActuators,
      eventos: appendEvents(module.eventos, [event]),
      historial: appendHistory(module.historial, historyEntry),
      ultimaActualizacion: historyEntry.timestamp
    };
  });
  saveToStorage(modules);
  syncModulesUI();
}

function toggleConnection(id) {
  modules = modules.map((module) => {
    if (module.id !== id) return module;
    const isConnected = module.estado === 'Conectado';
    const nextState = isConnected ? 'Desconectado' : 'Conectado';
    const event = createEvent(
      isConnected ? 'Módulo desconectado por administrador' : 'Módulo reconectado',
      isConnected ? 'warning' : 'info'
    );
    const updated = {
      ...module,
      estado: nextState,
      alertasActivas: isConnected ? [] : module.alertasActivas,
      eventos: appendEvents(module.eventos, [event])
    };
    if (isConnected) {
      updated.actuadores = sanitizeActuators({}, module.actuadoresDisponibles);
    }
    if (!isConnected) {
      updated.alertasActivas = detectAlerts(updated);
    }
    updated.historial = appendHistory(
      module.historial,
      createHistoryEntry(updated, updated.alertasActivas)
    );
    updated.ultimaActualizacion = updated.historial[updated.historial.length - 1]?.timestamp ?? updated.ultimaActualizacion;
    return updated;
  });
  saveToStorage(modules);
  syncModulesUI();
}

function startSimulation() {
  if (simulationInterval) clearInterval(simulationInterval);
  runSimulationStep();
  simulationInterval = setInterval(runSimulationStep, 5000);
}

function runSimulationStep() {
  modules = modules.map((module) => {
    if (module.estado !== 'Conectado') return module;
    const newSensors = simulateSensorValues(module);
    const candidate = { ...module, sensores: newSensors };
    const alerts = detectAlerts(candidate);
    const previousAlerts = module.alertasActivas ?? [];
    const triggered = alerts.filter((alert) => !previousAlerts.includes(alert));
    const resolved = previousAlerts.filter((alert) => !alerts.includes(alert));

    const events = [];
    triggered.forEach((alert) => {
      events.push(createEvent(`Alerta: ${alert}`, 'alert'));
    });
    resolved.forEach((alert) => {
      events.push(createEvent(`Alerta resuelta: ${alert}`, 'info'));
    });

    const historyEntry = createHistoryEntry(candidate, alerts);
    const nextModule = {
      ...candidate,
      historial: appendHistory(module.historial, historyEntry),
      eventos: appendEvents(module.eventos, events),
      alertasActivas: alerts,
      ultimaActualizacion: historyEntry.timestamp
    };
    return nextModule;
  });

  saveToStorage(modules);
  renderModules();
  updateSummary();
  renderAdminModules();
}

function simulateSensorValues(module) {
  const base = { ...module.sensores };
  if (module.sensoresDisponibles.includes('humedad')) {
    base.humedad = clamp(base.humedad + getRandomVariation(-4, 4), 0, 100);
  }
  if (module.sensoresDisponibles.includes('temperatura')) {
    base.temperatura = clamp(base.temperatura + getRandomVariation(-1, 1), 5, 45);
  }
  if (module.sensoresDisponibles.includes('nivel')) {
    base.nivel = clamp(base.nivel + getRandomVariation(-3, 3), 0, 100);
  }
  return base;
}

function detectAlerts(module) {
  const alerts = [];
  if (
    module.sensoresDisponibles.includes('humedad') &&
    module.sensores.humedad < module.configuracion.humedadMin
  ) {
    alerts.push('Humedad baja');
  }
  if (
    module.sensoresDisponibles.includes('temperatura') &&
    module.sensores.temperatura > module.configuracion.temperaturaMax
  ) {
    alerts.push('Temperatura alta');
  }
  if (module.sensoresDisponibles.includes('nivel') && module.sensores.nivel < module.configuracion.aguaMin) {
    alerts.push('Nivel de agua bajo');
  }
  return alerts;
}

function createHistoryEntry(module, alerts = []) {
  return {
    timestamp: new Date().toISOString(),
    sensores: { ...module.sensores },
    actuadores: { ...module.actuadores },
    alertas: [...alerts]
  };
}

function createEvent(mensaje, tipo = 'info') {
  return {
    timestamp: new Date().toISOString(),
    mensaje,
    tipo
  };
}

function appendHistory(historial = [], entry) {
  return [...historial, entry].slice(-HISTORY_LIMIT);
}

function appendEvents(eventos = [], nuevosEventos = []) {
  if (!nuevosEventos.length) return eventos.slice(-LOG_LIMIT);
  return [...eventos, ...nuevosEventos].slice(-LOG_LIMIT);
}

function formatActuators(actuadores = {}, disponibles = []) {
  if (!disponibles?.length) return 'Sin configuración';
  return disponibles
    .map((key) => {
      const meta = ACTUATOR_META[key] ?? { label: key };
      const state = actuadores[key] ?? 'OFF';
      return `${meta.label}: ${state}`;
    })
    .join(' · ');
}

function formatValue(value, unit = '') {
  if (typeof value !== 'number' || Number.isNaN(value)) return '—';
  return `${value}${unit}`;
}

function formatLastUpdate(timestamp) {
  const relative = formatRelativeTime(timestamp);
  return `Actualizado ${relative}`;
}

function formatRelativeTime(timestamp) {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return 'hace instantes';
  const diffMs = Date.now() - date.getTime();
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (diffMs < minute) {
    return 'hace instantes';
  }
  if (diffMs < hour) {
    const minutes = Math.round(diffMs / minute);
    return `hace ${minutes} min`;
  }
  if (diffMs < day) {
    const hours = Math.round(diffMs / hour);
    return `hace ${hours} h`;
  }

  return `el ${date.toLocaleDateString()} ${date.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit'
  })}`;
}

function formatDateTime(timestamp) {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return '—';
  return `${date.toLocaleDateString()} ${date.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit'
  })}`;
}

function formatTime(timestamp) {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return '--:--';
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function normalizeTimestamp(value) {
  if (!value) {
    return new Date().toISOString();
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return new Date().toISOString();
  }
  return date.toISOString();
}

function getRandomValue(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function getRandomVariation(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function generateSensorsSnapshot() {
  return {
    humedad: getRandomValue(40, 70),
    temperatura: getRandomValue(18, 28),
    nivel: getRandomValue(35, 80)
  };
}

function applyRoleRestrictions() {
  if (addPotButton) {
    addPotButton.toggleAttribute('disabled', userRole !== 'admin');
  }
  if (adminToggleButton) {
    adminToggleButton.toggleAttribute('disabled', userRole !== 'admin');
  }
  if (userRole !== 'admin' && adminPanel?.classList.contains('is-open')) {
    closeAdminPanel();
  }
  if (userRole !== 'admin' && moduleEditor?.classList.contains('is-open')) {
    closeActiveModal();
  }
}
