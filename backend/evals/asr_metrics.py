"""Speech-to-text metrics: normalised WER and CER, plus Swahili-aware word recall for code-switched speech.

Word-level language tags come from word frequencies (wordfreq): a word is English when it is more common in
English than in Swahili. Borrowed words ("daktari", "doc") can land on either side, so the Swahili/English
split is approximate and documented as such in the report.
"""

from __future__ import annotations

import random
import re
import unicodedata
from dataclasses import dataclass, field
from typing import Iterable

import jiwer
from rapidfuzz.distance import Levenshtein

# Punctuation that AfriSpeech readers say aloud. Removed from a transcript only when the reference text does
# not contain those words, so a real "comma" in a sentence is never deleted.
SPOKEN_PUNCTUATION = [
    "full stop", "fullstop", "period", "comma", "semicolon", "semi colon", "colon", "question mark",
    "exclamation mark", "open bracket", "close bracket", "open parenthesis", "close parenthesis", "hyphen",
    "dash", "slash", "new line", "new paragraph", "quote", "unquote", "end quote",
]

_PUNCT = re.compile(r"[^\w\s']", re.UNICODE)
_DIGITS = re.compile(r"\d+(?:\.\d+)?")


def _numbers_to_words(text: str) -> str:
    from num2words import num2words

    def spell(match: re.Match[str]) -> str:
        try:
            return " " + num2words(float(match.group()) if "." in match.group() else int(match.group())) + " "
        except (ValueError, OverflowError):
            return match.group()

    return _DIGITS.sub(spell, text)


def normalize(text: str, *, strip_spoken_punctuation: bool = False, reference: str = "") -> str:
    """Lowercase, numbers spelled out, punctuation removed, whitespace collapsed."""
    text = unicodedata.normalize("NFKC", str(text)).lower()
    if strip_spoken_punctuation:
        ref = reference.lower()
        for phrase in SPOKEN_PUNCTUATION:
            if phrase not in ref:
                text = re.sub(rf"\b{re.escape(phrase)}\b", " ", text)
    text = _numbers_to_words(text)
    text = text.replace("-", " ")
    text = _PUNCT.sub(" ", text)
    text = text.replace("'", "")
    return " ".join(text.split())


# --- word language tags --------------------------------------------------------------------------------------


# Common Swahili words that also appear in English text (names, abbreviations, Spanish/Italian loans) often
# enough to look English by frequency alone.
SWAHILI_COMMON = frozenset(
    """
    ana au baba bado cha chini choo damu dawa hapa hapo hata hii hiyo homa huko iko jana jina kama kidogo kila
    kitu koo kula kumi kuna kwa la leo lini maji mama mara moja na nane nina nne ni peke pia pole rafiki saba sana
    sasa sawa shida sina sita siku tano tatu tena tisa tu uso vya wa wala ya yako yangu za zaidi asante habari
    """.split()
)
#: wordfreq Zipf score at or above which a word counts as English (2.5 keeps "paracetamol", "inhaler").
ENGLISH_ZIPF = 2.5


class WordTagger:
    """Tags each word "en" or "sw".

    wordfreq has no Swahili list, so a word is English when it is reasonably common in English (Zipf >= 2.5)
    and is not one of the common Swahili words above; everything else counts as Swahili. Unknown words in an
    English-only clip count as English. Tuned and spot-checked on this dataset's 350 distinct words.
    """

    def __init__(self) -> None:
        from wordfreq import zipf_frequency

        self._zipf = zipf_frequency

    def tag(self, word: str, *, default: str) -> str:
        if default == "en":
            return "en"
        if word in SWAHILI_COMMON:
            return "sw"
        return "en" if self._zipf(word, "en") >= ENGLISH_ZIPF else "sw"


# --- per-clip scores -------------------------------------------------------------------------------------------


@dataclass
class ClipScores:
    ref_words: int
    word_errors: int
    ref_chars: int
    char_errors: int
    sw_ref: int = 0
    sw_hit_strict: int = 0
    sw_hit_lenient: int = 0
    sw_to_english: int = 0
    en_ref: int = 0
    en_hit_strict: int = 0
    en_hit_lenient: int = 0
    switch_ref: int = 0
    switch_errors: int = 0
    substitutions: list[tuple[str, str, str]] = field(default_factory=list)

    @property
    def wer(self) -> float:
        return self.word_errors / max(self.ref_words, 1)

    @property
    def cer(self) -> float:
        return self.char_errors / max(self.ref_chars, 1)


def _close(a: str, b: str) -> bool:
    """Lenient match: identical, or one letter off (two for words of 8+ letters)."""
    return Levenshtein.distance(a, b) <= (2 if max(len(a), len(b)) >= 8 else 1)


def score_clip(reference: str, hypothesis: str, *, tagger: WordTagger | None, default_lang: str) -> ClipScores:
    ref_words = reference.split()
    hyp_words = hypothesis.split()
    measures = jiwer.process_words(reference or "<empty>", hypothesis or "")
    word_errors = measures.substitutions + measures.deletions + measures.insertions
    chars = jiwer.process_characters(reference or "<empty>", hypothesis or "")
    char_errors = chars.substitutions + chars.deletions + chars.insertions
    scores = ClipScores(
        ref_words=len(ref_words), word_errors=word_errors,
        ref_chars=len(reference), char_errors=char_errors,
    )
    if tagger is None or not ref_words:
        return scores

    tags = [tagger.tag(word, default=default_lang) for word in ref_words]
    # What happened to each reference word: "hit", "lenient" (near miss), "sub:<word>", or "del".
    fate: list[str] = ["del"] * len(ref_words)
    for chunk in measures.alignments[0]:
        if chunk.type == "equal":
            for offset in range(chunk.ref_end_idx - chunk.ref_start_idx):
                fate[chunk.ref_start_idx + offset] = "hit"
        elif chunk.type == "substitute":
            for offset in range(chunk.ref_end_idx - chunk.ref_start_idx):
                hyp_word = hyp_words[chunk.hyp_start_idx + offset]
                ref_word = ref_words[chunk.ref_start_idx + offset]
                fate[chunk.ref_start_idx + offset] = "lenient" if _close(ref_word, hyp_word) else f"sub:{hyp_word}"

    for word, lang, outcome in zip(ref_words, tags, fate):
        hit = outcome == "hit"
        near = hit or outcome == "lenient"
        if lang == "sw":
            scores.sw_ref += 1
            scores.sw_hit_strict += hit
            scores.sw_hit_lenient += near
            if outcome.startswith("sub:") and tagger.tag(outcome[4:], default="mixed") == "en":
                scores.sw_to_english += 1
        else:
            scores.en_ref += 1
            scores.en_hit_strict += hit
            scores.en_hit_lenient += near
        if outcome.startswith("sub:"):
            scores.substitutions.append((word, outcome[4:], lang))

    # Words within 2 positions of a Swahili<->English switch in the reference.
    near_switch: set[int] = set()
    for index in range(1, len(tags)):
        if tags[index] != tags[index - 1]:
            near_switch.update(range(max(index - 2, 0), min(index + 2, len(tags))))
    scores.switch_ref = len(near_switch)
    scores.switch_errors = sum(1 for index in near_switch if fate[index] != "hit")
    return scores


# --- aggregation -----------------------------------------------------------------------------------------------


def _ratio(numerator: int, denominator: int) -> float | None:
    return round(numerator / denominator, 4) if denominator else None


def aggregate(clips: Iterable[ClipScores]) -> dict[str, float | int | None]:
    """Corpus-level (pooled) rates: total errors over total reference words/characters."""
    items = list(clips)
    total = lambda attribute: sum(getattr(clip, attribute) for clip in items)  # noqa: E731
    return {
        "clips": len(items),
        "reference_words": total("ref_words"),
        "wer": _ratio(total("word_errors"), total("ref_words")),
        "cer": _ratio(total("char_errors"), total("ref_chars")),
        "swahili_words": total("sw_ref"),
        "swahili_recall_strict": _ratio(total("sw_hit_strict"), total("sw_ref")),
        "swahili_recall_lenient": _ratio(total("sw_hit_lenient"), total("sw_ref")),
        "swahili_to_english_rate": _ratio(total("sw_to_english"), total("sw_ref")),
        "english_words": total("en_ref"),
        "english_recall_strict": _ratio(total("en_hit_strict"), total("en_ref")),
        "english_recall_lenient": _ratio(total("en_hit_lenient"), total("en_ref")),
        "switch_window_words": total("switch_ref"),
        "switch_window_error_rate": _ratio(total("switch_errors"), total("switch_ref")),
    }


def bootstrap_ci(clips: list[ClipScores], metric: str, *, iterations: int = 1000, seed: int = 7) -> list[float] | None:
    """95% confidence interval by resampling whole clips with replacement."""
    if len(clips) < 2:
        return None
    rng = random.Random(seed)
    values = []
    for _ in range(iterations):
        sample = [clips[rng.randrange(len(clips))] for _ in clips]
        value = aggregate(sample)[metric]
        if value is not None:
            values.append(value)
    if not values:
        return None
    values.sort()
    return [round(values[int(0.025 * len(values))], 4), round(values[int(0.975 * len(values)) - 1], 4)]
