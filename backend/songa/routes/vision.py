from __future__ import annotations

from fastapi import APIRouter, Depends

from songa.config import Settings
from songa.core.errors import BadPayload, ResourceExpired
from songa.core.media import decode_base64_payload, open_rgb_image, to_data_url
from songa.core.telemetry import StageTimer, request_timer
from songa.engines import Engines
from songa.llm.prompts import MENU_CHECK_SYSTEM, VISION_ANALYSIS_SYSTEM, menu_check_user, vision_analysis_user
from songa.llm.structured import complete_structured
from songa.routes.deps import get_engines, get_settings
from songa.schemas import (
    BoundingBox,
    IsolateRequest,
    IsolateResponse,
    MenuCheckModelOutput,
    MenuCheckRequest,
    MenuCheckResponse,
    MenuDish,
    Segment,
    SegmentRequest,
    SegmentResponse,
    VisionModelOutput,
)
from songa.vision.geometry import SCENE_CONCEPTS, Box, refine_segments, render_numbered_marks

router = APIRouter()

VERDICT_ORDER = {"avoid": 0, "ask": 1, "safe": 2}


async def _load_image(image_id: str | None, image_b64: str | None, engines: Engines, settings: Settings) -> bytes:
    if image_id:
        image_bytes = await engines.images.get(image_id)
        if image_bytes is None:
            raise ResourceExpired("The photo session expired. Resend the image.")
        return image_bytes
    return decode_base64_payload(image_b64 or "", max_bytes=settings.max_image_bytes, label="image")


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
        image_bytes = await _load_image(body.image_id, body.image_b64, engines, settings)
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


@router.post("/api/vision/menu-check", response_model=MenuCheckResponse)
async def menu_check(
    body: MenuCheckRequest,
    engines: Engines = Depends(get_engines),
    settings: Settings = Depends(get_settings),
    timer: StageTimer = Depends(request_timer),
) -> MenuCheckResponse:
    with timer.stage("load_image"):
        image = open_rgb_image(await _load_image(body.image_id, body.image_b64, engines, settings))

    with timer.stage("marks"):
        boxes = [Box(m.bbox.x, m.bbox.y, m.bbox.width, m.bbox.height) for m in body.marks]
        marked = render_numbered_marks(image, boxes)

    with timer.stage("muse"):
        output = await complete_structured(
            engines.llm,
            system_prompt=MENU_CHECK_SYSTEM,
            user_content=menu_check_user(
                needs=body.needs.strip(),
                traveler_locale=body.traveler_locale,
                local_locale=body.local_locale,
                mark_count=len(body.marks),
                image_url=to_data_url(marked),
            ),
            output_model=MenuCheckModelOutput,
            max_tokens=1800,
        )

    dishes: list[MenuDish] = []
    for dish in output.dishes:
        mark = body.marks[dish.mark - 1] if dish.mark is not None and 1 <= dish.mark <= len(body.marks) else None
        dishes.append(
            MenuDish(
                name=dish.name.strip(),
                verdict=dish.verdict,
                reason=dish.reason.strip(),
                segment_id=mark.id if mark else None,
                bbox=mark.bbox if mark else None,
            )
        )
    dishes.sort(key=lambda d: VERDICT_ORDER[d.verdict])

    return MenuCheckResponse(
        spoken_summary=output.spoken_summary.strip(),
        staff_question=(output.staff_question or "").strip() or None,
        staff_question_meaning=(output.staff_question_meaning or "").strip() or None,
        dishes=dishes,
        **timer.report(),
    )
