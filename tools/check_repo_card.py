"""check_repo_card.py -- gates for the drawing of a record.

The card draws a record this tool hands back, one field to a row. These guard
the drawing: text that fits the column it is drawn into, colour that still
says one thing, and values that carry the shape of a field rather than one
run's worth of digits. A picture with a hash in it is wrong by the next
commit, so a hash may not be drawn at all.

Whether the drawn fields are TRUE of the record is a different question, and
it is asked where the record lives rather than here.

Kept beside the art gates rather than inside them so neither file outgrows
what one person can hold at once.
"""
from __future__ import annotations

import json
import re
from pathlib import Path

import repo_card as CARD

ROOT = Path(__file__).resolve().parents[1]
ART = ROOT / "docs" / "art"

# A run of hex long enough to be a digest, and a number long enough to be a
# byte count. Either one in a value column dates the picture to one checkout.
DIGEST = re.compile(r"[0-9a-f]{12,}")
BIG_NUMBER = re.compile(r"\d{5,}")

# The two mono columns, in characters. A monospace advance is about 0.6em, so
# these count characters against the width each column actually has.
KEY_BUDGET = int((CARD.KEY_W + CARD.GUTTER - 16) / 7.8)
VAL_BUDGET = int(CARD.VAL_W / 7.2)


def _cards() -> list[dict]:
    return [card for path in sorted(ART.glob("*.art.json"))
            for card in json.loads(path.read_text(encoding="utf-8"))
            .get("cards", [])]


def values_that_are_not_shapes(cards: list[dict]) -> list[str]:
    """A value column holds the shape of a field, never a run of its digits."""
    bad = []
    for card in cards:
        for field in card["fields"]:
            value = field["value"]
            if DIGEST.search(value):
                bad.append(f'{card["file"]}: {field["key"]} draws a digest, '
                           f"and a digest is true for one checkout: {value!r}")
            if BIG_NUMBER.search(value):
                bad.append(f'{card["file"]}: {field["key"]} draws a number '
                           f"that moves with the commit: {value!r}")
    return bad


def text_that_overflows(cards: list[dict]) -> list[str]:
    """Nothing is drawn wider than the column it is drawn into. The key and
    the value are single unwrapped lines, so they run into their neighbour
    rather than being clipped; the note and the footnote wrap and then drop
    what will not fit instead of growing the drawing."""
    bad = []
    for card in cards:
        for field in card["fields"]:
            if len(field["key"]) > KEY_BUDGET:
                bad.append(f'{card["file"]}: the {field["key"]} name runs '
                           f"into the value column")
            if len(field["value"]) > VAL_BUDGET:
                bad.append(f'{card["file"]}: the value on {field["key"]} runs '
                           f"into the note column")
            drawn = " ".join(CARD._wrap(field["note"]))
            if drawn != " ".join(field["note"].split()):
                bad.append(f'{card["file"]}: the note on {field["key"]} cuts '
                           f'off at "{drawn}"')
        foot = " ".join(CARD._wrap(card["footnote"], CARD.FOOT_BUDGET,
                                   CARD.FOOT_LINES))
        if foot != " ".join(card["footnote"].split()):
            bad.append(f'{card["file"]}: the footnote cuts off at "{foot}"')
    return bad


def wrong_number_of_marks(cards: list[dict]) -> list[str]:
    """Colour says one thing here. Two accents and it says nothing."""
    bad = []
    for card in cards:
        hot = [f["key"] for f in card["fields"]
               if f.get("tone", "none") != "none"]
        if len(hot) != 1:
            bad.append(f'{card["file"]} accents {len(hot)} rows, and one hot '
                       f"mark per view is the whole of the colour rule")
    return bad


def checks() -> list[tuple]:
    """The card gates, in the order the receipt reports them."""
    return [
        ("art.card_draws_shapes_not_digits",
         lambda _unused: values_that_are_not_shapes(_cards())),
        ("art.card_text_fits_its_column",
         lambda _unused: text_that_overflows(_cards())),
        ("art.card_carries_one_mark",
         lambda _unused: wrong_number_of_marks(_cards())),
    ]


# A card built to break every one of those at once: a digest and a byte count
# in the value column, a name and a value too wide for their columns, a
# clipped note, a clipped footnote, and two hot marks where the rule allows
# one.
CONTROL = [{
    "file": "control.svg",
    "footnote": "word " * 200,
    "fields": [
        {"key": "head", "value": "9f2c4ab71de0", "note": "ok",
         "tone": "verified"},
        {"key": "bytes", "value": "104857 bytes", "note": "ok",
         "tone": "drift"},
        {"key": "z" * (KEY_BUDGET + 1), "value": "z" * (VAL_BUDGET + 1),
         "note": "word " * 40},
    ],
}]


def control_failures() -> list[str]:
    """Feed each card gate input it has to reject, and say what got past."""
    return [f"the gate missed {what}" for caught, what in (
        (len(values_that_are_not_shapes(CONTROL)) == 2,
         "a digest and a byte count drawn as values"),
        (len(text_that_overflows(CONTROL)) == 4,
         "an over-wide name, an over-wide value, a clipped note and a "
         "clipped footnote"),
        (len(wrong_number_of_marks(CONTROL)) == 1,
         "a card wearing two hot marks"),
    ) if not caught]
