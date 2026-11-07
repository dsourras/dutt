"""Copy the canonical public tariff section verbatim into the consumer charter."""
import json
import re
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


class Sections(HTMLParser):
    def __init__(self, source):
        super().__init__(convert_charrefs=False)
        self.source = source
        self.offsets = [0]
        for line in source.splitlines(keepends=True):
            self.offsets.append(self.offsets[-1] + len(line))
        self.stack = []
        self.ranges = {}
        self.feed(source)

    def position(self):
        line, column = self.getpos()
        return self.offsets[line - 1] + column

    def handle_starttag(self, tag, attrs):
        if tag == "section":
            self.stack.append((dict(attrs).get("id"), self.position()))

    def handle_endtag(self, tag):
        if tag == "section":
            identity, start = self.stack.pop()
            self.ranges[identity] = (start, self.position() + len("</section>"))


source = (ROOT / "service-terms.html").read_text(encoding="utf-8")
target_path = ROOT / "consumer-charter.html"
target = target_path.read_text(encoding="utf-8")
source_ranges, target_ranges = Sections(source).ranges, Sections(target).ranges
for identity in sorted(("pricing", "pricing-en"), key=lambda key: target_ranges[key][0], reverse=True):
    start, end = target_ranges[identity]
    first, last = source_ranges[identity]
    target = target[:start] + source[first:last] + target[end:]

pattern = r"const standardPrices = (\[[\s\S]*?\]);"
prices = re.search(pattern, source)
old = re.search(pattern, target)
assert prices and old
assert len(json.loads(prices.group(1))) == 40
target = target[:old.start(1)] + prices.group(1) + target[old.end(1):]
target_path.write_text(target, encoding="utf-8", newline="\n")
assert all(Sections(target).source[slice(*Sections(target).ranges[key])] == source[slice(*source_ranges[key])] for key in ("pricing", "pricing-en"))
print("Two tariff sections and all forty prices are identical after standard newline normalization.")
