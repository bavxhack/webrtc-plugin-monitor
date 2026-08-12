# WebRTC Live Monitor

**WebRTC Live Monitor** ist eine schlanke Chrome-Erweiterung (Manifest V3), die für den aktiven Tab live die Zahl offener `RTCPeerConnection`-Instanzen und ihrer Audio-, Kamera-Video- und Bildschirmfreigabekanäle anzeigt. Sie erfasst dabei keine Medieninhalte.

## Installation

1. Dieses Repository lokal bereitstellen.
2. In Chrome `chrome://extensions` öffnen und den **Entwicklermodus** aktivieren.
3. **Entpackte Erweiterung laden** wählen und den Repository-Ordner auswählen.
4. Eine WebRTC-Seite öffnen und das Erweiterungssymbol anklicken.

Der Quellstand verwendet eine dreiteilige Basisversion. Der GitHub-Actions-Workflow ergänzt beim Paketieren die jeweilige Run-Nummer als vierte Chrome-Versionskomponente, beispielsweise `1.3.0.42`. Dadurch ist jedes erzeugte Artefakt eindeutig einem Workflow-Lauf zugeordnet.

Nach einem erfolgreichen Push auf `main` veröffentlicht der Workflow einen als Vorabversion gekennzeichneten GitHub Release `main-<Run-Nummer>`. An diesem Release hängen das installierbare ZIP und seine SHA-256-Prüfsumme; der Release verweist auf den zugehörigen Commit aus `main`.

Die Mindestversion ist Chrome 111. Der Grund ist die deklarative Ausführung eines Content Scripts in der `MAIN` World. Beide Content Scripts starten mit `document_start` und in allen Frames. Die verwendeten MV3-Mechanismen sind in der offiziellen Dokumentation zu [Content Scripts und Ausführungswelten](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts), [`chrome.storage.session`](https://developer.chrome.com/docs/extensions/reference/api/storage#property-session), [Messaging](https://developer.chrome.com/docs/extensions/develop/concepts/messaging) und [`webNavigation`](https://developer.chrome.com/docs/extensions/reference/api/webNavigation) beschrieben.

## Angezeigte Werte und genaue Kanaldefinition

Berücksichtigt werden ausschließlich Peer Connections mit `connectionState !== "closed"`. Die Kanalwerte stammen aus den standardisierten `RTCStatsReport`-Feldern `inbound-rtp` und `outbound-rtp`:

- **Ausgehendes Audio/Kamera-Video:** ein lokaler `outbound-rtp`-Report, für den bereits mindestens ein Paket gesendet wurde.
- **Eingehendes Audio/Kamera-Video:** ein lokaler `inbound-rtp`-Report, für den tatsächlich mindestens ein Paket empfangen wurde. Vorab angelegte Receiver ohne RTP-Verkehr werden dadurch nicht mehr fälschlich gezählt.
- Simulcast-Layer werden anhand ihrer MID zu einem Medienkanal zusammengefasst. Separate RTX-, RED-, ULPFEC- und FlexFEC-Reparaturreports werden nicht als zusätzliche Streams gezählt.
- Die Bitrate wird aus der Differenz von `bytesReceived` beziehungsweise `bytesSent` und den Report-Zeitstempeln zweier aufeinanderfolgender Abfragen berechnet. Beim ersten Messpunkt wird deshalb zunächst `0 kbit/s` angezeigt.
- **Bildschirmfreigabe:** Ausgehende Tracks werden zuverlässig an ihrem Ursprung aus `getDisplayMedia()` erkannt und über Track-ID beziehungsweise MID dem RTP-Report zugeordnet. Eingehende Freigaben werden separat angezeigt, wenn der Browser sie im RTP-Report als `screenshare`, `screen`, `window` oder `browser` kennzeichnet; ohne diese optionale Kennzeichnung kann ein entfernter Track technisch nicht zuverlässig von einem Kamera-Track unterschieden werden.
- **Gesamt** ist jeweils eingehend plus ausgehend. Das Badge summiert Audio, Kamera-Video und Bildschirmfreigaben.
- Eine offene Peer Connection ohne Tracks wird als eine Verbindung und null Medienkanäle angezeigt.
- Der Abschnitt **Verbindungsstatus** aggregiert `new`, `connecting`, `connected`, `disconnected` und `failed` über alle Frames des Tabs. Geschlossene Verbindungen werden nicht als aktiv gezählt; unbekannte zukünftige Zustände erzeugen keinen erfundenen Statuswert.

Ein Browser kann einem Receiver bereits vor tatsächlich fließenden RTP-Medien einen nicht beendeten Track zuordnen. Nicht ausgehandelte, nur sendende oder gestoppte Transceiver werden deshalb nicht mehr als eingehend gezählt. Auch bei einem ausgehandelten Empfang lässt sich ohne Statistiken weiterhin nicht zuverlässig feststellen, ob gerade RTP-Pakete fließen; das MVP behauptet keine Aktivität auf Paketebene.

Die Zähler messen bewusst **MediaStreamTracks und nicht RTP-Streams/SSRCs**. Simulcast kann einen einzigen ausgehenden Video-Track über beispielsweise drei RTP-Encoding-Layer senden. Die Rohstatistik kann dafür drei ausgehende RTP-Streams enthalten, während WebRTC Live Monitor gemäß der Kanaldefinition korrekt einen ausgehenden Videokanal zählt. Mehrere unterschiedliche Sender-Tracks werden dagegen einzeln gezählt. RTP-Encoding-, SSRC- oder Statistikzählung gehört nicht zu diesem ersten Meilenstein.

## Architektur

1. `src/main-world.js` ersetzt den globalen Konstruktor durch einen transparent weiterleitenden Wrapper. Er beobachtet Erstellung und Zustandsänderungen der Peer Connections. `src/rtp-stats.js` liest deren `connectionState` und regelmäßig die `getStats()`-Reports aus, filtert tatsächlich übertragende RTP-Streams und berechnet die ein- und ausgehende Bitrate. Eine Synchronisierung alle 2,5 Sekunden ergänzt die ereignisbasierten Updates; Messungen überlappen sich dabei nicht.
2. `src/content-bridge.js` läuft isoliert, validiert Struktur, Version, Herkunftsfenster, Wertebereiche und Summen der Page-World-Nachrichten und leitet nur Zähler weiter.
3. `src/service-worker.js` hält Werte getrennt nach Tab und Frame, aggregiert sie über `src/counting.js`, unterscheidet Kamera-Videos von Bildschirmfreigaben, aktualisiert das Badge und persistiert den flüchtigen Zustand in `chrome.storage.session`. Navigationen, Frame-Wechsel und geschlossene Tabs bereinigen alte Einträge.
4. Ein expliziter Action-Controller verarbeitet den Toolbar-Klick und öffnet `popup.html` in einem kleinen Popup-Fenster. Ein weiterer Klick fokussiert das bereits offene Fenster. Das Popup fragt den aktiven Tab ab, hört auf Live-Updates und kann dessen Zustand zurücksetzen. Die Erweiterung konfiguriert keinerlei eigene Bilder oder Icons und verwendet Chromes Standardsymbol.

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

Die Node-Tests prüfen leere Zustände, Normalisierung, Summenbildung über mehrere Frames und getrennte Tabs. Der Check parst Manifest und JavaScript, prüft den expliziten Toolbar-Klick-Controller, die minimal erwarteten Berechtigungen, `document_start`, alle Frames und stellt sicher, dass weder Binärdateien noch eigene Icons konfiguriert sind.

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
4. Das heruntergeladene Workflow-Artifact **einmal** entpacken. Im entpackten Ordner muss `manifest.json` direkt sichtbar sein.
5. In Chrome `chrome://extensions` öffnen, den Entwicklermodus aktivieren und **Entpackte Erweiterung laden** wählen.
6. Genau den Ordner auswählen, in dem `manifest.json` liegt — nicht den Download-Ordner darüber.

Für einen dauerhaft öffentlich herunterladbaren Release muss die Version in `manifest.json` beispielsweise `1.1.0` lauten und ein passender Tag gepusht werden:

```bash
git tag v1.1.0
git push origin v1.1.0
```

Bei einem `v*`-Tag prüft der Workflow, dass Tag und Manifestversion übereinstimmen, und legt anschließend automatisch einen GitHub Release mit ZIP und SHA-256-Datei an. Die ZIP eines Releases muss vor dem Laden in Chrome ebenfalls entpackt werden. Normale Workflow-Artefakte bleiben 30 Tage verfügbar. Das Paket enthält ausschließlich die zum Laden der Erweiterung erforderlichen Manifest-, Popup- und `src`-Dateien; Tests, Harness, Repository-Metadaten und Dokumentation werden nicht in die installierbare ZIP aufgenommen.

Der gleiche Build kann lokal mit `npm run package` erzeugt werden. Die Ausgabe liegt danach unter `dist/webrtc-live-monitor.zip`.


### Fehler „Manifestdatei fehlt oder ist nicht lesbar“

Chrome kann keine GitHub-Artifact-ZIP und keine Release-ZIP direkt als entpackte Erweiterung laden. Entpacke den Download zuerst und wähle anschließend den Ordner, der `manifest.json` unmittelbar enthält. Der Workflow legt `manifest.json` jetzt an die Wurzel des Workflow-Artefakts; ein zweites inneres ZIP ist dort nicht mehr enthalten. Bereits vor dieser Korrektur erzeugte Workflow-Läufe behalten ihr altes, doppelt gepacktes Format und sollten nicht mehr verwendet werden. Starte stattdessen einen neuen Lauf oder lade ein Artefakt eines neueren Commits herunter.

## Erste Anzeige und integrierte Testseite

Nach der Installation müssen bereits geöffnete Webseiten einmal neu geladen werden, weil Chrome neu installierte Content Scripts nicht rückwirkend in vorhandene Dokumente einfügt. Öffne danach das Popup auf einer Seite, die WebRTC verwendet. Eine Peer Connection ohne Tracks erscheint als eine Verbindung mit null Audio- und Videokanälen.

Zum Funktionstest ohne externe Webseite im Popup **Testseite öffnen** wählen. Auf der Testseite kann eine Peer Connection ohne Tracks sowie lokales Audio oder Video erzeugt und wieder geschlossen werden. Es werden keine Kamera- oder Mikrofonberechtigungen angefordert. Nach einem Klick auf eine Testaktion das Erweiterungs-Popup erneut öffnen; Zähler und Badge sollten den neuen Zustand anzeigen.

### Beim Klick erscheint kein Popup

Das Puzzleteil-Symbol in der Chrome-Symbolleiste ist **das allgemeine Chrome-Menü für Erweiterungen**, nicht das Symbol von WebRTC Live Monitor. Nach dem Laden der Erweiterung:

1. `chrome://extensions` öffnen und prüfen, dass **WebRTC Live Monitor** vorhanden und eingeschaltet ist.
2. Auf der Erweiterungskarte **Neu laden** klicken, insbesondere nachdem ein neues GitHub-Artefakt entpackt wurde.
3. In der Symbolleiste auf das Puzzleteil **Erweiterungen** klicken.
4. Neben **WebRTC Live Monitor** die Stecknadel anklicken. Erst das danach dauerhaft sichtbare Monitor-Symbol öffnet das Popup.
5. Eine normale Webseite öffnen und neu laden. Auf `chrome://`-Seiten, im Chrome Web Store und auf der Seite `chrome://extensions` darf Chrome die Seiteninstrumentierung nicht ausführen; das Popup selbst sollte sich trotzdem öffnen und null Werte anzeigen.

Falls auch der Eintrag **WebRTC Live Monitor** im Erweiterungsmenü kein Popup öffnet, unter `chrome://extensions` auf der Erweiterungskarte nach einem roten Button **Fehler** suchen. Vor dem erneuten Laden muss das heruntergeladene Artefakt entpackt sein und die ausgewählte Verzeichniswurzel unmittelbar `manifest.json`, `popup.html`, `popup.js` und `popup.css` enthalten. Alte Workflow-Artefakte nicht wiederverwenden; jeder Workflow-Lauf enthält den Stand des jeweiligen Commits und wird später nicht aktualisiert.

### Meldung „Extension context invalidated“ nach „Neu laden“

Beim Neuladen einer Erweiterung invalidiert Chrome deren bereits in offenen Tabs laufende isolierte Content Scripts. Die aktuelle Bridge fängt sowohl synchrone Ausnahmen als auch abgelehnte Messaging-Promises ab, sodass daraus kein dauerhafter Erweiterungsfehler mehr entsteht. Trotzdem muss der betroffene Webseiten-Tab nach jedem Klick auf **Neu laden** ebenfalls einmal vollständig neu geladen werden: Nur dadurch werden die Content Scripts aus der aktualisierten Erweiterung neu eingebunden. Die Meldung aus einem bereits alten Kontext kann in `chrome://extensions` noch in der bisherigen Fehlerhistorie stehen; nach **Alle löschen** und einem Seiten-Reload sollte sie nicht erneut auftreten.

### Mehrere entpackte Versionen unterscheiden

Wenn verschiedene Workflow-Artefakte in unterschiedliche Download-Ordner entpackt und jeweils über **Entpackte Erweiterung laden** hinzugefügt wurden, können mehrere Installationen nebeneinander existieren. Entferne unter `chrome://extensions` alle älteren Einträge von **WebRTC Live Monitor**, lade nur den Ordner des neuesten Artefakts und hefte anschließend dessen Eintrag neu an. Das Popup zeigt die installierte Manifestversion am unteren Rand an. Die Erweiterung verwendet bewusst ausschließlich Chromes Standardsymbol; dadurch gibt es weder Bilddateien noch eine Icon-Erzeugung, die den Service Worker beeinflussen könnte.
