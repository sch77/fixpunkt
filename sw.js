// Service Worker für Fixpunkt auf GitHub Pages.
// Nimmt geteilte Inhalte an (Web Share Target unter Windows und Android), legt sie in IndexedDB ab
// und öffnet die Seite mit ?geteilt; so verlässt nichts Geteiltes das Gerät. Die Seite selbst lädt
// er zuerst aus dem Netz und hält eine Kopie für den Start ohne Verbindung vor.
'use strict';
const LAGER = 'fixpunkt-seite';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (e) => {
  const anfrage = e.request;
  if (anfrage.method === 'POST' && new URL(anfrage.url).pathname.endsWith('/teilen')) {
    e.respondWith(nimmGeteiltes(anfrage));
  } else if (anfrage.method === 'GET' && anfrage.mode === 'navigate') {
    e.respondWith(seite(anfrage));
  }
});

async function seite(anfrage) {
  const lager = await caches.open(LAGER);
  try {
    const antwort = await fetch(anfrage);
    if (antwort.ok) await lager.put(self.registration.scope, antwort.clone());
    return antwort;
  } catch {
    return (await lager.match(self.registration.scope)) || Response.error();
  }
}

async function nimmGeteiltes(anfrage) {
  const daten = await anfrage.formData();
  const eintrag = {
    titel: String(daten.get('titel') || ''),
    text: String(daten.get('text') || ''),
    url: String(daten.get('url') || ''),
  };
  const datei = daten.get('datei');
  // Wie die Seite legt er Bytes ab, keine Datei, weil WebKit File und Blob in IndexedDB abweist
  if (datei && typeof datei === 'object' && datei.size) {
    eintrag.daten = await datei.arrayBuffer();
    eintrag.name = datei.name;
    eintrag.typ = datei.type;
  }
  await ablegen(eintrag);
  return Response.redirect(new URL('./?geteilt', self.registration.scope).href, 303);
}

function ablegen(eintrag) {
  return new Promise((ok, fehl) => {
    const offen = indexedDB.open('fixpunkt', 1);
    offen.onupgradeneeded = () => offen.result.createObjectStore('dateien');
    offen.onerror = () => fehl(offen.error);
    offen.onsuccess = () => {
      const db = offen.result;
      const tx = db.transaction('dateien', 'readwrite');
      tx.objectStore('dateien').put(eintrag, 'geteilt');
      tx.oncomplete = () => { db.close(); ok(); };
      tx.onerror = () => { db.close(); fehl(tx.error); };
    };
  });
}
