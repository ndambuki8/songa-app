# Songa evaluation run `eval-2026-11-03`

Started 2026-11-03 21:43:40 UTC. Parts: asr, seg.

## Speech: muse-voice-transcribe-1.0

50 clips with human-verified references; 0 failed. Rates are pooled over all words; brackets are 95% bootstrap confidence intervals over clips.

| Set | Clips | WER | CER | Swahili recall (strict) | Swahili recall (lenient) | Swahili→English | English recall | Error near switches | p50 latency |
|---|---|---|---|---|---|---|---|---|---|
| Your recordings (all) | 23 | 16.2% (13.5–19.4) | 6.9% (5.4–8.8) | 88.1% (85.0–91.0) | 93.1% (90.3–95.5) | 0.6% | 87.4% | 14.3% | 3902.2 ms |
| Code-switched only | 20 | 16.5% (13.8–19.7) | 7.0% (5.4–8.6) | 88.0% (84.8–90.9) | 93.0% (90.1–95.6) | 0.6% | 86.0% | 14.3% | 3918.9 ms |
|   English | 2 | 9.1% | 7.1% | – | – | – | 100.0% | – | 1375.4 ms |
|   Kiswahili | 1 | 0.0% | 0.0% | 100.0% | 100.0% | 0.0% | – | – | 1560.9 ms |
|   Swahili-English | 20 | 16.5% | 7.0% | 88.0% | 93.0% | 0.6% | 86.0% | 14.3% | 3918.9 ms |
| AfriSpeech (accented English) | 27 | 18.9% (14.2–24.6) | 10.1% (7.3–13.5) | – | – | – | 86.5% | – | 2014.7 ms |

AfriSpeech by accent:

| Accent | Clips | WER | CER |
|---|---|---|---|
| afrikaans (ZA) | 3 | 16.4% | 9.4% |
| hausa (NG) | 3 | 16.1% | 6.4% |
| igbo (NG) | 3 | 19.5% | 14.0% |
| kinyarwanda (RW) | 3 | 33.3% | 20.2% |
| luganda (UG) | 3 | 14.9% | 8.5% |
| pidgin (NG) | 3 | 5.6% | 1.2% |
| swahili (KE) | 3 | 24.3% | 12.4% |
| yoruba (NG) | 2 | 17.6% | 8.9% |
| yoruba (US) | 1 | 13.0% | 7.6% |
| zulu (LS) | 1 | 0.0% | 0.0% |
| zulu (ZA) | 2 | 38.1% | 13.3% |

## Segmentation: COCO val2017 sample

200 images, 1003 text prompts (400 for objects not in the image), 358 taps. Presence uses Songa's threshold (0.35).

| Backend | False detections on absent objects | Presence precision | Presence recall | Box AP | Box AP50 | Mask AP | Tap mean IoU | Taps IoU≥0.5 | p50 per photo | p50 per tap |
|---|---|---|---|---|---|---|---|---|---|---|
| modal_gpu_sam3 | 1.5% | 99.0% | 94.5% | 0.634 | 0.822 | 0.546 | 0.7345 | 84.4% | 1385.7 ms | 764.6 ms |
| meta_api_sam3.1 | 1.2% | 99.1% | 88.6% | 0.580 | 0.739 | 0.508 | 0.7619 | 87.4% | 2064.7 ms | 2100.9 ms |

## Notes

- Swahili/English word tags come from English word frequencies plus a list of common Swahili words; borrowed words can be misclassified.
- AfriSpeech readers say punctuation aloud ("comma", "full stop"); those words are removed from transcripts when the reference does not contain them.
- COCO uses simple object names, so absolute segmentation scores are optimistic for travel scenes; compare the two backends.
- Meta SAM latency includes the network from Modal to the Meta API; the GPU latency includes Modal's call overhead.
