import { ESPLoader, Transport } from './vendor/esptool-js.bundle.js';

// --- Stan aplikacji ---
let manifest = null;
let selectedProfile = null;
let port = null;
let transport = null;
let loader = null;

// --- Elementy DOM ---
const profilesEl = document.getElementById('profiles');
const btnConnect = document.getElementById('btn-connect');
const btnFlash = document.getElementById('btn-flash');
const btnErase = document.getElementById('btn-erase');
const versionSelect = document.getElementById('version-select');
const statusEl = document.getElementById('status');
const logEl = document.getElementById('log');
const tabLinks = document.querySelectorAll('.tabs [data-tab-target]');
const tabPanels = document.querySelectorAll('.tab-panel');

// --- Funkcje pomocnicze ---
const log = (msg, type = 'info') => {
  console.log(msg);
  const classByType = {
    error: 'log-error',
    success: 'log-success',
    progress: 'log-progress',
    info: 'log-info',
  };
  const entry = document.createElement('div');
  entry.className = classByType[type] || classByType.info;
  entry.textContent = msg;
  logEl.appendChild(entry);
  logEl.scrollTop = logEl.scrollHeight;
};

const setStatus = (text, isError = false) => {
  statusEl.textContent = text;
  statusEl.style.color = isError ? 'var(--red)' : 'var(--yellow)';
};

const normalizeVersion = (version) => version.replace(/\s*\(najnowsza\)\s*/i, '').trim();

const compareFirmwareVersions = (a, b) => {
  const aVersion = normalizeVersion(a.version);
  const bVersion = normalizeVersion(b.version);
  return bVersion.localeCompare(aVersion, undefined, { numeric: true, sensitivity: 'base' });
};

function resetVersionSelect(message = 'Najpierw wybierz profil') {
  versionSelect.replaceChildren(new Option(message, ''));
  versionSelect.disabled = true;
}

// --- Nawigacja zakładek ---
function activateTab(targetId) {
  const targetPanel = document.getElementById(targetId);
  if (!targetPanel) return;

  tabPanels.forEach(panel => {
    panel.hidden = panel !== targetPanel;
  });

  tabLinks.forEach(link => {
    if (link.dataset.tabTarget === targetId) {
      link.setAttribute('aria-current', 'page');
    } else {
      link.removeAttribute('aria-current');
    }
  });
}

function requestedTabId() {
  const targetId = window.location.hash.slice(1);
  return Array.from(tabPanels).some(panel => panel.id === targetId) ? targetId : 'tab-installer';
}

tabLinks.forEach(link => {
  link.addEventListener('click', event => {
    event.preventDefault();
    const targetId = link.dataset.tabTarget;
    activateTab(targetId);
    if (window.location.hash !== `#${targetId}`) {
      window.history.pushState(null, '', `#${targetId}`);
    }
  });
});

window.addEventListener('popstate', () => activateTab(requestedTabId()));
activateTab(requestedTabId());

// --- Inicjalizacja ---
async function init() {
  resetVersionSelect();

  if (!('serial' in navigator)) {
    log('BŁĄD: Web Serial nie jest dostępny. Użyj Chrome/Edge.', 'error');
    setStatus('Twoja przeglądarka nie wspiera Web Serial.', true);
    return;
  }

  try {
    const res = await fetch('./profiles.json');
    manifest = await res.json();
    renderProfiles(manifest.profiles);
    log(`Wczytano manifest: ${manifest.profiles.length} profili.`, 'info');
  } catch (e) {
    selectedProfile = null;
    resetVersionSelect('Nie udało się wczytać wersji');
    log(`Błąd wczytywania manifestu: ${e.message}`, 'error');
    setStatus('Nie udało się wczytać listy profili.', true);
  }
}

// --- Renderowanie profili ---
function renderProfiles(profiles) {
  profilesEl.innerHTML = '';
  profiles.forEach(profile => {
    const card = document.createElement('div');
    card.className = 'profile-card';
    card.innerHTML = `
      <h3>${profile.label}</h3>
      <p>Chip: ${profile.chip}</p>
    `;
    card.addEventListener('click', () => selectProfile(profile, card));
    profilesEl.appendChild(card);
  });
}

function selectProfile(profile, card) {
  document.querySelectorAll('.profile-card').forEach(c => c.classList.remove('selected'));
  card.classList.add('selected');
  selectedProfile = profile;

  const versions = [...(profile.versions || [])]
    .filter(version => version.version && version.bin)
    .sort(compareFirmwareVersions);

  if (versions.length === 0) {
    resetVersionSelect('Brak dostępnych wersji');
    btnConnect.disabled = true;
    btnFlash.disabled = true;
    btnErase.disabled = true;
    setStatus(`Brak firmware dla profilu ${profile.label}.`, true);
    log(`Profil ${profile.label} nie ma dostępnych wersji firmware.`, 'error');
    return;
  }

  versionSelect.replaceChildren(...versions.map((version, index) => {
    const label = normalizeVersion(version.version);
    return new Option(index === 0 ? `${label} (najnowsza)` : label, version.bin);
  }));
  versionSelect.selectedIndex = 0;
  versionSelect.disabled = false;

  btnConnect.disabled = false;
  btnFlash.disabled = true; // Reset przycisku wgrywania przy zmianie profilu
  btnErase.disabled = true;
  setStatus(`Wybrano profil: ${profile.label}. Podłącz płytkę i kliknij Połącz.`);
  log(`Wybrano profil: ${profile.label} (wymagany chip: ${profile.chip})`, 'info');
}

// --- Logika połączenia ---
btnConnect.addEventListener('click', async () => {
  if (!selectedProfile) return;

  btnConnect.disabled = true;
  btnErase.disabled = true;
  setStatus('Łączenie z płytką...');

  try {
    // 1. Wybór portu (okno systemowe)
    port = await navigator.serial.requestPort();
    
    // 2. Inicjalizacja transportu i loadera
    transport = new Transport(port, true);
    loader = new ESPLoader({
      transport,
      baudrate: 921600,
      terminal: {
        clean: () => {},
        writeLine: (data) => log(data, 'progress'),
        write: (data) => log(data, 'progress'),
      },
    });

    // 3. Próba połączenia (reset do bootloadera i synchronizacja)
    log('Resetowanie i łączenie z bootloaderem...', 'progress');
    await loader.main();

    // 4. Weryfikacja chipu
    const detectedChip = loader.chip.CHIP_NAME.toLowerCase(); // np. "esp32-s3"
    log(`Wykryto układ: ${detectedChip}`, 'info');

    // Prosta weryfikacja (usuwamy myślniki, żeby "esp32-s3" pasowało do "esp32s3")
    const expectedChip = selectedProfile.chip.toLowerCase().replace('-', '');
    const actualChip = detectedChip.replace('-', '');

    if (actualChip !== expectedChip) {
      throw new Error(`Niezgodność chipu! Wybrano profil dla ${selectedProfile.chip}, a wykryto ${detectedChip}.`);
    }

    // Sukces
    log('Weryfikacja chipu zakończona pomyślnie.', 'success');
    setStatus('Połączono pomyślnie. Możesz wgrać firmware.', false);
    btnFlash.disabled = false;
    btnErase.disabled = !loader || !transport;

  } catch (e) {
    btnConnect.disabled = false;
    btnFlash.disabled = true;
    btnErase.disabled = true;
    await disconnect();

    if (e.name === 'NotFoundError' || e.message.includes('No port selected')) {
      setStatus('Anulowano wybór portu. Upewnij się, że płytka jest podłączona i spróbuj ponownie.', false);
      log('Anulowano okno wyboru portu.', 'info');
    } else {
      log(`Błąd połączenia: ${e.message}`, 'error');
      setStatus(`Błąd: ${e.message}`, true);
    }
  }
});

// --- Logika wgrywania firmware ---
btnFlash.addEventListener('click', async () => {
  btnConnect.disabled = true;
  btnFlash.disabled = true;
  btnErase.disabled = true;
  setStatus('Pobieranie firmware...');

  try {
    const firmwareUrl = document.getElementById('version-select').value;

    if (!firmwareUrl) {
      throw new Error('Nie wybrano wersji firmware');
    }

    if (firmwareUrl.includes('example.com')) {
      throw new Error('Brak prawdziwego pliku firmware (placeholder)');
    }

    const res = await fetch(firmwareUrl);

    if (!res.ok) {
      throw new Error(`Nie udało się pobrać firmware (${res.status})`);
    }

    const binaryData = new Uint8Array(await res.arrayBuffer());

    setStatus('Wgrywanie firmware...');
    await loader.writeFlash({
      fileArray: [{ data: binaryData, address: 0x10000 }],
      flashSize: 'keep',
      eraseAll: false,
      compress: true,
      reportProgress: (fileIndex, written, total) => {
        setStatus(`Wgrywanie: ${Math.round((written / total) * 100)}%`);
      },
    });

    await loader.after();

    setStatus('Wgrywanie zakończone sukcesem!', false);
    log('Firmware wgrany pomyślnie.', 'success');
    btnConnect.disabled = false;
  } catch (e) {
    log(`Błąd wgrywania: ${e.message}`, 'error');
    setStatus(`Błąd: ${e.message}`, true);
    btnConnect.disabled = false;
    btnFlash.disabled = !loader || !transport;
    btnErase.disabled = !loader || !transport;
  }
});

// --- Logika pełnego kasowania pamięci ---
btnErase.addEventListener('click', async () => {
  if (!loader || !transport) {
    btnErase.disabled = true;
    return;
  }

  btnConnect.disabled = true;
  btnFlash.disabled = true;
  btnErase.disabled = true;
  setStatus('Kasowanie pamięci...');

  try {
    await loader.eraseFlash();
    await loader.after();
    await disconnect();

    setStatus('Pamięć wyczyszczona pomyślnie!', false);
    log('Pamięć flash wyczyszczona pomyślnie.', 'success');
    btnConnect.disabled = true;
    btnFlash.disabled = true;
    btnErase.disabled = true;
  } catch (e) {
    log(`Błąd kasowania pamięci: ${e.message}`, 'error');
    setStatus(`Błąd: ${e.message}`, true);
    btnConnect.disabled = false;
    btnFlash.disabled = !loader || !transport;
    btnErase.disabled = !loader || !transport;
  }
});

// --- Funkcja rozłączania ---
async function disconnect() {
  try {
    if (transport) {
      await transport.disconnect();
    }
  } catch (e) {
    console.error('Błąd podczas rozłączania:', e);
  } finally {
    port = null;
    transport = null;
    loader = null;
  }
}

// Start
init();
