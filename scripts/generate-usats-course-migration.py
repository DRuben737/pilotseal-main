#!/usr/bin/env python3
"""Extract USATS TCO lesson text and generate the catalog data migration.

Requires pdfplumber. The generated payload preserves source wording while
removing PDF headers, footers, and visual line wrapping.
"""

from __future__ import annotations

import argparse
import base64
import json
import re
import textwrap
from pathlib import Path

import pdfplumber


PROVIDER = "U.S. Aviation Training Solutions"
IR_TITLE = "Instrument Rating - Airplane Single Engine Land"
CPL_TITLE = "Commercial Pilot Certification - Airplane Single Engine Land"


def clean_lines(text: str, course_title: str) -> list[str]:
    lines: list[str] = []
    for raw in text.splitlines():
        line = " ".join(raw.strip().split())
        if not line or line in {PROVIDER, course_title, "Rev 0"}:
            continue
        if re.fullmatch(r"\d+", line) or re.fullmatch(r"\d+\s+Rev 0", line):
            continue
        lines.append(line)
    return lines


def join_prose(lines: list[str]) -> str:
    result = ""
    for line in lines:
        if not result:
            result = line
        elif result.endswith("-") and line[:1].islower():
            result += line
        else:
            result += f" {line}"
    return result.strip()


def join_outline(lines: list[str]) -> str:
    entries: list[str] = []
    marker = re.compile(r"^(?:[IVXLCDM]+\.|[a-z]+\.|\d+\.|-)\s+", re.I)
    for line in lines:
        if marker.match(line) or not entries:
            entries.append(line)
        elif entries[-1].endswith("-") and line[:1].islower():
            entries[-1] += line
        else:
            entries[-1] += f" {line}"
    return "\n".join(entries).strip()


def section(lines: list[str], start_names: tuple[str, ...], end_names: tuple[str, ...]) -> list[str]:
    start = next(
        (index for index, line in enumerate(lines) if line in start_names),
        None,
    )
    if start is None:
        return []
    end = next(
        (
            index
            for index, line in enumerate(lines[start + 1 :], start + 1)
            if line in end_names
        ),
        len(lines),
    )
    return lines[start + 1 : end]


def parse_line_items(lines: list[str]) -> list[dict[str, object]]:
    items: list[dict[str, object]] = []
    current: dict[str, object] | None = None
    for line in lines:
        match = re.match(r"^(\d+)\.\s+(.*)$", line)
        if match:
            if current:
                items.append(current)
            current = {"position": int(match.group(1)), "text": match.group(2)}
        elif current:
            current["text"] = f"{current['text']} {line}"
    if current:
        items.append(current)

    for item in items:
        text = str(item["text"]).strip()
        score = re.search(r"\s+\(([1-5])\)$", text)
        item["minimum_score"] = int(score.group(1)) if score else None
        item["text"] = text[: score.start()].strip() if score else text
    return items


def ground_stage(course_code: str, number: int) -> int:
    if course_code == "IR":
        return 1 if number <= 6 else 2
    if number <= 6:
        return 1
    if number <= 12:
        return 2
    return 3


def flight_stage(number: int) -> int:
    if number <= 13:
        return 1
    if number <= 25:
        return 2
    return 3


def extract_ground(path: Path, course_code: str, course_title: str) -> list[dict[str, object]]:
    modules: list[dict[str, object]] = []
    header = re.compile(
        r"^GND\s+(\d+):\s*(.*?)(?:\s+\(([\d.]+)\s+hours\))?$",
        re.I,
    )
    with pdfplumber.open(path) as pdf:
        for pdf_page, page in enumerate(pdf.pages, 1):
            lines = clean_lines(page.extract_text() or "", course_title)
            if not any(line in {"Lesson Objective", "Lesson Objectives"} for line in lines):
                continue
            match = next((header.match(line) for line in lines if header.match(line)), None)
            if not match:
                continue
            number = int(match.group(1))
            title = match.group(2).strip()
            hours = float(match.group(3) or 2)
            objective = join_prose(
                section(
                    lines,
                    ("Lesson Objective", "Lesson Objectives"),
                    ("Content", "Completion Standard", "Completion Standards"),
                )
            )
            content = join_outline(
                section(
                    lines,
                    ("Content",),
                    ("Completion Standard", "Completion Standards"),
                )
            )
            completion = join_prose(
                section(
                    lines,
                    ("Completion Standard", "Completion Standards"),
                    (),
                )
            )
            modules.append(
                {
                    "module_number": number,
                    "stage_number": ground_stage(course_code, number),
                    "module_type": "Ground Exam" if "EXAM" in title.upper() else "Ground",
                    "duration": f"{hours:.1f} hours",
                    "duration_hours": hours,
                    "lesson_objective": objective,
                    "line_items": [],
                    "study_material": content,
                    "completion_standards": completion,
                    "source_page": pdf_page - 6,
                }
            )
    return sorted(modules, key=lambda module: int(module["module_number"]))


def extract_flight(path: Path, course_title: str) -> list[dict[str, object]]:
    modules: list[dict[str, object]] = []
    header = re.compile(
        r"^Module\s+(\d+)(?:-(\d+))?\s+\((.*?)\)\s+\(([\d.]+(?:-[\d.]+)?)\s+hours(\s+each)?\)$",
        re.I,
    )
    with pdfplumber.open(path) as pdf:
        for pdf_page, page in enumerate(pdf.pages, 1):
            lines = clean_lines(page.extract_text() or "", course_title)
            if "Lesson Objective" not in lines:
                continue
            match = next((header.match(line) for line in lines if header.match(line)), None)
            if not match:
                continue
            first = int(match.group(1))
            last = int(match.group(2) or first)
            module_type = match.group(3).strip()
            duration_value = match.group(4)
            duration = f"{duration_value} hours"
            if match.group(5):
                duration += " each"
            objective = join_prose(
                section(
                    lines,
                    ("Lesson Objective",),
                    (
                        "Line Item (minimum score)",
                        "Line Items (minimum score)",
                        "Line Item",
                        "Line Items",
                        "Study Material",
                        "Completion Standards",
                    ),
                )
            )
            item_lines = section(
                lines,
                (
                    "Line Item (minimum score)",
                    "Line Items (minimum score)",
                    "Line Item",
                    "Line Items",
                ),
                ("Study Material", "Completion Standards"),
            )
            items = parse_line_items(item_lines)
            study_material = join_prose(
                section(lines, ("Study Material",), ("Completion Standards",))
            )
            completion = join_prose(
                section(lines, ("Completion Standards",), ())
            )
            for number in range(first, last + 1):
                modules.append(
                    {
                        "module_number": number,
                        "stage_number": flight_stage(number),
                        "module_type": module_type,
                        "duration": duration,
                        "duration_hours": (
                            None if "-" in duration_value else float(duration_value)
                        ),
                        "lesson_objective": objective,
                        "line_items": items,
                        "study_material": study_material,
                        "completion_standards": completion,
                        "source_page": pdf_page - 6,
                    }
                )
    return sorted(modules, key=lambda module: int(module["module_number"]))


def course_payloads(ir_path: Path, cpl_path: Path) -> list[dict[str, object]]:
    return [
        {
            "provider_name": PROVIDER,
            "course_title": IR_TITLE,
            "revision": "Rev 0",
            "course_key": "usats.instrument-rating-airplane-single-engine-land.ground.rev-0",
            "source_file_name": ir_path.name,
            "modules": extract_ground(ir_path, "IR", IR_TITLE),
        },
        {
            "provider_name": PROVIDER,
            "course_title": CPL_TITLE,
            "revision": "Rev 0",
            "course_key": "usats.commercial-pilot-airplane-single-engine-land.ground.rev-0",
            "source_file_name": cpl_path.name,
            "modules": extract_ground(cpl_path, "CPL", CPL_TITLE),
        },
        {
            "provider_name": PROVIDER,
            "course_title": CPL_TITLE,
            "revision": "Rev 0",
            "course_key": "usats.commercial-pilot-airplane-single-engine-land.flight.rev-0",
            "source_file_name": cpl_path.name,
            "modules": extract_flight(cpl_path, CPL_TITLE),
        },
    ]


def validate(payloads: list[dict[str, object]]) -> None:
    expected = [13, 18, 43]
    for payload, count in zip(payloads, expected, strict=True):
        modules = payload["modules"]
        assert isinstance(modules, list) and len(modules) == count, (
            payload["course_key"],
            len(modules),
        )
        assert [module["module_number"] for module in modules] == list(range(1, count + 1))
        for module in modules:
            assert module["lesson_objective"]
            assert module["completion_standards"]
    flight = payloads[2]["modules"]
    assert isinstance(flight, list)
    assert flight[5]["lesson_objective"] == flight[7]["lesson_objective"]
    assert flight[22]["lesson_objective"] == flight[24]["lesson_objective"]
    assert flight[32]["lesson_objective"] == flight[37]["lesson_objective"]


def sql_for(payloads: list[dict[str, object]]) -> str:
    raw = json.dumps(payloads, ensure_ascii=False, separators=(",", ":")).encode()
    encoded = textwrap.fill(base64.b64encode(raw).decode(), width=100)
    return f"""-- USATS IR ground and Commercial Pilot ground/flight course content.
-- Source wording is preserved apart from PDF visual line wrapping. Grouped
-- Commercial modules are expanded into their individual module numbers.

alter table public.training_module_line_items
  alter column minimum_score drop not null;

alter table public.training_course_modules
  alter column duration_hours drop not null;

alter table public.training_module_line_items
  drop constraint if exists training_module_line_items_minimum_score_check;

alter table public.training_module_line_items
  add constraint training_module_line_items_minimum_score_check
  check (minimum_score is null or minimum_score between 1 and 5);

create temporary table usats_course_import (value jsonb not null) on commit drop;

insert into usats_course_import (value)
select value
from jsonb_array_elements(
  convert_from(decode($payload$
{encoded}
$payload$, 'base64'), 'utf8')::jsonb
) value;

insert into public.training_courses (
  stable_key, provider_name, title, revision_label, source_file_name, status
)
select
  value->>'course_key',
  value->>'provider_name',
  value->>'course_title',
  value->>'revision',
  value->>'source_file_name',
  'published'
from usats_course_import
on conflict (stable_key) do update set
  provider_name = excluded.provider_name,
  title = excluded.title,
  revision_label = excluded.revision_label,
  source_file_name = excluded.source_file_name,
  status = excluded.status,
  updated_at = timezone('utc', now());

insert into public.training_course_modules (
  course_id, stage_number, module_number, module_type, duration_label,
  duration_hours, lesson_objective, study_material, completion_standards, source_page
)
select
  course.id,
  (module->>'stage_number')::smallint,
  (module->>'module_number')::smallint,
  module->>'module_type',
  module->>'duration',
  case
    when module->'duration_hours' = 'null'::jsonb then null
    else (module->>'duration_hours')::numeric
  end,
  module->>'lesson_objective',
  module->>'study_material',
  module->>'completion_standards',
  (module->>'source_page')::integer
from usats_course_import source
join public.training_courses course on course.stable_key = source.value->>'course_key'
cross join lateral jsonb_array_elements(source.value->'modules') module
on conflict (course_id, module_number) do update set
  stage_number = excluded.stage_number,
  module_type = excluded.module_type,
  duration_label = excluded.duration_label,
  duration_hours = excluded.duration_hours,
  lesson_objective = excluded.lesson_objective,
  study_material = excluded.study_material,
  completion_standards = excluded.completion_standards,
  source_page = excluded.source_page,
  updated_at = timezone('utc', now());

delete from public.training_module_line_items item
using public.training_course_modules module, public.training_courses course
where item.module_id = module.id
  and module.course_id = course.id
  and course.stable_key in (select value->>'course_key' from usats_course_import);

insert into public.training_module_line_items (
  module_id, position, item_text, minimum_score
)
select
  target.id,
  (item->>'position')::smallint,
  item->>'text',
  case
    when item->'minimum_score' = 'null'::jsonb then null
    else (item->>'minimum_score')::smallint
  end
from usats_course_import source
join public.training_courses course on course.stable_key = source.value->>'course_key'
cross join lateral jsonb_array_elements(source.value->'modules') module
join public.training_course_modules target
  on target.course_id = course.id
 and target.module_number = (module->>'module_number')::smallint
cross join lateral jsonb_array_elements(module->'line_items') item;

insert into public.organization_training_courses (organization_id, course_id)
select organization.id, course.id
from public.organizations organization
cross join public.training_courses course
where course.stable_key in (select value->>'course_key' from usats_course_import)
  and regexp_replace(lower(organization.name), '[^a-z0-9]+', '', 'g') in (
    'usaviationtrainingsolutions',
    'usaviationtrainingsolutionsinc',
    'usats'
  )
on conflict (organization_id, course_id) do update set
  enabled = true,
  updated_at = timezone('utc', now());

drop table usats_course_import;
"""


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--ir", required=True, type=Path)
    parser.add_argument("--cpl", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    payloads = course_payloads(args.ir, args.cpl)
    validate(payloads)
    args.output.write_text(sql_for(payloads), encoding="utf-8")
    for payload in payloads:
        modules = payload["modules"]
        scored = sum(
            1
            for module in modules
            for item in module["line_items"]
            if item["minimum_score"] is not None
        )
        unscored = sum(
            1
            for module in modules
            for item in module["line_items"]
            if item["minimum_score"] is None
        )
        print(payload["course_key"], len(modules), scored, unscored)


if __name__ == "__main__":
    main()
