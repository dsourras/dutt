"""Build a preview of the new terms/charter; never overwrite the current pages."""
import json
import subprocess
from pathlib import Path

from lxml.html import Element, fromstring, tostring

ROOT = Path(__file__).resolve().parents[1]
DATA = json.loads(subprocess.check_output(
    ["node", str(ROOT.parent / "backend/tools/exportCityTariff.js")], encoding="utf-8"
))
NAMES = {"larisa": ("Λάρισα", "Larissa"), "thessaloniki": ("Θεσσαλονίκη", "Thessaloniki"),
         "athens": ("Αθήνα", "Athens")}


def add(parent, tag, text=None, **attrs):
    element = Element(tag, **attrs)
    element.text = text
    parent.append(element)
    return element


for file in ("service-terms", "consumer-charter"):
    document = fromstring((ROOT / f"{file}.html").read_text(encoding="utf-8"))
    for section_id, lang in (("pricing", 0), ("pricing-en", 1)):
        el = lang == 0
        section = document.get_element_by_id(section_id)
        section.set("data-pricing-policy-version", DATA["version"])
        for child in list(section)[1:]:
            if child.tag == "h3" and ("ακύρωσης" in child.text_content() or "Cancellation" in child.text_content()):
                break
            section.remove(child)
        tail = list(section)[1:]
        for child in tail:
            section.remove(child)
        add(section, "p", "Προσχέδιο, όχι σε ισχύ. Η ημερομηνία εφαρμογής θα ανακοινωθεί πριν από την έναρξη."
            if el else "Draft, not in effect. The effective date will be announced in advance.")
        add(section, "p", ("Δίκυκλο: έως 10 kg και έως 45 × 45 × 45 cm. Πάνω από 10 kg ή πάνω από 45 cm σε οποιαδήποτε πλευρά "
            "απαιτείται αυτοκίνητο/βαν, εφόσον υπάρχει κατάλληλο διαθέσιμο όχημα και είναι εφικτή η ασφαλής φόρτωση.")
            if el else ("Two-wheeler: up to 10 kg and 45 × 45 × 45 cm. A car or van is required above 10 kg or above "
                        "45 cm on any side, subject to availability and safe loading."))
        add(section, "p", ("Τιμή ανά πόλη παραλαβής, οδική απόσταση 1–40 km και όχημα. Ελάχιστη χρέωση 1 km. "
            "Αναλογική χρέωση ενδιάμεσων αποστάσεων, χωρίς προσαύξηση ζήτησης ή ζώνης. "
            "Αυτοκίνητο/βαν: +40%. Για άλλες πόλεις δεν αλλάζει ο τιμοκατάλογος.")
            if el else ("Prices vary by pickup city, road distance (1–40 km) and vehicle. Minimum 1 km fare. "
                        "Intermediate distances are prorated, with no demand or zone surcharge. "
                        "Car/van: +40%. The tariff in other cities is unchanged."))
        add(add(section, "p"), "a", "Λήψη προσχεδίου PDF" if el else "Download draft PDF",
            href="DUTT-City-Tariff-Draft.pdf")
        for city in DATA["cities"]:
            add(section, "h3", NAMES[city][lang])
            table = add(add(section, "div", **{"class": "table-wrap"}), "table")
            header = add(add(table, "thead"), "tr")
            for title in (("km", "Δίκυκλο καθαρή", "ΦΠΑ", "Δίκυκλο τελική", "Αυτ./βαν καθαρή", "ΦΠΑ", "Αυτ./βαν τελική") if el
                          else ("km", "Bike net", "VAT", "Bike total", "Car/van net", "VAT", "Car/van total")):
                add(header, "th", title)
            body = add(table, "tbody", **{"data-city-tariff": city})
            for row in DATA["rows"]:
                tr = add(body, "tr")
                add(tr, "td", str(row["km"]))
                for vehicle in ("standard", "carOrVan"):
                    for key in ("netCents", "vatCents", "grossCents"):
                        cents = row["cities"][city][vehicle][key]
                        add(tr, "td", f"{cents // 100}{',' if el else '.'}{cents % 100:02d} €")
            assert len(body) == 40
        section.extend(tail)
    for identity in ("el-items", "en-items"):
        matches = document.xpath(f'//*[@id="{identity}"]')
        if matches:
            for item in matches[0].xpath(".//span"):
                if item.text == "20 kg":
                    item.text = "10 kg"
    out = ROOT / "documents" / f"{file}-city-tariff-preview.html"
    out.write_text(tostring(document, encoding="unicode", doctype="<!doctype html>"), encoding="utf-8")
    print(out)
