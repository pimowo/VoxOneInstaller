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
const statusEl = document.getElementById('status');
const logEl = document.getElementById('log');

// --- Funkcje pomocnicze ---
const log = (msg) => {
  console.log(msg);
  logEl.textContent += `${msg}\n`;
  logEl.scrollTop = logEl.scrollHeight;
};

const setStatus = (text, isError = false) => {
  statusEl.textContent = text;
  statusEl.style.color = isError ? 'var(--red)' : 'var(--yellow)';
};

// --- Inicjalizacja ---
async function init() {
  if (!('serial' in navigator)) {
    log('BŁĄD: Web Serial nie jest dostępny. Użyj Chrome/Edge.');
    setStatus('Twoja przeglądarka nie wspiera Web Serial.', true);
    return;
  }

  try {
    const res = await fetch('./profiles.json');
    manifest = await res.json();
    renderProfiles(manifest.profiles);
    log(`Wczytano manifest: ${manifest.profiles.length} profili.`);
  } catch (e) {
    log(`Błąd wczytywania manifestu: ${e.message}`);
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
  
  btnConnect.disabled = false;
  btnFlash.disabled = true; // Reset przycisku wgrywania przy zmianie profilu
  setStatus(`Wybrano profil: ${profile.label}. Podłącz płytkę i kliknij Połącz.`);
  log(`Wybrano profil: ${profile.label} (wymagany chip: ${profile.chip})`);
}

// --- Logika połączenia ---
btnConnect.addEventListener('click', async () => {
  if (!selectedProfile) return;

  btnConnect.disabled = true;
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
        writeLine: (data) => log(data),
        write: (data) => log(data),
      },
    });

    // 3. Próba połączenia (reset do bootloadera i synchronizacja)
    log('Resetowanie i łączenie z bootloaderem...');
    await loader.main();

    // 4. Weryfikacja chipu
    const detectedChip = loader.chip.CHIP_NAME.toLowerCase(); // np. "esp32-s3"
    log(`Wykryto układ: ${detectedChip}`);

    // Prosta weryfikacja (usuwamy myślniki, żeby "esp32-s3" pasowało do "esp32s3")
    const expectedChip = selectedProfile.chip.toLowerCase().replace('-', '');
    const actualChip = detectedChip.replace('-', '');

    if (actualChip !== expectedChip) {
      throw new Error(`Niezgodność chipu! Wybrano profil dla ${selectedProfile.chip}, a wykryto ${detectedChip}.`);
    }

    // Sukces
    log('Weryfikacja chipu zakończona pomyślnie.');
    setStatus('Połączono pomyślnie. Możesz wgrać firmware.', false);
    btnFlash.disabled = false;

  } catch (e) {
    btnConnect.disabled = false;
    btnFlash.disabled = true;
    await disconnect();

    if (e.name === 'NotFoundError' || e.message.includes('No port selected')) {
      setStatus('Anulowano wybór portu. Upewnij się, że płytka jest podłączona i spróbuj ponownie.', false);
      log('Anulowano okno wyboru portu.');
    } else {
      log(`Błąd połączenia: ${e.message}`);
      setStatus(`Błąd: ${e.message}`, true);
    }
  }
});

// --- Logika wgrywania firmware ---
btnFlash.addEventListener('click', async () => {
  btnConnect.disabled = true;
  btnFlash.disabled = true;
  setStatus('Pobieranie firmware...');

  try {
    if (selectedProfile.bin.includes('example.com')) {
      throw new Error('Brak prawdziwego pliku firmware (placeholder)');
    }

    const res = await fetch(selectedProfile.bin);

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
    log('Firmware wgrany pomyślnie.');
    btnConnect.disabled = false;
  } catch (e) {
    log(`Błąd wgrywania: ${e.message}`);
    setStatus(`Błąd: ${e.message}`, true);
    btnConnect.disabled = false;
    btnFlash.disabled = false;
  }
});

// --- Funkcja rozłączania ---
async function disconnect() {
  try {
    if (transport) {
      await transport.disconnect();
    }
    port = null;
    transport = null;
    loader = null;
  } catch (e) {
    console.error('Błąd podczas rozłączania:', e);
  }
}

// Start
init();
