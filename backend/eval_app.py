"""Songa evaluations on Modal. Everything runs server-side; results land in the `songa-eval` Volume.

From backend/:
    modal deploy eval_app.py                          # once, and after changing code or Evaluation/ data
    modal run eval_app.py                             # starts a full run (speech + segmentation) and returns
    modal run eval_app.py --parts asr                 # speech only
    modal run eval_app.py --limit 4 --run-id smoke    # quick smoke test

The run is spawned on the deployed app, so it finishes even if you close the terminal or turn off the
computer. Watch it with `modal app logs songa-eval`. Fetch results when it finishes:
    modal volume ls songa-eval results
    modal volume get songa-eval results/<run_id> ../Evaluation/results    # creates results/<run_id>/

What is evaluated (see Evaluation/README.md):
* Speech: Muse Voice Transcribe (Meta Model API) on the human-verified clips in Evaluation/. WER, CER,
  Swahili- and English-word recall, Swahili-to-English substitutions, errors near language switches.
* Segmentation: Songa's SAM 3 on a Modal GPU vs hosted SAM 3.1 (Meta Model API) on a COCO val2017 sample.
  Presence (false detections on absent objects), box AP, mask AP and tap-to-isolate mask IoU.
"""

from __future__ import annotations

import os
from pathlib import Path

import modal

EVAL_DIR = Path(__file__).resolve().parent.parent / "Evaluation"

app = modal.App("songa-eval")
results_volume = modal.Volume.from_name("songa-eval", create_if_missing=True)
hf_cache = modal.Volume.from_name("songa-hf-cache", create_if_missing=True)
secrets = [modal.Secret.from_name("songa-secrets")]

eval_image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("ffmpeg")
    .pip_install(
        "httpx>=0.27",
        "pydantic>=2.8",
        "fastapi>=0.115",
        "pillow>=10.4",
        "numpy>=1.26",
        "scipy>=1.11",
        "meta-sam-parser>=0.0.6",
        "jiwer>=3.0",
        "rapidfuzz>=3.0",
        "wordfreq>=3.0",
        "num2words>=0.5.13",
        "pycocotools>=2.0.8",
    )
    .add_local_python_source("songa", "evals")
    .add_local_dir(EVAL_DIR, "/eval_data", ignore=["results", "results/**", "*.md"])
)

sam_image = (
    modal.Image.debian_slim(python_version="3.11")
    .pip_install("torch>=2.6", "torchvision", "transformers>=5.0", "huggingface_hub", "pillow>=10.4", "numpy>=1.26")
    .env({"HF_HOME": "/cache/huggingface", "HF_XET_HIGH_PERFORMANCE": "1"})
    .add_local_python_source("songa")
)


@app.cls(
    image=sam_image,
    gpu=["L4", "A10"],
    secrets=secrets,
    volumes={"/cache": hf_cache},
    timeout=900,
    scaledown_window=120,
    max_containers=1,  # one GPU for the whole run; concurrent calls queue on it
)
@modal.concurrent(max_inputs=4)
class EvalSam:
    """The same SAM 3 runner as production (`SamGpu`), separate so evaluation never touches the live app."""

    @modal.enter()
    def load(self) -> None:
        from songa.services.sam_local import Sam3Runner

        self.runner = Sam3Runner(os.environ.get("SAM_LOCAL_MODEL_ID", "facebook/sam3"))
        self.runner.load()

    @modal.method()
    def segment(self, jpeg: bytes, concepts: list[str], threshold: float) -> list[dict]:
        return self.runner.segment(jpeg, concepts, threshold, return_masks=True)

    @modal.method()
    def isolate(self, jpeg: bytes, x: int, y: int) -> dict:
        return self.runner.isolate(jpeg, x, y)


@app.function(image=eval_image, secrets=secrets, volumes={"/vol": results_volume}, timeout=3 * 3600)
async def run_eval(run_id: str, parts: str = "asr,seg", images: int = 200, limit: int = 0, seed: int = 7) -> str:
    from evals.runner import run

    return await run(
        run_id=run_id,
        parts={part.strip() for part in parts.split(",") if part.strip()},
        images=images,
        limit=limit,
        seed=seed,
        data_dir=Path("/eval_data"),
        volume_dir=Path("/vol"),
        commit=results_volume.commit.aio,
        gpu=EvalSam(),
    )


@app.local_entrypoint()
def main(parts: str = "asr,seg", images: int = 200, limit: int = 0, seed: int = 7, run_id: str = "") -> None:
    """Starts a run on the *deployed* app and returns at once.

    A call made with `.remote()` from this machine is cancelled if this machine disconnects, even with
    `--detach`. A call spawned on the deployed function belongs to Modal, so the run finishes on its own.
    Deploy first (and again after changing code or the Evaluation data): `modal deploy eval_app.py`.
    """
    from datetime import datetime, timezone

    run_id = run_id or datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    deployed = modal.Function.from_name("songa-eval", "run_eval")
    call = deployed.spawn(run_id, parts, images, limit, seed)
    print(f"Started run {run_id} (parts={parts}, images={images}, limit={limit or 'none'}, seed={seed}).")
    print(f"Function call: {call.object_id}. It runs on Modal; you can close this terminal now.")
    print("Progress: modal app logs songa-eval")
    print(f"Results: modal volume get songa-eval results/{run_id} ../Evaluation/results   (folder must exist)")
