from __future__ import annotations

import json
import re
from typing import Any, TypeVar

from pydantic import BaseModel, ValidationError

from songa.core.errors import UpstreamModelError
from songa.engines import ChatMessage, LanguageModel

T = TypeVar("T", bound=BaseModel)

_FENCE = re.compile(r"^```(?:json)?\s*(.*?)\s*```$", re.DOTALL)


def extract_json_object(text: str) -> Any:
    """Parses the first JSON object in a model reply, tolerating code fences and surrounding prose."""
    candidate = text.strip()
    fenced = _FENCE.match(candidate)
    if fenced:
        candidate = fenced.group(1)
    try:
        return json.loads(candidate)
    except json.JSONDecodeError:
        pass

    start = candidate.find("{")
    if start < 0:
        raise ValueError("no JSON object found")
    decoder = json.JSONDecoder()
    obj, _ = decoder.raw_decode(candidate[start:])
    return obj


async def complete_structured(
    llm: LanguageModel,
    *,
    system_prompt: str,
    user_content: str | list[dict[str, Any]],
    output_model: type[T],
    max_tokens: int,
) -> T:
    """Asks the model for JSON matching `output_model`, with one self-repair round on invalid output."""
    messages: list[ChatMessage] = [
        {"role": "developer", "content": system_prompt},
        {"role": "user", "content": user_content},
    ]

    last_error = ""
    for attempt in range(2):
        reply = await llm.complete(messages, max_tokens=max_tokens)
        try:
            return output_model.model_validate(extract_json_object(reply))
        except (ValueError, ValidationError) as exc:
            last_error = str(exc)[:600]
            if attempt == 0:
                messages = [
                    *messages,
                    {"role": "assistant", "content": reply},
                    {
                        "role": "user",
                        "content": (
                            "Your previous reply did not match the required JSON schema. "
                            f"Validation error: {last_error}\n"
                            "Reply again with only the corrected JSON object and nothing else."
                        ),
                    },
                ]

    raise UpstreamModelError(
        "Muse Wonder returned output that did not match the expected format.", code="invalid_model_output"
    )
