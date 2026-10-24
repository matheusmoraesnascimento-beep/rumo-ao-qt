#!/usr/bin/env python3
"""Validate CP-T 2022-2026 question archive with no answer keys."""
import json,collections,hashlib
from pathlib import Path
root=Path(__file__).resolve().parent.parent
qs=json.loads((root/'dados/questoes_2022_2026.json').read_text(encoding='utf8'))
assert len(qs)==250, f'{len(qs)} questions, expected 250'
ids=set()
for year in range(2022,2027):
 subset=sorted((x for x in qs if x['exam_year']==year),key=lambda x:x['number'])
 assert [x['number'] for x in subset]==list(range(1,51)),f'Year {year}: missing/duplicate ids'
 for q in subset:
  assert q['id']==f'CPT-{year}-Q{q["number"]:02}'
  assert q['id'] not in ids
  ids.add(q['id'])
  assert q.get('correct_option') is None,f'Answer key detected: {q["id"]}'
  assert (root/q['image_path']).is_file(), f'Image missing: {q["id"]}'
  assert len(q['ocr_text'].strip())>30, f'OCR empty: {q["id"]}'
  assert q.get('ocr_status')=='pending_review'
print('PASS: 250 IDs, 5x50, unique, OCR and images available, no answer keys')
