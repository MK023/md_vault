# MD Vault - Documentazione Tecnica

**Sistema di Knowledge Base Personale e Progetto Portfolio DevOps**

Dominio: `mdvault.site`
Stack: GCP GCE e2-small, K3s, Nginx Ingress, Cloudflare Tunnel, FastAPI, SQLite FTS5
Autore: Marco Bellingeri
Data: Febbraio 2026

---

## Indice

1. [Panoramica](#1-panoramica)
2. [Architettura](#2-architettura)
3. [Backend API](#3-backend-api)
4. [Frontend](#4-frontend)
5. [Database](#5-database)
6. [Infrastruttura](#6-infrastruttura)
7. [Kubernetes](#7-kubernetes)
8. [CI/CD](#8-cicd)
9. [Sicurezza](#9-sicurezza)
10. [Scelte Tecnologiche](#10-scelte-tecnologiche)
11. [Deploy](#11-deploy)

---

## 1. Panoramica

### Cos'e MD Vault

MD Vault e un sistema di knowledge base personale self-hosted, progettato per gestire documentazione tecnica in modo centralizzato, sicuro e con accesso rapido. Il progetto nasce con una doppia finalita:

- **Knowledge Base personale**: un unico punto di accesso per organizzare e consultare documentazione tecnica, appunti di studio, note di progetto e materiale di riferimento. I documenti sono organizzati per progetto con un sistema di tagging flessibile e ricerca full-text istantanea.

- **Portfolio DevOps**: il progetto stesso dimostra competenze pratiche su tecnologie richieste nel mondo DevOps moderno: containerizzazione con Docker, orchestrazione con Kubernetes (K3s), Infrastructure as Code con Terraform, CI/CD con GitHub Actions, networking con Cloudflare Tunnel, e gestione di constraint reali come il budget limitato di RAM.

### Perche e stato creato

L'esigenza nasce dalla necessita di avere un sistema documentale leggero ma completo, che potesse:

- Funzionare su un singolo server con risorse limitate (2GB RAM su e2-small)
- Essere accessibile da qualsiasi dispositivo via HTTPS
- Supportare ricerca full-text veloce su tutti i contenuti
- Gestire file multiformat (Markdown, PDF, DOCX, XLSX, immagini, diagrammi draw.io)
- Essere completamente automatizzato nel deploy (Infrastructure as Code)
- Non avere costi ricorrenti significativi (dominio + GCE con $300 crediti gratuiti)

Il risultato e un sistema production-ready che risolve un problema reale, con vincoli concreti di risorse e budget, e che dimostra padronanza dello stack DevOps dalla infrastruttura al codice applicativo.

### Caratteristiche principali

| Funzionalita | Dettaglio |
|---|---|
| Autenticazione | JWT con bcrypt password hashing |
| Ricerca | Full-text search con SQLite FTS5 |
| Upload file | MD, PDF, DOCX, XLSX, immagini, draw.io (max 50MB) |
| Visualizzatori | PDF.js, mammoth.js, SheetJS, diagrams.net viewer |
| Organizzazione | Progetti (cartelle) + tags + drag & drop |
| UI | Tema Windows 95 retro, zero build step |
| Backup | CronJob K8s notturno su Cloudflare R2 |
| Infrastruttura | Terraform IaC completo |
| Deploy | Helm chart + script one-shot con import immagini in K3s |

---

## 2. Architettura

### Diagramma architetturale

```
                              Internet
                                 |
                                 v
                    +---------------------------+
                    |    Cloudflare Edge CDN     |
                    |  (SSL/TLS, DDoS, Cache)    |
                    |  DNS: mdvault.site         |
                    +---------------------------+
                                 |
                          Cloudflare Tunnel
                          (connessione uscente)
                                 |
                                 v
              +------------------------------------------+
              |         GCP GCE e2-small                   |
              |         Ubuntu 22.04                      |
              |         europe-west8 (Milano)              |
              |                                          |
              |   +------------------------------------+  |
              |   |          K3s Cluster                |  |
              |   |  (Traefik disabilitato)             |  |
              |   |                                    |  |
              |   |  +------------------------------+  |  |
              |   |  |   Nginx Ingress Controller   |  |  |
              |   |  |   (routing per path)         |  |  |
              |   |  +------------------------------+  |  |
              |   |       |                    |       |  |
              |   |       | /                  | /api  |  |
              |   |       v                    v       |  |
              |   |  +-----------+    +-----------+    |  |
              |   |  | Frontend  |    |    API    |    |  |
              |   |  | nginx:alp |    | FastAPI   |    |  |
              |   |  | HTML/CSS  |    | uvicorn   |    |  |
              |   |  | JS (Win95)|    | Python3.11|    |  |
              |   |  +-----------+    +-----------+    |  |
              |   |                        |           |  |
              |   |                        v           |  |
              |   |               +--------------+     |  |
              |   |               |   SQLite DB  |     |  |
              |   |               |   WAL mode   |     |  |
              |   |               |   FTS5 index |     |  |
              |   |               +--------------+     |  |
              |   |                    |               |  |
              |   |             PersistentVolume       |  |
              |   |             hostPath: 5Gi          |  |
              |   |                    |               |  |
              |   |  +------------------------------+  |  |
              |   |  | CronJob backup (03:00 UTC)   |  |  |
              |   |  | SQLite online backup API     |  |  |
              |   |  +------------------------------+  |  |
              |   |                    |               |  |
              |   +------------------------------------+  |
              +------------------------------------------+
                                 |
                          boto3 (S3-compatible)
                                 |
                                 v
                    +---------------------------+
                    |    Cloudflare R2           |
                    |    (backup storage)        |
                    |    10GB free tier          |
                    +---------------------------+
```

### Flusso delle richieste

1. **Client**: l'utente accede a `https://mdvault.site` dal browser.
2. **Cloudflare Edge**: la richiesta arriva alla rete edge di Cloudflare, che gestisce il certificato SSL/TLS, la protezione DDoS e il caching degli asset statici.
3. **Cloudflare Tunnel**: il traffico viene instradato attraverso un tunnel crittografato verso l'istanza GCE. Il tunnel e una connessione *uscente* dalla VM, quindi non serve aprire porte inbound (nessuna firewall rule HTTP/HTTPS).
4. **Nginx Ingress Controller**: all'interno del cluster K3s, l'Ingress Controller riceve il traffico e lo instrada in base al path:
   - `/*` va al pod Frontend (file statici serviti da nginx:alpine)
   - `/api/*` va al pod API (FastAPI su uvicorn)
5. **Frontend**: serve i file HTML, CSS e JavaScript. Le chiamate API dal browser vengono proxiate via nginx verso il backend.
6. **API**: FastAPI gestisce autenticazione, CRUD documenti, upload file e ricerca full-text.
7. **SQLite**: il database risiede su un PersistentVolume (hostPath) con WAL mode per performance concorrenti e FTS5 per la ricerca full-text.
8. **Backup**: un CronJob Kubernetes esegue il backup ogni notte alle 03:00 UTC usando la SQLite online backup API, con upload opzionale su Cloudflare R2.

### Componenti nel namespace `md-vault`

| Pod/Risorsa | Immagine | Ruolo | Risorse |
|---|---|---|---|
| `md-vault-frontend` | `md-vault-frontend:latest` | Serve UI statica | 32-64Mi RAM |
| `md-vault-api` | `md-vault-api:latest` | Backend REST API | 128-256Mi RAM |
| `cloudflared` | `cloudflare/cloudflared:2024.6.1` | Tunnel verso Cloudflare | 32-64Mi RAM |
| `md-vault-backup` (CronJob) | `md-vault-backup:latest` | Backup notturno DB | 64-128Mi RAM |
| Nginx Ingress Controller | `ingress-nginx` | Routing HTTP | ~120Mi RAM |

---

## 3. Backend API

### Stack tecnologico

- **Framework**: FastAPI 0.129.0 con uvicorn 0.41.0 come ASGI server
- **Python**: 3.11-slim (immagine Docker leggera)
- **Autenticazione**: JWT (PyJWT 2.11.0) con bcrypt 5.0.0
- **Upload**: python-multipart 0.0.22
- **Monitoring**: Sentry SDK 2.53.0
- **Testing**: pytest 8.3.4 + httpx 0.28.1
- **Database**: sqlite3 (libreria standard Python)

### Struttura del codice

```
backend/
  __init__.py
  main.py          # Entrypoint FastAPI, CORS, lifespan
  config.py        # Configurazione da env vars
  database.py      # Init DB, FTS5, triggers, migration
  auth.py          # JWT encode/decode, bcrypt, dependency
  models.py        # Pydantic schemas request/response
  routers/
    __init__.py
    auth.py        # Login, cambio password
    documents.py   # CRUD documenti, upload file
    search.py      # Ricerca full-text FTS5
  tests/
    __init__.py
    conftest.py    # Fixtures: test DB, test client, auth token
    test_auth.py   # JWT, bcrypt, login, rate limiting
    test_documents.py  # CRUD, file upload/download, tags
    test_search.py     # FTS5 search, edge cases, healthz
  Dockerfile       # Build image Python
  requirements.txt # Dipendenze pip
```

### Entrypoint e inizializzazione

Il file `main.py` configura l'applicazione FastAPI con un *lifespan* context manager che inizializza il database allo startup:

```python
@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield

_docs_enabled = os.environ.get("DOCS_ENABLED", "true").lower() in ("1", "true")
app = FastAPI(
    title="MD Vault", version="1.0.0",
    description="Personal knowledge base API with full-text search, file management, and JWT authentication.",
    lifespan=lifespan,
    docs_url="/api/docs" if _docs_enabled else None,
    redoc_url=None,
    openapi_url="/api/openapi.json" if _docs_enabled else None,
)

_allowed_origins = os.environ.get("CORS_ORIGINS", "https://mdvault.site").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["Authorization", "Content-Type"],
)

app.include_router(auth.router)
app.include_router(documents.router)
app.include_router(search.router)
```

La documentazione Swagger/OpenAPI e abilitata per default (`DOCS_ENABLED=true`), accessibile su `/api/docs`. Puo essere disabilitata in produzione con `DOCS_ENABLED=false`. Le origini CORS sono ristrette al dominio di produzione.

### Configurazione

Tutte le configurazioni sono lette da variabili d'ambiente, con default sicuri per lo sviluppo locale:

```python
JWT_SECRET = os.environ.get("JWT_SECRET", "change-me-in-production")
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "admin")
DB_PATH = os.environ.get("DB_PATH", "/data/vault.db")
JWT_EXPIRY_HOURS = int(os.environ.get("JWT_EXPIRY_HOURS", "24"))
UPLOAD_DIR = os.environ.get("UPLOAD_DIR", "/data/uploads")
```

In produzione, queste variabili sono iniettate dai ConfigMap e Secrets di Kubernetes.

### Endpoints API

#### Autenticazione (`/api/auth`)

| Metodo | Endpoint | Descrizione | Auth |
|---|---|---|---|
| `POST` | `/api/auth/login` | Login, restituisce JWT token | No |
| `PUT` | `/api/auth/password` | Cambia password utente corrente | Si |

**Esempio login:**

```bash
curl -X POST https://mdvault.site/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username": "admin", "password": "mia-password"}'
```

Risposta:
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIs...",
  "token_type": "bearer"
}
```

#### Documenti (`/api/docs`)

| Metodo | Endpoint | Descrizione | Auth |
|---|---|---|---|
| `GET` | `/api/docs` | Lista tutti i documenti | Si |
| `POST` | `/api/docs` | Crea documento (JSON body) | Si |
| `POST` | `/api/docs/upload` | Upload file multiformat | Si |
| `GET` | `/api/docs/{id}` | Dettaglio documento | Si |
| `GET` | `/api/docs/{id}/file` | Download file originale | Si |
| `PUT` | `/api/docs/{id}` | Aggiorna documento | Si |
| `DELETE` | `/api/docs/{id}` | Elimina documento + file | Si |
| `GET` | `/api/docs/meta/tags` | Lista tutti i tag univoci | Si |

**Estensioni file supportate:**

```python
ALLOWED_EXTENSIONS = {
    ".md", ".txt", ".pdf", ".doc", ".docx", ".xls", ".xlsx",
    ".ppt", ".pptx", ".csv", ".json", ".yaml", ".yml", ".xml",
    ".html", ".htm", ".png", ".jpg", ".jpeg", ".gif", ".svg", ".drawio",
}
```

**Estensioni con estrazione contenuto testuale (indicizzate in FTS5):**

```python
TEXT_EXTENSIONS = {
    ".md", ".txt", ".csv", ".json", ".yaml", ".yml", ".xml",
    ".html", ".htm", ".drawio",
}
```

Il limite di upload e 50MB per file.

#### Ricerca (`/api/search`)

| Metodo | Endpoint | Descrizione | Auth |
|---|---|---|---|
| `GET` | `/api/search?q=termine` | Ricerca full-text FTS5 | Si |
| `GET` | `/api/system-info` | Informazioni server (hostname, OS, CPU, DB size) | Si |

**Esempio ricerca:**

```bash
curl -H "Authorization: Bearer $TOKEN" \
  "https://mdvault.site/api/search?q=kubernetes+deploy"
```

Risposta:
```json
[
  {
    "id": 42,
    "title": "K8s Deployment Guide",
    "snippet": "...configurazione <mark>kubernetes</mark> per il <mark>deploy</mark>...",
    "project": "DevOps",
    "tags": ["k8s", "deploy"]
  }
]
```

La funzione `snippet()` di FTS5 genera estratti del contenuto con i termini cercati evidenziati da tag `<mark>`, limitati a 32 token di contesto.

#### Health Check

```
GET /api/healthz
```

Verifica la connettivita al database SQLite. Usato da Kubernetes come liveness e readiness probe:

```python
@app.get("/api/healthz")
def healthz():
    try:
        with get_db() as conn:
            conn.execute("SELECT 1")
        return {"status": "ok", "db": "connected"}
    except Exception:
        return JSONResponse(
            status_code=503,
            content={"status": "error", "db": "disconnected"},
        )
```

In caso di errore viene restituito HTTP 503 (non 200), cosi che le Kubernetes probes rilevino correttamente il problema.

### Autenticazione JWT con bcrypt

Il modulo `auth.py` implementa un sistema di autenticazione stateless basato su JWT:

```python
def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()

def verify_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode(), hashed.encode())

def create_token(username: str) -> str:
    payload = {
        "sub": username,
        "exp": datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRY_HOURS),
        "iat": datetime.now(timezone.utc),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm="HS256")
```

La dependency `get_current_user` protegge tutti gli endpoint che richiedono autenticazione:

```python
def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
) -> str:
    payload = decode_token(credentials.credentials)
    return payload["sub"]
```

### Modelli Pydantic

I modelli definiscono la validazione rigorosa di input/output, inclusa una conversione automatica dei tag da stringa comma-separated (come salvata in SQLite) a lista Python:

```python
def _parse_tags(v):
    """Converte tags comma-separated da SQLite in lista Python."""
    if isinstance(v, str):
        return [t.strip() for t in v.split(",") if t.strip()]
    if v is None:
        return []
    return v

TagList = Annotated[list[str], BeforeValidator(_parse_tags)]

class DocumentResponse(BaseModel):
    id: int
    title: str
    content: str
    project: str | None = None
    tags: TagList
    file_name: str | None = None
    file_type: str | None = None
    created_at: str
    updated_at: str
```

### Prevenzione path traversal

L'endpoint di download file implementa un controllo esplicito contro attacchi di path traversal:

```python
real_path = os.path.realpath(file_path)
if not real_path.startswith(os.path.realpath(UPLOAD_DIR)):
    raise HTTPException(status_code=403, detail="Access denied")
```

Questo impedisce a un file con nome malevolo (es. `../../etc/passwd`) di uscire dalla directory di upload.

### Test Suite

Il backend include una suite di test completa con pytest e httpx, che copre tutti gli endpoint API:

| File | Test | Copertura |
|---|---|---|
| `test_auth.py` | 12 | Login success/failure, rate limiting, cambio password, validazione token |
| `test_documents.py` | 16 | CRUD, upload/download file, tags, protezione path traversal |
| `test_search.py` | 10 | Ricerca FTS5, edge cases, healthz, system-info |
| **Totale** | **38** | Tutti gli endpoint API |

I test usano un database SQLite in-memory con fixture isolate. Il pattern `importlib.reload` garantisce che ogni test ottenga un'istanza pulita di config, database e app FastAPI:

```python
@pytest.fixture()
def client(tmp_path):
    os.environ["DB_PATH"] = str(tmp_path / "test.db")
    os.environ["UPLOAD_DIR"] = str(tmp_path / "uploads")

    import importlib
    import backend.config; importlib.reload(backend.config)
    import backend.database; importlib.reload(backend.database)
    import backend.main; importlib.reload(backend.main)

    from backend.main import app
    with TestClient(app) as c:
        yield c
```

Esecuzione:

```bash
# Tutti i test
python -m pytest backend/tests/ -v

# File specifico
python -m pytest backend/tests/test_auth.py -v
```

### Dockerfile API

```dockerfile
FROM python:3.11-slim

WORKDIR /app

RUN adduser --disabled-password --gecos "" appuser

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . ./backend/

RUN mkdir -p /data && chown appuser:appuser /data

USER appuser

EXPOSE 8000

CMD ["uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

Punti chiave:
- L'immagine usa `python:3.11-slim` per dimensioni ridotte
- Un utente non-root `appuser` esegue il processo (sicurezza)
- `--no-cache-dir` per non accumulare cache pip nell'immagine
- La directory `/data` e creata con ownership corretta per SQLite

---

## 4. Frontend

### Design Win95 Retro

Il frontend adotta un'interfaccia utente ispirata a Windows 95, implementata interamente con HTML, CSS e JavaScript vanilla (ES6 modules) -- senza framework, senza build step, senza node_modules.

### Architettura modulare ES6

Il codice JavaScript e organizzato in moduli ES6 nativi, serviti direttamente da Nginx senza bundler:

```
frontend/js/
  app.js           # Init, event listeners, orchestrazione
  api.js           # apiFetch(), tutte le chiamate HTTP
  auth.js          # Login flow, gestione token, cambio password
  documents.js     # CRUD documenti, rendering markdown/file, viewer
  tree.js          # Tree navigation, drag-drop, context menu
  windows.js       # Window management, minimize/maximize, resize, desktop icons
  state.js         # Stato applicativo condiviso
```

Ogni modulo esporta solo cio che serve agli altri. L'entry point `app.js` importa e inizializza tutti i moduli:

```javascript
import { state } from "./state.js";
import { initAuth, showLogin, showMain } from "./auth.js";
import { initDocuments, loadDocuments } from "./documents.js";
import { initTree, renderTree } from "./tree.js";
import { initWindows } from "./windows.js";
```

L'`index.html` carica l'entry point come modulo:

```html
<script type="module" src="js/app.js"></script>
```

Vantaggi di questa architettura:
- **Zero build step**: i moduli ES6 sono supportati nativamente da tutti i browser moderni
- **Separazione responsabilita**: ogni modulo gestisce un aspetto specifico dell'applicazione
- **Manutenibilita**: modifiche isolate senza rischio di side-effect su altre aree
- **Callback pattern**: dipendenze cross-modulo gestite con registrazione callback (`onLoginSuccess`, `onDocumentsLoaded`) per evitare import circolari

L'interfaccia replica fedelmente gli elementi UI di Windows 95:
- **Finestre** con barra del titolo blu gradiente e pulsanti di controllo funzionanti (riduci ad icona, ingrandisci, chiudi)
- **Desktop** con icone (Risorse del Computer, Cestino) visibili quando la finestra e minimizzata
- **Taskbar** in basso che appare quando la finestra e minimizzata, come in Win95
- **Menu bar** con dropdown (File, Edit, View, Help) che si aprono al click e switchano all'hover
- **Pannello tree** a sinistra con struttura a cartelle (progetti) e file (documenti)
- **Pannello documento** a destra con rendering del contenuto
- **Status bar** in basso con contatore documenti e barra di ricerca
- **Dialog modali** con stile Win95 per login, upload, editor, conferma eliminazione, proprieta di sistema
- **Bordi raised/sunken** con il classico effetto 3D tramite border multicolore
- **Scrollbar** personalizzate in stile retro

### Ottimizzazioni Performance

Il frontend implementa diverse ottimizzazioni per velocita e reattivita:

- **Lazy loading librerie**: mammoth.js (620KB), SheetJS (861KB) e PDF.js (312KB) vengono caricati on-demand al primo utilizzo tramite un helper `loadScript()` con cache Promise, risparmiando ~1.8MB all'avvio
- **Event delegation**: un singolo set di listener su `treeContainer` gestisce click, context menu e drag & drop per tutti i file e cartelle, invece di listener individuali per ogni elemento
- **Cache documento**: il documento corrente e salvato in `currentDoc`, evitando fetch API per le operazioni Edit/Delete dal menu
- **setActiveTreeItem()**: al click su un documento, il tree non viene ricostruito -- viene solo spostata la classe CSS `.active`, mantenendo lo stato di espansione delle cartelle
- **Stato collapsed preservato**: un Set `collapsedPaths` tiene traccia delle cartelle chiuse e le ri-applica dopo ogni `renderTree()`

### Colori e variabili CSS

```css
:root {
    --bg: #c0c0c0;           /* Grigio Windows classico */
    --bg-dark: #808080;
    --bg-light: #dfdfdf;
    --blue: #000080;          /* Blu barra del titolo */
    --blue-light: #1084d0;    /* Gradiente barra titolo */
    --font: "Microsoft Sans Serif", "MS Sans Serif", Arial, sans-serif;
}

body {
    font-family: var(--font);
    font-size: 11px;
    background: #008080;      /* Teal desktop background */
}
```

### Tree Explorer con Drag & Drop

Il pannello laterale sinistro mostra un albero di navigazione che organizza i documenti per progetto:

- I **progetti** sono mostrati come cartelle espandibili/comprimibili con click
- I **documenti** sono mostrati come file con icone specifiche per tipo (PDF, DOCX, XLSX, immagini, etc.)
- Il **drag & drop** nativo HTML5 permette di spostare documenti tra cartelle:

```javascript
file.draggable = true;
file.addEventListener("dragstart", function (e) {
    e.dataTransfer.setData("text/plain", String(doc.id));
    e.dataTransfer.effectAllowed = "move";
});

// Sul folder target:
folder.addEventListener("drop", function (e) {
    e.preventDefault();
    var docId = e.dataTransfer.getData("text/plain");
    if (docId) moveDocument(parseInt(docId), project);
});
```

Lo spostamento aggiorna il campo `project` del documento via API PUT.

Le cartelle supportano anche un **menu contestuale** (tasto destro) con opzioni "Rename Folder" e "Delete Folder".

### Visualizzatori integrati

Il frontend include viewer per diversi formati di file, caricati da CDN **on-demand** al primo utilizzo (lazy loading):

| Formato | Libreria | Versione CDN |
|---|---|---|
| PDF | PDF.js | 3.11.174 |
| DOCX | mammoth.js | 1.x |
| XLSX/XLS/CSV | SheetJS (XLSX) | 0.18 |
| draw.io | diagrams.net viewer (iframe) | - |
| Markdown | marked.js | latest |
| Immagini | HTML nativo `<img>` | - |
| JSON/YAML/XML | `<pre><code>` | - |

**Rendering PDF:**

```javascript
async function renderPdf(url, headers, container) {
    var res = await fetch(url, { headers: headers });
    var data = await res.arrayBuffer();
    var pdf = await pdfjsLib.getDocument({ data: data }).promise;

    for (var i = 1; i <= pdf.numPages; i++) {
        var page = await pdf.getPage(i);
        var viewport = page.getViewport({ scale: 1.2 });
        var canvas = document.createElement("canvas");
        // ... render su canvas
        await page.render({ canvasContext: ctx, viewport: viewport }).promise;
        container.appendChild(canvas);
    }
}
```

**Rendering DOCX:**

```javascript
async function renderDocx(url, headers, container) {
    var res = await fetch(url, { headers: headers });
    var data = await res.arrayBuffer();
    var result = await mammoth.convertToHtml({ arrayBuffer: data });
    var safeHtml = DOMPurify.sanitize(result.value);
    container.appendChild(createSanitizedFragment(safeHtml));
}
```

**Rendering fogli di calcolo:**

```javascript
async function renderSpreadsheet(url, headers, container, ext) {
    var res = await fetch(url, { headers: headers });
    var data = await res.arrayBuffer();
    var workbook = XLSX.read(data, { type: "array" });

    workbook.SheetNames.forEach(function (name) {
        var sheet = workbook.Sheets[name];
        var htmlStr = XLSX.utils.sheet_to_html(sheet, { editable: false });
        var safeHtml = DOMPurify.sanitize(htmlStr);
        // ... render tabella
    });
}
```

**Rendering diagrammi draw.io:**

```javascript
async function renderDrawio(url, headers, container) {
    var res = await fetch(url, { headers: headers });
    var xmlText = await res.text();
    var xmlB64 = btoa(unescape(encodeURIComponent(xmlText)));
    var iframe = document.createElement("iframe");
    iframe.src = "https://viewer.diagrams.net/?highlight=0000ff&nav=1&title=diagram#R"
                + encodeURIComponent(xmlB64);
    container.appendChild(iframe);
}
```

### DOMPurify per sicurezza XSS

Ogni contenuto HTML generato da librerie esterne (marked.js, mammoth.js, SheetJS, snippet FTS5) viene sanificato con DOMPurify prima di essere inserito nel DOM:

```javascript
function renderMarkdownSafe(markdownText) {
    var rawHtml = marked.parse(markdownText);
    return DOMPurify.sanitize(rawHtml);
}

function sanitize(html) {
    return DOMPurify.sanitize(html, { ALLOWED_TAGS: ["mark"] });
}
```

Per gli snippet di ricerca, solo il tag `<mark>` e consentito, bloccando qualsiasi altro HTML potenzialmente pericoloso.

### Nginx per il Frontend

La configurazione nginx del pod frontend serve i file statici e inoltra le chiamate API al backend:

```nginx
server {
    listen 80;
    server_name _;

    root /usr/share/nginx/html;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    # JS/CSS/HTML: ETag revalidation + bypass Cloudflare CDN cache
    location ~* \.(js|css|html)$ {
        etag on;
        add_header Cache-Control "no-cache";
        add_header CDN-Cache-Control "no-store";
    }

    # Immutable assets (fonts, images, icons): long cache
    location ~* \.(woff2?|ttf|eot|ico|png|jpg|jpeg|gif|svg|webp)$ {
        expires 30d;
        add_header Cache-Control "public, immutable";
    }

    location /api/ {
        proxy_pass http://md-vault-api.md-vault.svc.cluster.local:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

La configurazione include cache headers ottimizzati: i file JS/CSS/HTML usano `ETag` con `no-cache` (il browser rivalidata ad ogni richiesta, scaricando solo se il file e cambiato), mentre font e immagini hanno cache immutabile di 30 giorni. L'header `CDN-Cache-Control: no-store` impedisce a Cloudflare di servire versioni stale di JS/CSS dopo un deploy.

L'uso dell'indirizzo DNS interno Kubernetes (`md-vault-api.md-vault.svc.cluster.local`) permette la risoluzione del servizio senza hardcodare IP.

### Dockerfile Frontend

```dockerfile
FROM nginx:alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY index.html /usr/share/nginx/html/
COPY style.css /usr/share/nginx/html/
COPY js/ /usr/share/nginx/html/js/

EXPOSE 80
```

L'immagine risultante e estremamente leggera: nginx:alpine piu i file statici (HTML, CSS e moduli JS).

---

## 5. Database

### SQLite con WAL mode

MD Vault utilizza SQLite come database, configurato con Write-Ahead Logging (WAL) per migliorare le performance di lettura concorrente:

```python
@contextmanager
def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys=ON")
    try:
        yield conn
    finally:
        conn.close()
```

Il context manager garantisce la chiusura della connessione anche in caso di eccezione. Il WAL mode viene attivato una sola volta in `init_db()` (non per-connection, perche e persistente nel database). All'init viene anche verificata la versione minima di SQLite (>= 3.35.0) necessaria per la clausola `RETURNING`.

Il WAL mode permette letture concorrenti durante le scritture, eliminando i lock in lettura che altrimenti bloccherebbero le query di ricerca FTS5.

### Schema del database

#### Tabella `users`

```sql
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

#### Tabella `documents`

```sql
CREATE TABLE IF NOT EXISTS documents (
    id INTEGER PRIMARY KEY,
    title TEXT NOT NULL,
    content TEXT NOT NULL DEFAULT '',
    project TEXT,
    tags TEXT,
    file_name TEXT,
    file_type TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### FTS5 Virtual Table

La tabella virtuale FTS5 indicizza i campi `title`, `content`, `project` e `tags` per la ricerca full-text:

```sql
CREATE VIRTUAL TABLE documents_fts USING fts5(
    title, content, project, tags,
    content=documents, content_rowid=id
);
```

L'opzione `content=documents` configura FTS5 come *content table* che referenzia la tabella `documents`, evitando duplicazione dei dati. Il `content_rowid=id` mappa il rowid FTS5 alla primary key della tabella sorgente.

### Trigger di sincronizzazione

Tre trigger mantengono automaticamente sincronizzata la tabella FTS5 con la tabella `documents`:

**Trigger INSERT** -- aggiunge un record FTS5 quando un documento viene creato:

```sql
CREATE TRIGGER IF NOT EXISTS documents_ai AFTER INSERT ON documents BEGIN
    INSERT INTO documents_fts(rowid, title, content, project, tags)
    VALUES (new.id, new.title, new.content, new.project, new.tags);
END;
```

**Trigger DELETE** -- rimuove il record FTS5 quando un documento viene eliminato:

```sql
CREATE TRIGGER IF NOT EXISTS documents_ad AFTER DELETE ON documents BEGIN
    INSERT INTO documents_fts(documents_fts, rowid, title, content, project, tags)
    VALUES ('delete', old.id, old.title, old.content, old.project, old.tags);
END;
```

**Trigger UPDATE** -- aggiorna il record FTS5 (delete + insert) quando un documento viene modificato:

```sql
CREATE TRIGGER IF NOT EXISTS documents_au AFTER UPDATE ON documents BEGIN
    INSERT INTO documents_fts(documents_fts, rowid, title, content, project, tags)
    VALUES ('delete', old.id, old.title, old.content, old.project, old.tags);
    INSERT INTO documents_fts(rowid, title, content, project, tags)
    VALUES (new.id, new.title, new.content, new.project, new.tags);
END;
```

Il pattern `INSERT INTO documents_fts(documents_fts, ...)` con primo campo uguale al nome della tabella e la sintassi FTS5 per i comandi speciali (in questo caso `'delete'`).

### Schema migration automatica

La funzione `init_db()` implementa una migrazione incrementale: controlla se le colonne `file_name` e `file_type` esistono gia nella tabella `documents` e le aggiunge solo se mancanti:

```python
columns = [
    row[1] for row in cur.execute("PRAGMA table_info(documents)").fetchall()
]
if "file_name" not in columns:
    cur.execute("ALTER TABLE documents ADD COLUMN file_name TEXT")
    cur.execute("ALTER TABLE documents ADD COLUMN file_type TEXT")
```

Questo approccio consente di aggiornare lo schema senza perdere dati esistenti. Il seed dell'utente admin viene creato se non esiste, oppure aggiornato se la password nell'env var e cambiata:

```python
existing = cur.execute(
    "SELECT id, password_hash FROM users WHERE username = ?", ("admin",)
).fetchone()
if not existing:
    hashed = bcrypt.hashpw(ADMIN_PASSWORD.encode(), bcrypt.gensalt())
    cur.execute(
        "INSERT INTO users (username, password_hash) VALUES (?, ?)",
        ("admin", hashed.decode()),
    )
else:
    if not bcrypt.checkpw(ADMIN_PASSWORD.encode(), existing["password_hash"].encode()):
        hashed = bcrypt.hashpw(ADMIN_PASSWORD.encode(), bcrypt.gensalt())
        cur.execute(
            "UPDATE users SET password_hash = ? WHERE username = ?",
            (hashed.decode(), "admin"),
        )
```

Questo garantisce che un cambio di `ADMIN_PASSWORD` nei Kubernetes Secrets venga applicato automaticamente al prossimo restart del pod.

### Query di ricerca FTS5

La ricerca sfrutta le funzionalita avanzate di FTS5:

```sql
SELECT
    d.id,
    d.title,
    snippet(documents_fts, 1, '<mark>', '</mark>', '...', 32) AS snippet,
    d.project,
    d.tags
FROM documents_fts
JOIN documents d ON d.id = documents_fts.rowid
WHERE documents_fts MATCH ?
ORDER BY rank
LIMIT 50
```

- `snippet()` genera un estratto con i termini evidenziati da tag `<mark>`
- Il secondo argomento `1` indica di estrarre lo snippet dalla colonna `content` (indice 1)
- `ORDER BY rank` ordina per rilevanza (BM25 di default in FTS5)
- `LIMIT 50` previene risultati eccessivi

### Backup del database

Il backup utilizza l'API online backup di SQLite, che garantisce una copia consistente anche durante operazioni di scrittura:

```python
def local_backup():
    os.makedirs(BACKUP_DIR, exist_ok=True)
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_path = os.path.join(BACKUP_DIR, f"vault_{timestamp}.db")

    src = sqlite3.connect(DB_PATH)
    dst = sqlite3.connect(backup_path)
    src.backup(dst)
    dst.close()
    src.close()
    return backup_path
```

La funzione `src.backup(dst)` copia pagina per pagina il database sorgente nella destinazione, gestendo automaticamente le transazioni in corso.

---

## 6. Infrastruttura

### Terraform Overview

L'infrastruttura e definita interamente come codice con Terraform, usando tre provider:

```hcl
terraform {
  required_version = ">= 1.5.0"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 4.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.0"
    }
  }
}

provider "google" {
  project = var.gcp_project   # mdvault
  region  = var.gcp_region    # europe-west8 (Milano)
  zone    = var.gcp_zone      # europe-west8-a
}

provider "cloudflare" {
  api_token = var.cloudflare_api_token
}
```

### Struttura dei file Terraform

```
terraform/
  providers.tf         # Provider Google Cloud e Cloudflare
  variables.tf         # Variabili con default
  vpc.tf               # VPC network e subnet
  firewall.tf          # Firewall rules (solo SSH inbound)
  compute.tf           # Istanza GCE
  cloudflare.tf        # Tunnel, config, record DNS
  gcs_backend.tf       # Backend GCS per state (commentato)
  outputs.tf           # Output (IP, instance name, SSH command)
  scripts/
    startup.sh         # Bootstrap script per GCE
```

### VPC e Networking

Una VPC dedicata con subnet per l'istanza GCE:

```hcl
resource "google_compute_network" "main" {
  name                    = "md-vault-vpc"
  auto_create_subnetworks = false
}

resource "google_compute_subnetwork" "public" {
  name          = "md-vault-subnet"
  ip_cidr_range = "10.0.1.0/24"
  region        = var.gcp_region
  network       = google_compute_network.main.id
}
```

### Firewall Rules

Le firewall rules sono volutamente restrittive grazie al Cloudflare Tunnel:

```hcl
resource "google_compute_firewall" "allow_ssh" {
  name    = "md-vault-allow-ssh"
  network = google_compute_network.main.name

  allow {
    protocol = "tcp"
    ports    = ["22"]
  }

  source_ranges = [var.ssh_allowed_ip]
  target_tags   = ["md-vault"]
}

resource "google_compute_firewall" "allow_egress" {
  name      = "md-vault-allow-egress"
  network   = google_compute_network.main.name
  direction = "EGRESS"

  allow {
    protocol = "all"
  }

  destination_ranges = ["0.0.0.0/0"]
  target_tags        = ["md-vault"]
}
```

**Nessuna porta HTTP/HTTPS aperta in ingresso.** Tutto il traffico web arriva attraverso il Cloudflare Tunnel (connessione uscente dal pod `cloudflared`). L'unica porta inbound e la 22 (SSH), ristretta al solo IP personale tramite `target_tags`.

### GCE Instance

```hcl
resource "google_compute_instance" "md_vault" {
  name         = "md-vault"
  machine_type = var.machine_type    # e2-small (2 vCPU, 2GB RAM)
  zone         = var.gcp_zone

  tags = ["md-vault"]

  boot_disk {
    initialize_params {
      image = "ubuntu-os-cloud/ubuntu-2204-lts"
      size  = 30        # 30GB pd-ssd
      type  = "pd-ssd"
    }
  }

  network_interface {
    subnetwork = google_compute_subnetwork.public.id
    access_config {}    # IP pubblico effimero
  }

  metadata = {
    ssh-keys = "mdvault:${var.ssh_public_key}"
  }

  metadata_startup_script = file("${path.module}/scripts/startup.sh")
}
```

L'immagine e Ubuntu 22.04 LTS. Il disco boot e 30GB pd-ssd. L'utente SSH `mdvault` e configurato tramite metadata.

### Cloudflare Tunnel e DNS

```hcl
resource "cloudflare_tunnel" "md_vault" {
  account_id = var.cloudflare_account_id
  name       = "md-vault"
  secret     = random_password.tunnel_secret.result
}

resource "cloudflare_tunnel_config" "md_vault" {
  account_id = var.cloudflare_account_id
  tunnel_id  = cloudflare_tunnel.md_vault.id

  config {
    ingress_rule {
      hostname = var.domain           # mdvault.site
      service  = "http://ingress-nginx-controller.ingress-nginx.svc.cluster.local:80"
    }
    ingress_rule {
      service = "http_status:404"     # catch-all
    }
  }
}

resource "cloudflare_record" "vault" {
  zone_id = var.cloudflare_zone_id
  name    = split(".", var.domain)[0]
  content = "${cloudflare_tunnel.md_vault.id}.cfargotunnel.com"
  type    = "CNAME"
  proxied = true
}
```

Il record DNS CNAME punta al tunnel Cloudflare con proxy abilitato, nascondendo l'IP reale della VM.

### Perche GCP e2-small

| Aspetto | Dettaglio |
|---|---|
| vCPU | 2 (shared-core) |
| RAM | 2GB (sufficiente per K3s + tutti i pod) |
| Rete | Fino a 1 Gbps |
| Costo | Coperto dai $300 di crediti gratuiti GCP |
| Storage | pd-ssd 30GB |

La `e2-small` offre il miglior rapporto costo/risorse per un progetto di questa natura:
- 2GB di RAM sono sufficienti per K3s (~300-400MB), Nginx Ingress (~120MB), e i pod applicativi (~300MB totali), con margine per spike
- Il modello shared-core e ideale per un'applicazione con traffico sporadico
- La regione `europe-west8` (Milano) offre la latenza minima per utenti in Italia
- I $300 di crediti gratuiti GCP coprono diversi mesi di utilizzo

### Perche K3s invece di K8s full

| Caratteristica | K3s | K8s completo |
|---|---|---|
| RAM base | ~300-400MB | ~1.5-2GB |
| Dipendenze | Singolo binario | etcd, kube-apiserver, etc. |
| Storage | SQLite/dqlite | Richiede etcd |
| Install time | ~30 secondi | ~15-30 minuti |
| Certificati | Automatici | Configurazione manuale |
| Ideale per | Single-node, edge, IoT | Multi-node production |

Con 2GB di RAM totali, K8s full non lascerebbe risorse sufficienti per i pod applicativi. K3s e la scelta naturale per un deployment single-node: stesso API Kubernetes, stessi manifest, ma footprint ridotto.

### Startup Script (Bootstrap)

Lo script di bootstrap eseguito al primo avvio della VM GCE:

```bash
#!/bin/bash
set -euo pipefail

# Installa Docker
apt-get update -y && apt-get upgrade -y
curl -fsSL https://get.docker.com | sh
usermod -aG docker mdvault

# Installa K3s (Traefik disabilitato, usiamo Nginx Ingress)
curl -sfL https://get.k3s.io | INSTALL_K3S_EXEC="--disable traefik \
  --disable servicelb --write-kubeconfig-mode 644" sh -

# Attendi che K3s sia pronto
until kubectl get nodes 2>/dev/null | grep -q " Ready"; do
  sleep 5
done

# Installa Nginx Ingress Controller (baremetal, no cloud LB)
kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/\
controller-v1.9.4/deploy/static/provider/baremetal/deploy.yaml

# Patch hostNetwork per cloudflared
kubectl -n ingress-nginx patch deployment ingress-nginx-controller \
  --type='json' -p='[{"op":"add","path":"/spec/template/spec/hostNetwork","value":true}]'

# Setup KUBECONFIG per utente mdvault
echo 'export KUBECONFIG=/etc/rancher/k3s/k3s.yaml' >> /home/mdvault/.bashrc
mkdir -p /home/mdvault/.kube
cp /etc/rancher/k3s/k3s.yaml /home/mdvault/.kube/config
chown -R mdvault:mdvault /home/mdvault/.kube

# Crea directory per PersistentVolume
mkdir -p /opt/md-vault/data
chown 1000:1000 /opt/md-vault/data
```

Traefik (l'ingress controller predefinito di K3s) e disabilitato perche usiamo Nginx Ingress Controller per maggiore flessibilita e familiarita. L'Nginx Ingress usa il provider `baremetal` (nessun cloud LoadBalancer), con `hostNetwork` abilitato per permettere a cloudflared di raggiungere il controller su localhost.

### Variabili Terraform

```hcl
variable "gcp_project" {
  default = "mdvault"
}

variable "gcp_region" {
  default = "europe-west8"
}

variable "gcp_zone" {
  default = "europe-west8-a"
}

variable "machine_type" {
  default = "e2-small"
}

variable "domain" {
  default = "mdvault.site"
}

variable "cloudflare_api_token" {
  sensitive = true
}

variable "cloudflare_account_id" {}
variable "cloudflare_zone_id" {}
variable "ssh_public_key" {}
variable "ssh_allowed_ip" {}
```

Le variabili sensibili (`cloudflare_api_token`) sono marcate come `sensitive = true` per evitare che vengano stampate nei log di Terraform. I valori sono forniti via file `terraform.tfvars` (escluso da git). La variabile `ssh_allowed_ip` include una validazione CIDR.

### Backend GCS per lo State

Il backend GCS per lo state Terraform e predisposto ma commentato, da attivare dopo la creazione del bucket:

```hcl
# terraform {
#   backend "gcs" {
#     bucket = "md-vault-terraform-state"
#     prefix = "terraform/state"
#   }
# }
```

Per creare il bucket:
```bash
gcloud storage buckets create gs://md-vault-terraform-state \
  --project=mdvault --location=europe-west8 --uniform-bucket-level-access
```

---

## 7. Kubernetes

### Helm Chart

Il deploy Kubernetes e gestito tramite un Helm 3 chart che parametrizza tutti i manifest:

```
helm/md-vault/
  Chart.yaml              # Metadata del chart (name, version)
  values.yaml             # Valori di default per produzione
  values-local.yaml       # Override per k3d locale
  templates/
    _helpers.tpl          # Helper per label comuni
    namespace.yaml
    secrets.yaml
    configmap.yaml
    pv-pvc.yaml
    api-deployment.yaml
    api-service.yaml
    frontend-deployment.yaml
    frontend-service.yaml
    ingress.yaml
    cloudflared.yaml      # Condizionale: .Values.tunnel.enabled
    backup-cronjob.yaml
```

Il chart supporta configurazione flessibile tramite `values.yaml`:

```bash
# Deploy con valori di produzione
helm upgrade --install md-vault helm/md-vault

# Deploy locale con override k3d
helm upgrade --install md-vault helm/md-vault -f helm/md-vault/values-local.yaml

# Dry-run per ispezionare i template renderizzati
helm template md-vault helm/md-vault
```

Componenti condizionali:
- **Cloudflare Tunnel**: abilitato/disabilitato con `.Values.tunnel.enabled`
- **Backup CronJob**: abilitato/disabilitato con `.Values.backup.enabled`

Lo script `deploy.sh` usa `helm upgrade --install` per deploy idempotenti.

### Organizzazione dei manifest (legacy)

I manifest raw Kubernetes sono mantenuti in `k8s/` come riferimento:

```
k8s/
  namespace.yaml              # Namespace md-vault
  secrets.yaml.example        # Template secrets (non committato)
  configmap.yaml              # Configurazione non sensibile
  pv-pvc.yaml                 # PersistentVolume e PersistentVolumeClaim
  api-deployment.yaml          # Deployment API FastAPI
  api-service.yaml             # Service API (ClusterIP)
  frontend-deployment.yaml     # Deployment Frontend nginx
  frontend-service.yaml        # Service Frontend (ClusterIP)
  cloudflared-deployment.yaml  # Deployment Cloudflare tunnel
  ingress.yaml                 # Ingress rules per routing
  backup-cronjob.yaml          # CronJob backup notturno
```

### Namespace

```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: md-vault
```

Tutti i componenti sono isolati nel namespace `md-vault`.

### Secrets

Il file `secrets.yaml` contiene le credenziali sensibili e NON e versionato in git (vedi `.gitignore`). E disponibile un template:

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: md-vault-secrets
  namespace: md-vault
type: Opaque
stringData:
  JWT_SECRET: "change-me-to-a-random-string"
  ADMIN_PASSWORD: "change-me-to-a-strong-password"
  CLOUDFLARE_TUNNEL_TOKEN: "your-tunnel-token-here"
```

### ConfigMap

Configurazione non sensibile iniettata come variabili d'ambiente:

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: md-vault-config
  namespace: md-vault
data:
  DB_PATH: "/data/vault.db"
  LOG_LEVEL: "info"
  JWT_EXPIRY_HOURS: "24"
```

### PersistentVolume e PersistentVolumeClaim

Il database SQLite e i file uploadati risiedono su un PersistentVolume di tipo `hostPath`:

```yaml
apiVersion: v1
kind: PersistentVolume
metadata:
  name: md-vault-pv
spec:
  capacity:
    storage: 5Gi
  accessModes:
    - ReadWriteOnce
  hostPath:
    path: /opt/md-vault/data
  persistentVolumeReclaimPolicy: Retain

---
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: md-vault-data
  namespace: md-vault
spec:
  accessModes:
    - ReadWriteOnce
  resources:
    requests:
      storage: 5Gi
```

`persistentVolumeReclaimPolicy: Retain` garantisce che i dati non vengano cancellati se il PVC viene eliminato. La directory host `/opt/md-vault/data` e creata dallo script `startup.sh` con permessi corretti (UID 1000).

### Deployment API

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: md-vault-api
  namespace: md-vault
spec:
  replicas: 1
  selector:
    matchLabels:
      app: md-vault-api
  template:
    spec:
      securityContext:
        runAsNonRoot: true
        runAsUser: 1000
        fsGroup: 1000
      containers:
        - name: api
          image: md-vault-api:latest
          imagePullPolicy: Never
          ports:
            - containerPort: 8000
          envFrom:
            - configMapRef:
                name: md-vault-config
            - secretRef:
                name: md-vault-secrets
          resources:
            requests:
              memory: "128Mi"
              cpu: "100m"
            limits:
              memory: "256Mi"
              cpu: "500m"
          livenessProbe:
            httpGet:
              path: /api/healthz
              port: 8000
            initialDelaySeconds: 10
            periodSeconds: 30
          readinessProbe:
            httpGet:
              path: /api/healthz
              port: 8000
            initialDelaySeconds: 5
            periodSeconds: 10
          volumeMounts:
            - name: data
              mountPath: /data
      volumes:
        - name: data
          persistentVolumeClaim:
            claimName: md-vault-data
```

Aspetti chiave:

- **`imagePullPolicy: Never`**: le immagini sono buildate localmente sulla VM e importate in K3s con `k3s ctr images import`. Non c'e un registry esterno, risparmiando banda e complessita.
- **`securityContext`**: il container gira come utente non-root (UID 1000), corrispondente all'utente `appuser` creato nel Dockerfile.
- **Resource limits**: memory limit di 256Mi con request di 128Mi. Questo protegge il nodo da OOM kill in caso di memory leak, essenziale con solo 2GB di RAM totali.
- **Health probes**: liveness e readiness probe sull'endpoint `/api/healthz` verificano che l'API e il database siano funzionanti.

### Deployment Frontend

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: md-vault-frontend
  namespace: md-vault
spec:
  replicas: 1
  template:
    spec:
      securityContext:
        fsGroup: 101
      containers:
        - name: frontend
          image: md-vault-frontend:latest
          imagePullPolicy: Never
          ports:
            - containerPort: 80
          resources:
            requests:
              memory: "32Mi"
              cpu: "50m"
            limits:
              memory: "64Mi"
              cpu: "200m"
```

Il frontend usa risorse minime (32-64Mi) poiche serve solo file statici.

### Deployment Cloudflared

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: cloudflared
  namespace: md-vault
spec:
  replicas: 1
  template:
    spec:
      securityContext:
        runAsNonRoot: true
        runAsUser: 65532
      containers:
        - name: cloudflared
          image: cloudflare/cloudflared:2024.6.1
          imagePullPolicy: IfNotPresent
          args:
            - tunnel
            - run
          env:
            - name: TUNNEL_TOKEN
              valueFrom:
                secretKeyRef:
                  name: md-vault-secrets
                  key: CLOUDFLARE_TUNNEL_TOKEN
          resources:
            requests:
              memory: "32Mi"
              cpu: "50m"
            limits:
              memory: "64Mi"
              cpu: "200m"
```

Il container `cloudflared` stabilisce una connessione uscente verso la rete Cloudflare, creando il tunnel attraverso il quale arriva il traffico web. Il token del tunnel e letto dai Secrets Kubernetes.

### Services

Entrambi i servizi sono di tipo `ClusterIP` (accessibili solo internamente al cluster):

```yaml
# API Service
apiVersion: v1
kind: Service
metadata:
  name: md-vault-api
  namespace: md-vault
spec:
  selector:
    app: md-vault-api
  ports:
    - port: 8000
      targetPort: 8000
  type: ClusterIP

# Frontend Service
apiVersion: v1
kind: Service
metadata:
  name: md-vault-frontend
  namespace: md-vault
spec:
  selector:
    app: md-vault-frontend
  ports:
    - port: 80
      targetPort: 80
  type: ClusterIP
```

Non serve `LoadBalancer` ne `NodePort` perche il traffico esterno arriva dal Cloudflare Tunnel, non direttamente al nodo.

### Ingress

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: md-vault-ingress
  namespace: md-vault
  annotations:
    nginx.ingress.kubernetes.io/use-regex: "true"
spec:
  ingressClassName: nginx
  rules:
    - http:
        paths:
          - path: /api
            pathType: Prefix
            backend:
              service:
                name: md-vault-api
                port:
                  number: 8000
          - path: /
            pathType: Prefix
            backend:
              service:
                name: md-vault-frontend
                port:
                  number: 80
```

Il routing e basato sul path:
- `/api/*` viene instradato al servizio API sulla porta 8000
- `/` (tutto il resto) viene instradato al frontend sulla porta 80

Non c'e `rewrite-target` perche l'API si aspetta di ricevere le richieste con il prefisso `/api` intatto.

### CronJob Backup

Il backup notturno usa un'immagine Docker dedicata (`md-vault-backup`) con boto3 pre-installato, eliminando la necessita di `pip install` a runtime:

```dockerfile
# backup/Dockerfile
FROM python:3.11-slim
RUN pip install --no-cache-dir boto3 && \
    adduser --disabled-password --gecos "" backupuser
COPY backup.py /app/backup.py
USER backupuser
ENTRYPOINT ["python", "/app/backup.py"]
```

Il CronJob Kubernetes:

```yaml
apiVersion: batch/v1
kind: CronJob
metadata:
  name: md-vault-backup
  namespace: md-vault
spec:
  schedule: "0 3 * * *"
  jobTemplate:
    spec:
      template:
        spec:
          securityContext:
            runAsNonRoot: true
            runAsUser: 1000
            fsGroup: 1000
          containers:
            - name: backup
              image: md-vault-backup:latest
              imagePullPolicy: Never
              resources:
                requests:
                  memory: "64Mi"
                limits:
                  memory: "128Mi"
              volumeMounts:
                - name: data
                  mountPath: /data
                  readOnly: true
          restartPolicy: OnFailure
          volumes:
            - name: data
              persistentVolumeClaim:
                claimName: md-vault-data
```

Il CronJob esegue ogni notte alle 03:00 UTC. Monta il volume dati in sola lettura (`readOnly: true`) per sicurezza. L'immagine dedicata garantisce startup rapido e riproducibilita (nessun download a runtime).

### Budget risorse per 2GB RAM

| Componente | Request | Limit |
|---|---|---|
| K3s base (kubelet, apiserver, etc.) | ~350Mi | - |
| Nginx Ingress Controller | ~100Mi | ~120Mi |
| md-vault-api | 128Mi | 256Mi |
| md-vault-frontend | 32Mi | 64Mi |
| cloudflared | 32Mi | 64Mi |
| Sistema operativo + overhead | ~200Mi | - |
| **Totale stimato** | **~850Mi** | - |
| **RAM disponibile** | **2048Mi** | - |
| **Margine** | **~1200Mi** | - |

Con la e2-small da 2GB, il margine e ampio per gestire spike di traffico e il job di backup notturno (64-128Mi temporanei).

---

## 8. CI/CD

### GitHub Actions Pipeline

Il file `.github/workflows/ci.yml` definisce una pipeline CI che si attiva su push e pull request verso il branch `main`:

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]
```

### Job della pipeline

La pipeline e composta da 8 job, alcuni indipendenti e paralleli:

```
lint ──> test ──> build-api
build-frontend (parallelo)
build-backup (parallelo)
validate-helm (parallelo)
validate-k8s (parallelo)
validate-terraform (parallelo)
```

#### 1. Lint (`lint`)

Esegue analisi statica del codice Python con 5 strumenti:

```yaml
- name: Black
  run: black --check .

- name: isort
  run: isort --check-only .

- name: Flake8
  run: flake8 . --max-line-length 99

- name: Bandit
  run: bandit -r . -s B608

- name: Mypy
  run: mypy . --ignore-missing-imports --no-strict-optional
```

| Strumento | Scopo |
|---|---|
| **Black** | Formattazione codice (verifica, non modifica) |
| **isort** | Ordine degli import |
| **Flake8** | Linting PEP8 con line length 99 |
| **Bandit** | Analisi sicurezza (esclude B608: SQL injection, gestita manualmente) |
| **Mypy** | Type checking statico |

#### 2. Test (`test`)

Esegue la suite di test pytest dopo il lint:

```yaml
test:
  runs-on: ubuntu-latest
  needs: lint
  steps:
    - uses: actions/checkout@v6
    - uses: actions/setup-python@v6
      with:
        python-version: "3.11"
    - name: Install dependencies
      run: pip install -r backend/requirements.txt
    - name: Run tests
      run: python -m pytest backend/tests/ -v
```

I 38 test coprono tutti gli endpoint API con database SQLite in-memory.

#### 3. Build API (`build-api`)

Dipende dal job `test` (si esegue solo se i test passano):

```yaml
build-api:
  runs-on: ubuntu-latest
  needs: test
  steps:
    - uses: actions/checkout@v4
    - name: Build API image
      run: docker build -t md-vault-api:latest ./backend
```

#### 4. Build Frontend (`build-frontend`)

Eseguito in parallelo (non dipende dal lint):

```yaml
build-frontend:
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
    - name: Build Frontend image
      run: docker build -t md-vault-frontend:latest ./frontend
```

#### 5. Build Backup (`build-backup`)

Builda l'immagine Docker dedicata per il backup:

```yaml
build-backup:
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v6
    - name: Build Backup image
      run: docker build -t md-vault-backup:latest ./backup
```

#### 6. Validazione Helm (`validate-helm`)

Verifica la sintassi e la correttezza del chart Helm:

```yaml
validate-helm:
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v6
    - name: Install Helm
      uses: azure/setup-helm@v4
      with:
        version: "v3.14.0"
    - name: Helm lint
      run: helm lint helm/md-vault
```

#### 7. Validazione YAML Kubernetes (`validate-k8s`)

Verifica che tutti i file YAML nella directory `k8s/` siano sintatticamente validi:

```yaml
validate-k8s:
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
    - name: Validate YAML syntax
      run: |
        for f in k8s/*.yaml; do
          echo "Validating $f..."
          python3 -c "
        import yaml, sys
        with open(sys.argv[1]) as fh:
            list(yaml.safe_load_all(fh))
        " "$f" || exit 1
        done
```

#### 8. Validazione Terraform (`validate-terraform`)

Verifica formattazione e validita della configurazione Terraform:

```yaml
validate-terraform:
  runs-on: ubuntu-latest
  defaults:
    run:
      working-directory: terraform
  steps:
    - uses: actions/checkout@v4
    - uses: hashicorp/setup-terraform@v3
      with:
        terraform_version: "1.7.0"
    - name: Terraform fmt
      run: terraform fmt -check -recursive
    - name: Terraform init
      run: terraform init -backend=false
    - name: Terraform validate
      run: terraform validate
```

`-backend=false` permette di inizializzare Terraform senza configurare il backend S3, necessario per eseguire la validazione in CI.

---

## 9. Sicurezza

### Autenticazione e autorizzazione

- **JWT (JSON Web Token)**: ogni richiesta autenticata richiede un token Bearer nell'header `Authorization`. I token scadono dopo 24 ore (configurabile via `JWT_EXPIRY_HOURS`).
- **bcrypt**: le password sono hashate con bcrypt con salt automatico. Non vengono mai salvate in chiaro.
- **Algoritmo**: HS256 (HMAC-SHA256) per la firma del JWT.

### Rate limiting login

L'endpoint di login implementa un rate limiting in-memory per IP (10 tentativi ogni 5 minuti):

```python
_login_attempts: dict[str, list[float]] = defaultdict(list)
_RATE_LIMIT_WINDOW = 300  # 5 minuti
_RATE_LIMIT_MAX = 10

def _check_rate_limit(ip: str):
    now = time.monotonic()
    _login_attempts[ip] = [t for t in _login_attempts[ip] if now - t < _RATE_LIMIT_WINDOW]
    if len(_login_attempts[ip]) >= _RATE_LIMIT_MAX:
        raise HTTPException(status_code=429, detail="Too many login attempts")
    _login_attempts[ip].append(now)
```

L'IP viene letto dall'header `X-Real-IP` settato da nginx (non `X-Forwarded-For` che puo essere spoofato dal client). Su login riuscito, il contatore viene azzerato.

### CORS e API docs

- **CORS ristretto**: le origini consentite sono configurate tramite env var `CORS_ORIGINS` (default: `https://mdvault.site`). In sviluppo locale si puo impostare `CORS_ORIGINS=http://localhost`.
- **Swagger/OpenAPI abilitati**: la documentazione interattiva e disponibile su `/api/docs` per default. Disattivabile con `DOCS_ENABLED=false` in produzione se necessario.

### Protezione da path traversal

L'endpoint di download file verifica che il path risolto rimanga all'interno della directory di upload:

```python
real_path = os.path.realpath(file_path)
if not real_path.startswith(os.path.realpath(UPLOAD_DIR)):
    raise HTTPException(status_code=403, detail="Access denied")
```

### Prevenzione XSS con DOMPurify

Ogni contenuto HTML inserito nel DOM passa attraverso DOMPurify:

- **Markdown**: `DOMPurify.sanitize(marked.parse(content))`
- **DOCX**: `DOMPurify.sanitize(mammoth_result.value)`
- **Fogli di calcolo**: `DOMPurify.sanitize(xlsx_html)`
- **Snippet ricerca**: `DOMPurify.sanitize(snippet, { ALLOWED_TAGS: ["mark"] })`

Inoltre, il codice usa metodi DOM sicuri (`textContent`, `createElement`, `appendChild`) invece di `innerHTML` dove possibile.

### Cloudflare Tunnel (zero porte inbound)

Il Cloudflare Tunnel elimina la necessita di aprire porte HTTP/HTTPS nelle firewall rules GCP:

- **Nessuna porta 80/443 aperta**: il traffico web arriva attraverso una connessione *uscente* dal pod `cloudflared`
- **IP nascosto**: il record DNS CNAME punta al tunnel, non all'IP della VM
- **SSL/TLS gestito da Cloudflare**: certificato automatico, nessuna configurazione cert-manager
- **DDoS protection**: inclusa nel piano gratuito di Cloudflare

L'unica porta inbound e la 22 (SSH), ristretta a un singolo IP via firewall rule con target tag.

### Kubernetes Secrets

Le credenziali sensibili (JWT secret, password admin, token tunnel) sono gestite come Kubernetes Secrets:

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: md-vault-secrets
  namespace: md-vault
type: Opaque
stringData:
  JWT_SECRET: "..."
  ADMIN_PASSWORD: "..."
  CLOUDFLARE_TUNNEL_TOKEN: "..."
```

Il file `secrets.yaml` e escluso da git (vedi `.gitignore`). Solo il template `secrets.yaml.example` e versionato.

### Container security

- I container API e cloudflared girano come utente **non-root** (`runAsNonRoot: true`)
- L'API gira come UID 1000 (utente `appuser` creato nel Dockerfile)
- Il cloudflared gira come UID 65532 (utente `nonroot`)
- Il backup monta il volume in **sola lettura** (`readOnly: true`)

### .gitignore hardened

Il `.gitignore` e configurato per escludere rigorosamente:

```gitignore
# Secrets & credentials
k8s/secrets.yaml
terraform/terraform.tfvars
terraform/*.auto.tfvars
.env
.env.*
*.pem
*.key
*.crt
credentials.json
service-account.json

# Terraform state
*.tfstate
*.tfstate.backup
.terraform/

# Database
vault.db
*.db
*.db-wal
*.db-shm
data/
uploads/
```

### Validazione input

- **Pydantic**: tutti i dati in ingresso sono validati dai modelli Pydantic (tipo, formato, campi obbligatori)
- **Estensioni file**: solo le estensioni nella whitelist `ALLOWED_EXTENSIONS` sono accettate
- **Dimensione file**: limite massimo di 50MB per upload
- **Ricerca**: lunghezza minima di 1 carattere per le query (`min_length=1`)

### Analisi sicurezza nel CI

**Bandit** esegue scansione automatica del codice Python per vulnerabilita note:

```yaml
- name: Bandit
  run: bandit -r . -s B608
```

L'esclusione `B608` (possibile SQL injection) e intenzionale: le query SQL con f-string nell'update sono gestite con parametrizzazione dei valori e commentate con `# noqa: S608`.

---

## 10. Scelte Tecnologiche

### Perche SQLite

| Pro | Dettaglio |
|---|---|
| **Zero configurazione** | Nessun server separato da gestire, nessuna connessione TCP |
| **Singolo file** | Il database e un singolo file, backup = copia del file |
| **Performance** | Per un utente singolo, SQLite e piu veloce di PostgreSQL (no overhead rete) |
| **Ideale per single-server** | Un solo server, un solo writer: scenario perfetto per SQLite |
| **WAL mode** | Letture concorrenti durante le scritture |
| **Backup semplice** | API `sqlite3.backup()` per copie consistenti hot |
| **FTS5 integrato** | Ricerca full-text senza dipendenze esterne (Elasticsearch, etc.) |

Quando NON usare SQLite:
- Se servissero piu writer concorrenti su server diversi
- Se il dataset superasse i 10-50GB
- Se servissero query relazionali complesse con JOIN multi-tabella

Per MD Vault (singolo utente, singolo server, <1GB di dati), SQLite e la scelta ottimale.

### Perche FTS5

FTS5 (Full-Text Search 5) e il modulo di ricerca full-text di SQLite. Rispetto ad alternative:

| Alternativa | Pro SQLite FTS5 |
|---|---|
| Elasticsearch | Zero infrastruttura aggiuntiva, zero RAM extra, integrato in SQLite |
| PostgreSQL FTS | Nessun server aggiuntivo, stessa performance per volumi piccoli |
| Whoosh/Lunr.js | FTS5 e C-native, piu veloce di implementazioni Python/JS |
| Ricerca LIKE | FTS5 usa indice invertito, ordine 1000x piu veloce su testi lunghi |

FTS5 offre:
- Indice invertito per ricerca sub-millisecondo
- Ranking BM25 per ordinamento per rilevanza
- Funzione `snippet()` per estratti con termini evidenziati
- Sincronizzazione automatica tramite trigger SQL

### Perche Win95 UI

| Motivazione | Dettaglio |
|---|---|
| **Originalita** | In un mare di Material Design e Tailwind, un'interfaccia Win95 si distingue immediatamente |
| **Zero build step** | HTML + CSS + JS vanilla con ES6 modules. Nessun npm, webpack, vite |
| **Leggerezza** | JS organizzato in 7 moduli ES6, ~640 righe di CSS. Nessuna dipendenza locale |
| **Nostalgia funzionale** | L'interfaccia Win95 e immediatamente riconoscibile e intuitiva |
| **Portfolio impact** | Dimostra che si puo creare un'UI completa e funzionale senza framework |

Le librerie esterne (marked.js, DOMPurify, PDF.js, mammoth.js, SheetJS) sono caricate da CDN, non richiedono build step.

### Perche Cloudflare Tunnel

| Vantaggio | Dettaglio |
|---|---|
| **Gratuito** | Incluso nel piano free di Cloudflare |
| **Sicurezza** | Nessuna porta HTTP/HTTPS aperta sul server |
| **SSL automatico** | Certificato gestito da Cloudflare, zero configurazione |
| **DDoS protection** | Inclusa gratuitamente |
| **IP nascosto** | L'IP reale della VM non e mai esposto |
| **Semplicita** | Un singolo pod Kubernetes con un token |

Alternative considerate e scartate:
- **cert-manager + Let's Encrypt**: richiede porte 80/443 aperte, complessita aggiuntiva
- **GCP Load Balancer**: costo significativo, overkill per un singolo server
- **Nginx proxy con certbot**: gestione certificati manuale, porte aperte

### Perche non un framework frontend (React, Vue, etc.)

| Aspetto | Vanilla JS | Framework |
|---|---|---|
| Build step | Nessuno | npm install, webpack/vite |
| node_modules | 0 | 200-500MB |
| Bundle size | 3 file (~50KB) | 200KB+ minimizzato |
| Docker image | nginx:alpine + 3 file | Richiede build multi-stage |
| Complessita | Bassa | Alta |
| Time to deploy | Istantaneo | Build pipeline necessaria |

Per un'applicazione a singolo utente con UI relativamente semplice, un framework frontend aggiungerebbe complessita senza benefici proporzionali.

---

## 11. Deploy

### Prerequisiti

1. Istanza GCE provisionata con Terraform (o manualmente)
2. K3s installato e funzionante (via `startup.sh`)
3. Nginx Ingress Controller installato
4. Docker installato sulla VM
5. File `k8s/secrets.yaml` creato a partire dal template

### Procedura step-by-step

#### 1. Clonare il repository sulla VM

```bash
ssh -i ~/.ssh/md-vault mdvault@<IP_GCE>
git clone https://github.com/MK023/md_vault.git
cd md_vault
```

#### 2. Creare il file secrets

```bash
cp k8s/secrets.yaml.example k8s/secrets.yaml
nano k8s/secrets.yaml
# Inserire:
#   JWT_SECRET: un valore random lungo (es. openssl rand -hex 32)
#   ADMIN_PASSWORD: una password sicura
#   CLOUDFLARE_TUNNEL_TOKEN: il token dal dashboard Cloudflare
```

#### 3. Eseguire il deploy

```bash
./scripts/deploy.sh
```

### Script deploy.sh

Lo script `deploy.sh` automatizza l'intero processo di deploy in 5 step:

```bash
#!/bin/bash
set -euo pipefail

echo "=== MD Vault Deploy ==="

# Step 1: Build immagine Docker API
echo "[1/5] Building API image..."
docker build -t md-vault-api:latest ./backend

# Step 2: Build immagine Docker Frontend
echo "[2/5] Building Frontend image..."
docker build -t md-vault-frontend:latest ./frontend

# Step 3: Importare le immagini in K3s
echo "[3/5] Importing images into K3s..."
docker save md-vault-api:latest | sudo k3s ctr images import -
docker save md-vault-frontend:latest | sudo k3s ctr images import -

# Step 4: Applicare tutti i manifest Kubernetes
echo "[4/5] Applying Kubernetes manifests..."
kubectl apply -f k8s/namespace.yaml
kubectl apply -f k8s/secrets.yaml
kubectl apply -f k8s/configmap.yaml
kubectl apply -f k8s/pv-pvc.yaml
kubectl apply -f k8s/api-deployment.yaml
kubectl apply -f k8s/api-service.yaml
kubectl apply -f k8s/frontend-deployment.yaml
kubectl apply -f k8s/frontend-service.yaml
kubectl apply -f k8s/cloudflared-deployment.yaml
kubectl apply -f k8s/ingress.yaml
kubectl apply -f k8s/backup-cronjob.yaml

# Step 5: Restart dei deployment per usare le nuove immagini
echo "[5/5] Restarting deployments..."
kubectl rollout restart deployment/md-vault-api -n md-vault
kubectl rollout restart deployment/md-vault-frontend -n md-vault

echo "=== Deploy complete! ==="
kubectl get pods -n md-vault
```

### Import immagini in K3s

Poiche le immagini Docker sono buildate localmente (non esiste un registry esterno), il processo di import e fondamentale:

```bash
docker save md-vault-api:latest | sudo k3s ctr images import -
```

Questo comando:
1. `docker save` esporta l'immagine come tar stream
2. Il pipe passa lo stream a `k3s ctr images import`
3. K3s importa l'immagine nel suo store containerd interno

Per questo motivo i deployment usano `imagePullPolicy: Never`: K3s non deve cercare l'immagine su un registry esterno, ma usare quella gia presente nel suo store locale.

### Verifica del deploy

Dopo il deploy, verificare lo stato dei pod:

```bash
# Stato pod
kubectl get pods -n md-vault

# Output atteso:
# NAME                                  READY   STATUS    RESTARTS   AGE
# md-vault-api-xxxxx                    1/1     Running   0          30s
# md-vault-frontend-xxxxx               1/1     Running   0          30s
# cloudflared-xxxxx                      1/1     Running   0          30s

# Log API
kubectl logs -f deployment/md-vault-api -n md-vault

# Health check
curl https://mdvault.site/api/healthz

# Tutti i servizi
kubectl get all -n md-vault
```

### Aggiornamento

Per aggiornare il codice dopo modifiche:

```bash
cd md_vault
git pull
./scripts/deploy.sh
```

Lo script ricostruisce le immagini, le re-importa in K3s, applica eventuali cambiamenti ai manifest e riavvia i deployment.

### Comandi utili

```bash
# Vedere i log dell'API in tempo reale
kubectl logs -f deployment/md-vault-api -n md-vault

# Riavviare un singolo deployment
kubectl rollout restart deployment/md-vault-api -n md-vault

# Accedere alla shell del container API
kubectl exec -it deployment/md-vault-api -n md-vault -- /bin/sh

# Backup manuale
kubectl exec deployment/md-vault-api -n md-vault -- python /app/backup.py

# Verificare lo stato del tunnel Cloudflare
kubectl logs deployment/cloudflared -n md-vault

# Verificare l'ingress
kubectl describe ingress md-vault-ingress -n md-vault

# Risorse utilizzate
kubectl top pods -n md-vault
```

---

## Appendice: Struttura completa del progetto

```
md_vault/
  backend/                    # FastAPI backend
    main.py
    config.py
    database.py
    auth.py
    models.py
    routers/
      auth.py
      documents.py
      search.py
    tests/                    # pytest test suite (38 test)
      conftest.py
      test_auth.py
      test_documents.py
      test_search.py
    Dockerfile
    requirements.txt
  frontend/                   # Win95 UI (ES6 modules, vanilla JS)
    index.html
    style.css
    js/                       # Moduli ES6 nativi
      app.js                  # Entry point, orchestrazione
      api.js                  # apiFetch(), chiamate HTTP
      auth.js                 # Login, token, cambio password
      documents.js            # CRUD, viewer, rendering
      tree.js                 # Tree, drag-drop, context menu
      windows.js              # Finestre, taskbar, desktop icons
      state.js                # Stato condiviso
    nginx.conf
    Dockerfile
  helm/                       # Helm 3 chart
    md-vault/
      Chart.yaml
      values.yaml
      values-local.yaml
      templates/
        _helpers.tpl
        namespace.yaml
        secrets.yaml
        configmap.yaml
        pv-pvc.yaml
        api-deployment.yaml
        api-service.yaml
        frontend-deployment.yaml
        frontend-service.yaml
        ingress.yaml
        cloudflared.yaml
        backup-cronjob.yaml
  k8s/                        # Kubernetes manifests (legacy)
    namespace.yaml
    secrets.yaml.example
    configmap.yaml
    pv-pvc.yaml
    api-deployment.yaml
    api-service.yaml
    frontend-deployment.yaml
    frontend-service.yaml
    cloudflared-deployment.yaml
    ingress.yaml
    backup-cronjob.yaml
  backup/                     # Immagine Docker backup dedicata
    Dockerfile                # python:3.11-slim + boto3
    backup.py                 # Backup SQLite su R2
  terraform/                  # IaC (Google Cloud)
    providers.tf
    variables.tf
    vpc.tf
    firewall.tf
    compute.tf
    cloudflare.tf
    gcs_backend.tf
    outputs.tf
    scripts/
      startup.sh
  scripts/                    # Lifecycle & deploy
    start.sh
    stop.sh
    deploy.sh                 # Build + Helm deploy
    backup.py
  docs/
    architettura.md
    architettura.drawio
  .github/
    workflows/
      ci.yml                  # lint -> test -> build + validate
  docker-compose.yml
  pyproject.toml
  .gitignore
  README.md
```
