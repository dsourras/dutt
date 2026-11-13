"""Verify every price in the draft HTML and PDF against the backend export."""
import argparse
from datetime import date
import json
import os
import re
import subprocess
from pathlib import Path

from lxml.html import fromstring
from pypdf import PdfReader

site = Path(__file__).resolve().parents[1]
backend = Path(os.environ.get("DUTT_BACKEND_SOURCE", site.parent / "backend-git"))
data = json.loads(subprocess.check_output(["node", str(backend / "tools/exportCityTariff.js")]))
documents = site / "documents"
parser = argparse.ArgumentParser()
parser.add_argument("--effective-date", type=date.fromisoformat)
effective = parser.parse_args().effective_date


def cents_for(row, city):
    return [
        row["cities"][city][vehicle][field]
        for vehicle in ("standard", "carOrVan")
        for field in ("netCents", "vatCents", "grossCents")
    ]


for name, version in (("service-terms", "1.7"), ("consumer-charter", "1.6")):
    suffix = f"v{version}-{effective.isoformat()}" if effective else "city-tariff-preview"
    doc = fromstring((documents / f"{name}-{suffix}.html").read_text(encoding="utf-8"))
    for section, decimal in (("pricing", ","), ("pricing-en", ".")):
        pricing = doc.get_element_by_id(section)
        assert pricing.get("data-pricing-policy-version") == data["version"]
        assert f"{data['motorbikeMaxKg']} kg" in pricing.text_content() and "40 km" in pricing.text_content()
        if effective:
            assert effective.strftime("%d / %m / %Y") in pricing.text_content()
        for city in data["cities"]:
            rows = pricing.xpath(f'.//tbody[@data-city-tariff="{city}"]/tr')
            assert len(rows) == 40
            for actual, expected in zip(rows, data["rows"], strict=True):
                cells = [cell.text_content() for cell in actual]
                assert int(cells[0]) == expected["km"]
                assert [int(value.removesuffix(" €").replace(decimal, "")) for value in cells[1:]] == cents_for(expected, city)

pdf = PdfReader(documents / f"DUTT-City-Tariff-{effective.isoformat() if effective else 'Draft'}.pdf")
assert len(pdf.pages) == len(data["cities"])
for city, page in zip(data["cities"], pdf.pages, strict=True):
    text = page.extract_text()
    status = effective.strftime("%d/%m/%Y") if effective else "ΠΡΟΣΧΕΔΙΟ"
    assert f"{data['motorbikeMaxKg']} kg" in text and status in text
    tokens = re.findall(r"\d+,\d{2}", text)
    actual = [int(token.replace(",", "")) for token in tokens]
    expected = [cents for row in data["rows"] for cents in cents_for(row, city)]
    assert actual == expected, city

print("3 PDF pages and 12 HTML tables: every fare, VAT amount and weight limit matches.")
