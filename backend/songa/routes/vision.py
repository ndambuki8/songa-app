from __future__ import annotations

from fastapi import APIRouter, Depends

from songa.config import Settings
from songa.core.errors import BadPayload, ResourceExpired
from songa.core.media import decode_base64_payload, open_rgb_image, to_data_url
from songa.core.telemetry import StageTimer, request_timer
from songa.engines import Engines
from songa.llm.prompts import VISION_ANALYSIS_SYSTEM, vision_analysis_user
from songa.llm.structured import complete_structured
from songa.routes.deps import get_engines, get_settings
from songa.schemas import (
    BoundingBox,
    IsolateRequest,
    IsolateResponse,
    Segment,
    SegmentRequest,
    SegmentResponse,
    VisionModelOutput,
)
from songa.vision.geometry import SCENE_CONCEPTS, refine_segments

router = APIRouter()


@router.post("/api/vision/segment", response_model=SegmentResponse)
async def segment(
    body: SegmentRequest,
    engines: Engines = Depends(get_engines),
    settings: Settings = Depends(get_settings),
    timer: StageTimer = Depends(request_timer),
) -> SegmentResponse:
    with timer.stage("decode"):
        image_bytes = decode_base64_payload(body.image_b64, max_bytes=settings.max_image_bytes, label="image")
        width, height = open_rgb_image(image_bytes).size

    with timer.stage("sam"):
        raw = await engines.segmenter.segment(image_bytes, SCENE_CONCEPTS[body.scene])
    refined = refine_segments(raw, image_w=width, image_h=height)

    with timer.stage("cache"):
        image_id = await engines.images.put(image_bytes)

    return SegmentResponse(
        image_id=image_id,
        width=width,
        height=height,
        segments=[
            Segment(
                id=f"seg_{index}",
                label=item.label,
                score=round(item.score, 4),
                bbox=BoundingBox(x=item.x, y=item.y, width=item.width, height=item.height),
            )
            for index, item in enumerate(refined)
        ],
        **timer.report(),
    )


@router.post("/api/vision/sam-isolate", response_model=IsolateResponse)
async def sam_isolate(
    body: IsolateRequest,
    engines: Engines = Depends(get_engines),
    settings: Settings = Depends(get_settings),
    timer: StageTimer = Depends(request_timer),
) -> IsolateResponse:
    with timer.stage("load_image"):
        if body.image_id:
            image_bytes = await engines.images.get(body.image_id)
            if image_bytes is None:
                raise ResourceExpired("The photo session expired. Resend the image.")
        else:
            image_bytes = decode_base64_payload(body.image_b64 or "", max_bytes=settings.max_image_bytes, label="image")
        width, height = open_rgb_image(image_bytes).size

    if body.click_x >= width or body.click_y >= height:
        raise BadPayload(f"Click ({body.click_x}, {body.click_y}) is outside the {width}x{height} image.")

    with timer.stage("sam"):
        isolation = await engines.segmenter.isolate(image_bytes, body.click_x, body.click_y)

    with timer.stage("muse"):
        output = await complete_structured(
            engines.llm,
            system_prompt=VISION_ANALYSIS_SYSTEM,
            user_content=vision_analysis_user(
                scene=body.scene,
                traveler_locale=body.traveler_locale,
                home_currency=body.home_currency,
                crop_url=to_data_url(isolation.crop_jpeg),
                context_url=to_data_url(isolation.context_jpeg),
            ),
            output_model=VisionModelOutput,
            max_tokens=900,
        )

    return IsolateResponse(
        detected_object=output.detected_object,
        contextual_description=output.contextual_description,
        price_breakdown=output.price_breakdown or None,
        safety_precautions=[item.strip() for item in output.safety_precautions if item.strip()],
        segment_bbox=BoundingBox(x=isolation.x, y=isolation.y, width=isolation.width, height=isolation.height),
        **timer.report(),
    )
