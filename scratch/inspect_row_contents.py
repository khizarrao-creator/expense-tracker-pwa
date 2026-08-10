import json
import sys
from pathlib import Path

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

grid_file = Path(r"d:\expenseTracker\backups\firestore-export-2026-08-03T09-42-57-375Z\projects_sub\JnJJUiPJu7nRpDJXliz5\projects_JnJJUiPJu7nRpDJXliz5_grid.json")

with open(grid_file, "r", encoding="utf-8") as fp:
    grid_data = json.load(fp)

print("=== DETAILED SPREADSHEET BACKUP CONTENTS ===")
for doc in grid_data:
    sheets = doc.get("sheets", [])
    for s in sheets:
        name = s.get("name")
        rows = s.get("rows") or s.get("cells") or s.get("data") or []
        print(f"\n==========================================")
        print(f"📊 SHEET NAME: '{name}' | Total Rows: {len(rows)}")
        print(f"==========================================")
        for idx, row in enumerate(rows[:5]): # show first 5 rows of each sheet
            print(f"  Row {idx+1}: {json.dumps(row, ensure_ascii=False)}")
        if len(rows) > 5:
            print(f"  ... and {len(rows) - 5} more rows.")
