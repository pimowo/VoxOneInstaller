import { ESPLoader, Transport } from './vendor/esptool-js.bundle.js';

const logEl = document.getElementById('log');
const log = (msg) => { console.log(msg); logEl.textContent += `${msg}\n`; };

if (!('serial' in navigator)) {
  log('Web Serial nie jest dostępny. Otwórz w Chrome/Edge na laptopie przez http://localhost:5500');
} else {
  log('Web Serial dostępny.');
}

try {
  const res = await fetch('./profiles.json');
  const manifest = await res.json();
  log(`Wczytano manifest: ${manifest.profiles?.length ?? 0} profili`);
} catch (e) {
  log(`Błąd wczytywania manifestu: ${e.message}`);
}

log(`ESPLoader: ${typeof ESPLoader}`);
log(`Transport: ${typeof Transport}`);
