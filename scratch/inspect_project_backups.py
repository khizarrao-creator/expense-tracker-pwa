import os
import json
from pathlib import Path

backup_dir = Path(r"d:\expenseTracker\backups")
latest_dir = backup_dir / "firestore-export-2026-08-03T09-42-57-375Z"

print("--- INSPECTING BACKUPS ---")
for root, dirs, files in os.walk(latest_dir):
    for f in files:
        if "grid" in f.lower() or "sheet" in f.lower() or "project" in f.lower():
            file_path = os.path.join(root, f)
            rel_path = os.path.relpath(file_path, backup_dir)
            size = os.path.getsize(file_path)
            print(f"\nFile: {rel_path} ({size} bytes)")
            try:
                with open(file_path, "r", encoding="utf-8") as fp:
                    data = json.load(fp)
                    if isinstance(data, list):
                        print(f"  Count: {len(data)} items")
                        for item in data[:3]:
                            print(f"  Sample Item: ID={item.get('id')}, Name={item.get('name') or item.get('title')}, Keys={list(item.keys())}")
                    elif isinstance(data, dict):
                        print(f"  Dict Keys: {list(data.keys())}")
                        if "rows" in data or "data" in data or "cells" in data or "columns" in data:
                            rows = data.get("rows") or data.get("data")
                            cols = data.get("columns") or data.get("headers")
                            print(f"  Grid details: {len(rows) if isinstance(rows, list) else 'N/A'} rows, {len(cols) if isinstance(cols, list) else 'N/A'} columns")
            except Exception as e:
                print(f"  Error reading file: {e}")

print("\n--- CHECKING latest.json ---")
latest_json = backup_dir / "latest.json"
if latest_json.exists():
    with open(latest_json, "r", encoding="utf-8") as fp:
        try:
            data = json.load(fp)
            if isinstance(data, dict):
                print(f"latest.json top-level collections: {list(data.keys())}")
                if "projects" in data:
                    print(f"  'projects' in latest.json: {len(data['projects'])} items")
        except Exception as e:
            print(f"Error in latest.json: {e}")
