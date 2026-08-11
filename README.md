# WebRTC Live Monitor

**WebRTC Live Monitor** ist eine schlanke Chrome-Erweiterung (Manifest V3), die für den aktiven Tab live die Zahl offener `RTCPeerConnection`-Instanzen und ihrer Audio-/Videokanäle anzeigt. Sie liest **nicht** `chrome://webrtc-internals` aus und erfasst keine Medieninhalte.

## Installation

1. Dieses Repository lokal bereitstellen.
2. In Chrome `chrome://extensions` öffnen und den **Entwicklermodus** aktivieren.
3. **Entpackte Erweiterung laden** wählen und den Repository-Ordner auswählen.
4. Eine WebRTC-Seite öffnen und das Erweiterungssymbol anklicken.

Die Mindestversion ist Chrome 111. Der Grund ist die deklarative Ausführung eines Content Scripts in der `MAIN` World. Beide Content Scripts starten mit `document_start` und in allen Frames. Die verwendeten MV3-Mechanismen sind in der offiziellen Dokumentation zu [Content Scripts und Ausführungswelten](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts), [`chrome.storage.session`](https://developer.chrome.com/docs/extensions/reference/api/storage#property-session), [Messaging](https://developer.chrome.com/docs/extensions/develop/concepts/messaging) und [`webNavigation`](https://developer.chrome.com/docs/extensions/reference/api/webNavigation) beschrieben.

## Angezeigte Werte und genaue Kanaldefinition

Berücksichtigt werden ausschließlich Peer Connections mit `connectionState !== "closed"`:

- **Ausgehendes Audio/Video:** ein Audio-/Video-Track eines `RTCRtpSender`, dessen `readyState` nicht `ended` ist.
- **Eingehendes Audio/Video:** ein Audio-/Video-Track eines `RTCRtpReceiver`, dessen `readyState` nicht `ended` ist.
- Derselbe Track wird innerhalb einer Peer Connection und Richtung anhand seiner Objektidentität nur einmal gezählt.
- **Gesamt** ist jeweils eingehend plus ausgehend. Das Badge ist Audio gesamt plus Video gesamt.
- Eine offene Peer Connection ohne Tracks wird als eine Verbindung und null Medienkanäle angezeigt.

Ein Browser kann einem Receiver bereits vor tatsächlich fließenden RTP-Medien einen nicht beendeten Track zuordnen. Ohne Statistiken auszulesen lässt sich „vorhanden“ nicht zuverlässig von „empfängt gerade Daten“ unterscheiden. Dieses MVP folgt daher bewusst der obigen Track-Definition und behauptet keine Aktivität auf Paketebene.

## Architektur

1. `src/main-world.js` ersetzt den globalen Konstruktor durch einen transparent weiterleitenden Wrapper. Er beobachtet Erstellung, `addTrack`, `removeTrack`, `addTransceiver`, `replaceTrack`, `track`, `connectionstatechange`, Track-`ended` und `close`. Eine Synchronisierung alle 2,5 Sekunden ergänzt die ereignisbasierten Updates.
2. `src/content-bridge.js` läuft isoliert, validiert Struktur, Version, Herkunftsfenster, Wertebereiche und Summen der Page-World-Nachrichten und leitet nur Zähler weiter.
3. `src/service-worker.js` hält Werte getrennt nach Tab und Frame, aggregiert sie über `src/counting.js`, aktualisiert das Badge und persistiert den flüchtigen Zustand in `chrome.storage.session`. Navigationen, Frame-Wechsel und geschlossene Tabs bereinigen alte Einträge.
4. Das Popup fragt ausschließlich den aktiven Tab ab, hört auf Live-Updates und kann dessen gespeicherten Zustand zurücksetzen. Das Action-Icon wird beim Start mit `OffscreenCanvas` erzeugt, sodass das Repository keine binären Bilddateien benötigt.

`<all_urls>` ist als Host-Zugriff erforderlich, damit die Instrumentierung bei `document_start` auf beliebigen WebRTC-Webseiten und in deren Frames aktiv sein kann. `storage`, `tabs` und `webNavigation` dienen ausschließlich Session-Zustand, aktivem Tab und zuverlässiger Navigationsbereinigung. Es gibt keinen Build-Schritt und keine Laufzeitabhängigkeiten.

## Datenschutz und Sicherheit

Die Erweiterung:

- liest, zeichnet oder speichert keine Audio-/Videodaten;
- speichert weder SDP, IP-Adressen, URLs, Codecs, Bitraten, Paketstatistiken noch ICE-Details;
- sendet keine Telemetrie und kontaktiert keine externen Server;
- persistiert nur nichtnegative Zähler, Dokumentkennung und Aktualisierungszeit im arbeitsspeicherartigen Session Storage.

Die Kommunikation aus der Main World muss die DOM-Nachrichtenbrücke passieren. Die isolierte Bridge akzeptiert nur Nachrichten vom eigenen `window`, mit festem Namespace und Protokollversion, bekannten Nachrichtentypen, begrenzten Ganzzahlen und konsistenten Summen. Der Service Worker vertraut Tab- und Frame-Identität nur den von Chrome gelieferten `sender`-Metadaten an. **Einschränkung:** Seiten-Code kann den bekannten Namespace sehen und passende `window.postMessage`-Nachrichten imitieren. Die Validierung begrenzt Form und Auswirkung, kann Spoofing innerhalb desselben Seitenkontexts aber nicht kryptografisch verhindern. Die Werte sind deshalb Diagnoseinformationen, keine Sicherheitsentscheidung.

## Tests

```bash
npm test
npm run check
```

Die Node-Tests prüfen leere Zustände, Normalisierung, Summenbildung über mehrere Frames und getrennte Tabs. Der Check parst Manifest und JavaScript, prüft die minimal erwarteten Berechtigungen, `document_start`, alle Frames und die quelltextbasierte Icon-Erzeugung.

### Lokales Browser-Harness

Einen lokalen Server starten (WebRTC ist auf `localhost` als sicherem Kontext verfügbar):

```bash
python3 -m http.server 8000
```

Dann `http://localhost:8000/test-harness/` öffnen. Die Schaltflächen decken ab: keine Verbindung, Verbindung ohne Tracks, ausgehendes Audio, Audio plus Video, mehrere Connections, eingehendes Audio über lokalen Loopback, `replaceTrack`, Entfernen/Beenden, Schließen, Reload und getrennte Tabs. Das eingebettete Frame deckt den Iframe-Fall ab. Für Navigation kann zusätzlich zwischen Harness- und Frame-URL gewechselt werden. Es werden keine externen Dienste und keine Geräteberechtigungen benötigt.

## Bekannte Einschränkungen

- Bereits vor dem frühestmöglichen `document_start` durch browserinterne Abläufe erzeugte Objekte können grundsätzlich nicht rückwirkend entdeckt werden; normaler Seitencode wird ab `document_start` instrumentiert.
- Geschützte Chrome-Seiten, der Chrome Web Store und andere für Erweiterungen gesperrte Schemes können nicht instrumentiert werden.
- Eine Seite kann den Konstruktor nach der Installation selbst ersetzen oder die Nachrichtenbrücke imitieren.
- Das Zurücksetzen löscht den aktuellen Tab-Zustand; solange WebRTC weiterläuft, stellt die periodische Synchronisierung ihn erwartungsgemäß wieder her.
- Das MVP zeigt absichtlich keine Bitrate, Codecs, Paketverlust-, SDP-, ICE- oder IP-Daten.

## Automatischer GitHub-Build und Download

Der Workflow `.github/workflows/build-extension.yml` testet und paketiert die Erweiterung bei jedem Push, Pull Request und manuellen Start:

1. Auf GitHub den Tab **Actions** öffnen und **Build Chrome extension** auswählen.
2. Einen erfolgreichen Lauf öffnen.
3. Unter **Artifacts** das Archiv `webrtc-live-monitor-<commit>` herunterladen.
4. Das heruntergeladene Workflow-Artifact entpacken; darin befinden sich `webrtc-live-monitor.zip` und die SHA-256-Prüfsumme.
5. `webrtc-live-monitor.zip` ebenfalls entpacken.
6. In Chrome `chrome://extensions` öffnen, den Entwicklermodus aktivieren, **Entpackte Erweiterung laden** wählen und den zuletzt entpackten Ordner auswählen.

Für einen dauerhaft öffentlich herunterladbaren Release muss die Version in `manifest.json` beispielsweise `1.1.0` lauten und ein passender Tag gepusht werden:

```bash
git tag v1.1.0
git push origin v1.1.0
```

Bei einem `v*`-Tag prüft der Workflow, dass Tag und Manifestversion übereinstimmen, und legt anschließend automatisch einen GitHub Release mit ZIP und SHA-256-Datei an. Normale Workflow-Artefakte bleiben 30 Tage verfügbar. Das Paket enthält ausschließlich die zum Laden der Erweiterung erforderlichen Manifest-, Popup- und `src`-Dateien; Tests, Harness, Repository-Metadaten und Dokumentation werden nicht in die installierbare ZIP aufgenommen.

Der gleiche Build kann lokal mit `npm run package` erzeugt werden. Die Ausgabe liegt danach unter `dist/webrtc-live-monitor.zip`.
