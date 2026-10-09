<p align="center">
  <img src="frontend/public/favicon.svg" alt="GupAi scissors logo" width="112" height="112">
</p>
<h1 align="center">GupAi</h1>
<p align="center"><strong>Para bago gumupit, nagkaintindihan muna.</strong><br>Agree on the haircut before the first cut.</p>
<p align="center">An offline AI consultation assistant for Filipino barbershops.</p>

GupAi helps a barber and customer turn “ganito sana” into a shared haircut plan. **Kuya Gup**, the app’s barber assistant, asks about preferences, reviews reference photos, and helps choose the sides and top. Both people approve the same plan before cutting begins. With consent, a saved visit makes “same as last time” easier next time.

Built for **AppBuildersPH Hackathon 2026 — Local AI**. AI inference runs on the shop laptop; a paired phone connects over the same local network. Internet is needed for initial installation and model downloads, not for normal consultations afterward.

## What it does

- **Guided Tagalog/Taglish consultation:** type, use answer chips, dictate, or attach a haircut reference. Kuya Gup asks one question at a time and builds a shared brief.
- **A consistent male voice:** optional local OmniVoice speech uses the included Kuya Gup reference voice. Mute and **Pakinggan** replay controls are available.
- **Phone pairing:** scan a chair’s single-use QR code to join its consultation. Multiple chairs can share the laptop.
- **Guided photos:** capture front, left, and right views with framing guidance and a countdown.
- **Face and hair observations:** local models suggest face shape and hair characteristics for the barber to confirm.
- **Sides and top selection:** illustrated choices and explanations based on the customer’s preferences and the haircut catalog.
- **Shared agreement:** the barber and customer approve the same plan version before cutting. Optional photo checkpoints provide advisory feedback.
- **Return visits:** ratings, consented customer records, saved preferred haircuts, and customer deletion.

The previews are illustrations, not predictions of exactly how a person will look. AI observations are suggestions; the barber and customer make the final decisions.

## How it runs

| Component | Purpose |
|---|---|
| React, TypeScript, Vite | Laptop and phone interfaces; served locally after building |
| FastAPI + SQLite | Local API, consultations, agreements, and customer records |
| Ollama + `qwen3.5:4b` | Conversation, photo observations, and suggestions |
| faster-whisper | Local Tagalog/Taglish speech recognition |
| MediaPipe Face Landmarker | Face landmarks and heuristic shape estimates |
| OmniVoice, optional | Local spoken replies using the included male reference |
| mkcert | Trusted local HTTPS for phone camera and microphone access |

## Before you start

You need:

- **Python 3.12**, **Node.js 22.12 or newer** (Node 24 also works), npm, Git, [Ollama](https://ollama.com/download), and [mkcert](https://github.com/FiloSottile/mkcert#installation).
- A laptop with enough free disk space for Python packages and several gigabytes of model weights. Allow **at least 15 GB free** as a practical starting point; GPU packages can need more.
- **16 GB RAM or more is recommended**, especially with spoken replies. Lower-memory machines may be slow; this is not a validated minimum.
- Internet during setup. For phone pairing, put both devices on the same reachable Wi-Fi/hotspot without client isolation.

**Tested environment:** Apple Silicon macOS with Python 3.12. The Windows instructions below match the project’s paths and launcher, but have not been freshly tested on a separate Windows machine. The current voice implementation uses Apple’s MPS GPU on supported Macs and CPU elsewhere; an NVIDIA GPU is not automatically used by this code.

> Run every command below from the repository root unless a step says otherwise. Do not copy another person’s `.venv`, certificates, or local database.

## Step 1 — Clone the project

```sh
git clone https://github.com/manalogadiel/GupAi.git
cd GupAi
```

Check the tools:

```sh
node --version
npm --version
ollama --version
mkcert -version
```

If a command is missing, install that prerequisite and open a new terminal before continuing.

## Step 2 — Create the Python environment

### macOS / Linux — Bash or Zsh

```sh
python3.12 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
mkdir -p certs knowledge/models
```

### Windows — PowerShell

```powershell
py -3.12 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
New-Item -ItemType Directory -Force certs, knowledge/models | Out-Null
```

If PowerShell blocks activation, use `.\.venv\Scripts\python.exe` instead of `python` in the remaining commands; activation is only a convenience. On macOS/Linux the equivalent is `.venv/bin/python`.

Install the core dependencies. These versions match the working development environment:

```sh
python -m pip install "fastapi==0.143.0" "uvicorn[standard]==0.54.0" "pydantic==2.14.0" "pillow==12.3.0" "python-multipart==0.0.32" "httpx==0.28.1" "qrcode==8.2" "faster-whisper==1.2.1" "mediapipe==1.1.0" "av==19.0.1" "numpy==2.5.3" "pytest==9.1.1"
```

## Step 3 — Download the local AI models

**Keep internet enabled for this step.** If you previously set `HF_HUB_OFFLINE` or `TRANSFORMERS_OFFLINE`, remove those settings while downloading.

### Conversation and vision

Open the Ollama application and leave it running, then run:

```sh
ollama pull qwen3.5:4b
ollama list
```

The list must include `qwen3.5:4b`. If Ollama is not running as an application/service, run `ollama serve` in a separate terminal and leave it open. Do not run a second server if port 11434 is already occupied by Ollama.

### Speech recognition

Download the lighter model first. The app uses it when the larger default model is not cached:

```sh
python -c "from faster_whisper import WhisperModel; WhisperModel('small', device='cpu', compute_type='int8')"
```

For the larger Tagalog/Taglish recognition option, also download:

```sh
python -c "from faster_whisper import WhisperModel; WhisperModel('large-v3-turbo', device='cpu', compute_type='int8')"
```

When both are present, the app prefers `large-v3-turbo`. To use `small` explicitly, set `GUPAI_WHISPER=small` before launching.

### Face landmarks

This command works in both activated environments:

```sh
python -c "from pathlib import Path; from urllib.request import urlretrieve; p=Path('knowledge/models/face_landmarker.task'); p.parent.mkdir(parents=True, exist_ok=True); urlretrieve('https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task', str(p))"
```

### Spoken replies — optional

Install this if you want Kuya Gup to speak. Text conversation works without it; missing voice weights will not be downloaded automatically at runtime.

```sh
python -m pip install -r backend/requirements-tts.txt
python scripts/setup-tts.py
```

This downloads approximately **3.27 GB** of OmniVoice weights to `data/models/omnivoice`. The reference voice is already included at `knowledge/voices/kuya-gup.wav`.

**License:** OmniVoice’s code is Apache-2.0, but its pretrained weights are **CC-BY-NC**, according to its [model card](https://huggingface.co/k2-fsa/OmniVoice). Check the model terms before commercial deployment. Spoken replies can take several seconds to generate and will be slower on CPU. Browser playback may require tapping **Pakinggan**.

Check that Python dependencies are compatible:

```sh
python -m pip check
```

Expected: `No broken requirements found.`

## Step 4 — Build the interface

```sh
npm --prefix frontend ci
npm --prefix frontend run build
```

A successful build creates `frontend/dist/index.html`. FastAPI serves this build, so you do **not** need a separate Vite server to run the app. Rebuild after changing frontend code.

## Step 5 — Create HTTPS certificates

Find the laptop’s **local IPv4 address** on the network the phone will use:

- **macOS:** System Settings → Wi-Fi → Details → TCP/IP.
- **Windows:** run `ipconfig` and find the IPv4 address of the active Wi-Fi adapter.
- **Linux:** inspect the active network connection or run `hostname -I`.

Install mkcert’s local certificate authority:

```sh
mkcert -install
```

Then generate the certificate. **Replace `192.168.1.50` below with your laptop’s actual local IP**; it is only an example:

```sh
mkcert -cert-file certs/gupai.pem -key-file certs/gupai-key.pem localhost 127.0.0.1 ::1 192.168.1.50
```

If the laptop’s network/IP changes, regenerate the certificate for the new IP and use that address when starting the app.

### Trust the certificate on the phone

```sh
mkcert -CAROOT
```

Transfer **only `rootCA.pem`** from that directory to your own test phone. Never share `rootCA-key.pem` or `certs/gupai-key.pem`.

- **iPhone/iPad:** install the downloaded profile in Settings, then enable its trust under General → About → Certificate Trust Settings.
- **Android:** install it as a CA certificate through the device’s security/credential settings. Menu names differ by manufacturer.

Allow the browser’s camera and microphone permissions when prompted. A trusted HTTPS connection is required for the phone capture workflow.

## Step 6 — Start GupAi

All downloads must be complete first. Keep Ollama running. Replace the example IP with the same laptop IP used in the certificate.

### macOS / Linux

```sh
export HF_HUB_OFFLINE=1
export TRANSFORMERS_OFFLINE=1
export PYTORCH_ENABLE_MPS_FALLBACK=1
python scripts/preflight.py --phone-ip 192.168.1.50
bash scripts/start-demo.sh 192.168.1.50
```

### Windows PowerShell

```powershell
$env:HF_HUB_OFFLINE = "1"
$env:TRANSFORMERS_OFFLINE = "1"
python scripts/preflight.py --phone-ip 192.168.1.50
.\scripts\start-demo.ps1 -PhoneIP 192.168.1.50
```

Preflight should report `"ready": true`. Fix any `false` check before continuing. Preflight checks the core app, speech recognition, and certificates; it **does not check OmniVoice readiness**. Startup prints separate model warmup messages, including `warm tagalog voice` when voice setup succeeds. Wait for warmup before the first consultation.

If PowerShell prevents the launcher script from running, use the manual command below with the project’s Python executable.

### Manual launch — either platform

Set the phone URL first:

```sh
# macOS/Linux
export GUPAI_PAIR_BASE_URL=https://192.168.1.50:8443
```

```powershell
# Windows PowerShell
$env:GUPAI_PAIR_BASE_URL = "https://192.168.1.50:8443"
```

Then, with the virtual environment active:

```sh
python -m uvicorn backend.app.main:app --host 0.0.0.0 --port 8443 --ssl-keyfile certs/gupai-key.pem --ssl-certfile certs/gupai.pem
```

Leave that terminal running. Stop with **Ctrl+C**; run the same launcher again to restart. Do not start multiple copies on port 8443.

## Step 7 — Open the app and try a consultation

1. On the **laptop**, open **https://localhost:8443**. Use localhost for barber access; the LAN URL is intended for the paired phone.
2. Start a consultation and display its QR code.
3. On the **phone**, scan that QR code. The generated link includes the pairing token; opening the bare LAN address does not pair a device.
4. Answer Kuya Gup’s questions, capture the guided photos, and confirm the observations.
5. Choose the sides and top, then approve the shared haircut plan from both devices.
6. Finish the visit, collect a rating, and save a record only with the appropriate consent.

For a quick server check, open **https://localhost:8443/api/health** on the laptop. Expect `ollama`, `whisper`, and `face_landmarker` to be `true`, with `vision_model` set to `qwen3.5:4b`. Voice generation has a separate startup check and is not included in this response.

After setup, you can disconnect the network’s **internet uplink** to try offline operation. Keep the local Wi-Fi/hotspot connection between laptop and phone active.

## Troubleshooting

| Symptom | What to check |
|---|---|
| `python` or a package is missing | Activate `.venv`, or use its Python executable explicitly. Use Python 3.12. |
| Vite reports an unsupported Node version | Install Node 22.12+ or Node 24, reopen the terminal, then rerun `npm ci` and the build. |
| `ollama_model: false` | Start Ollama and confirm `ollama list` contains exactly `qwen3.5:4b`. |
| `speech_weights_cached: false` | Download `small` or `large-v3-turbo` using the same OS user and virtual environment that run the app. Disable offline environment flags during downloads. |
| `face_model: false` | Repeat the face landmark download and check the destination filename. |
| `production_ui: false` | Run `npm --prefix frontend ci` and `npm --prefix frontend run build`. |
| Certificate/IP checks fail | Regenerate the certificate with the current laptop IP and pass that IP to the launcher. |
| Phone cannot connect | Use the same LAN, allow Python/port 8443 through the firewall on the private network, and avoid guest Wi-Fi client isolation. |
| Phone camera/mic unavailable | Trust the CA on the phone, use HTTPS, and grant browser permissions. |
| Voice is silent | Install the optional TTS dependencies and weights, check warmup logs, unmute, then tap **Pakinggan**. |
| Voice or AI is delayed | Wait for model warmup, close other heavy apps, and avoid overlapping consultations while testing. New audio requires inference; cached replay is quicker. CPU voice generation can be slow. |
| Launcher says “already running” | Stop the existing server with Ctrl+C before restarting to apply backend changes. Refresh both browsers after frontend changes. |

## Development checks

With the virtual environment active:

```sh
python -m pytest backend/tests -q
npm --prefix frontend run build
npm --prefix frontend run lint
```

Optional playback regression tests use **Node 24**:

```sh
node --experimental-strip-types --test frontend/tests/speech.test.ts
```

Core API tests use temporary databases; passing them does not replace testing camera, microphone, certificate trust, and playback on a physical phone. Setup commands were checked against the repository and working Mac environment; a fresh installation on every supported OS has not been verified.

## Data, privacy, and limitations

- SQLite records and local media live under `data/`. Model caches and certificates are machine-specific and excluded from Git.
- Photos and recordings stay on the local system during inference. No cloud AI API key is required.
- Face landmarks estimate shape; the app does not perform face identification.
- The prototype has no barber password and does not encrypt stored data at rest. Use it on a trusted local network, not as a public internet service.
- Haircut advice and face-shape thresholds are not professionally validated. Confirm observations and preferences with the barber and customer.
- Separate licenses apply to models and third-party assets; local execution does not remove those restrictions.

## Project guide

- [`backend/app/`](backend/app/) — API, local models, consultation flow, and storage.
- [`frontend/src/`](frontend/src/) — laptop/phone interfaces and the mascot.
- [`knowledge/`](knowledge/) — haircut catalog, source material, and voice reference.
- [`scripts/`](scripts/) — readiness checks, launchers, and voice setup.
- [`docs/DEMO.md`](docs/DEMO.md) — demo and physical-device checklist.
- [`docs/PRD.md`](docs/PRD.md) — product scope and design.
- [`DISCLOSURES.md`](DISCLOSURES.md) and [`ASSETS.md`](ASSETS.md) — development and asset background. See the current voice license note above for the added OmniVoice integration.

Built with Claude Code and OpenAI Codex. The shared goal: help people leave the chair with the haircut they actually agreed on.
