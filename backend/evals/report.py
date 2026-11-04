"""Figures and extra statistics for an evaluation run.

    python -m evals.report ../Evaluation/results/<run_id>

Writes PNG charts to <run>/figures/ and analysis.json (error breakdowns not in results.json), and prints a short
digest. Only reads files the run produced; makes no API calls.
"""

from __future__ import annotations

import json
import sys
from collections import Counter
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402

# Songa palette (mobile/src/theme/tokens.ts)
GREEN = "#0B8457"
DARK_GREEN = "#096C47"
CREAM = "#F4E5C2"
CHARCOAL = "#323232"
MUTED = "#646464"
GPU_LABEL = "Songa L4 GPU (SAM 3)"
META_LABEL = "Meta API (SAM 3.1)"

plt.rcParams.update(
    {
        "font.size": 10,
        "axes.edgecolor": CHARCOAL,
        "axes.labelcolor": CHARCOAL,
        "xtick.color": CHARCOAL,
        "ytick.color": CHARCOAL,
        "axes.spines.top": False,
        "axes.spines.right": False,
        "figure.dpi": 150,
        "savefig.bbox": "tight",
    }
)


def read_jsonl(path: Path) -> list[dict]:
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


def pct_axis(axis) -> None:
    axis.yaxis.set_major_formatter(matplotlib.ticker.PercentFormatter(1.0, decimals=0))


def label_bars(axis, bars, fmt="{:.1%}") -> None:
    for bar in bars:
        height = bar.get_height()
        axis.annotate(fmt.format(height), (bar.get_x() + bar.get_width() / 2, height), ha="center", va="bottom",
                      fontsize=8, color=CHARCOAL, xytext=(0, 2), textcoords="offset points")


def main(run_dir: Path) -> None:
    results = json.loads((run_dir / "results.json").read_text(encoding="utf-8"))
    clips = read_jsonl(run_dir / "asr_per_clip.jsonl")
    taps = read_jsonl(run_dir / "seg_taps.jsonl")
    prompts = read_jsonl(run_dir / "seg_prompts.jsonl")
    figures = run_dir / "figures"
    figures.mkdir(exist_ok=True)
    asr, seg = results["asr"], results["segmentation"]
    analysis: dict = {}

    # ---- 1. WER and CER by set, with 95% intervals --------------------------------------------------------
    sets = [
        ("Code-switched\nSwahili-English", asr["primary"]["code_switched_only"]),
        ("All Songa\nrecordings", asr["primary"]["overall"]),
        ("AfriSpeech\naccented English", asr["afrispeech"]["overall"]),
    ]
    fig, ax = plt.subplots(figsize=(7, 3.6))
    x = np.arange(len(sets))
    for offset, metric, color, name in ((-0.18, "wer", GREEN, "Word error rate"), (0.18, "cer", CREAM, "Character error rate")):
        values = [s[metric] for _, s in sets]
        lows = [s[metric] - s["ci95"][metric][0] for _, s in sets]
        highs = [s["ci95"][metric][1] - s[metric] for _, s in sets]
        bars = ax.bar(x + offset, values, 0.36, color=color, edgecolor=CHARCOAL, linewidth=0.6, label=name,
                      yerr=[lows, highs], capsize=3, error_kw={"ecolor": CHARCOAL, "linewidth": 0.8})
        label_bars(ax, bars)
    ax.set_xticks(x, [f"{name}\n(n={s['clips']})" for name, s in sets])
    pct_axis(ax)
    ax.set_ylabel("Error rate (lower is better)")
    ax.set_title("Muse Voice Transcribe: error rates with 95% confidence intervals", color=CHARCOAL, fontsize=11)
    ax.legend(frameon=False)
    fig.savefig(figures / "fig1_asr_error_rates.png")
    plt.close(fig)

    # ---- 2. Swahili vs English word recall (code-switched clips) -------------------------------------------
    cs = asr["primary"]["code_switched_only"]
    fig, ax = plt.subplots(figsize=(6, 3.4))
    groups = ["Swahili words", "English words"]
    strict = [cs["swahili_recall_strict"], cs["english_recall_strict"]]
    lenient = [cs["swahili_recall_lenient"], cs["english_recall_lenient"]]
    x = np.arange(2)
    label_bars(ax, ax.bar(x - 0.18, strict, 0.36, color=GREEN, edgecolor=CHARCOAL, linewidth=0.6, label="Exact match"))
    label_bars(ax, ax.bar(x + 0.18, lenient, 0.36, color=CREAM, edgecolor=CHARCOAL, linewidth=0.6, label="Near match (1 letter off; 2 for 8+ letters)"))
    ax.set_xticks(x, [f"{g}\n(n={n})" for g, n in zip(groups, [cs["swahili_words"], cs["english_words"]])])
    ax.set_ylim(0, 1.08)
    pct_axis(ax)
    ax.set_ylabel("Share of reference words recovered")
    ax.set_title("Code-switched speech: word recall by language", color=CHARCOAL, fontsize=11)
    ax.legend(frameon=False, ncol=2, loc="upper center", bbox_to_anchor=(0.5, -0.2))
    fig.savefig(figures / "fig2_word_recall_by_language.png")
    plt.close(fig)

    # ---- 3. Misses near a language switch vs elsewhere -----------------------------------------------------
    near_words = near_miss = total_words = total_miss = 0
    for clip in clips:
        if clip["dataset"] != "primary" or clip.get("wer") is None:
            continue
        sw_ref, en_ref = clip["swahili_words"], clip["english_words"]
        misses = round(sw_ref * (1 - (clip["swahili_recall_strict"] or 0))) if sw_ref else 0
        misses += round(en_ref * (1 - (clip["english_recall_strict"] or 0))) if en_ref else 0
        total_words += sw_ref + en_ref
        total_miss += misses
        if clip["switch_window_words"]:
            near_words += clip["switch_window_words"]
            near_miss += round(clip["switch_window_words"] * clip["switch_window_error_rate"])
    far_words, far_miss = total_words - near_words, total_miss - near_miss
    analysis["switch_effect"] = {
        "near_switch_words": near_words, "near_switch_miss_rate": round(near_miss / near_words, 4),
        "other_words": far_words, "other_miss_rate": round(far_miss / far_words, 4),
    }
    fig, ax = plt.subplots(figsize=(5.2, 3.2))
    bars = ax.bar([f"Within 2 words of a\nlanguage switch (n={near_words})", f"Everywhere else\n(n={far_words})"],
                  [near_miss / near_words, far_miss / far_words], 0.5, color=[GREEN, CREAM], edgecolor=CHARCOAL, linewidth=0.6)
    label_bars(ax, bars)
    pct_axis(ax)
    ax.set_ylabel("Reference words missed")
    ax.set_title("Do errors cluster at language switches?", color=CHARCOAL, fontsize=11)
    fig.savefig(figures / "fig3_switch_effect.png")
    plt.close(fig)

    # ---- 4. Per-clip WER vs CER ----------------------------------------------------------------------------
    fig, ax = plt.subplots(figsize=(5.6, 4))
    for dataset, color, name in (("primary", GREEN, "Songa recordings"), ("afrispeech", MUTED, "AfriSpeech")):
        points = [(c["wer"], c["cer"]) for c in clips if c["dataset"] == dataset and c.get("wer") is not None]
        ax.scatter([p[0] for p in points], [p[1] for p in points], s=28, color=color, alpha=0.85, label=name,
                   edgecolor="white", linewidth=0.5)
    limit = max(max(c["wer"] for c in clips if c.get("wer") is not None), 0.5) + 0.03
    ax.plot([0, limit], [0, limit], color=MUTED, linewidth=0.8, linestyle="--")
    ax.set_xlim(0, limit)
    ax.set_ylim(0, limit)
    ax.xaxis.set_major_formatter(matplotlib.ticker.PercentFormatter(1.0, decimals=0))
    pct_axis(ax)
    ax.set_xlabel("Word error rate (per clip)")
    ax.set_ylabel("Character error rate (per clip)")
    ax.set_title("Clips far below the diagonal are near-miss spellings", color=CHARCOAL, fontsize=10)
    ax.legend(frameon=False)
    fig.savefig(figures / "fig4_wer_vs_cer_per_clip.png")
    plt.close(fig)

    # ---- 5. AfriSpeech by accent ----------------------------------------------------------------------------
    accents = sorted(asr["afrispeech"]["by_accent"].items(), key=lambda kv: kv[1]["wer"])
    fig, ax = plt.subplots(figsize=(7, 3.8))
    y = np.arange(len(accents))
    ax.barh(y, [a[1]["wer"] for a in accents], color=GREEN, edgecolor=CHARCOAL, linewidth=0.6, label="WER")
    ax.barh(y, [a[1]["cer"] for a in accents], 0.4, color=CREAM, edgecolor=CHARCOAL, linewidth=0.6, label="CER")
    for row, (_, value) in zip(y, accents):
        ax.text(value["wer"] + 0.004, row, f"{value['wer']:.0%}", va="center", fontsize=8, color=CHARCOAL)
    ax.set_yticks(y, [f"{name} (n={value['clips']})" for name, value in accents])
    ax.xaxis.set_major_formatter(matplotlib.ticker.PercentFormatter(1.0, decimals=0))
    ax.set_xlabel("Error rate")
    ax.set_title("AfriSpeech sample: error rate by speaker accent (1–3 clips each)", color=CHARCOAL, fontsize=11)
    ax.legend(frameon=False, loc="lower right")
    fig.savefig(figures / "fig5_afrispeech_by_accent.png")
    plt.close(fig)

    # ---- substitutions and worst clips ----------------------------------------------------------------------
    subs = Counter()
    sub_lang = Counter()
    for clip in clips:
        for item in clip.get("substitutions") or []:
            subs[(item["reference"], item["transcript"])] += 1
            if clip["dataset"] == "primary":
                sub_lang[item["language"]] += 1
    # Songa recordings only: AfriSpeech words are all tagged English, which would swamp the comparison.
    analysis["primary_substitutions_by_reference_language"] = dict(sub_lang)
    analysis["top_substitutions"] = [{"reference": r, "transcript": h, "count": n} for (r, h), n in subs.most_common(25)]
    worst = sorted((c for c in clips if c.get("wer") is not None), key=lambda c: -c["wer"])[:6]
    analysis["worst_clips"] = [
        {k: c[k] for k in ("filename", "dataset", "language_pair", "accent", "wer", "cer", "reference", "hypothesis")} for c in worst
    ]

    # ---- 6. Segmentation quality comparison ----------------------------------------------------------------
    gpu, meta = seg["backends"]["modal_gpu_sam3"], seg["backends"]["meta_api_sam3.1"]
    metrics = [
        ("Presence\nrecall", "presence", "recall"),
        ("Presence\nprecision", "presence", "precision"),
        ("Box AP", "box_ap", "AP"),
        ("Box AP50", "box_ap", "AP50"),
        ("Mask AP", "mask_ap", "AP"),
        ("Taps with\nIoU ≥ 0.5", "tap_to_isolate", "share_iou_at_least_0.5"),
    ]
    fig, ax = plt.subplots(figsize=(8, 3.8))
    x = np.arange(len(metrics))
    for offset, backend, color, name in ((-0.19, gpu, GREEN, GPU_LABEL), (0.19, meta, CREAM, META_LABEL)):
        bars = ax.bar(x + offset, [backend[a][b] for _, a, b in metrics], 0.38, color=color, edgecolor=CHARCOAL, linewidth=0.6, label=name)
        label_bars(ax, bars, fmt="{:.2f}")
    ax.set_xticks(x, [m[0] for m in metrics])
    ax.set_ylim(0, 1.1)
    ax.set_ylabel("Score (higher is better)")
    ax.set_title(f"SAM on COCO val2017: {seg['images']} images, {seg['prompts']} prompts, {seg['taps']} taps",
                 color=CHARCOAL, fontsize=11)
    ax.legend(frameon=False, ncol=2, loc="upper center", bbox_to_anchor=(0.5, -0.18))
    fig.savefig(figures / "fig6_segmentation_quality.png")
    plt.close(fig)

    # ---- 7. Latency -----------------------------------------------------------------------------------------
    fig, axes = plt.subplots(1, 2, figsize=(8, 3.3))
    for axis, key, title in ((axes[0], "latency_per_photo", "Per photo (all prompts)"), (axes[1], "latency_per_tap", "Per tap")):
        x = np.arange(2)
        for offset, stat, color, name in ((-0.18, "p50_ms", GREEN, "Median"), (0.18, "p95_ms", CREAM, "95th percentile")):
            bars = axis.bar(x + offset, [gpu[key][stat] / 1000, meta[key][stat] / 1000], 0.36, color=color,
                            edgecolor=CHARCOAL, linewidth=0.6, label=name)
            label_bars(axis, bars, fmt="{:.1f} s")
        axis.set_xticks(x, ["L4 GPU\n(SAM 3)", "Meta API\n(SAM 3.1)"])
        axis.set_title(title, color=CHARCOAL, fontsize=10)
        axis.set_ylabel("Seconds")
    axes[0].legend(frameon=False)
    fig.suptitle("Segmentation latency, measured from Modal (warm GPU)", color=CHARCOAL, fontsize=11)
    fig.savefig(figures / "fig7_segmentation_latency.png")
    plt.close(fig)

    # ---- 8. Tap IoU distribution ----------------------------------------------------------------------------
    fig, ax = plt.subplots(figsize=(6.5, 3.4))
    bins = np.linspace(0, 1, 21)
    for backend, color, name in (("modal_gpu_sam3", GREEN, GPU_LABEL), ("meta_api_sam3.1", MUTED, META_LABEL)):
        values = [t["iou"] for t in taps if t["backend"] == backend and t["iou"] is not None]
        ax.hist(values, bins=bins, color=color, alpha=0.6, label=f"{name} (median {np.median(values):.2f})", edgecolor="white")
    ax.set_xlabel("Overlap (IoU) between SAM's outline and the true object")
    ax.set_ylabel("Taps")
    ax.set_title("Tap-to-isolate: most taps select the right object", color=CHARCOAL, fontsize=11)
    ax.legend(frameon=False, loc="upper left")
    fig.savefig(figures / "fig8_tap_iou_distribution.png")
    plt.close(fig)

    # ---- per-category presence misses and count behaviour ----------------------------------------------------
    misses = Counter()
    for row in prompts:
        if row["present"] and row["detections_at_threshold"] == 0:
            misses[(row["backend"], row["prompt"])] += 1
    analysis["most_missed_categories"] = {
        backend: [{"category": c, "missed": n} for (b, c), n in misses.most_common() if b == backend][:10]
        for backend in ("modal_gpu_sam3", "meta_api_sam3.1")
    }
    false_hits = Counter()
    for row in prompts:
        if not row["present"] and row["detections_at_threshold"] > 0:
            false_hits[(row["backend"], row["prompt"])] += 1
    analysis["false_detections_on_absent"] = {
        backend: [{"category": c, "times": n} for (b, c), n in false_hits.most_common() if b == backend]
        for backend in ("modal_gpu_sam3", "meta_api_sam3.1")
    }
    tap_pairs = {}
    for t in taps:
        tap_pairs.setdefault((t["image_id"], t["x"], t["y"]), {})[t["backend"]] = t["iou"]
    both = [v for v in tap_pairs.values() if len(v) == 2 and None not in v.values()]
    analysis["tap_head_to_head"] = {
        "taps": len(both),
        "gpu_better_by_0.1": sum(1 for v in both if v["modal_gpu_sam3"] - v["meta_api_sam3.1"] > 0.1),
        "meta_better_by_0.1": sum(1 for v in both if v["meta_api_sam3.1"] - v["modal_gpu_sam3"] > 0.1),
        "within_0.1": sum(1 for v in both if abs(v["modal_gpu_sam3"] - v["meta_api_sam3.1"]) <= 0.1),
    }

    (run_dir / "analysis.json").write_text(json.dumps(analysis, indent=2, ensure_ascii=False), encoding="utf-8")
    print(json.dumps(analysis, indent=1, ensure_ascii=False)[:6000])
    print("figures:", sorted(p.name for p in figures.glob("*.png")))


if __name__ == "__main__":
    main(Path(sys.argv[1]).resolve())
