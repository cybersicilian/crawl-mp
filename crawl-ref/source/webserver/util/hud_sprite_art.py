"""Native 16px optical artwork; role-specific objects, gaps and action symbols."""
from PIL import Image, ImageDraw, ImageFilter

SIZE = 16
EDGE = (12, 16, 23, 255)
COLORS = {
    "steel": ("b5c3d0", "657f9b", "eff5fa"),
    "teal": ("6fcba7", "3f8f98", "d7f5cf"),
    "gold": ("edbd54", "b57934", "fff2b0"),
    "wood": ("bd8550", "e3b65a", "ffe4b6"),
    "red": ("e97967", "a7444a", "ffd8b0"),
    "blue": ("79c2ec", "426ba8", "e1f5ff"),
    "violet": ("bf9ae6", "7d5cb1", "f0dcff"),
    "green": ("a7d16d", "5b984a", "f0f6be"),
    "bone": ("e9d9ab", "9f9677", "fff7d3"),
    "skin": ("e6ac72", "b76f47", "ffe3b5"),
}
COLORS = {key: [tuple(bytes.fromhex(value)) + (255,) for value in values]
          for key, values in COLORS.items()}


class Sprite:
    def __init__(self, family="steel", accent=None):
        self.image = Image.new("RGBA", (SIZE, SIZE))
        self.colors = COLORS[family].copy()
        if accent: self.colors[1] = COLORS[accent][0]

    def shape(self, method, points, color=0, edge=True, width=2):
        mask = Image.new("L", (SIZE, SIZE))
        draw = ImageDraw.Draw(mask)
        if method == "line": draw.line(points, fill=255, width=width)
        elif method == "rect": draw.rectangle(points, fill=255)
        elif method == "oval": draw.ellipse(points, fill=255)
        else: draw.polygon(points, fill=255)
        if edge: self.image.paste(EDGE, (0, 0), mask.filter(ImageFilter.MaxFilter(3)))
        self.image.paste(EDGE if color == "edge" else self.colors[color], (0, 0), mask)

    def p(self, points, color=0, edge=True): self.shape("poly", points, color, edge)
    def r(self, box, color=0, edge=True): self.shape("rect", box, color, edge)
    def o(self, box, color=0, edge=True): self.shape("oval", box, color, edge)
    def l(self, points, color=0, edge=True, width=2): self.shape("line", points, color, edge, width)

    def finish(self):
        # One coherent two-pixel light catches the upper body; no texture/dither.
        pixels = self.image.load()
        for y in range(2, SIZE - 2):
            for x in range(2, SIZE - 3):
                if pixels[x, y] == self.colors[0] and pixels[x + 1, y] == self.colors[0]:
                    pixels[x, y] = pixels[x + 1, y] = self.colors[2]
                    return self.image
        return self.image


def blade(s, reverse=False, color=0):
    def pts(values): return [(15 - x if reverse else x, y) for x, y in values]
    s.p(pts([(4, 10), (10, 3), (13, 2), (13, 5), (7, 12)]), color)
    s.l(pts([(3, 9), (7, 12)]), 1)
    s.p(pts([(3, 11), (5, 12), (3, 13), (2, 12)]), 1)


def bag(s, kind):
    if kind == "inventory-open":
        # Open container plus outward arrow is an action, not another bag.
        s.r((2, 7, 10, 13)); s.p([(2, 3), (7, 3), (9, 5), (3, 5)])
        s.r((3, 8, 9, 10), "edge", False)
        s.p([(9, 2), (13, 2), (13, 6), (12, 5), (9, 8), (7, 6), (10, 3)], 1)
    elif kind == "filter-pack":
        # A round, visibly open drawstring pouch contrasts with the backpack.
        s.p([(5, 5), (10, 5), (13, 9), (12, 12), (10, 13), (5, 13), (2, 11), (2, 9)])
        s.r((5, 2, 7, 5), 1); s.r((9, 3, 10, 5), 1)
        s.r((5, 6, 10, 7), "edge", False)
    else:
        s.r((5, 2, 10, 5)); s.r((7, 3, 8, 5), "edge", False)
        s.p([(4, 5), (11, 5), (13, 7), (13, 13), (2, 13), (2, 7)])
        s.r((3, 6, 12, 8), 1, False); s.r((5, 10, 10, 12), 1, False)
        s.r((7, 8, 8, 10), 2, False)


def book(s, opened=False):
    if opened:
        s.p([(2, 5), (5, 4), (7, 6), (8, 6), (10, 4), (13, 5), (13, 13), (10, 12), (8, 13), (7, 13), (5, 12), (2, 13)])
        s.r((3, 6, 5, 11), 1, False); s.r((10, 6, 12, 11), 1, False)
        s.r((7, 7, 8, 12), "edge", False)
    else:
        s.r((3, 2, 12, 13)); s.r((3, 3, 4, 12), 1, False)
        s.r((7, 5, 10, 9), 1, False)


def fist(s):
    s.p([(5, 3), (7, 3), (7, 2), (10, 2), (10, 3), (12, 3), (13, 5), (13, 9),
         (10, 12), (6, 12), (3, 9), (2, 6), (4, 5), (6, 7), (7, 7), (5, 5)])
    s.r((6, 12, 10, 13), 1); s.r((4, 7, 6, 8), 1, False)
    s.r((7, 5, 9, 6), 1, False)


def cuirass(s):
    s.p([(4, 2), (6, 4), (9, 4), (11, 2), (13, 5), (12, 7), (10, 7), (10, 13),
         (5, 13), (5, 7), (3, 7), (2, 5)])
    s.r((7, 3, 8, 5), "edge", False); s.r((6, 6, 9, 10), 1, False)
    s.r((5, 11, 10, 12), 0, False)


def shield(s):
    s.p([(7, 2), (12, 4), (12, 8), (10, 11), (7, 13), (4, 11), (3, 8), (3, 4)])
    s.r((7, 5, 8, 9), 1, False); s.r((5, 7, 10, 8), 1, False)


def foot(s, wing=False):
    s.p([(8, 2), (12, 2), (11, 9), (13, 11), (13, 13), (5, 13), (4, 11), (8, 8)])
    if wing: s.p([(2, 4), (5, 5), (7, 8), (4, 8), (2, 6)], 1)
    else: s.r((8, 3, 11, 5), 1, False)


def magnifier(s, role):
    s.l([(10, 10), (12, 12)], 1, True, 3)
    if role in ("zoom-in", "zoom-out"):
        s.o((2, 2, 11, 11)); s.o((3, 3, 10, 10), "edge", False)
        s.r((4, 6, 9, 7), 2, False)
        if role == "zoom-in": s.r((6, 4, 7, 9), 2, False)
    else:
        s.o((2, 2, 10, 10)); s.o((4, 4, 8, 8), 1, False)
        if role == "inspect": s.r((6, 5, 7, 7), "edge", False)


def horn(s, silenced=False):
    s.p([(2, 7), (5, 7), (9, 3), (9, 12), (5, 9), (2, 9)])
    s.r((7, 6, 8, 9), 1, False)
    if silenced: s.l([(3, 12), (12, 3)], 1, True, 2)
    else: s.l([(12, 4), (13, 6), (13, 9), (12, 11)], 1, True, 1)


def flag(s, role):
    s.r((2, 2, 3, 13), 1)
    shapes = {
        "ping-look": [(4, 2), (13, 2), (13, 9), (4, 9)],
        "ping-danger": [(4, 2), (13, 2), (12, 6), (13, 10), (4, 10)],
        "ping-loot": [(4, 2), (12, 2), (13, 4), (13, 8), (11, 10), (4, 10)],
        "ping-stairs": [(4, 2), (13, 2), (13, 8), (11, 8), (11, 10), (4, 10)],
    }
    s.p(shapes[role])
    if role == "ping-look":
        s.p([(6, 5), (8, 3), (10, 3), (12, 5), (10, 7), (8, 7)], 2, False)
        s.r((9, 4, 10, 6), "edge", False)
    if role == "ping-danger": s.r((8, 3, 9, 5), 2, False); s.r((8, 7, 9, 8), 2, False)
    if role == "ping-loot": s.o((6, 3, 11, 8), 1, False); s.r((8, 4, 9, 7), 2, False)
    if role == "ping-stairs": s.l([(6, 8), (8, 8), (8, 6), (10, 6), (10, 4), (12, 4)], 2, False, 2)


def arrow(s, direction="up", color=0):
    points = [(7, 2), (13, 8), (9, 8), (9, 13), (6, 13), (6, 8), (2, 8)]
    if direction == "down": points = [(x, 15 - y) for x, y in points]
    s.p(points, color)


def render(role):
    # All 112 recipes are drawn in native pixels. No scaling or fallback art.
    s = Sprite()
    if role in ("zoom-in", "zoom-out", "inspect", "search"):
        s = Sprite("gold", "blue"); magnifier(s, role)
    elif role == "zoom-reset":
        s = Sprite("teal", "gold")
        s.p([(5, 2), (10, 2), (13, 5), (13, 7), (10, 7), (10, 5), (9, 4), (6, 4),
             (4, 6), (4, 9), (6, 11), (9, 11), (9, 13), (5, 13), (2, 10), (2, 5)])
        s.p([(8, 8), (13, 8), (13, 13)], 1)
    elif role == "camera":
        s = Sprite("steel", "blue")
        s.p([(2, 5), (5, 5), (6, 3), (10, 3), (11, 5), (13, 5), (13, 13), (2, 13)])
        s.o((6, 7, 10, 11), 1); s.r((3, 6, 4, 7), 1, False)
    elif role == "camp":
        s = Sprite("gold", "wood"); s.p([(7, 2), (13, 13), (2, 13)])
        s.p([(7, 6), (11, 13), (4, 13)], "edge", False); s.r((7, 5, 8, 7), 1, False)
    elif role == "layout":
        s = Sprite("steel", "blue"); s.r((2, 2, 6, 13)); s.r((9, 2, 13, 6), 1); s.r((9, 9, 13, 13), 1)
    elif role == "move":
        s = Sprite("teal"); s.r((6, 4, 9, 11)); s.r((4, 6, 11, 9))
        s.p([(5, 5), (7, 2), (10, 5)]); s.p([(5, 10), (7, 13), (10, 10)])
        s.p([(5, 5), (2, 7), (5, 10)]); s.p([(10, 5), (13, 7), (10, 10)])
    elif role == "expand":
        s = Sprite("steel"); s.p([(2, 2), (7, 2), (5, 4), (7, 6), (6, 7), (4, 5), (2, 7)])
        s.p([(8, 9), (9, 8), (11, 10), (13, 8), (13, 13), (8, 13), (10, 11)])
    elif role in ("save", "codex"):
        s = Sprite("red" if role == "codex" else "blue", "gold" if role == "codex" else "green"); book(s)
        if role == "save": s.l([(6, 9), (8, 11), (12, 6)], 1, False)
        else: s.r((8, 5, 9, 9), 0, False)
    elif role == "overview":
        s = Sprite("bone", "blue"); s.p([(3, 2), (10, 2), (13, 5), (13, 13), (3, 13)])
        s.p([(10, 2), (10, 5), (13, 5)], 1, False)
        s.r((5, 5, 7, 7), 1, False); s.r((5, 9, 11, 10), 1, False)
    elif role in ("map", "explore"):
        s = Sprite("bone", "teal")
        s.p([(2, 3), (6, 2), (10, 4), (13, 2), (13, 12), (9, 13), (6, 11), (2, 13)])
        s.r((6, 3, 6, 10), "edge", False); s.r((10, 5, 10, 12), "edge", False)
        if role == "explore":
            s.l([(3, 10), (3, 6), (7, 6), (7, 9), (12, 9)], 1, False)
            s.p([(10, 7), (13, 9), (10, 11)], 1, False)
    elif role == "navigate":
        s = Sprite("teal"); s.p([(7, 2), (13, 13), (7, 9), (2, 13)])
        s.r((7, 5, 8, 8), 1, False)
    elif role == "signal":
        s = Sprite("gold", "teal"); s.r((7, 7, 8, 13)); s.p([(7, 2), (10, 5), (7, 8), (4, 5)])
        s.l([(2, 4), (2, 8)], 1, True, 1); s.l([(13, 4), (13, 8)], 1, True, 1)
    elif role in ("user", "add-hero", "claim-hero"):
        s = Sprite("teal", "bone"); s.o((5, 2, 9, 6), 1)
        s.p([(5, 8), (9, 8), (12, 11), (12, 13), (2, 13), (2, 11)])
        if role == "add-hero": s.r((11, 6, 12, 12), 1); s.r((9, 8, 13, 9), 1)
        if role == "claim-hero": s.r((12, 5, 13, 12), 1); s.p([(9, 5), (13, 5), (12, 8), (9, 8)], 1)
    elif role == "plus":
        s = Sprite("green"); s.r((6, 2, 9, 13)); s.r((2, 6, 13, 9))
    elif role == "compact":
        s = Sprite("steel"); s.r((2, 2, 13, 4)); s.r((2, 7, 13, 9)); s.r((2, 12, 13, 13))
    elif role == "chevron-up":
        s = Sprite("teal"); s.p([(2, 10), (7, 4), (13, 10), (11, 12), (7, 8), (4, 12)])
    elif role == "remove":
        s = Sprite("red"); s.l([(3, 3), (12, 12)], 0, True, 3); s.l([(12, 3), (3, 12)], 0, True, 3)
    elif role in ("question", "slot-missing"):
        s = Sprite("gold", "steel")
        if role == "slot-missing":
            s.r((2, 2, 12, 3), 1); s.r((2, 2, 3, 13), 1); s.r((2, 12, 13, 13), 1); s.r((12, 9, 13, 13), 1)
        s.p([(5, 3), (10, 3), (12, 5), (12, 6), (9, 9), (7, 9), (7, 7), (10, 5), (6, 5), (6, 6), (4, 6), (4, 4)])
        s.r((7, 12, 8, 13))
    elif role in ("faith", "faith-none"):
        s = Sprite("gold", "steel"); s.p([(2, 5), (7, 2), (13, 5)])
        s.r((3, 7, 5, 11), 1); s.r((10, 7, 12, 11), 1); s.r((2, 13, 13, 13))
        if role == "faith-none": s.l([(6, 7), (10, 11)], 1); s.l([(10, 7), (6, 11)], 1)
        else: s.r((7, 8, 8, 11), 0)
    elif role == "coin":
        s = Sprite("gold"); s.o((2, 2, 13, 13)); s.r((7, 4, 8, 11), 1, False)
        s.r((5, 5, 10, 6), 1, False); s.r((5, 9, 10, 10), 1, False)
    elif role == "confusion":
        s = Sprite("violet"); s.l([(3, 12), (12, 12), (12, 3), (3, 3), (3, 9), (8, 9), (8, 6), (6, 6)], 0, True, 2)
    elif role in ("sound", "silence"):
        s = Sprite("gold", "red" if role == "silence" else "teal"); horn(s, role == "silence")
    elif role in ("book", "spells"):
        s = Sprite("violet" if role == "spells" else "wood", "bone"); book(s, True)
        if role == "spells": s.p([(7, 2), (10, 4), (8, 6), (6, 4)], 0)
    elif role == "chat":
        s = Sprite("teal", "bone"); s.r((2, 2, 13, 10)); s.p([(3, 9), (3, 13), (8, 9)])
        s.r((4, 5, 11, 6), 1, False); s.r((4, 8, 8, 8), 1, False)
    elif role == "poison":
        s = Sprite("green"); s.p([(7, 2), (11, 6), (13, 9), (12, 12), (10, 13), (5, 13), (2, 11), (2, 8), (4, 6)])
        s.o((5, 7, 7, 9), 1, False)
    elif role == "flame":
        s = Sprite("red", "gold"); s.p([(4, 13), (2, 8), (5, 9), (7, 2), (9, 7), (12, 4), (13, 10), (11, 13)])
        s.p([(5, 11), (7, 7), (10, 11), (9, 13), (6, 13)], 1, False)
    elif role == "frost":
        s = Sprite("blue", "bone"); s.p([(7, 2), (11, 5), (13, 9), (9, 13), (4, 12), (2, 6)])
        s.l([(7, 3), (7, 11)], 1, False); s.l([(3, 6), (11, 9)], 1, False, 1)
    elif role == "bolt":
        s = Sprite("gold"); s.p([(8, 2), (13, 2), (8, 7), (13, 7), (3, 13), (5, 8), (2, 8)])
    elif role in ("shield", "equipped"):
        s = Sprite("blue", "steel" if role == "shield" else "green"); shield(s)
        if role == "equipped": s.l([(5, 8), (7, 10), (11, 5)], 1, False, 2)
    elif role in ("boots", "speed"):
        s = Sprite("wood", "bone"); foot(s)
        if role == "speed": s.r((2, 3, 5, 4), 1); s.r((2, 7, 4, 8), 1)
    elif role == "dexterity":
        # A precision pinch: index/thumb loop with a real 2px opening.
        s = Sprite("green", "skin")
        s.p([(3, 2), (7, 2), (9, 4), (9, 7), (11, 5), (13, 6), (13, 10), (10, 13),
             (5, 13), (2, 9), (2, 6), (4, 7), (6, 6), (6, 4), (4, 4), (4, 6), (2, 5), (2, 3)])
        s.r((4, 4, 6, 6), "edge", False); s.r((5, 10, 10, 12), 1, False)
    elif role == "slow":
        s = Sprite("green", "bone"); s.r((2, 11, 12, 13)); s.o((3, 3, 11, 11), 1)
        s.r((6, 6, 8, 8), "edge", False); s.r((12, 8, 13, 11)); s.r((12, 5, 13, 6))
    elif role == "wing":
        s = Sprite("bone"); s.p([(2, 3), (6, 5), (9, 9), (13, 5), (13, 10), (8, 13), (4, 10)])
        s.l([(4, 5), (7, 10)], 1, False, 2); s.l([(8, 8), (9, 11)], 1, False, 1)
    elif role == "eye":
        s = Sprite("bone", "blue"); s.p([(2, 8), (5, 3), (10, 3), (13, 8), (10, 12), (5, 12)])
        s.o((5, 4, 11, 10), 1, False); s.r((7, 5, 8, 10), "edge", False)
    elif role == "moon":
        s = Sprite("gold"); s.p([(10, 2), (5, 3), (2, 7), (4, 12), (9, 13), (13, 9),
                                            (8, 9), (6, 7), (7, 4)])
    elif role == "heart":
        s = Sprite("red"); s.p([(2, 4), (4, 2), (7, 5), (8, 5), (11, 2), (13, 4), (13, 8), (7, 13), (2, 8)])
    elif role in ("skull", "doom", "banes"):
        s = Sprite("red" if role == "doom" else "bone", "red")
        s.p([(4, 2), (11, 2), (13, 4), (13, 9), (10, 10), (10, 13), (5, 13), (5, 10), (2, 9), (2, 4)])
        s.r((4, 5, 6, 8), "edge", False); s.r((9, 5, 11, 8), "edge", False)
        s.r((7, 11, 8, 12), "edge", False)
        if role == "banes": s.l([(3, 3), (12, 12)], 1, False, 2)
    elif role in ("spark", "powers", "jewellery"):
        s = Sprite("violet" if role != "jewellery" else "blue", "gold")
        if role == "jewellery": s.o((3, 7, 12, 13), 1); s.o((6, 9, 9, 11), "edge", False)
        s.p([(7, 2), (12, 7), (7, 12), (3, 7)]); s.l([(7, 4), (7, 9)], 2, False, 1)
        if role == "powers": s.r((3, 13, 12, 13), 1)
    elif role in ("blade", "autofight"):
        s = Sprite("steel", "red" if role == "autofight" else "gold"); blade(s)
        if role == "autofight": blade(s, True, 1)
    elif role == "trait":
        s = Sprite("violet", "green"); s.l([(3, 3), (12, 6), (12, 9), (3, 12)], 0, True, 2)
        s.l([(12, 3), (3, 6), (3, 9), (12, 12)], 1, True, 2)
    elif role == "ready":
        s = Sprite("green"); s.l([(3, 8), (6, 11), (12, 3)], 0, True, 3)
    elif role == "rune":
        s = Sprite("steel", "violet"); s.p([(4, 2), (11, 2), (13, 4), (12, 13), (3, 13), (2, 11), (2, 4)])
        s.l([(5, 4), (10, 7), (5, 10), (10, 11)], 1, False, 2)
    elif role in ("stairs", "stairs-up", "stairs-down", "floor"):
        s = Sprite("steel", "teal" if role != "stairs-down" else "gold")
        if role == "floor":
            s.p([(2, 13), (2, 6), (6, 2), (10, 2), (13, 6), (13, 13)])
            s.r((5, 6, 10, 11), "edge", False); s.r((3, 12, 12, 13), 1, False)
        else:
            s.r((3, 10, 6, 13)); s.r((7, 6, 9, 13)); s.r((10, 2, 13, 13))
            if role == "stairs-up": s.p([(4, 2), (7, 6), (5, 6), (5, 8), (3, 8), (3, 6), (2, 6)], 1)
            if role == "stairs-down": s.p([(3, 2), (5, 2), (5, 5), (7, 5), (4, 9), (2, 5), (3, 5)], 1)
    elif role == "loot":
        s = Sprite("gold", "wood"); s.r((2, 7, 13, 13), 1); s.p([(2, 6), (4, 2), (11, 2), (13, 6)])
        s.r((7, 6, 8, 10), 0, False)
    elif role == "potion":
        s = Sprite("blue", "red"); s.r((6, 2, 9, 5), 1)
        s.p([(5, 5), (10, 5), (10, 7), (13, 10), (12, 13), (3, 13), (2, 10), (5, 7)])
        s.r((4, 10, 11, 12), 1, False)
    elif role == "helmet":
        s = Sprite("steel", "gold"); s.p([(3, 13), (2, 6), (6, 2), (10, 2), (13, 6), (12, 13)])
        s.r((3, 7, 12, 8), "edge", False); s.r((7, 7, 8, 12), "edge", False)
    elif role in ("gloves", "control"):
        s = Sprite("steel", "gold")
        if role == "control":
            s.p([(7, 2), (8, 2), (8, 7), (11, 7), (13, 10), (10, 13), (6, 13),
                 (2, 9), (3, 7), (6, 9), (6, 4), (7, 4)])
        else:
            s.p([(4, 2), (6, 2), (6, 5), (7, 5), (7, 2), (9, 2), (9, 5), (11, 3),
                 (12, 5), (12, 10), (9, 13), (5, 13), (2, 8), (3, 6), (4, 8)])
        s.r((6, 11, 10, 12), 1, False)
    elif role == "abilities":
        # Innate powers: a person radiating energy, distinct from hand statistics.
        s = Sprite("violet", "gold"); s.o((6, 3, 10, 7), 1)
        s.p([(6, 8), (10, 8), (12, 11), (12, 13), (4, 13), (4, 11)])
        s.p([(7, 9), (10, 11), (8, 13), (6, 11)], 1, False)
        s.r((2, 5, 3, 7), 1); s.r((12, 4, 13, 6), 1); s.r((7, 2, 9, 2), 1)
    elif role == "cloak":
        s = Sprite("violet"); s.p([(5, 2), (10, 2), (12, 6), (13, 13), (2, 13), (3, 6)])
        s.p([(6, 4), (9, 4), (10, 8), (5, 8)], "edge", False)
    elif role == "danger":
        s = Sprite("gold", "red"); s.p([(7, 2), (13, 13), (2, 13)])
        s.r((7, 6, 8, 9), "edge", False); s.r((7, 11, 8, 12), "edge", False)
    elif role == "corrosion":
        s = Sprite("blue", "green"); s.p([(2, 3), (5, 2), (10, 7), (6, 10), (2, 6)])
        s.p([(4, 5), (7, 5), (9, 7), (6, 8)], 1, False)
        s.p([(12, 8), (13, 12), (11, 13), (10, 12)], 1)
    elif role == "strength":
        s = Sprite("skin"); fist(s)
    elif role == "intelligence":
        # Uneven lobes and offset spinal stem avoid a face/skull interpretation.
        s = Sprite("violet")
        s.p([(3, 4), (5, 2), (7, 3), (10, 2), (13, 5), (13, 9), (10, 11),
             (10, 13), (8, 13), (8, 11), (4, 11), (2, 8), (2, 5)])
        s.r((7, 4, 8, 9), 1, False); s.r((3, 6, 5, 7), 1, False); s.r((10, 7, 12, 8), 1, False)
    elif role == "armour":
        s = Sprite("steel", "blue"); cuirass(s)
    elif role == "evasion":
        s = Sprite("teal", "bone"); s.o((9, 2, 12, 5), 1)
        s.l([(8, 6), (11, 8)], 0, True, 3); s.l([(8, 7), (4, 7), (3, 5)], 0)
        s.l([(9, 9), (6, 12), (3, 12)], 0); s.l([(9, 9), (12, 11)], 0)
    elif role == "blink":
        s = Sprite("violet"); s.p([(8, 2), (13, 7), (8, 13), (5, 13), (9, 7), (5, 2)])
        s.r((2, 3, 4, 5), 1); s.r((2, 10, 4, 12), 1)
    elif role == "holy":
        s = Sprite("gold"); s.r((6, 2, 9, 13)); s.r((2, 6, 13, 9))
    elif role == "reflection":
        s = Sprite("steel", "blue"); s.r((2, 2, 8, 13)); s.r((3, 4, 7, 11), 1, False)
        s.l([(11, 3), (12, 6), (10, 8), (12, 11)], 0, True, 2)
    elif role == "chain":
        s = Sprite("steel"); s.o((2, 6, 8, 13)); s.r((4, 8, 6, 11), "edge", False)
        s.o((7, 2, 13, 9)); s.r((9, 4, 11, 7), "edge", False); s.l([(6, 9), (9, 6)], 1, False)
    elif role == "rest":
        s = Sprite("wood", "blue"); s.r((2, 8, 13, 12)); s.r((2, 5, 3, 13)); s.r((12, 11, 13, 13))
        s.r((6, 7, 12, 10), 1, False); s.r((3, 7, 5, 9), 2, False)
    elif role == "pickup":
        s = Sprite("skin", "gold"); s.o((6, 2, 9, 5), 1)
        s.p([(2, 10), (4, 8), (7, 11), (10, 11), (13, 8), (13, 11), (10, 13), (5, 13)])
    elif role in ("inventory", "inventory-open", "filter-pack"):
        s = Sprite("wood", "gold"); bag(s, role)
    elif role == "skills":
        s = Sprite("wood", "steel"); s.o((9, 2, 12, 5)); s.r((8, 6, 12, 10)); s.r((10, 10, 11, 13)); s.r((6, 7, 13, 8))
        s.p([(2, 11), (6, 4), (8, 3), (8, 6), (4, 12)], 1); s.l([(2, 9), (5, 12)], 1)
    elif role == "cycle-hero":
        s = Sprite("teal", "bone"); s.p([(2, 6), (3, 3), (6, 2), (11, 2), (13, 5), (9, 5), (10, 4), (6, 4), (4, 6)])
        s.p([(13, 9), (12, 12), (9, 13), (4, 13), (2, 10), (6, 10), (5, 11), (9, 11), (11, 9)])
        s.r((7, 6, 8, 8), 1)
    elif role.startswith("ping-"):
        s = Sprite({"ping-look": "teal", "ping-danger": "red", "ping-loot": "gold", "ping-stairs": "blue"}[role], "wood"); flag(s, role)
    elif role == "filter-all":
        s = Sprite("steel", "gold")
        for box, color in (((2, 2, 6, 6), 0), ((9, 2, 13, 6), 1), ((2, 9, 6, 13), 1), ((9, 9, 13, 13), 0)): s.r(box, color)
    elif role == "filter-equipped":
        s = Sprite("steel", "green"); cuirass(s); s.l([(7, 9), (10, 12), (13, 7)], 1, False, 2)
    elif role == "experience":
        s = Sprite("teal", "gold"); s.p([(6, 2), (10, 6), (6, 10), (2, 6)])
        s.r((2, 12, 6, 13), 1); s.r((7, 10, 9, 13), 1); s.r((10, 7, 13, 13), 1)
    elif role == "time":
        s = Sprite("gold", "blue"); s.r((3, 2, 12, 3)); s.r((3, 12, 12, 13))
        s.p([(4, 4), (11, 4), (8, 7), (11, 11), (4, 11), (7, 7)], 1)
        s.p([(6, 10), (8, 8), (10, 10)], 0, False)
    elif role == "quiver":
        s = Sprite("wood", "bone"); s.r((4, 2, 5, 9), 1); s.r((9, 2, 10, 9), 1)
        s.p([(3, 7), (12, 7), (11, 13), (4, 13)]); s.r((4, 8, 11, 9), 1, False)
    elif role == "contamination":
        s = Sprite("violet", "green"); s.o((2, 2, 13, 13)); s.r((3, 5, 6, 7), 1, False); s.r((9, 8, 12, 11), 1, False)
    elif role in ("slot-add", "slot-clear"):
        s = Sprite("steel", "green" if role == "slot-add" else "red"); s.r((2, 2, 13, 13)); s.r((3, 3, 12, 12), "edge", False)
        if role == "slot-add": s.r((7, 4, 8, 11), 1, False); s.r((4, 7, 11, 8), 1, False)
        else: s.l([(5, 5), (10, 10)], 1, False, 2); s.l([(10, 5), (5, 10)], 1, False, 2)
    elif role == "tray-expand":
        s = Sprite("teal", "wood"); s.p([(7, 2), (12, 8), (9, 8), (9, 10), (6, 10), (6, 8), (2, 8)])
        s.r((2, 12, 13, 13), 1)
    elif role == "exit":
        s = Sprite("wood", "red"); s.r((2, 2, 9, 13)); s.r((4, 4, 8, 12), "edge", False)
        s.p([(10, 5), (13, 8), (10, 11), (10, 9), (6, 9), (6, 7), (10, 7)], 1)
    elif role == "level-cap":
        s = Sprite("gold"); s.p([(2, 3), (5, 7), (8, 2), (11, 7), (13, 3), (12, 12), (3, 12)])
        s.r((3, 12, 12, 13), 1, False)
    elif role == "scroll":
        s = Sprite("bone", "red"); s.r((3, 3, 12, 12)); s.r((2, 2, 13, 3)); s.r((2, 12, 13, 13))
        s.r((8, 8, 11, 11), 1, False)
    elif role in ("wand", "staff", "ammo"):
        s = Sprite("wood", "violet" if role == "staff" else "blue" if role == "wand" else "bone")
        if role == "staff": s.r((7, 6, 8, 13)); s.p([(5, 2), (10, 2), (12, 5), (9, 8), (4, 5)], 1)
        else:
            s.l([(3, 12), (11, 4)], 0, True, 2); s.p([(9, 2), (13, 2), (13, 6)], 1)
            if role == "ammo": s.p([(2, 8), (7, 13), (2, 13)], 1)
    elif role == "supplies":
        s = Sprite("bone", "red"); s.r((2, 5, 13, 13)); s.r((6, 2, 9, 4))
        s.r((7, 6, 8, 12), 1, False); s.r((4, 8, 11, 9), 1, False)
    elif role == "bestiary":
        s = Sprite("steel", "gold"); s.p([(2, 2), (6, 5), (9, 5), (13, 2), (13, 9), (9, 13), (6, 13), (2, 9)])
        s.r((4, 7, 6, 8), "edge", False); s.r((9, 7, 11, 8), "edge", False); s.r((7, 10, 8, 11), 1, False)
    elif role == "arcane-deck":
        s = Sprite("violet", "gold"); s.r((2, 5, 9, 13)); s.r((6, 2, 13, 12))
        s.p([(9, 4), (12, 7), (9, 10), (7, 7)], 1, False)
    elif role == "compass-rose":
        s = Sprite("gold", "blue"); s.p([(7, 2), (9, 6), (13, 7), (9, 9), (7, 13), (6, 9), (2, 7), (6, 6)])
        s.p([(7, 5), (10, 7), (7, 10), (5, 7)], 1, False)
    elif role == "compass-needle":
        s = Sprite("red", "steel"); s.p([(7, 2), (11, 11), (7, 8), (4, 11)])
        s.p([(7, 9), (9, 13), (6, 13)], 1)
    else:
        raise ValueError(f"No intentional native16 sprite for {role}")
    return s.finish()
