# Songa

Songa is a context-aware travel companion. Songa breaks language barriers with intent-driven voice interpretation, tap-to-explain vision built on SAM 3.1, an ambient journal that compiles itself into an itinerary, and an offline compass back to your lodging.

```
songa-app/
  mobile/    Expo SDK 58 + Expo Router (TypeScript, strict)
  backend/   FastAPI gateway on Modal (CPU); Muse Wonder, SAM 3.1 and Muse Voice Transcribe via the Meta Model API,
             plus optional self-hosted SAM 3 on a Modal GPU
```

## Features

| Tab | What it does | Pipeline |
| --- | --- | --- |
| Speak | Split screen. The resident half is rotated 180 degrees for the person across the table. Either side taps the mic, and the other side hears a culturally polite rendering of the intent. What Songa heard appears as soon as it is transcribed, before the translation is ready. | expo-audio (mono 16 kHz AAC), then `POST /api/dialogue/intent-bridge/stream` (NDJSON: a `transcript` event from Muse Voice Transcribe, then a `result` event from Muse Wonder), then expo-speech. The app falls back to the one-shot `POST /api/dialogue/intent-bridge` if the gateway returns 404. |
| Look | Photograph a menu, sign, market stall or place. SAM 3.1 finds items by concept ("menu item", "price", "landmark"). Tap one to get a translation, a price conversion and safety or allergen alerts. Or type a question ("Where am I?", "Which dishes are vegetarian?"), about the whole photo or the tapped item. Questions are a conversation: follow-ups like "is it spicy?" build on earlier answers and taps about the same photo (the phone keeps the thread and sends the last 6 exchanges; the server stores nothing). The answer comes first, then SAM 3.1 highlights the things it mentions. Every Look request carries the phone's GPS and place name ("Westlands, Nairobi, Kenya"), so local dishes, prices and signs are read in context; for place questions, the gateway also cross-checks the photo against Wikipedia landmarks within 1 km. | `POST /api/vision/segment` (SAM 3.1 concept prompts), then `POST /api/vision/sam-isolate` (SAM 3.1 point prompt, crop, Muse Wonder vision) or `POST /api/vision/ask` (NDJSON: an `answer` event from Muse Wonder, grounded by Wikipedia GeoSearch, then a `highlights` event from SAM 3.1) |
| Journal | Capture moments during the day: notes, voice memos and photos. "My day" turns them into a first-person diary timeline, written in your voice, with plans and reminders listed separately under "For later". It writes itself when you open it and updates when moments change. Times shown with `~` are estimates. | `POST /api/transcribe` (Muse Voice Transcribe) per memo, then `POST /api/logbook/compile-itinerary` (Muse Wonder) |
| Anchor | Anchor where you're staying: Songa watches GPS for up to 20 s and averages the sharpest fixes into one precise point (it stops early at ±8 m), then looks up the street address. An arrow and the distance guide you back with no network or map tiles. "Show a local" holds two cards written once in the local language and saved for offline use: **Take me home** (your address and taxi phrases) and **My needs** (allergies, diet and medical notes). Each phrase can be read aloud. Your needs also make Look's food alerts personal ("For you: likely contains peanuts"). | expo-location (`watchPositionAsync` plus smoothed heading), `combineFixes` and Haversine math in `mobile/src/lib/geo.ts`, `POST /api/cards/local` (Muse Wonder), expo-speech, AsyncStorage |

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

- With the default `SAM_BACKEND=meta`, no GPUs are used, so a Modal account without a payment method works. The gateway is a single CPU container with ffmpeg, and it scales to zero.
- Every setting is documented in `backend/.env.example`, split into runtime settings (read from the Modal secret) and deploy-time settings (read from your shell by `modal deploy`).
- All inference goes through the Meta Model API at `https://api.meta.ai/v1` with one key:
  - Muse Wonder (`muse-wonder-1.0`, Chat Completions)
  - SAM 3.1 (`sam-3.1`, Responses API; output parsed with Meta's `meta-sam-parser`)
  - Muse Voice Transcribe (`muse-voice-transcribe-1.0`, `/asr/transcribe`)
- The phone records AAC (m4a). Voice Transcribe accepts WAV only, so the gateway converts each clip to mono 24 kHz PCM with ffmpeg.
- Voice Transcribe supports 25 languages. For locales outside that list (for example Kiswahili), no language hint is sent and the model detects the language itself.
- An idle gateway container stays up for 5 minutes (`SONGA_SCALEDOWN_S`, default 300), so only the first request of a conversation pays the cold start of about 5 s. The app also pings `/health` when Speak opens and when a recording starts, so a cold container boots while the person is still talking.
- For a live demo, deploy with `SONGA_WARM=1 modal deploy modal_app.py` to keep one gateway container warm. Redeploy without it afterwards.
- **Self-hosted SAM (optional).** Set `SAM_BACKEND=modal` in the Modal secret to run SAM 3 on Songa's own GPU (class `SamGpu`, L4 with A10 fallback via `SONGA_SAM_GPU`). The GPU starts from a GPU memory snapshot in about 6 s and shuts down after 3 idle minutes (`SONGA_SAM_SCALEDOWN_S`). Until it answers, hosted Meta SAM serves Look, so a cold or capacity-starved GPU never blocks the app. Responses show which one answered in `timings` (`sam_gpu` or `sam_fallback`). Compare both with `modal run modal_app.py::benchmark_sam`.

Run the tests (no API keys needed; HTTP calls are mocked):

```bash
cd backend && python -m pytest
```

## Mobile setup

```bash
cd mobile
npm install
cp .env.example .env                # set EXPO_PUBLIC_SONGA_API_URL and EXPO_PUBLIC_SONGA_API_KEY
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
