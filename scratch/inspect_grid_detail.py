import json
from pathlib import Path

grid_file = Path(r"d:\expenseTracker\backups\firestore-export-2026-08-03T09-42-57-375Z\projects_sub\JnJJUiPJu7nRpDJXliz5\projects_JnJJUiPJu7nRpDJXliz5_grid.json")

print("=== GRID BACKUP FILE DETAILS ===")
with open(grid_file, "r", encoding="utf-8") as f:
    grid_data = json.load(f)

if isinstance(grid_data, list) and len(grid_data) > 0:
    item = grid_data[0]
    print(f"Document ID: {item.get('_id')}")
    print(f"Updated At: {item.get('updatedAt')}")
    sheets = item.get("sheets", {})
    if isinstance(sheets, dict):
        print(f"Total Sheets in Backup: {len(sheets)}")
        for sheet_id, sheet_info in sheets.items():
            name = sheet_info.get("name") or sheet_info.get("title") or sheet_id
            data_grid = sheet_info.get("data", [])
            headers = sheet_info.get("headers", [])
            print(f"\n📄 Sheet ID: {sheet_id} | Name: '{name}'")
            print(f"   Headers ({len(headers)}): {headers}")
            print(f"   Rows Count: {len(data_grid)}")
            if len(data_grid) > 0:
                print(f"   Sample Row 1: {data_grid[0]}")
                if len(data_grid) > 1:
                    print(f"   Sample Row 2: {data_grid[1]}")
    elif isinstance(sheets, list):
        print(f"Total Sheets (list): {len(sheets)}")
        for s in sheets:
            print(f"  Sheet: {s.get('name')}, rows: {len(s.get('data', []))}")
