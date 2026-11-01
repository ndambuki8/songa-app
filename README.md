# Songa

Songa is a context-aware travel companion. Songa breaks language barriers with intent-driven voice interpretation, tap-to-explain vision built on SAM 3.1, an ambient journal that compiles itself into an itinerary, and an offline compass back to your lodging.

```
songa-app/
  mobile/    Expo SDK 58 + Expo Router (TypeScript, strict)
  backend/   CPU-only FastAPI gateway on Modal; Muse Wonder, SAM 3.1 and Muse Voice Transcribe via the Meta Model API
```

## Features

| Tab | What it does | Pipeline |
| --- | --- | --- |
| Trip | Before travelling, enter the destination, dates, stay and any needs (diet, children, mobility). Songa returns a day-by-day plan, key phrases with audio, local manners, safety, money and transport tips, and emergency numbers. The plan is saved on the phone for offline use, and the stay becomes Anchor's suggested name. | `POST /api/trip/briefing` (Muse Wonder), then expo-speech for phrases |
| Speak | Split screen. The resident half is rotated 180 degrees for the person across the table. Either side taps the mic, and the other side hears a culturally polite rendering of the intent. | expo-audio, then `POST /api/dialogue/intent-bridge` (Muse Voice Transcribe, then Muse Wonder), then expo-speech |
| Look | Photograph a menu, sign or transit board. SAM 3.1 finds items by concept ("menu item", "price", "sign"). Tap one to get a translation, a price conversion and safety or allergen alerts. | `POST /api/vision/segment` (SAM 3.1 concept prompts), then `POST /api/vision/sam-isolate` (SAM 3.1 point prompt, crop, Muse Wonder vision) |
| Journal | Capture notes, voice memos and photos during the day. "Compile my day" turns them into a chronological timeline. | `POST /api/transcribe` (Muse Voice Transcribe) per memo, then `POST /api/logbook/compile-itinerary` (Muse Wonder) |
| Anchor | Lock your lodging's GPS position. An arrow and the distance in meters guide you back with no network or map tiles. | expo-location (2 s polling plus heading), Haversine and bearing math in `mobile/src/lib/geo.ts`, AsyncStorage |

Every backend response includes `latency_ms` and a per-stage `timings` breakdown. Errors use a single envelope, `{ "error": { "code", "message" }, "latency_ms" }`, with semantic HTTP statuses (400, 401, 410, 413, 422, 502, 503, 504).

## Design system

All colors come from `mobile/src/theme/tokens.ts` (`SONGA_THEME`). ESLint rejects raw hex or rgb literals anywhere outside `src/theme/`.

The spec lists `surfaceNatural` as `#FF4E5C2`. That value has 7 digits and is not a valid color, so the app uses `#F4E5C2`, the almond/cream described alongside it.

Typography is a fixed, absolute scale in `typography.ts`.

## Backend setup (Modal)

Run every command from the `backend/` directory.

```bash
cd backend
pip install fastapi pydantic httpx pillow numpy meta-sam-parser modal python-dotenv pytest
modal setup                                          # once, to authenticate
cp .env.example .env                                 # fill in META_API_KEY and SONGA_API_KEY
modal secret create songa-secrets --from-dotenv .env --force
modal run modal_app.py::smoke                        # one real call to each Meta model
modal deploy modal_app.py                            # prints https://<workspace>--songa-gateway.modal.run
```

- No GPUs are used, so a Modal account without a payment method works. The gateway is a single CPU container with ffmpeg, and it scales to zero.
- All inference goes through the Meta Model API at `https://api.meta.ai/v1` with one key:
  - Muse Wonder (`muse-wonder-1.0`, Chat Completions)
  - SAM 3.1 (`sam-3.1`, Responses API; output parsed with Meta's `meta-sam-parser`)
  - Muse Voice Transcribe (`muse-voice-transcribe-1.0`, `/asr/transcribe`)
- The phone records AAC (m4a). Voice Transcribe accepts WAV only, so the gateway converts each clip to mono 24 kHz PCM with ffmpeg.
- Voice Transcribe supports 25 languages. For locales outside that list (for example Kiswahili), no language hint is sent and the model detects the language itself.
- For a live demo, deploy with `SONGA_WARM=1 modal deploy modal_app.py` to keep one gateway container warm. Redeploy without it afterwards.

To run the gateway on your own machine instead of Modal (needs ffmpeg and the same `.env`):

```bash
cd backend
uvicorn local_app:app --host 0.0.0.0 --port 8000 --env-file .env --reload
```

Point the app at it with `EXPO_PUBLIC_SONGA_API_URL=http://<your-computer-LAN-IP>:8000` in `mobile/.env.local`. The phone and the computer must be on the same Wi-Fi.

Run the tests (no API keys needed; HTTP calls are mocked):

```bash
cd backend && python -m pytest
```

## Mobile setup

Expo SDK 58 requires Node.js 22.13 or newer.

```bash
cd mobile
npm install
cp .env.example .env.local          # set EXPO_PUBLIC_SONGA_API_URL and EXPO_PUBLIC_SONGA_API_KEY
npx expo start
```

Camera, microphone, compass and file-system features need a physical device. Expo Go works for quick checks. For a full native build, use `npx expo run:android`, `npx expo run:ios` or `npx eas-cli@latest build --profile development`.

Quality gates:

```bash
npm run typecheck && npm run lint && npm test
```

## Architecture notes

- **Separation of concerns.** Screens in `src/app/` only wire a hook to a view. Hooks in `src/features/*/hooks` own state and side effects. Components in `src/features/*/components` only render. API modules in `src/services/api` never throw: they return a typed `ApiResult` that the views show through `ErrorBanner`.
- **Runtime contracts.** Responses are validated with zod on the client and Pydantic on the server. Muse Wonder output is validated against a schema, with one self-repair retry before a `502 invalid_model_output`.
- **Vision session cache.** `segment` stores the uploaded photo in a `modal.Dict` with a 30 minute TTL, so each tap sends only coordinates. If the cache has expired, the server returns `410`, and the client automatically resends the photo.
- **Swappable engines.** Routes depend on the protocols in `backend/songa/engines.py`. The Meta adapters live in `backend/songa/services/` and share one HTTP client that maps API failures to the error envelope.
