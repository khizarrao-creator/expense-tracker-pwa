import os
import json
import sys
from pathlib import Path

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

backup_dir = Path(r"d:\expenseTracker\backups")

print("=== SCANNING ALL BACKUP FOLDERS FOR SPREADSHEET / GRID DATA ===")

for export_folder in backup_dir.iterdir():
    if export_folder.is_dir():
        print(f"\n📁 Checking export folder: {export_folder.name}")
        for root, dirs, files in os.walk(export_folder):
            for f in files:
                if "grid" in f.lower() or "sheet" in f.lower() or "project" in f.lower():
                    filepath = Path(root) / f
                    size = filepath.stat().st_size
                    if size > 10:
                        try:
                            with open(filepath, "r", encoding="utf-8") as fp:
                                content = json.load(fp)
                                print(f"  📄 File: {filepath.relative_to(backup_dir)} ({size} bytes)")
                                # Check if content has non-empty sheet data
                                if isinstance(content, list):
                                    for idx, doc in enumerate(content):
                                        sheets = doc.get("sheets")
                                        if isinstance(sheets, list):
                                            for s in sheets:
                                                name = s.get("name")
                                                data = s.get("data", [])
                                                headers = s.get("headers", [])
                                                cells = s.get("cells") or s.get("rows") or []
                                                print(f"      Sheet '{name}': {len(data)} data rows, headers: {headers}, cells/rows: {len(cells)}")
                                        elif isinstance(sheets, dict):
                                            for sid, s in sheets.items():
                                                name = s.get("name") or s.get("title") or sid
                                                data = s.get("data", [])
                                                headers = s.get("headers", [])
                                                print(f"      Sheet '{name}': {len(data)} data rows, headers: {headers}")
                                elif isinstance(content, dict):
                                    sheets = content.get("sheets")
                                    if sheets:
                                        print(f"      Dict sheet content: {type(sheets)}")
                        except Exception as e:
                            print(f"  Error reading {f}: {e}")
